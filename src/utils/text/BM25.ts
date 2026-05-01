//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// BM25 ranking — the de-facto baseline for keyword search.
//
// Why this beats raw term-frequency counting:
//   • IDF — rare terms (e.g. "validateToken") outweigh common ones (e.g. "user").
//   • TF saturation (k1) — a chunk repeating "user" 50 times doesn't beat one
//     with 5 occurrences by 10×.
//   • Length normalization (b) — long chunks don't automatically dominate.
//
// We feed it the identifier-tokenized form of each chunk so a query for "auth"
// matches `AuthService` even though the literal substring "auth " doesn't
// appear.

import { IdentifierTokenizer } from './IdentifierTokenizer.js';

export interface BM25Document {
  id:     string;
  tokens: string[];   // pre-tokenized terms (with duplicates → TF)
}

export class BM25 {
  // Standard defaults; tuned for short-to-medium code chunks.
  private readonly k1 = 1.5;
  private readonly b  = 0.75;

  private docFreq:    Map<string, number> = new Map();
  private docLengths: Map<string, number> = new Map();
  private avgDocLen   = 0;
  private totalDocs   = 0;

  // Index a corpus. Repeated calls reset state.
  fit(docs: BM25Document[]): void {
    this.docFreq.clear();
    this.docLengths.clear();
    this.totalDocs = docs.length;

    if (docs.length === 0) {
      this.avgDocLen = 0;
      return;
    }

    let totalLen = 0;
    for (const d of docs) {
      this.docLengths.set(d.id, d.tokens.length);
      totalLen += d.tokens.length;

      // Document frequency = number of distinct documents containing the term.
      const seen = new Set<string>();
      for (const t of d.tokens) {
        if (!seen.has(t)) {
          seen.add(t);
          this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
        }
      }
    }
    this.avgDocLen = totalLen / docs.length;
  }

  score(queryTerms: string[], doc: BM25Document): number {
    if (this.totalDocs === 0 || queryTerms.length === 0) return 0;

    // Build TF map for this doc (cheap; docs are small)
    const tf = new Map<string, number>();
    for (const t of doc.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    const docLen = this.docLengths.get(doc.id) ?? doc.tokens.length;
    const lengthNorm = 1 - this.b + this.b * (docLen / Math.max(this.avgDocLen, 1));

    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term);
      if (!f) continue;
      const df = this.docFreq.get(term) ?? 0;
      // BM25 IDF (Okapi variant, smoothed to be non-negative)
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
      const tfNorm = (f * (this.k1 + 1)) / (f + this.k1 * lengthNorm);
      score += idf * tfNorm;
    }
    return score;
  }

  // Convenience wrapper: take a corpus of plain strings + a query, return
  // (id, score) pairs sorted descending. Filters scores ≤ 0.
  static rank(
    corpus: Array<{ id: string; text: string }>,
    query:  string,
  ): Array<{ id: string; score: number }> {
    const docs: BM25Document[] = corpus.map(c => ({
      id:     c.id,
      tokens: IdentifierTokenizer.tokenizeDocument(c.text),
    }));
    const scorer = new BM25();
    scorer.fit(docs);

    const queryTerms = IdentifierTokenizer.tokenizeQuery(query);
    return docs
      .map(d => ({ id: d.id, score: scorer.score(queryTerms, d) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}
