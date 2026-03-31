//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readFileSync } from 'fs';
import { extname } from 'path';
import { FileCache } from './FileCache.js';
import { HashUtil } from '../../utils/hash/HashUtil.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import { EXTENSION_TO_LANGUAGE, SESSION_EXPIRY_MS } from '../../config/constants.js';
import type { FileRecord } from '../../models/FileRecord.js';

export class CacheManager {
  private cache: FileCache;

  constructor() {
    this.cache = new FileCache();
  }

  // Returns cached record if file is unchanged, null if changed/new
  getIfFresh(filePath: string): FileRecord | null {
    const cached = this.cache.get(filePath);
    if (!cached) return null;

    const currentHash = HashUtil.fromFile(filePath);
    if (!currentHash || currentHash !== cached.hash) return null;

    // Update last read timestamp without full re-index
    this.cache.set({ ...cached, lastReadAt: Date.now() });
    return cached;
  }

  // Read file, cache it, return record + content
  readAndCache(filePath: string): { record: FileRecord; content: string } | null {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    const hash     = HashUtil.fromContent(content);
    const lines    = content.split('\n');
    const ext      = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
    const tokens   = TokenEstimator.estimateCode(content);
    const summary  = CacheManager.buildSummary(content, language, lines.length);

    const record: FileRecord = {
      path:          filePath,
      hash,
      summary,
      language,
      lineCount:     lines.length,
      tokenEstimate: tokens,
      lastReadAt:    Date.now(),
    };

    this.cache.set(record);
    return { record, content };
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  purgeExpired(): number {
    return this.cache.purgeOlderThan(Date.now() - SESSION_EXPIRY_MS * 7); // 7 days
  }

  getCacheSize(): number {
    return this.cache.count();
  }

  private static buildSummary(content: string, language: string, lineCount: number): string {
    const lines = content.split('\n');
    const topLines = lines.slice(0, 5).join('\n').trim();

    if (['typescript', 'javascript'].includes(language)) {
      const exports = lines
        .filter(l => /^export\s+(function|class|const|interface|type|enum)/.test(l.trim()))
        .slice(0, 8)
        .map(l => l.trim().replace(/\{.*/, '').trim());
      if (exports.length > 0) {
        return `${lineCount} lines. Exports: ${exports.join(', ')}`;
      }
    }

    if (language === 'python') {
      const defs = lines
        .filter(l => /^(def|class)\s+/.test(l.trim()))
        .slice(0, 8)
        .map(l => l.trim().split('(')[0].replace(/^(def|class)\s+/, ''));
      if (defs.length > 0) {
        return `${lineCount} lines. Defines: ${defs.join(', ')}`;
      }
    }

    return `${lineCount} lines. Starts: ${topLines.slice(0, 100)}`;
  }
}
