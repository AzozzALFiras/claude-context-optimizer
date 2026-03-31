//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { TOKEN_CHARS_RATIO } from '../../config/constants.js';

export class TokenEstimator {
  // Fast estimation: ~4 chars per token (Claude tokenizer average)
  static estimate(text: string): number {
    return Math.ceil(text.length / TOKEN_CHARS_RATIO);
  }

  // More accurate for code: accounts for indentation and symbols
  static estimateCode(code: string): number {
    const lines = code.split('\n');
    let total = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        total += 2; // blank/comment lines are cheap
      } else {
        total += Math.ceil(line.length / TOKEN_CHARS_RATIO);
      }
    }

    return total;
  }

  static formatTokenCount(tokens: number): string {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  static savingsPercent(original: number, reduced: number): number {
    if (original === 0) return 0;
    return Math.round(((original - reduced) / original) * 100);
  }

  static estimateLines(lineCount: number, avgLineLength = 40): number {
    return TokenEstimator.estimate(' '.repeat(avgLineLength).repeat(lineCount));
  }
}
