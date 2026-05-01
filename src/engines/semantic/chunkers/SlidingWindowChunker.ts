//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { FileChunk } from '../../../models/FileRecord.js';
import { BM25 } from '../../../utils/text/BM25.js';
import { IdentifierTokenizer } from '../../../utils/text/IdentifierTokenizer.js';

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

  // Score chunks against a query with BM25 + identifier-aware tokenization.
  scoreAgainstQuery(chunks: FileChunk[], query: string): FileChunk[] {
    if (chunks.length === 0) return [];
    const queryTerms = IdentifierTokenizer.tokenizeQuery(query);
    if (queryTerms.length === 0) {
      return chunks.map(c => ({ ...c, relevanceScore: 0 }));
    }

    const docs = chunks.map((c, i) => ({
      id:     String(i),
      tokens: IdentifierTokenizer.tokenizeDocument(c.content),
    }));
    const scorer = new BM25();
    scorer.fit(docs);

    return chunks
      .map((c, i) => ({ ...c, relevanceScore: scorer.score(queryTerms, docs[i]) }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
