//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { randomUUID } from 'crypto';
import { JsonStore } from '../store/JsonStore.js';
import { SESSION_EXPIRY_MS } from '../../config/constants.js';
import type { SessionRecord, SessionFileEntry } from '../../models/SessionRecord.js';

const T_SESSION = 'sessions';
const T_FILES   = 'session_files';

export class SessionMemory {
  private store:            JsonStore;
  private currentSessionId: string;

  constructor() {
    this.store            = new JsonStore('context-optimizer.json');
    this.currentSessionId = this.resolveActiveSession();
  }

  private resolveActiveSession(): string {
    const cutoff  = Date.now() - SESSION_EXPIRY_MS;
    const sessions = this.store.all(T_SESSION)
      .filter(s => (s['lastActiveAt'] as number) > cutoff)
      .sort((a, b) => (b['lastActiveAt'] as number) - (a['lastActiveAt'] as number));

    if (sessions.length > 0) {
      const id = sessions[0]['sessionId'] as string;
      this.touchSession(id);
      return id;
    }
    return this.createSession();
  }

  private createSession(): string {
    const id  = randomUUID();
    const now = Date.now();
    this.store.set(T_SESSION, id, { sessionId: id, startedAt: now, lastActiveAt: now, totalTokens: 0 });
    return id;
  }

  private touchSession(sessionId: string): void {
    const s = this.store.get(T_SESSION, sessionId);
    if (s) this.store.set(T_SESSION, sessionId, { ...s, lastActiveAt: Date.now() });
  }

  getCurrentSessionId(): string { return this.currentSessionId; }

  recordFileRead(filePath: string, fileHash: string, tokenCount: number): void {
    const key = this.store.compoundKey(this.currentSessionId, filePath);
    this.store.set(T_FILES, key, {
      sessionId: this.currentSessionId, filePath, fileHash,
      readAt: Date.now(), tokenCount,
    });
    const s = this.store.get(T_SESSION, this.currentSessionId);
    if (s) {
      this.store.set(T_SESSION, this.currentSessionId, {
        ...s,
        totalTokens:  (s['totalTokens'] as number) + tokenCount,
        lastActiveAt: Date.now(),
      });
    }
  }

  wasReadInSession(filePath: string): SessionFileEntry | null {
    const key = this.store.compoundKey(this.currentSessionId, filePath);
    const row = this.store.get(T_FILES, key);
    if (!row) return null;
    return {
      sessionId:  row['sessionId'] as string,
      filePath:   row['filePath'] as string,
      fileHash:   row['fileHash'] as string,
      readAt:     row['readAt'] as number,
      tokenCount: row['tokenCount'] as number,
    };
  }

  getSessionFiles(): SessionFileEntry[] {
    return this.store.all(T_FILES)
      .filter(r => r['sessionId'] === this.currentSessionId)
      .sort((a, b) => (b['readAt'] as number) - (a['readAt'] as number))
      .map(r => ({
        sessionId:  r['sessionId'] as string,
        filePath:   r['filePath'] as string,
        fileHash:   r['fileHash'] as string,
        readAt:     r['readAt'] as number,
        tokenCount: r['tokenCount'] as number,
      }));
  }

  getSessionRecord(): SessionRecord | null {
    const s = this.store.get(T_SESSION, this.currentSessionId);
    if (!s) return null;
    return {
      sessionId:       s['sessionId'] as string,
      startedAt:       s['startedAt'] as number,
      lastActiveAt:    s['lastActiveAt'] as number,
      totalTokensUsed: s['totalTokens'] as number,
    };
  }

  purgeExpiredSessions(): void {
    const cutoff    = Date.now() - SESSION_EXPIRY_MS;
    const expiredIds = this.store.all(T_SESSION)
      .filter(s => (s['lastActiveAt'] as number) < cutoff)
      .map(s => s['sessionId'] as string);

    for (const id of expiredIds) {
      this.store.delete(T_SESSION, id);
      this.store.deleteWhere(T_FILES, r => r['sessionId'] === id);
    }
  }
}
