//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { SemanticIndex } from '../../engines/semantic/SemanticIndex.js';
import { CacheManager } from '../../engines/cache/CacheManager.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';

export class FunctionExtractorTool {
  private index: SemanticIndex;
  private cache: CacheManager;

  constructor(cache: CacheManager) {
    this.index = new SemanticIndex();
    this.cache = cache;
  }

  execute(args: { file_path: string; name: string }): ToolResult {
    const { file_path, name } = args;

    // Ensure file is cached
    const fresh = this.cache.getIfFresh(file_path);
    if (!fresh) {
      const result = this.cache.readAndCache(file_path);
      if (!result) {
        return { success: false, content: `Cannot read file: ${file_path}` };
      }
    }

    const chunk = this.index.extractByName(file_path, name);

    if (!chunk) {
      // Fall back to fuzzy search
      const fuzzy = this.index.query(file_path, name, 2000);
      if (fuzzy.length === 0) {
        return {
          success: true,
          content: `No function or class named \`${name}\` found in \`${file_path}\`.`,
        };
      }

      const tokens = TokenEstimator.estimateCode(fuzzy[0].content);
      return {
        success:    true,
        content:    FunctionExtractorTool.format(fuzzy[0].content, name, file_path, fuzzy[0].startLine, true),
        tokensUsed: tokens,
      };
    }

    const tokens = TokenEstimator.estimateCode(chunk.content);
    const cached = this.cache.getIfFresh(file_path);
    const fullTokens = cached?.tokenEstimate ?? tokens * 10;

    return {
      success:     true,
      content:     FunctionExtractorTool.format(chunk.content, name, file_path, chunk.startLine, false),
      tokensUsed:  tokens,
      tokensSaved: fullTokens - tokens,
      metadata: {
        startLine: chunk.startLine,
        endLine:   chunk.endLine,
        type:      chunk.chunkType,
      },
    };
  }

  private static format(
    content:   string,
    name:      string,
    filePath:  string,
    startLine: number,
    isFuzzy:   boolean,
  ): string {
    const fuzzyNote = isFuzzy ? ' *(closest match)*' : '';
    return [
      `## \`${name}\`${fuzzyNote} — ${filePath}:${startLine}`,
      '```',
      content,
      '```',
    ].join('\n');
  }
}
