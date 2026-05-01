//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// BM25-based chunk ranking with identifier-aware tokenization, plus small
// structural bonuses (kind, position, identifier exact-match) that BM25
// alone wouldn't capture.

import { BM25 } from '../../utils/text/BM25.js';
import { IdentifierTokenizer } from '../../utils/text/IdentifierTokenizer.js';
import type { FileChunk } from '../../models/FileRecord.js';

export class RelevanceScorer {
  static rankChunks(chunks: FileChunk[], query: string): FileChunk[] {
    if (chunks.length === 0) return [];

    const queryTerms = IdentifierTokenizer.tokenizeQuery(query);
    if (queryTerms.length === 0) return chunks.map(c => ({ ...c, relevanceScore: 0 }));

    // Fit BM25 over the file's chunks. Including the identifier in the doc
    // text lets BM25 weight identifier matches naturally.
    const docs = chunks.map((c, i) => ({
      id:     String(i),
      tokens: IdentifierTokenizer.tokenizeDocument(
        (c.identifier ? c.identifier + ' ' : '') + c.content,
      ),
    }));

    const scorer = new BM25();
    scorer.fit(docs);

    const scored = chunks.map((chunk, i) => {
      const bm = scorer.score(queryTerms, docs[i]);

      // Heuristic bonuses (small, additive — BM25 carries most of the weight)
      let bonus = 0;
      if (chunk.identifier) {
        const idTokens = new Set(IdentifierTokenizer.tokenize(chunk.identifier));
        for (const q of queryTerms) {
          if (idTokens.has(q)) bonus += 2.0;          // identifier-token hit
        }
        if (queryTerms.includes(chunk.identifier.toLowerCase())) bonus += 4.0;
      }
      if (chunk.chunkType === 'function' || chunk.chunkType === 'class') bonus += 0.5;
      if (chunk.startLine <= 50) bonus += 0.3;

      return { ...chunk, relevanceScore: bm + bonus };
    });

    return scored
      .filter(c => c.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  // Single-chunk scoring kept for backward compatibility (used by tests /
  // possible external callers). Internally just runs the corpus path on a
  // singleton corpus.
  static score(chunk: FileChunk, query: string): number {
    return RelevanceScorer.rankChunks([chunk], query)[0]?.relevanceScore ?? 0;
  }
}
