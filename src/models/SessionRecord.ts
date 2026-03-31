//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export interface SessionRecord {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  totalTokensUsed: number;
}

export interface SessionFileEntry {
  sessionId: string;
  filePath: string;
  fileHash: string;
  readAt: number;
  tokenCount: number;
}

export interface SessionSnapshot {
  snapshotId: string;
  sessionId: string;
  timestamp: number;
  label: string;
  summary: string;
  tokenCount: number;
  filesInContext: string[];
}
