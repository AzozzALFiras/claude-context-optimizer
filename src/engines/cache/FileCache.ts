//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { JsonStore } from '../store/JsonStore.js';
import type { FileRecord } from '../../models/FileRecord.js';

const TABLE = 'file_cache';

export class FileCache {
  private store: JsonStore;

  constructor() {
    this.store = new JsonStore('context-optimizer.json');
  }

  get(filePath: string): FileRecord | null {
    const row = this.store.get(TABLE, filePath);
    if (!row) return null;
    return {
      path:          row['path'] as string,
      hash:          row['hash'] as string,
      summary:       row['summary'] as string,
      language:      row['language'] as string,
      lineCount:     row['lineCount'] as number,
      tokenEstimate: row['tokenEstimate'] as number,
      lastReadAt:    row['lastReadAt'] as number,
    };
  }

  set(record: FileRecord): void {
    this.store.set(TABLE, record.path, { ...record });
  }

  delete(filePath: string): void {
    this.store.delete(TABLE, filePath);
  }

  hasChanged(filePath: string, currentHash: string): boolean {
    const row = this.store.get(TABLE, filePath);
    return !row || (row['hash'] as string) !== currentHash;
  }

  purgeOlderThan(timestampMs: number): number {
    return this.store.deleteWhere(TABLE, r => (r['lastReadAt'] as number) < timestampMs);
  }

  count(): number {
    return this.store.count(TABLE);
  }
}
