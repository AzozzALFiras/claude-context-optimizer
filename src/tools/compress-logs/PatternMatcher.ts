//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

// Stack trace detection patterns (multi-language)
const STACK_TRACE_PATTERNS = [
  /^\s+at\s+/,                            // JavaScript/Node.js
  /^\s+File\s+"[^"]+",\s+line\s+\d+/,   // Python
  /^\s+\w+\.\w+\([\w.]+:\d+\)/,         // Java/Kotlin
  /^\s+\[\d+\]\s+0x[0-9a-f]+/,          // C/C++ native
  /^\s+#\d+\s+0x[0-9a-f]+/,             // GDB-style
  /goroutine\s+\d+\s+\[/,               // Go
  /^\s+from\s+[\w/]+\.rb:\d+/,          // Ruby
];

export class PatternMatcher {
  static isStackTraceLine(line: string): boolean {
    return STACK_TRACE_PATTERNS.some(p => p.test(line));
  }

  static isRepetitionMarker(line: string): boolean {
    return /(\.\.\.|repeated|again|above|similar|same error)/i.test(line);
  }

  static isTimestamp(segment: string): boolean {
    return (
      /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(segment) ||
      /\[\d{2}:\d{2}:\d{2}\]/.test(segment)
    );
  }

  static normalizeMessage(message: string): string {
    return message
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,\d]*/g, '<TIME>')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>')
      .replace(/https?:\/\/[^\s]+/g, '<URL>')
      .replace(/\/[\w./\-]+/g, (m) => m.split('/').pop() ?? m) // shorten paths
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Detect log file format (structured JSON, logfmt, or plain text)
  static detectFormat(firstLine: string): 'json' | 'logfmt' | 'plain' {
    try {
      JSON.parse(firstLine);
      return 'json';
    } catch {
      if (/\w+=\S+/.test(firstLine)) return 'logfmt';
      return 'plain';
    }
  }

  static parseJsonLogLine(line: string): { level?: string; message?: string } | null {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      return {
        level:   String(obj['level'] ?? obj['severity'] ?? obj['lvl'] ?? ''),
        message: String(obj['message'] ?? obj['msg'] ?? obj['text'] ?? ''),
      };
    } catch {
      return null;
    }
  }
}
