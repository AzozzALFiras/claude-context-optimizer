//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// MCP wrapper around SymbolIndex.
//
// Actions:
//   find      — locate definitions of a symbol by name. Returns file:line
//               + signature in ~30 tokens per match instead of a full read.
//   outline   — list every symbol defined in one file (replaces a "skim"
//               read for ~80% fewer tokens).
//   rebuild   — full re-scan of a project; use when many files changed.
//   refresh   — re-index a single file (no-op if hash unchanged).
//   stats     — summary of what is indexed.

import { SymbolIndex } from '../../engines/symbols/SymbolIndex.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';
import type { SymbolEntry, SymbolKind } from '../../models/Symbol.js';

type Action = 'find' | 'outline' | 'rebuild' | 'refresh' | 'stats';

const VALID_KINDS: SymbolKind[] = ['function', 'class', 'method', 'interface', 'type', 'enum', 'const'];

export class SymbolIndexTool {
  private index: SymbolIndex;

  constructor() {
    this.index = new SymbolIndex();
  }

  execute(args: {
    action:        Action;
    name?:         string;
    file_path?:    string;
    root_path?:    string;
    kind?:         string;
    language?:     string;
    limit?:        number;
    force?:        boolean;
    auto_index?:   boolean;
  }): ToolResult {
    const root = args.root_path ?? process.cwd();

    switch (args.action) {
      case 'find':    return this.find(args, root);
      case 'outline': return this.outline(args, root);
      case 'rebuild': return this.rebuild(root, args.force ?? true);
      case 'refresh': return this.refresh(args, root);
      case 'stats':   return this.stats(root);
      default:
        return { success: false, content: 'Unknown action. Use: find | outline | rebuild | refresh | stats' };
    }
  }

  // ── find ───────────────────────────────────────────────────────────────────

  private find(
    args: { name?: string; kind?: string; language?: string; limit?: number; auto_index?: boolean },
    rootPath: string,
  ): ToolResult {
    if (!args.name || args.name.trim() === '') {
      return { success: false, content: 'Missing required argument: name' };
    }

    // Auto-index if the project has never been indexed under this root.
    if (args.auto_index !== false) this.ensureIndexed(rootPath);

    const kind = SymbolIndexTool.normalizeKind(args.kind);
    const matches = this.index.query(args.name, {
      kind,
      language: args.language,
      limit:    args.limit ?? 20,
      rootPath,
    });

    if (matches.length === 0) {
      return {
        success: true,
        content: [
          `No symbol matching \`${args.name}\` found under ${rootPath}.`,
          `Try \`symbol_index({ action: "rebuild" })\` if the project changed,`,
          `or use \`bulk_search\` for free-text matches.`,
        ].join('\n'),
      };
    }

    const output = SymbolIndexTool.formatMatches(matches, args.name, rootPath);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
      metadata: {
        matches:    matches.length,
        exactCount: matches.filter(m => m.name.toLowerCase() === args.name!.toLowerCase()).length,
      },
    };
  }

  // ── outline ────────────────────────────────────────────────────────────────

  private outline(
    args: { file_path?: string; auto_index?: boolean },
    rootPath: string,
  ): ToolResult {
    if (!args.file_path) {
      return { success: false, content: 'Missing required argument: file_path' };
    }

    if (args.auto_index !== false) {
      // Make sure this file is indexed (cheap if hash matches).
      this.index.indexFile(args.file_path, rootPath, false);
    }

    const symbols = this.index.outline(args.file_path);
    if (symbols.length === 0) {
      return {
        success: true,
        content: `No symbols found in ${args.file_path}. The file may be plain text, generated, or larger than 2MB.`,
      };
    }

    const output = SymbolIndexTool.formatOutline(symbols, args.file_path);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
      metadata:   { symbolCount: symbols.length },
    };
  }

  // ── rebuild ────────────────────────────────────────────────────────────────

  private rebuild(rootPath: string, force: boolean): ToolResult {
    const t0 = Date.now();
    const result = this.index.indexProject(rootPath, { force });
    const elapsed = Date.now() - t0;

    return {
      success: true,
      content: [
        `## Symbol index rebuilt`,
        `**Root:** ${rootPath}`,
        `**Files scanned:** ${result.filesScanned}`,
        `**Files updated:** ${result.filesIndexed}`,
        `**Symbols indexed:** ${result.symbolsAdded}`,
        `**Time:** ${elapsed}ms`,
        '',
        `Use \`symbol_index({ action: "find", name: "..." })\` to query.`,
      ].join('\n'),
      metadata: { ...result, elapsedMs: elapsed },
    };
  }

  // ── refresh ────────────────────────────────────────────────────────────────

  private refresh(
    args: { file_path?: string; force?: boolean },
    rootPath: string,
  ): ToolResult {
    if (!args.file_path) {
      return { success: false, content: 'Missing required argument: file_path' };
    }
    const result = this.index.indexFile(args.file_path, rootPath, args.force ?? true);
    if (!result) {
      return { success: true, content: `File skipped (not a code file or too large): ${args.file_path}` };
    }
    return {
      success: true,
      content: result.changed
        ? `Re-indexed ${args.file_path} — ${result.symbols} symbols.`
        : `${args.file_path} unchanged since last index — ${result.symbols} symbols.`,
      metadata: result,
    };
  }

  // ── stats ──────────────────────────────────────────────────────────────────

  private stats(rootPath: string): ToolResult {
    const s = this.index.stats(rootPath);
    const lines = [
      `## Symbol Index — ${rootPath}`,
      `**Files:** ${s.totalFiles}  |  **Symbols:** ${s.totalSymbols}`,
    ];
    if (s.lastIndexed > 0) {
      const ago = Math.round((Date.now() - s.lastIndexed) / 60000);
      lines.push(`**Last indexed:** ${ago} minute(s) ago`);
    } else {
      lines.push('**Last indexed:** never — run `symbol_index({ action: "rebuild" })` first.');
    }

    if (Object.keys(s.byKind).length > 0) {
      lines.push('', '### By kind');
      for (const [kind, count] of Object.entries(s.byKind).sort(([, a], [, b]) => b - a)) {
        lines.push(`- ${kind}: ${count}`);
      }
    }

    if (Object.keys(s.byLanguage).length > 0) {
      lines.push('', '### By language');
      for (const [lang, count] of Object.entries(s.byLanguage).sort(([, a], [, b]) => b - a)) {
        lines.push(`- ${lang}: ${count}`);
      }
    }

    return { success: true, content: lines.join('\n') };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private ensureIndexed(rootPath: string): void {
    const s = this.index.stats(rootPath);
    if (s.totalFiles === 0) {
      this.index.indexProject(rootPath);
    }
  }

  private static normalizeKind(raw?: string): SymbolKind | undefined {
    if (!raw) return undefined;
    const lower = raw.toLowerCase() as SymbolKind;
    return VALID_KINDS.includes(lower) ? lower : undefined;
  }

  private static formatMatches(matches: SymbolEntry[], query: string, rootPath: string): string {
    const lines = [
      `## Symbols matching \`${query}\` in ${rootPath}`,
      `**${matches.length} match${matches.length > 1 ? 'es' : ''}**`,
      '',
    ];

    // Group by relPath for readability
    const byFile = new Map<string, SymbolEntry[]>();
    for (const m of matches) {
      if (!byFile.has(m.relPath)) byFile.set(m.relPath, []);
      byFile.get(m.relPath)!.push(m);
    }

    for (const [file, syms] of byFile) {
      lines.push(`### ${file}`);
      for (const s of syms) {
        const where = s.containerName ? ` *(in ${s.containerName})*` : '';
        lines.push(`- **${s.name}** \`${s.kind}\`${where} — L${s.line}`);
        lines.push(`  \`${SymbolIndexTool.truncate(s.signature, 100)}\``);
      }
      lines.push('');
    }

    lines.push(`*Use \`function_extractor\` to read a specific symbol's body.*`);
    return lines.join('\n');
  }

  private static formatOutline(symbols: SymbolEntry[], filePath: string): string {
    const lines = [`## Outline: ${filePath}`, `**${symbols.length} symbols**`, ''];
    let currentClass = '';

    for (const s of symbols) {
      if (s.kind === 'method') {
        if (s.containerName !== currentClass) {
          currentClass = s.containerName ?? '';
        }
        lines.push(`  - L${s.line}  \`${s.name}()\``);
      } else {
        currentClass = s.kind === 'class' ? s.name : '';
        lines.push(`- L${s.line}  **${s.name}** \`${s.kind}\``);
      }
    }
    return lines.join('\n');
  }

  private static truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }
}
