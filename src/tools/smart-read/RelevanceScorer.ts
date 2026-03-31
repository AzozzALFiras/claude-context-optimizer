//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { FileChunk } from '../../models/FileRecord.js';

export class RelevanceScorer {
  // Score a chunk against a query — higher = more relevant
  static score(chunk: FileChunk, query: string): number {
    const keywords = RelevanceScorer.tokenize(query);
    const content  = chunk.content.toLowerCase();
    let score      = 0;

    for (const kw of keywords) {
      // Exact match in identifier (function/class name)
      if (chunk.identifier?.toLowerCase().includes(kw)) {
        score += 10;
      }

      // Matches in content
      let pos = content.indexOf(kw);
      while (pos !== -1) {
        score += 1;
        pos = content.indexOf(kw, pos + 1);
      }
    }

    // Bonus: chunk near top of file (often more relevant)
    if (chunk.startLine <= 50) score += 2;

    // Bonus: chunk is a function or class definition
    if (chunk.chunkType === 'function' || chunk.chunkType === 'class') score += 3;

    return score;
  }

  static rankChunks(chunks: FileChunk[], query: string): FileChunk[] {
    return chunks
      .map(c => ({ ...c, relevanceScore: RelevanceScorer.score(c, query) }))
      .filter(c => c.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private static tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }
}
