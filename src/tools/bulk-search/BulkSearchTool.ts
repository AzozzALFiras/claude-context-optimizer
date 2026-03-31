//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { IGNORED_DIRECTORIES, IGNORED_FILES, MAX_SEARCH_RESULTS, MAX_SEARCH_CONTEXT_LINES } from '../../config/constants.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

interface SearchMatch {
  filePath:    string;
  lineNumber:  number;
  lineContent: string;
  context:     string[];
}

export class BulkSearchTool {
  execute(args: {
    root_path?:       string;
    pattern:          string;
    file_extensions?: string[];
    case_sensitive?:  boolean;
    context_lines?:   number;
    /**
     * Progressive disclosure — inspired by claude-mem's 3-layer model:
     *   'files'   → only file paths + match count  (~50 tokens, choose this first)
     *   'lines'   → matching lines, no context     (~200 tokens)
     *   'context' → lines + surrounding code       (full output, default)
     */
    detail_level?: 'files' | 'lines' | 'context';
  }): ToolResult {
    const {
      root_path = process.cwd(),
      pattern,
      file_extensions,
      case_sensitive = false,
      context_lines = MAX_SEARCH_CONTEXT_LINES,
      detail_level = 'context',
    } = args;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, case_sensitive ? 'g' : 'gi');
    } catch {
      return { success: false, content: `Invalid regex pattern: ${pattern}` };
    }

    const files   = this.collectFiles(root_path, file_extensions);
    const matches = this.searchFiles(files, root_path, regex, detail_level === 'context' ? context_lines : 0);

    if (matches.length === 0) {
      return {
        success: true,
        content: `No matches found for \`${pattern}\` in ${root_path}`,
      };
    }

    const output = BulkSearchTool.format(matches, pattern, root_path, detail_level);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
      metadata:   { matchCount: matches.length, fileCount: [...new Set(matches.map(m => m.filePath))].length, detailLevel: detail_level },
    };
  }

  private collectFiles(rootPath: string, extensions?: string[]): string[] {
    const results: string[] = [];
    this.walk(rootPath, results, extensions);
    return results;
  }

  private walk(dir: string, results: string[], extensions?: string[], depth = 0): void {
    if (depth > 8) return;

    let items: string[];
    try { items = readdirSync(dir); } catch { return; }

    for (const item of items) {
      if (IGNORED_DIRECTORIES.has(item) || item.startsWith('.')) continue;
      if (IGNORED_FILES.has(item)) continue;

      const fullPath = join(dir, item);
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        this.walk(fullPath, results, extensions, depth + 1);
      } else if (stat.isFile() && stat.size < 5 * 1024 * 1024) {
        const ext = extname(item).toLowerCase();
        if (!extensions || extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  private searchFiles(
    files: string[],
    rootPath: string,
    regex: RegExp,
    contextSize: number,
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];

    for (const file of files) {
      if (matches.length >= MAX_SEARCH_RESULTS) break;

      let content: string;
      try { content = readFileSync(file, 'utf8'); } catch { continue; }

      const lines   = content.split('\n');
      const relPath = relative(rootPath, file);

      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (!regex.test(lines[i])) continue;

        const ctxStart = Math.max(0, i - contextSize);
        const ctxEnd   = Math.min(lines.length, i + contextSize + 1);
        const context  = [
          ...lines.slice(ctxStart, i),
          ...lines.slice(i + 1, ctxEnd),
        ].map(l => l.trim()).filter(Boolean);

        matches.push({
          filePath:    relPath,
          lineNumber:  i + 1,
          lineContent: lines[i].trim(),
          context,
        });

        if (matches.length >= MAX_SEARCH_RESULTS) break;
      }
    }

    return matches;
  }

  private static format(
    matches:     SearchMatch[],
    pattern:     string,
    rootPath:    string,
    detail:      'files' | 'lines' | 'context' = 'context',
  ): string {
    const fileGroups = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      if (!fileGroups.has(m.filePath)) fileGroups.set(m.filePath, []);
      fileGroups.get(m.filePath)!.push(m);
    }

    const lines = [
      `## Search: \`${pattern}\` in ${rootPath}`,
      `**${matches.length} matches** in **${fileGroups.size} files**`,
    ];

    // Layer 1 — files only (~50 tokens). Hint to drill deeper.
    if (detail === 'files') {
      lines.push('');
      for (const [file, fileMatches] of fileGroups) {
        lines.push(`- \`${file}\` (${fileMatches.length} match${fileMatches.length > 1 ? 'es' : ''})`);
      }
      lines.push('');
      lines.push('*Use `detail_level: "lines"` to see matching lines, or `"context"` for full context.*');
      return lines.join('\n');
    }

    lines.push('');

    for (const [file, fileMatches] of fileGroups) {
      lines.push(`### ${file}`);
      for (const match of fileMatches) {
        lines.push(`**L${match.lineNumber}:** \`${match.lineContent}\``);
        // Layer 3 — show surrounding context
        if (detail === 'context' && match.context.length > 0) {
          lines.push(`> ${match.context.slice(0, 2).join(' | ')}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
