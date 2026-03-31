//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { CacheManager } from '../../engines/cache/CacheManager.js';
import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { HashUtil } from '../../utils/hash/HashUtil.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

export class RecallFileTool {
  private cache:   CacheManager;
  private session: SessionMemory;

  constructor(cache: CacheManager, session: SessionMemory) {
    this.cache   = cache;
    this.session = session;
  }

  execute(args: { file_path: string }): ToolResult {
    const { file_path } = args;

    const sessionEntry = this.session.wasReadInSession(file_path);
    const cached       = this.cache.getIfFresh(file_path);

    // Not read this session and not cached
    if (!sessionEntry && !cached) {
      return {
        success: true,
        content: `**${file_path}** has not been read in this session. Use \`smart_read\` to read it.`,
      };
    }

    // Verify if file changed since last read
    const currentHash = HashUtil.fromFile(file_path);
    const knownHash   = sessionEntry?.fileHash ?? cached?.hash;

    if (!currentHash) {
      return { success: false, content: `Cannot access file: ${file_path}` };
    }

    if (currentHash !== knownHash) {
      // File changed — invalidate cache
      this.cache.invalidate(file_path);
      return {
        success: true,
        content: RecallFileTool.changedMessage(file_path, sessionEntry?.readAt),
      };
    }

    // File unchanged
    const ago         = sessionEntry ? Math.round((Date.now() - sessionEntry.readAt) / 60000) : null;
    const tokensSaved = sessionEntry?.tokenCount ?? cached?.tokenEstimate ?? 0;
    const summary     = cached?.summary ?? 'Summary not available';

    return {
      success:     true,
      content:     RecallFileTool.unchangedMessage(file_path, summary, ago, tokensSaved),
      tokensSaved,
    };
  }

  private static changedMessage(filePath: string, lastReadAt?: number): string {
    const ago = lastReadAt ? Math.round((Date.now() - lastReadAt) / 60000) : null;
    const agoStr = ago !== null ? ` (last read ${ago} minute(s) ago)` : '';
    return [
      `**${filePath}** has changed since last read${agoStr}.`,
      'Cache invalidated. Use `smart_read` to get the updated content.',
    ].join('\n');
  }

  private static unchangedMessage(
    filePath: string,
    summary: string,
    agoMinutes: number | null,
    tokensSaved: number,
  ): string {
    const agoStr = agoMinutes !== null ? `${agoMinutes} minute(s) ago` : 'earlier this session';
    return [
      `**${filePath}** — unchanged since last read (${agoStr})`,
      `**Summary:** ${summary}`,
      `**Tokens saved by using cache:** ~${TokenEstimator.formatTokenCount(tokensSaved)}`,
      '',
      'File is ready. Use `smart_read` with a specific query to fetch relevant sections.',
    ].join('\n');
  }
}
