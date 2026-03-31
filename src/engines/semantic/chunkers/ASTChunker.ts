//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import type { FileChunk } from '../../../models/FileRecord.js';
import { TypeScriptParser } from '../parsers/TypeScriptParser.js';
import { PythonParser } from '../parsers/PythonParser.js';
import { GenericParser } from '../parsers/GenericParser.js';

export class ASTChunker {
  // Chunk code file into semantic units (functions, classes)
  chunk(content: string, language: string): FileChunk[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.chunkTypeScript(content);
      case 'python':
        return this.chunkPython(content);
      default:
        return this.chunkGeneric(content, language);
    }
  }

  private chunkTypeScript(content: string): FileChunk[] {
    const chunks: FileChunk[] = [];

    const functions = TypeScriptParser.extractFunctions(content);
    for (const fn of functions) {
      chunks.push({
        content:        fn.body,
        startLine:      fn.startLine,
        endLine:        fn.endLine,
        relevanceScore: 0,
        chunkType:      'function',
        identifier:     fn.name,
      });
    }

    const classes = TypeScriptParser.extractClasses(content);
    for (const cls of classes) {
      // Only add class if not already covered by function chunks
      const alreadyCovered = chunks.some(
        c => c.startLine <= cls.startLine && c.endLine >= cls.endLine,
      );
      if (!alreadyCovered) {
        chunks.push({
          content:        cls.body,
          startLine:      cls.startLine,
          endLine:        cls.endLine,
          relevanceScore: 0,
          chunkType:      'class',
          identifier:     cls.name,
        });
      }
    }

    return chunks.length > 0
      ? chunks
      : GenericParser.extractSections(content);
  }

  private chunkPython(content: string): FileChunk[] {
    const chunks: FileChunk[] = [];

    const functions = PythonParser.extractFunctions(content);
    for (const fn of functions) {
      chunks.push({
        content:        fn.body,
        startLine:      fn.startLine,
        endLine:        fn.endLine,
        relevanceScore: 0,
        chunkType:      'function',
        identifier:     fn.name,
      });
    }

    const classes = PythonParser.extractClasses(content);
    for (const cls of classes) {
      const alreadyCovered = chunks.some(
        c => c.startLine <= cls.startLine && c.endLine >= cls.endLine,
      );
      if (!alreadyCovered) {
        chunks.push({
          content:        cls.body,
          startLine:      cls.startLine,
          endLine:        cls.endLine,
          relevanceScore: 0,
          chunkType:      'class',
          identifier:     cls.name,
        });
      }
    }

    return chunks.length > 0
      ? chunks
      : GenericParser.extractSections(content);
  }

  private chunkGeneric(content: string, language: string): FileChunk[] {
    // Use signatures as anchors, extract surrounding blocks
    const sigs = GenericParser.extractFunctionSignatures(content, language);
    if (sigs.length === 0) {
      return GenericParser.extractSections(content);
    }

    const lines = content.split('\n');
    const chunks: FileChunk[] = [];

    for (const sig of sigs) {
      const idx = lines.findIndex(l => l.trim() === sig);
      if (idx === -1) continue;

      const blockLines = lines.slice(idx, Math.min(idx + 60, lines.length));
      chunks.push({
        content:        blockLines.join('\n'),
        startLine:      idx + 1,
        endLine:        idx + blockLines.length,
        relevanceScore: 0,
        chunkType:      'function',
        identifier:     sig.split('(')[0].split(/\s+/).pop() ?? sig,
      });
    }

    return chunks.length > 0 ? chunks : GenericParser.extractSections(content);
  }
}
