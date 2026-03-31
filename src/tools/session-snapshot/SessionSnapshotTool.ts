//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { SnapshotManager } from '../../engines/session/SnapshotManager.js';
import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

export class SessionSnapshotTool {
  private snapshots: SnapshotManager;
  private session:   SessionMemory;

  constructor(session: SessionMemory) {
    this.snapshots = new SnapshotManager();
    this.session   = session;
  }

  execute(args: {
    action:   'save' | 'restore' | 'list';
    label?:   string;
    summary?: string;
  }): ToolResult {
    switch (args.action) {
      case 'save':    return this.save(args.label ?? 'checkpoint', args.summary ?? '');
      case 'restore': return this.restore();
      case 'list':    return this.list();
      default:
        return { success: false, content: 'Unknown action. Use: save | restore | list' };
    }
  }

  private save(label: string, summary: string): ToolResult {
    const sessionId    = this.session.getCurrentSessionId();
    const filesInCtx   = this.session.getSessionFiles().map(f => f.filePath);
    const sessionRecord = this.session.getSessionRecord();
    const totalTokens  = sessionRecord?.totalTokensUsed ?? 0;

    const autoSummary = summary || [
      `Session snapshot at ${new Date().toLocaleTimeString()}.`,
      `Files in context: ${filesInCtx.slice(0, 5).join(', ')}${filesInCtx.length > 5 ? '...' : ''}.`,
      `Tokens used: ~${TokenEstimator.formatTokenCount(totalTokens)}.`,
    ].join(' ');

    const snapshot = this.snapshots.save(sessionId, label, autoSummary, filesInCtx);

    return {
      success: true,
      content: [
        `## Snapshot saved: "${label}"`,
        `**ID:** ${snapshot.snapshotId.slice(0, 8)}`,
        `**Files in context:** ${filesInCtx.length}`,
        `**Session tokens:** ~${TokenEstimator.formatTokenCount(totalTokens)}`,
        '',
        `**Summary:** ${autoSummary}`,
      ].join('\n'),
    };
  }

  private restore(): ToolResult {
    const sessionId = this.session.getCurrentSessionId();
    const latest    = this.snapshots.getLatest(sessionId);

    if (!latest) {
      return { success: true, content: 'No snapshots found for this session.' };
    }

    const ago = Math.round((Date.now() - latest.timestamp) / 60000);

    return {
      success: true,
      content: [
        `## Snapshot: "${latest.label}" (${ago} minute(s) ago)`,
        '',
        latest.summary,
        '',
        `**Files that were in context:**`,
        latest.filesInContext.map(f => `- ${f}`).join('\n'),
      ].join('\n'),
    };
  }

  private list(): ToolResult {
    const sessionId = this.session.getCurrentSessionId();
    const all       = this.snapshots.getAll(sessionId);

    if (all.length === 0) {
      return { success: true, content: 'No snapshots in this session.' };
    }

    const lines = ['## Session Snapshots', ''];
    for (const snap of all) {
      const ago = Math.round((Date.now() - snap.timestamp) / 60000);
      lines.push(`- **${snap.label}** (${ago}m ago) — ${snap.filesInContext.length} files — ID: \`${snap.snapshotId.slice(0, 8)}\``);
    }

    return { success: true, content: lines.join('\n') };
  }
}
