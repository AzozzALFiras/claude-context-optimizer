//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { randomUUID } from 'crypto';
import { JsonStore } from '../store/JsonStore.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { SessionSnapshot } from '../../models/SessionRecord.js';

const TABLE = 'snapshots';

export class SnapshotManager {
  private store: JsonStore;

  constructor() {
    this.store = new JsonStore('context-optimizer.json');
  }

  save(sessionId: string, label: string, summary: string, filesInContext: string[]): SessionSnapshot {
    const snap: SessionSnapshot = {
      snapshotId:     randomUUID(),
      sessionId,
      timestamp:      Date.now(),
      label,
      summary,
      tokenCount:     TokenEstimator.estimate(summary),
      filesInContext,
    };

    this.store.set(TABLE, snap.snapshotId, {
      ...snap,
      filesInContext: JSON.stringify(snap.filesInContext),
    });

    return snap;
  }

  getLatest(sessionId: string): SessionSnapshot | null {
    const all = this.store.all(TABLE)
      .filter(r => r['sessionId'] === sessionId)
      .sort((a, b) => (b['timestamp'] as number) - (a['timestamp'] as number));
    return all.length > 0 ? this.mapRow(all[0]) : null;
  }

  getAll(sessionId: string): SessionSnapshot[] {
    return this.store.all(TABLE)
      .filter(r => r['sessionId'] === sessionId)
      .sort((a, b) => (b['timestamp'] as number) - (a['timestamp'] as number))
      .map(r => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): SessionSnapshot {
    return {
      snapshotId:     row['snapshotId'] as string,
      sessionId:      row['sessionId'] as string,
      timestamp:      row['timestamp'] as number,
      label:          row['label'] as string,
      summary:        row['summary'] as string,
      tokenCount:     row['tokenCount'] as number,
      filesInContext: JSON.parse(row['filesInContext'] as string) as string[],
    };
  }
}
