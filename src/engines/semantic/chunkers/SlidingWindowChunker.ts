//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { FileChunk } from '../../../models/FileRecord.js';

export class SlidingWindowChunker {
  private windowSize: number;
  private overlap:    number;

  constructor(windowSize = 50, overlap = 5) {
    this.windowSize = windowSize;
    this.overlap    = overlap;
  }

  chunk(content: string): FileChunk[] {
    const lines  = content.split('\n');
    const chunks: FileChunk[] = [];
    const step   = this.windowSize - this.overlap;

    for (let i = 0; i < lines.length; i += step) {
      const slice = lines.slice(i, i + this.windowSize);
      chunks.push({
        content:        slice.join('\n'),
        startLine:      i + 1,
        endLine:        i + slice.length,
        relevanceScore: 0,
        chunkType:      'lines',
      });
    }

    return chunks;
  }

  // Score chunks against a query using keyword frequency
  scoreAgainstQuery(chunks: FileChunk[], query: string): FileChunk[] {
    const keywords = SlidingWindowChunker.extractKeywords(query);

    return chunks.map(chunk => ({
      ...chunk,
      relevanceScore: SlidingWindowChunker.computeScore(chunk.content, keywords),
    })).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private static extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !SlidingWindowChunker.isStopWord(w));
  }

  private static computeScore(content: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    const lower = content.toLowerCase();
    let score   = 0;

    for (const keyword of keywords) {
      let pos = lower.indexOf(keyword);
      while (pos !== -1) {
        score++;
        pos = lower.indexOf(keyword, pos + 1);
      }
    }

    // Boost for exact phrase match
    const phrase = keywords.join(' ');
    if (lower.includes(phrase)) score += keywords.length * 3;

    return score;
  }

  private static isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'this', 'that', 'with', 'from',
      'have', 'not', 'are', 'was', 'what', 'how', 'can',
      'does', 'get', 'set', 'use', 'via',
    ]);
    return stopWords.has(word);
  }
}
