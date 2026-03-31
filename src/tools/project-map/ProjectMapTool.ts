//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { existsSync } from 'fs';
import { FileTreeBuilder } from './FileTreeBuilder.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult, ProjectMapEntry } from '../../models/ToolResult.js';

export class ProjectMapTool {
  private builder = new FileTreeBuilder();

  execute(args: { root_path?: string; show_token_estimates?: boolean }): ToolResult {
    const { root_path = process.cwd(), show_token_estimates = true } = args;

    if (!existsSync(root_path)) {
      return { success: false, content: `Path not found: ${root_path}` };
    }

    const entries = this.builder.build(root_path);

    if (entries.length === 0) {
      return { success: true, content: 'No files found in project.' };
    }

    const output = ProjectMapTool.format(entries, root_path, show_token_estimates);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
      metadata: {
        totalFiles:    entries.length,
        totalLines:    entries.reduce((s, e) => s + e.lineCount, 0),
        totalTokens:   entries.reduce((s, e) => s + e.tokenEstimate, 0),
        byLanguage:    ProjectMapTool.groupByLanguage(entries),
      },
    };
  }

  private static format(
    entries: ProjectMapEntry[],
    rootPath: string,
    showTokens: boolean,
  ): string {
    const totalLines  = entries.reduce((s, e) => s + e.lineCount, 0);
    const totalTokens = entries.reduce((s, e) => s + e.tokenEstimate, 0);
    const byLanguage  = ProjectMapTool.groupByLanguage(entries);

    const lines: string[] = [
      `## Project Map: ${rootPath}`,
      `**${entries.length} files** | **${totalLines.toLocaleString()} lines** | ~${TokenEstimator.formatTokenCount(totalTokens)} tokens total`,
      '',
      '### By Language',
    ];

    for (const [lang, count] of Object.entries(byLanguage)) {
      lines.push(`- **${lang}**: ${count} files`);
    }

    lines.push('', '### Files');

    // Group by directory
    const grouped = ProjectMapTool.groupByDir(entries);
    for (const [dir, files] of Object.entries(grouped)) {
      lines.push(`\n**${dir || '.'}/**`);
      for (const file of files) {
        const tokenInfo = showTokens
          ? ` *(~${TokenEstimator.formatTokenCount(file.tokenEstimate)} tokens)*`
          : '';
        lines.push(`  - \`${file.path.split('/').pop()}\` — ${file.description}${tokenInfo}`);
      }
    }

    return lines.join('\n');
  }

  private static groupByLanguage(entries: ProjectMapEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const e of entries) {
      result[e.language] = (result[e.language] ?? 0) + 1;
    }
    return Object.fromEntries(
      Object.entries(result).sort(([, a], [, b]) => b - a),
    );
  }

  private static groupByDir(entries: ProjectMapEntry[]): Record<string, ProjectMapEntry[]> {
    const result: Record<string, ProjectMapEntry[]> = {};
    for (const entry of entries) {
      const parts = entry.path.split('/');
      const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      if (!result[dir]) result[dir] = [];
      result[dir].push(entry);
    }
    return result;
  }
}
