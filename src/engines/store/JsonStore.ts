//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// Pure JSON file store — zero native compilation, works on Node 18-24+
// Replaces SQLite to ensure cross-platform compatibility without build tools.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PlatformUtil } from '../../utils/platform/PlatformUtil.js';

export interface StoreRecord {
  [key: string]: unknown;
}

// Per-process singletons keyed by absolute file path.
// Without this, multiple JsonStore instances pointing at the same file each hold
// their own in-memory snapshot and clobber each other on write — losing tasks,
// snapshots, sessions, and cache data.
const INSTANCES = new Map<string, JsonStore>();

export class JsonStore {
  private filePath: string;
  private data: Record<string, StoreRecord> = {};
  private dirty: boolean = false;

  constructor(filename: string) {
    this.filePath = join(PlatformUtil.getCacheDir(), filename);
    const existing = INSTANCES.get(this.filePath);
    if (existing) return existing;
    this.data = this.load();
    INSTANCES.set(this.filePath, this);
  }

  private load(): Record<string, StoreRecord> {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, StoreRecord>;
        }
      }
    } catch {
      // corrupted file — start fresh
    }
    return {};
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data), 'utf8');
      this.dirty = false;
    } catch { /* non-critical */ }
  }

  // ── Table operations ──────────────────────────────────────────────────────

  get(table: string, key: string): StoreRecord | null {
    return this.data[`${table}:${key}`] ?? null;
  }

  set(table: string, key: string, record: StoreRecord): void {
    this.data[`${table}:${key}`] = record;
    this.dirty = true;
    this.flush();
  }

  delete(table: string, key: string): void {
    const k = `${table}:${key}`;
    if (k in this.data) {
      delete this.data[k];
      this.dirty = true;
      this.flush();
    }
  }

  all(table: string): StoreRecord[] {
    const prefix = `${table}:`;
    return Object.entries(this.data)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }

  count(table: string): number {
    const prefix = `${table}:`;
    return Object.keys(this.data).filter(k => k.startsWith(prefix)).length;
  }

  deleteWhere(table: string, predicate: (record: StoreRecord) => boolean): number {
    const prefix = `${table}:`;
    let removed = 0;
    for (const k of Object.keys(this.data)) {
      if (k.startsWith(prefix) && predicate(this.data[k])) {
        delete this.data[k];
        removed++;
        this.dirty = true;
      }
    }
    if (this.dirty) this.flush();
    return removed;
  }

  // Composite key for tables with multi-column primary keys
  compoundKey(...parts: string[]): string {
    return parts.join('|');
  }
}
