//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readFileSync } from 'fs';
import { extname } from 'path';
import { ASTChunker } from './chunkers/ASTChunker.js';
import { SlidingWindowChunker } from './chunkers/SlidingWindowChunker.js';
import { EXTENSION_TO_LANGUAGE } from '../../config/constants.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import { MAX_SNIPPET_TOKENS } from '../../config/constants.js';
import type { FileChunk } from '../../models/FileRecord.js';

const CODE_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'go', 'rust',
  'java', 'csharp', 'cpp', 'ruby', 'php', 'swift', 'kotlin',
]);

export class SemanticIndex {
  private astChunker    = new ASTChunker();
  private textChunker   = new SlidingWindowChunker(60, 10);

  // Returns the most relevant chunks for a given query, under token budget
  query(filePath: string, userQuery: string, maxTokens = MAX_SNIPPET_TOKENS): FileChunk[] {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return [];
    }

    const ext      = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';

    const chunks = CODE_LANGUAGES.has(language)
      ? this.astChunker.chunk(content, language)
      : this.textChunker.chunk(content);

    const scored = this.textChunker.scoreAgainstQuery(chunks, userQuery);
    return SemanticIndex.fitInBudget(scored, maxTokens);
  }

  // Extract a specific function/class by name
  extractByName(filePath: string, name: string): FileChunk | null {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    const ext      = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';

    const chunks = this.astChunker.chunk(content, language);
    const target = name.toLowerCase();

    return chunks.find(c => c.identifier?.toLowerCase() === target) ?? null;
  }

  private static fitInBudget(chunks: FileChunk[], maxTokens: number): FileChunk[] {
    const result: FileChunk[] = [];
    let used = 0;

    for (const chunk of chunks) {
      const tokens = TokenEstimator.estimateCode(chunk.content);
      if (used + tokens > maxTokens) break;
      result.push(chunk);
      used += tokens;
    }

    return result;
  }
}
