//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readFileSync } from 'fs';
import { LogParser } from '../../engines/semantic/parsers/LogParser.js';
import { PatternMatcher } from './PatternMatcher.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult, CompressedLogResult, LogEntry } from '../../models/ToolResult.js';

export class CompressLogsTool {
  execute(args: { file_path: string; context_lines?: number; max_entries?: number }): ToolResult {
    const { file_path, context_lines = 3, max_entries = 100 } = args;

    let content: string;
    try {
      content = readFileSync(file_path, 'utf8');
    } catch (err) {
      return { success: false, content: `Cannot read file: ${file_path}` };
    }

    const originalTokens = TokenEstimator.estimateCode(content);
    const entries = LogParser.parse(content, context_lines);

    const fatals   = entries.filter(e => e.level === 'FATAL').slice(0, max_entries);
    const errors   = entries.filter(e => e.level === 'ERROR').slice(0, max_entries);
    const warnings = entries.filter(e => e.level === 'WARN').slice(0, max_entries);

    const result: CompressedLogResult = {
      originalLines: content.split('\n').length,
      returnedLines: fatals.length + errors.length + warnings.length,
      fatals,
      errors,
      warnings,
      tokensSaved:   0,
      summary:       '',
    };

    const output = CompressLogsTool.formatOutput(result, file_path);
    const reducedTokens = TokenEstimator.estimate(output);
    result.tokensSaved  = originalTokens - reducedTokens;

    return {
      success:     true,
      content:     output,
      tokensSaved: result.tokensSaved,
      tokensUsed:  reducedTokens,
      metadata: {
        originalLines: result.originalLines,
        returnedLines: result.returnedLines,
        fatals:        fatals.length,
        errors:        errors.length,
        warnings:      warnings.length,
        savingsPercent: TokenEstimator.savingsPercent(originalTokens, reducedTokens),
      },
    };
  }

  private static formatOutput(result: CompressedLogResult, filePath: string): string {
    const lines: string[] = [
      `## Log Analysis: ${filePath}`,
      `**Original:** ${result.originalLines} lines | **Returned:** ${result.returnedLines} entries`,
      '',
    ];

    if (result.fatals.length > 0) {
      lines.push('### FATAL Errors');
      CompressLogsTool.appendEntries(lines, result.fatals);
    }

    if (result.errors.length > 0) {
      lines.push('### Errors');
      CompressLogsTool.appendEntries(lines, result.errors);
    }

    if (result.warnings.length > 0) {
      lines.push('### Warnings');
      CompressLogsTool.appendEntries(lines, result.warnings);
    }

    if (result.fatals.length === 0 && result.errors.length === 0 && result.warnings.length === 0) {
      lines.push('✓ No errors or warnings found in this log file.');
    }

    return lines.join('\n');
  }

  private static appendEntries(output: string[], entries: LogEntry[]): void {
    for (const entry of entries) {
      const repeat = entry.occurrences > 1 ? ` (×${entry.occurrences})` : '';
      output.push(`**Line ${entry.lineNumber}${repeat}:** ${PatternMatcher.normalizeMessage(entry.message)}`);
      if (entry.contextLines.length > 0) {
        output.push('```');
        output.push(...entry.contextLines.slice(0, 3));
        output.push('```');
      }
    }
    output.push('');
  }
}
