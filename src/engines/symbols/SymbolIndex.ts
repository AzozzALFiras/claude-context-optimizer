//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// Project-wide symbol index. Answers "where is X defined?" in ~50 tokens
// instead of reading every file. Incremental: per-file hash skips unchanged
// files; replaces all entries for a file when its hash changes.

import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative, resolve } from 'path';
import { JsonStore } from '../store/JsonStore.js';
import { HashUtil } from '../../utils/hash/HashUtil.js';
import { IdentifierTokenizer } from '../../utils/text/IdentifierTokenizer.js';
import { TypeScriptParser } from '../semantic/parsers/TypeScriptParser.js';
import { PythonParser } from '../semantic/parsers/PythonParser.js';
import { GenericParser } from '../semantic/parsers/GenericParser.js';
import {
  EXTENSION_TO_LANGUAGE,
  IGNORED_DIRECTORIES,
  IGNORED_FILES,
  MAX_PROJECT_MAP_FILES,
} from '../../config/constants.js';
import type { SymbolEntry, SymbolFileMeta, SymbolIndexStats, SymbolKind } from '../../models/Symbol.js';

const T_SYMBOLS = 'symbols';
const T_FILES   = 'symbol_files';
const T_ROOTS   = 'symbol_roots';

const CODE_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'go', 'rust',
  'java', 'csharp', 'cpp', 'ruby', 'php', 'swift', 'kotlin',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — skip larger source files

export class SymbolIndex {
  private store: JsonStore;

  constructor() {
    this.store = new JsonStore('context-optimizer.json');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  indexProject(rootPath: string, opts: { force?: boolean } = {}): {
    filesScanned: number;
    filesIndexed: number;
    symbolsAdded: number;
  } {
    const root = resolve(rootPath);
    const files = this.collectFiles(root);

    let scanned = 0;
    let indexed = 0;
    let added   = 0;

    for (const file of files.slice(0, MAX_PROJECT_MAP_FILES)) {
      scanned++;
      const result = this.indexFile(file, root, opts.force ?? false);
      if (result) {
        indexed += result.changed ? 1 : 0;
        added   += result.symbols;
      }
    }

    this.store.set(T_ROOTS, root, {
      rootPath:    root,
      lastIndexed: Date.now(),
      fileCount:   scanned,
    });

    return { filesScanned: scanned, filesIndexed: indexed, symbolsAdded: added };
  }

  // Re-index one file. Skips parse if hash unchanged unless force=true.
  indexFile(filePath: string, rootPath: string, force = false):
    { changed: boolean; symbols: number } | null {
    const abs = resolve(filePath);
    let content: string;
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
      content = readFileSync(abs, 'utf8');
    } catch {
      return null;
    }

    const hash    = HashUtil.fromContent(content);
    const ext     = extname(abs).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
    if (!CODE_LANGUAGES.has(language)) return null;

    const existing = this.store.get(T_FILES, abs) as SymbolFileMeta | null;
    if (!force && existing && existing.hash === hash) {
      return { changed: false, symbols: existing.symbolCount };
    }

    // Replace all symbols for this file
    this.deleteSymbolsForFile(abs);

    const symbols = SymbolIndex.extractSymbols(content, abs, rootPath, language);
    for (const sym of symbols) {
      const key = `${sym.filePath}|${sym.name}|${sym.line}`;
      this.store.set(T_SYMBOLS, key, { ...sym });
    }

    const meta: SymbolFileMeta = {
      filePath:    abs,
      rootPath,
      hash,
      language,
      symbolCount: symbols.length,
      indexedAt:   Date.now(),
    };
    this.store.set(T_FILES, abs, { ...meta });

    return { changed: true, symbols: symbols.length };
  }

  // Look up symbols by name. Buckets, in order:
  //   1. Exact (case-insensitive name match)
  //   2. Substring match (current behavior)
  //   3. Identifier-token match — query terms map onto camelCase / snake_case
  //      components of the symbol name (so "auth" matches "AuthService").
  query(
    name: string,
    opts: { kind?: SymbolKind; language?: string; limit?: number; rootPath?: string } = {},
  ): SymbolEntry[] {
    const all     = this.store.all(T_SYMBOLS) as unknown as SymbolEntry[];
    const lower   = name.toLowerCase();
    const limit   = opts.limit ?? 20;
    const qTokens = IdentifierTokenizer.tokenizeQuery(name);

    const exact:    SymbolEntry[] = [];
    const partial:  SymbolEntry[] = [];
    const tokenHit: SymbolEntry[] = [];

    for (const sym of all) {
      if (opts.kind && sym.kind !== opts.kind) continue;
      if (opts.language && sym.language !== opts.language) continue;
      if (opts.rootPath) {
        const root = resolve(opts.rootPath);
        if (!sym.filePath.startsWith(root)) continue;
      }

      const symLower = sym.name.toLowerCase();
      if (symLower === lower) {
        exact.push(sym);
      } else if (symLower.includes(lower)) {
        partial.push(sym);
      } else {
        // Identifier-aware fuzzy match — split symbol name on case/_ and see
        // if any query term hits a component.
        const symTokens = new Set(IdentifierTokenizer.tokenize(sym.name));
        if (qTokens.some(q => symTokens.has(q))) tokenHit.push(sym);
      }
    }

    // Methods deprioritized vs top-level definitions for the same name
    const rank = (s: SymbolEntry) => (s.kind === 'method' ? 1 : 0);
    exact.sort((a, b) => rank(a) - rank(b));
    partial.sort((a, b) => rank(a) - rank(b));
    tokenHit.sort((a, b) => rank(a) - rank(b));

    return [...exact, ...partial, ...tokenHit].slice(0, limit);
  }

  // Symbols defined inside a single file — quick "outline" view.
  outline(filePath: string): SymbolEntry[] {
    const abs = resolve(filePath);
    const all = this.store.all(T_SYMBOLS) as unknown as SymbolEntry[];
    return all
      .filter(s => s.filePath === abs)
      .sort((a, b) => a.line - b.line);
  }

  stats(rootPath?: string): SymbolIndexStats {
    const root = rootPath ? resolve(rootPath) : '';
    const allSymbols = this.store.all(T_SYMBOLS) as unknown as SymbolEntry[];
    const allFiles   = this.store.all(T_FILES)   as unknown as SymbolFileMeta[];

    const symbols = root ? allSymbols.filter(s => s.filePath.startsWith(root)) : allSymbols;
    const files   = root ? allFiles.filter(f => f.filePath.startsWith(root))   : allFiles;

    const byKind: Record<string, number> = {};
    const byLang: Record<string, number> = {};
    let lastIndexed = 0;

    for (const s of symbols) {
      byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
      byLang[s.language] = (byLang[s.language] ?? 0) + 1;
    }
    for (const f of files) {
      if (f.indexedAt > lastIndexed) lastIndexed = f.indexedAt;
    }

    return {
      rootPath:     root,
      totalFiles:   files.length,
      totalSymbols: symbols.length,
      byKind,
      byLanguage:   byLang,
      lastIndexed,
    };
  }

  // Drop all symbols + meta for a path (e.g. file deleted on disk).
  invalidateFile(filePath: string): void {
    const abs = resolve(filePath);
    this.deleteSymbolsForFile(abs);
    this.store.delete(T_FILES, abs);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private deleteSymbolsForFile(absPath: string): void {
    this.store.deleteWhere(T_SYMBOLS, r => (r['filePath'] as string) === absPath);
  }

  private collectFiles(rootPath: string): string[] {
    const out: string[] = [];
    this.walk(rootPath, out, 0);
    return out;
  }

  private walk(dir: string, out: string[], depth: number): void {
    if (depth > 10) return;
    let items: string[];
    try { items = readdirSync(dir); } catch { return; }

    for (const item of items) {
      if (IGNORED_DIRECTORIES.has(item)) continue;
      if (item.startsWith('.') && depth > 0) continue;
      if (IGNORED_FILES.has(item)) continue;

      const full = join(dir, item);
      let stat;
      try { stat = statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        this.walk(full, out, depth + 1);
      } else if (stat.isFile()) {
        const ext = extname(item).toLowerCase();
        const lang = EXTENSION_TO_LANGUAGE[ext];
        if (lang && CODE_LANGUAGES.has(lang)) out.push(full);
      }
    }
  }

  private static extractSymbols(
    content: string,
    absPath: string,
    rootPath: string,
    language: string,
  ): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const relPath = relative(rootPath, absPath);

    const push = (s: Omit<SymbolEntry, 'filePath' | 'relPath' | 'language'>) => {
      symbols.push({ ...s, filePath: absPath, relPath, language });
    };

    if (language === 'typescript' || language === 'javascript') {
      for (const fn of TypeScriptParser.extractFunctions(content)) {
        push({
          name: fn.name, kind: 'function', line: fn.startLine, endLine: fn.endLine,
          signature: fn.signature,
        });
      }
      for (const cls of TypeScriptParser.extractClasses(content)) {
        push({
          name: cls.name, kind: 'class', line: cls.startLine, endLine: cls.endLine,
          signature: SymbolIndex.firstLine(content, cls.startLine),
        });
        for (const method of cls.methods) {
          // Heuristic: find method line within class body
          const idx = SymbolIndex.findMethodLine(content, cls.startLine, cls.endLine, method);
          if (idx > 0) {
            push({
              name: method, kind: 'method', line: idx, endLine: idx,
              signature: SymbolIndex.firstLine(content, idx),
              containerName: cls.name,
            });
          }
        }
      }
      for (const iface of TypeScriptParser.extractInterfaces(content)) {
        const line = SymbolIndex.findLineMatching(content, new RegExp(`^(?:export\\s+)?interface\\s+${iface}\\b`));
        if (line > 0) {
          push({
            name: iface, kind: 'interface', line, endLine: line,
            signature: SymbolIndex.firstLine(content, line),
          });
        }
      }
      // Also pick up exported types and enums via simple scan
      SymbolIndex.scanLineByLine(content, [
        { kind: 'type', re: /^(?:export\s+)?type\s+(\w+)/ },
        { kind: 'enum', re: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/ },
      ], push);
    } else if (language === 'python') {
      for (const fn of PythonParser.extractFunctions(content)) {
        push({
          name: fn.name, kind: 'function', line: fn.startLine, endLine: fn.endLine,
          signature: fn.signature,
        });
      }
      for (const cls of PythonParser.extractClasses(content)) {
        push({
          name: cls.name, kind: 'class', line: cls.startLine, endLine: cls.endLine,
          signature: SymbolIndex.firstLine(content, cls.startLine),
        });
        for (const method of cls.methods) {
          const idx = SymbolIndex.findMethodLine(content, cls.startLine, cls.endLine, method);
          if (idx > 0) {
            push({
              name: method, kind: 'method', line: idx, endLine: idx,
              signature: SymbolIndex.firstLine(content, idx),
              containerName: cls.name,
            });
          }
        }
      }
    } else {
      // Generic — function-signature scrape only
      const sigs = GenericParser.extractFunctionSignatures(content, language);
      for (const sig of sigs) {
        const line = SymbolIndex.findLineMatching(content, new RegExp(`^${SymbolIndex.escapeRegex(sig)}$`));
        const m = sig.match(/(\w+)\s*\(/);
        if (m && line > 0) {
          push({
            name: m[1], kind: 'function', line, endLine: line, signature: sig,
          });
        }
      }
    }

    return symbols;
  }

  private static scanLineByLine(
    content: string,
    rules: Array<{ kind: SymbolKind; re: RegExp }>,
    push: (s: Omit<SymbolEntry, 'filePath' | 'relPath' | 'language'>) => void,
  ): void {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const rule of rules) {
        const m = lines[i].match(rule.re);
        if (m && m[1]) {
          push({
            name: m[1], kind: rule.kind, line: i + 1, endLine: i + 1,
            signature: lines[i].trim(),
          });
          break;
        }
      }
    }
  }

  private static firstLine(content: string, line: number): string {
    return (content.split('\n')[line - 1] ?? '').trim();
  }

  private static findLineMatching(content: string, re: RegExp): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) return i + 1;
    }
    return 0;
  }

  private static findMethodLine(content: string, fromLine: number, toLine: number, name: string): number {
    const lines = content.split('\n');
    const start = Math.max(0, fromLine - 1);
    const end   = Math.min(lines.length, toLine);
    const re    = new RegExp(`(?:^|\\s)(?:async\\s+|static\\s+|public\\s+|private\\s+|protected\\s+|override\\s+)*${SymbolIndex.escapeRegex(name)}\\s*\\(`);
    for (let i = start; i < end; i++) {
      if (re.test(lines[i])) return i + 1;
    }
    return 0;
  }

  private static escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
