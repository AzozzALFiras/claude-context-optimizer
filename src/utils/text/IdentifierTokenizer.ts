//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// Splits code identifiers into searchable component words.
//
//   loginUser        → ['loginuser', 'login', 'user']
//   AuthService      → ['authservice', 'auth', 'service']
//   get_user_id      → ['get_user_id', 'get', 'user', 'id']
//   HTTPSConnection  → ['httpsconnection', 'https', 'connection']
//
// This is the difference between "auth" finding `AuthService` (works) and
// "auth" finding nothing because no chunk literally contains the substring.

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from',
  'have', 'not', 'are', 'was', 'what', 'how', 'can',
  'does', 'use', 'via', 'into', 'onto', 'will', 'should',
  'would', 'could', 'about', 'when', 'then', 'else',
]);

export class IdentifierTokenizer {
  // Tokenize a single identifier — produces both the original (lowercased)
  // and each component word, deduplicated.
  static tokenize(identifier: string): string[] {
    if (!identifier) return [];

    const lower = identifier.toLowerCase();
    const tokens = new Set<string>([lower]);

    // Split on non-alphanumeric: snake_case, kebab-case, dot.notation, etc.
    const segments = identifier.split(/[^A-Za-z0-9]+/).filter(Boolean);

    for (const seg of segments) {
      const segLower = seg.toLowerCase();
      if (segLower !== lower) tokens.add(segLower);

      // Split camelCase / PascalCase / acronym boundaries.
      // Pattern: lowercase→uppercase boundary, OR end of acronym followed by Title.
      // E.g. "HTTPSConnection" → ["HTTPS", "Connection"]
      const parts = seg
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')          // fooBar → foo Bar
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')        // HTTPSConn → HTTPS Conn
        .split(' ')
        .filter(Boolean);

      for (const p of parts) {
        const t = p.toLowerCase();
        if (t.length >= 2) tokens.add(t);
      }
    }

    return [...tokens];
  }

  // Tokenize a free-text query: lowercase, strip punctuation, split on
  // whitespace, drop stop words. Short query terms (1 char) dropped to avoid
  // matching everything.
  static tokenizeQuery(query: string): string[] {
    if (!query) return [];
    const raw = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));

    // For each query word, also expand identifier-style splits.
    // Lets users paste an identifier directly: "loginUser" works as a query.
    const expanded = new Set<string>(raw);
    for (const w of raw) {
      for (const piece of IdentifierTokenizer.tokenize(w)) {
        if (piece.length > 1) expanded.add(piece);
      }
    }
    return [...expanded];
  }

  // Tokenize a chunk of code/text into a multiset of terms — preserves
  // duplicates so BM25 can compute term frequency.
  static tokenizeDocument(text: string): string[] {
    const out: string[] = [];
    // Match identifier-like sequences (incl. snake_case)
    const matches = text.match(/[A-Za-z_][\w]*/g);
    if (!matches) return out;
    for (const m of matches) {
      if (m.length < 2) continue;
      // For document indexing we keep both the original-lowercased and the
      // split components (so a chunk containing `loginUser` increases TF for
      // both `loginuser`, `login`, and `user`).
      for (const t of IdentifierTokenizer.tokenize(m)) {
        if (t.length >= 2 && !STOP_WORDS.has(t)) out.push(t);
      }
    }
    return out;
  }
}
