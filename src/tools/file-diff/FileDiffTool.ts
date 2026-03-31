//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

export class FileDiffTool {
  execute(args: {
    file_path:  string;
    base?:      string; // commit/branch to diff against (default: HEAD)
    staged?:    boolean;
    context?:   number; // lines of context (default: 3)
  }): ToolResult {
    const { file_path, base = 'HEAD', staged = false, context = 3 } = args;

    if (!existsSync(file_path)) {
      return { success: false, content: `File not found: ${file_path}` };
    }

    const diff = FileDiffTool.runDiff(file_path, base, staged, context);

    if (diff === null) {
      return { success: false, content: 'Not a git repository or git is not installed.' };
    }

    if (diff.trim() === '') {
      return {
        success:  true,
        content:  `No changes in ${file_path} compared to ${staged ? 'staged' : base}.`,
        tokensSaved: 0,
      };
    }

    const tokens = TokenEstimator.estimate(diff);
    return {
      success:    true,
      content:    `## Diff: ${file_path} vs ${staged ? 'staged' : base}\n\n\`\`\`diff\n${diff}\n\`\`\``,
      tokensUsed: tokens,
      metadata:   { linesChanged: diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length },
    };
  }

  private static runDiff(
    filePath: string,
    base: string,
    staged: boolean,
    context: number,
  ): string | null {
    try {
      const stagedFlag = staged ? '--cached' : '';
      const cmd = `git diff ${stagedFlag} -U${context} ${base} -- "${filePath}" 2>&1`;
      return execSync(cmd, { encoding: 'utf8', timeout: 10_000 });
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg.includes('not a git repository') || msg.includes('not recognized')) {
        return null;
      }
      // File might be new (untracked) — return that info
      return `# File is new or untracked: ${filePath}`;
    }
  }
}
