//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { ParsedFunction, ParsedClass } from '../../../models/FileRecord.js';

export class PythonParser {
  static extractFunctions(content: string): ParsedFunction[] {
    const lines = content.split('\n');
    const results: ParsedFunction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
      if (!match) continue;

      const indent = PythonParser.getIndent(lines[i]);
      const body   = PythonParser.extractIndentBlock(lines, i, indent);

      results.push({
        name:      match[1],
        startLine: i + 1,
        endLine:   i + body.split('\n').length,
        signature: lines[i].trim(),
        body,
        language:  'python',
      });
    }

    return results;
  }

  static extractClasses(content: string): ParsedClass[] {
    const lines = content.split('\n');
    const results: ParsedClass[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^class\s+(\w+)/);
      if (!match) continue;

      const body    = PythonParser.extractIndentBlock(lines, i, 0);
      const methods = PythonParser.extractMethodNames(body);

      results.push({
        name:      match[1],
        startLine: i + 1,
        endLine:   i + body.split('\n').length,
        methods,
        body,
        language:  'python',
      });
    }

    return results;
  }

  static extractImports(content: string): string[] {
    const results: string[] = [];
    for (const line of content.split('\n')) {
      const importMatch = line.match(/^import\s+([\w.]+)/);
      const fromMatch   = line.match(/^from\s+([\w.]+)\s+import/);
      if (importMatch) results.push(importMatch[1]);
      else if (fromMatch) results.push(fromMatch[1]);
    }
    return results;
  }

  static extractDocstring(content: string): string | null {
    const match = content.match(/^(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/m);
    return match ? (match[1] ?? match[2] ?? '').trim() : null;
  }

  private static getIndent(line: string): number {
    return line.length - line.trimStart().length;
  }

  private static extractIndentBlock(lines: string[], startIdx: number, baseIndent: number): string {
    const block = [lines[startIdx]];

    for (let i = startIdx + 1; i < Math.min(startIdx + 300, lines.length); i++) {
      const line = lines[i];
      if (line.trim() === '') {
        block.push(line);
        continue;
      }
      const indent = PythonParser.getIndent(line);
      if (indent <= baseIndent && i > startIdx + 1) break;
      block.push(line);
    }

    return block.join('\n');
  }

  private static extractMethodNames(classBody: string): string[] {
    const names: string[] = [];
    for (const line of classBody.split('\n')) {
      const match = line.match(/^\s+(?:async\s+)?def\s+(\w+)/);
      if (match) names.push(match[1]);
    }
    return names;
  }
}
