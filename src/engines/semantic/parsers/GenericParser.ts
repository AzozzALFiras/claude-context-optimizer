//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { FileChunk } from '../../../models/FileRecord.js';

// Handles Go, Rust, Java, C#, and any language without a dedicated parser
export class GenericParser {
  static extractFunctionSignatures(content: string, language: string): string[] {
    const lines = content.split('\n');
    const sigs: string[] = [];
    const patterns = GenericParser.getPatternsForLanguage(language);

    for (const line of lines) {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          sigs.push(line.trim());
          break;
        }
      }
    }

    return sigs.slice(0, 50);
  }

  static extractImports(content: string, language: string): string[] {
    const lines = content.split('\n');
    const imports: string[] = [];

    const importPatterns: Record<string, RegExp> = {
      go:     /^import\s+["(]/,
      rust:   /^use\s+/,
      java:   /^import\s+/,
      csharp: /^using\s+/,
      cpp:    /^#include\s+/,
      ruby:   /^require\s+/,
      php:    /^(?:require|include|use)\s+/,
    };

    const pattern = importPatterns[language];
    if (!pattern) return [];

    for (const line of lines) {
      if (pattern.test(line.trim())) {
        imports.push(line.trim());
      }
    }

    return imports;
  }

  static extractSections(content: string): FileChunk[] {
    const lines = content.split('\n');
    const chunks: FileChunk[] = [];
    const chunkSize = 30;

    for (let i = 0; i < lines.length; i += chunkSize) {
      const slice = lines.slice(i, i + chunkSize);
      chunks.push({
        content:        slice.join('\n'),
        startLine:      i + 1,
        endLine:        i + slice.length,
        relevanceScore: 0,
        chunkType:      'block',
      });
    }

    return chunks;
  }

  private static getPatternsForLanguage(language: string): RegExp[] {
    const map: Record<string, RegExp[]> = {
      go: [
        /^func\s+\w+/,
        /^func\s+\(\w+\s+\*?\w+\)\s+\w+/,
      ],
      rust: [
        /^(?:pub\s+)?(?:async\s+)?fn\s+\w+/,
        /^(?:pub\s+)?struct\s+\w+/,
        /^(?:pub\s+)?impl\s+/,
        /^(?:pub\s+)?trait\s+\w+/,
      ],
      java: [
        /^\s+(?:public|private|protected|static|final|\s)*\s+\w+\s+\w+\s*\(/,
        /^(?:public|private|protected|\s)*\s*(?:class|interface|enum)\s+\w+/,
      ],
      csharp: [
        /^\s+(?:public|private|protected|static|virtual|override|async|\s)*\s+\w+\s+\w+\s*\(/,
        /^(?:public|private|protected|\s)*\s*(?:class|interface|struct|enum)\s+\w+/,
      ],
      cpp: [
        /^\w[\w\s*&]+\s+\w+\s*\(/,
        /^class\s+\w+/,
        /^struct\s+\w+/,
      ],
      ruby: [
        /^\s*def\s+\w+/,
        /^\s*class\s+\w+/,
        /^\s*module\s+\w+/,
      ],
    };

    return map[language] ?? [/^\s*(?:function|def|func|fn|sub|method)\s+\w+/];
  }
}
