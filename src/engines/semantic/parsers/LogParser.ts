//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { LOG_LEVEL_PATTERNS, DEFAULT_LOG_CONTEXT_LINES, MAX_LOG_ENTRIES } from '../../../config/constants.js';
import type { LogEntry } from '../../../models/ToolResult.js';

type LogLevel = 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

interface RawMatch {
  lineNumber: number;
  level: LogLevel;
  message: string;
}

export class LogParser {
  static parse(
    content: string,
    contextLines = DEFAULT_LOG_CONTEXT_LINES,
  ): LogEntry[] {
    const lines = content.split('\n');
    const matches = LogParser.findMatches(lines);
    const deduplicated = LogParser.deduplicate(matches);
    const withContext = LogParser.attachContext(deduplicated, lines, contextLines);

    return withContext.slice(0, MAX_LOG_ENTRIES);
  }

  private static findMatches(lines: string[]): RawMatch[] {
    const results: RawMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const level = LogParser.detectLevel(line);
      if (level) {
        results.push({ lineNumber: i + 1, level, message: line.trim() });
      }
    }

    return results;
  }

  private static detectLevel(line: string): LogLevel | null {
    if (LOG_LEVEL_PATTERNS.FATAL.test(line)) return 'FATAL';
    if (LOG_LEVEL_PATTERNS.ERROR.test(line)) return 'ERROR';
    if (LOG_LEVEL_PATTERNS.WARN.test(line))  return 'WARN';
    return null;
  }

  private static deduplicate(matches: RawMatch[]): RawMatch[] {
    const seen = new Map<string, RawMatch & { count: number }>();

    for (const match of matches) {
      // Normalize: remove timestamps, IDs, line numbers from key
      const key = match.message
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,\d]*/g, '<TIME>')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<UUID>')
        .replace(/\b\d+\b/g, '<N>')
        .slice(0, 120);

      if (seen.has(key)) {
        seen.get(key)!.count++;
      } else {
        seen.set(key, { ...match, count: 1 });
      }
    }

    return [...seen.values()];
  }

  private static attachContext(
    matches: Array<RawMatch & { count?: number }>,
    lines: string[],
    contextSize: number,
  ): LogEntry[] {
    const now = Date.now();

    return matches.map(match => {
      const idx   = match.lineNumber - 1;
      const start = Math.max(0, idx - contextSize);
      const end   = Math.min(lines.length, idx + contextSize + 1);
      const ctx   = lines.slice(start, end).filter((_, i) => start + i !== idx);

      return {
        lineNumber:   match.lineNumber,
        level:        match.level as LogLevel,
        message:      match.message,
        contextLines: ctx.map(l => l.trim()).filter(Boolean),
        occurrences:  (match as { count?: number }).count ?? 1,
        firstSeen:    now,
        lastSeen:     now,
      };
    });
  }
}
