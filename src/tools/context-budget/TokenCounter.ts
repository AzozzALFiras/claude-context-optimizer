//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import { CONTEXT_WARNING_THRESHOLD, CONTEXT_CRITICAL_THRESHOLD } from '../../config/constants.js';
import type { BudgetItem } from '../../models/ToolResult.js';

export interface BudgetAnalysis {
  totalTokens:    number;
  usedPercent:    number;
  status:         'ok' | 'warning' | 'critical';
  items:          BudgetItem[];
  recommendation: string;
}

export class TokenCounter {
  analyze(items: Array<{ label: string; content: string; priority?: number }>): BudgetAnalysis {
    const budgetItems: BudgetItem[] = items.map(item => {
      const tokens = TokenEstimator.estimateCode(item.content);
      return {
        label:    item.label,
        tokenCount: tokens,
        priority: TokenCounter.categorizePriority(item.label, tokens, item.priority ?? 5),
        reason:   TokenCounter.getReason(item.label, tokens),
      };
    });

    const total   = budgetItems.reduce((s, i) => s + i.tokenCount, 0);
    const percent = Math.round((total / CONTEXT_CRITICAL_THRESHOLD) * 100);
    const status  = TokenCounter.getStatus(total);

    return {
      totalTokens:    total,
      usedPercent:    percent,
      status,
      items:          budgetItems.sort((a, b) => b.tokenCount - a.tokenCount),
      recommendation: TokenCounter.buildRecommendation(budgetItems, total, status),
    };
  }

  private static categorizePriority(
    label: string,
    tokens: number,
    userPriority: number,
  ): BudgetItem['priority'] {
    if (userPriority >= 8) return 'keep';
    if (tokens > 10_000)   return 'consider-removing';
    if (tokens > 20_000)   return 'remove';
    if (label.toLowerCase().includes('log'))  return 'consider-removing';
    if (label.toLowerCase().includes('lock')) return 'remove';
    return 'keep';
  }

  private static getReason(label: string, tokens: number): string {
    if (tokens > 20_000) return `Very large (${TokenEstimator.formatTokenCount(tokens)} tokens)`;
    if (tokens > 10_000) return `Large (${TokenEstimator.formatTokenCount(tokens)} tokens)`;
    if (label.toLowerCase().includes('log'))  return 'Log files often have low information density';
    if (label.toLowerCase().includes('lock')) return 'Lock files are auto-generated, rarely needed';
    return `${TokenEstimator.formatTokenCount(tokens)} tokens`;
  }

  private static getStatus(total: number): BudgetAnalysis['status'] {
    if (total >= CONTEXT_CRITICAL_THRESHOLD) return 'critical';
    if (total >= CONTEXT_WARNING_THRESHOLD)  return 'warning';
    return 'ok';
  }

  private static buildRecommendation(
    items: BudgetItem[],
    total: number,
    status: BudgetAnalysis['status'],
  ): string {
    if (status === 'ok') {
      return `Context is healthy at ${TokenEstimator.formatTokenCount(total)} tokens.`;
    }

    const toRemove = items.filter(i => i.priority === 'remove' || i.priority === 'consider-removing');
    const savings  = toRemove.reduce((s, i) => s + i.tokenCount, 0);

    if (toRemove.length === 0) {
      return `Context is ${status}. Consider using smart_read to get only relevant parts of large files.`;
    }

    const names = toRemove.slice(0, 3).map(i => `"${i.label}"`).join(', ');
    return `Context is ${status}. Removing ${names} would save ~${TokenEstimator.formatTokenCount(savings)} tokens (${TokenEstimator.savingsPercent(total, total - savings)}%).`;
  }
}
