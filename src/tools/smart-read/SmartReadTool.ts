//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { CacheManager } from '../../engines/cache/CacheManager.js';
import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { SemanticIndex } from '../../engines/semantic/SemanticIndex.js';
import { RelevanceScorer } from './RelevanceScorer.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import { MAX_SNIPPET_TOKENS } from '../../config/constants.js';
import type { ToolResult } from '../../models/ToolResult.js';
import type { FileChunk } from '../../models/FileRecord.js';

export class SmartReadTool {
  private cache:   CacheManager;
  private session: SessionMemory;
  private index:   SemanticIndex;

  constructor(cache: CacheManager, session: SessionMemory) {
    this.cache   = cache;
    this.session = session;
    this.index   = new SemanticIndex();
  }

  execute(args: {
    file_path:  string;
    query:      string;
    max_tokens?: number;
  }): ToolResult {
    const { file_path, query, max_tokens = MAX_SNIPPET_TOKENS } = args;

    // Check if file was already read this session
    const sessionEntry = this.session.wasReadInSession(file_path);
    const fresh        = this.cache.getIfFresh(file_path);

    if (sessionEntry && fresh && sessionEntry.fileHash === fresh.hash) {
      // File is unchanged — return relevant chunks without re-reading from disk.
      // For small files, returning chunks (which can include duplicate AST class
      // bodies) inflates output past the original — yielding negative savings.
      // Mirror the small-file path used on first read.
      if (fresh.tokenEstimate <= max_tokens) {
        return {
          success:    true,
          content:    SmartReadTool.noMatchMessage(file_path, fresh.summary, sessionEntry),
          tokensSaved: sessionEntry.tokenCount,
        };
      }

      const chunks  = this.index.query(file_path, query, max_tokens);
      const ranked  = RelevanceScorer.rankChunks(chunks, query);
      const topChunks = SmartReadTool.fitInBudget(ranked, max_tokens);

      if (topChunks.length === 0) {
        return {
          success:    true,
          content:    SmartReadTool.noMatchMessage(file_path, fresh.summary, sessionEntry),
          tokensSaved: sessionEntry.tokenCount,
        };
      }

      const chunkTokens = TokenEstimator.estimateCode(topChunks.map(c => c.content).join('\n'));
      return {
        success:     true,
        content:     SmartReadTool.formatChunks(topChunks, file_path, fresh, true),
        tokensSaved: Math.max(0, sessionEntry.tokenCount - chunkTokens),
      };
    }

    // Read and cache
    const result = this.cache.readAndCache(file_path);
    if (!result) {
      return { success: false, content: `Cannot read file: ${file_path}` };
    }

    const { record } = result;
    // Strip <private>...</private> blocks before any processing or caching
    const content = SmartReadTool.stripPrivate(result.content);
    this.session.recordFileRead(file_path, record.hash, record.tokenEstimate);

    // Small files: returning formatted chunks adds more overhead than it saves.
    // Threshold: if the whole file fits comfortably in budget, return it directly.
    if (record.tokenEstimate <= max_tokens) {
      return {
        success:     true,
        content:     `## ${file_path}\n**${record.lineCount} lines | ${record.language}**\n\n\`\`\`${record.language}\n${content}\n\`\`\``,
        tokensSaved: 0,
      };
    }

    const chunks     = this.index.query(file_path, query, max_tokens);
    const ranked     = RelevanceScorer.rankChunks(chunks, query);
    const topChunks  = SmartReadTool.fitInBudget(ranked, max_tokens);

    if (topChunks.length === 0) {
      return {
        success:     true,
        content:     `## ${file_path}\n**Summary:** ${record.summary}\n\nNo specific matches for "${query}". File cached for future queries.`,
        tokensSaved: record.tokenEstimate - TokenEstimator.estimate(record.summary),
      };
    }

    const chunkTokens = TokenEstimator.estimateCode(topChunks.map(c => c.content).join('\n'));
    return {
      success:     true,
      content:     SmartReadTool.formatChunks(topChunks, file_path, record, false),
      tokensSaved: Math.max(0, record.tokenEstimate - chunkTokens),
    };
  }

  private static fitInBudget(chunks: FileChunk[], maxTokens: number): FileChunk[] {
    const result: FileChunk[] = [];
    let used = 0;
    for (const chunk of chunks) {
      const t = TokenEstimator.estimateCode(chunk.content);
      if (used + t > maxTokens) break;
      result.push(chunk);
      used += t;
    }
    return result;
  }

  private static formatChunks(
    chunks: FileChunk[],
    filePath: string,
    record: { summary: string; lineCount: number; language: string },
    fromCache: boolean,
  ): string {
    const cacheNote = fromCache ? ' *(from cache — unchanged)*' : '';
    const lines     = [
      `## ${filePath}${cacheNote}`,
      `**${record.lineCount} lines | ${record.language} | Summary:** ${record.summary}`,
      '',
    ];

    for (const chunk of chunks) {
      const name = chunk.identifier ? ` — \`${chunk.identifier}\`` : '';
      lines.push(`### Lines ${chunk.startLine}–${chunk.endLine}${name}`);
      lines.push('```' + record.language);
      lines.push(chunk.content);
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Strip <private>...</private> blocks — inspired by claude-mem's privacy model.
   * Prevents sensitive content (API keys, tokens, PII) from leaking into context.
   */
  private static stripPrivate(content: string): string {
    return content.replace(/<private>[\s\S]*?<\/private>/gi, '<private>[redacted]</private>');
  }

  private static noMatchMessage(
    filePath: string,
    summary: string,
    session: { readAt: number; tokenCount: number },
  ): string {
    const ago = Math.round((Date.now() - session.readAt) / 60000);
    return [
      `## ${filePath} *(cached — unchanged)*`,
      `**Summary:** ${summary}`,
      `**Last read:** ${ago} minute(s) ago | **Tokens saved:** ${session.tokenCount}`,
      `No specific matches found for the query. File is cached and ready.`,
    ].join('\n');
  }
}
