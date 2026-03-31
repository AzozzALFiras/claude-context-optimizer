//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { TokenCounter } from './TokenCounter.js';
import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

export class ContextBudgetTool {
  private counter: TokenCounter;
  private session: SessionMemory;

  constructor(session: SessionMemory) {
    this.counter = new TokenCounter();
    this.session = session;
  }

  execute(args: {
    items?: Array<{ label: string; content: string; priority?: number }>;
    include_session?: boolean;
  }): ToolResult {
    const { items = [], include_session = true } = args;

    let allItems = [...items];

    if (include_session) {
      const sessionFiles = this.session.getSessionFiles();
      for (const file of sessionFiles) {
        if (!allItems.find(i => i.label === file.filePath)) {
          allItems.push({
            label:   file.filePath,
            content: ' '.repeat(file.tokenCount * 4), // reconstruct for counting
            priority: 5,
          });
        }
      }
    }

    if (allItems.length === 0) {
      const sessionRecord = this.session.getSessionRecord();
      return {
        success: true,
        content: ContextBudgetTool.noItemsMessage(sessionRecord?.totalTokensUsed ?? 0),
      };
    }

    const analysis = this.counter.analyze(allItems);
    return {
      success:    true,
      content:    ContextBudgetTool.formatAnalysis(analysis),
      tokensUsed: analysis.totalTokens,
      metadata: {
        status:       analysis.status,
        totalTokens:  analysis.totalTokens,
        usedPercent:  analysis.usedPercent,
      },
    };
  }

  private static formatAnalysis(analysis: ReturnType<TokenCounter['analyze']>): string {
    const statusEmoji = { ok: '✅', warning: '⚠️', critical: '🚨' }[analysis.status];

    const lines = [
      `## Context Budget ${statusEmoji}`,
      `**Total:** ${TokenEstimator.formatTokenCount(analysis.totalTokens)} tokens (${analysis.usedPercent}% of limit)`,
      '',
      '### Items by size',
    ];

    for (const item of analysis.items) {
      const flag = item.priority === 'remove'           ? ' 🗑️ remove'
                 : item.priority === 'consider-removing' ? ' ⚡ consider removing'
                 : '';
      lines.push(`- **${item.label}**: ${TokenEstimator.formatTokenCount(item.tokenCount)} tokens${flag}`);
      lines.push(`  *${item.reason}*`);
    }

    lines.push('', `### Recommendation`, analysis.recommendation);

    return lines.join('\n');
  }

  private static noItemsMessage(sessionTokens: number): string {
    return [
      '## Context Budget',
      `**Session tokens used so far:** ~${TokenEstimator.formatTokenCount(sessionTokens)}`,
      '',
      'Pass `items` to analyze specific content in your context.',
      'Or use `include_session: true` to automatically include session file history.',
    ].join('\n');
  }
}
