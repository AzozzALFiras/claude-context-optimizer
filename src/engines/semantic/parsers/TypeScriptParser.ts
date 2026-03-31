//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { ParsedFunction, ParsedClass } from '../../../models/FileRecord.js';

export class TypeScriptParser {
  static extractFunctions(content: string): ParsedFunction[] {
    const lines = content.split('\n');
    const results: ParsedFunction[] = [];

    const patterns = [
      // export function foo(
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]/,
      // export const foo = (  OR  export const foo = async (
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
      // export const foo = async () =>
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\w*\s*=>/,
      // method inside class:  public/private/protected foo(
      /^\s+(?:public|private|protected|static|async|override|\s)*\s*(\w+)\s*\(/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1] && !TypeScriptParser.isKeyword(match[1])) {
          const body = TypeScriptParser.extractBlock(lines, i);
          results.push({
            name:      match[1],
            startLine: i + 1,
            endLine:   i + body.split('\n').length,
            signature: line.trim(),
            body,
            language:  'typescript',
          });
          break;
        }
      }
    }

    return results;
  }

  static extractClasses(content: string): ParsedClass[] {
    const lines = content.split('\n');
    const results: ParsedClass[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (!match) continue;

      const body    = TypeScriptParser.extractBlock(lines, i);
      const methods = TypeScriptParser.extractMethodNames(body);

      results.push({
        name:      match[1],
        startLine: i + 1,
        endLine:   i + body.split('\n').length,
        methods,
        body,
        language:  'typescript',
      });
    }

    return results;
  }

  static extractInterfaces(content: string): string[] {
    const results: string[] = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^(?:export\s+)?interface\s+(\w+)/);
      if (match) results.push(match[1]);
    }
    return results;
  }

  static extractImports(content: string): string[] {
    const results: string[] = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      if (match) results.push(match[1]);
    }
    return results;
  }

  private static extractBlock(lines: string[], startIdx: number): string {
    const block: string[] = [lines[startIdx]];
    let depth = 0;
    let started = false;

    for (let i = startIdx; i < Math.min(startIdx + 200, lines.length); i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') { depth--; }
      }
      if (i > startIdx) block.push(line);
      if (started && depth <= 0) break;
    }

    return block.join('\n');
  }

  private static extractMethodNames(classBody: string): string[] {
    const names: string[] = [];
    for (const line of classBody.split('\n')) {
      const match = line.match(/^\s+(?:public|private|protected|static|async|\s)*\s*(\w+)\s*\(/);
      if (match && match[1] && !TypeScriptParser.isKeyword(match[1])) {
        names.push(match[1]);
      }
    }
    return [...new Set(names)];
  }

  private static isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'for', 'while', 'switch', 'catch', 'return',
      'new', 'delete', 'typeof', 'void', 'throw', 'await',
      'constructor', 'super', 'this',
    ]);
    return keywords.has(name);
  }
}
