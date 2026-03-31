//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { IGNORED_DIRECTORIES, IGNORED_FILES, EXTENSION_TO_LANGUAGE, MAX_PROJECT_MAP_FILES } from '../../config/constants.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ProjectMapEntry } from '../../models/ToolResult.js';

export class FileTreeBuilder {
  build(rootPath: string): ProjectMapEntry[] {
    const entries: ProjectMapEntry[] = [];
    this.walk(rootPath, rootPath, entries, 0);
    return entries.slice(0, MAX_PROJECT_MAP_FILES);
  }

  private walk(
    rootPath: string,
    currentPath: string,
    results: ProjectMapEntry[],
    depth: number,
  ): void {
    if (depth > 10) return;

    let items: string[];
    try {
      items = readdirSync(currentPath);
    } catch {
      return;
    }

    for (const item of items) {
      if (IGNORED_DIRECTORIES.has(item) || item.startsWith('.')) {
        // Allow .github, .claude etc only at root
        if (depth > 0 || !['github', 'claude'].includes(item.slice(1))) continue;
      }
      if (IGNORED_FILES.has(item)) continue;

      const fullPath = join(currentPath, item);
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        this.walk(rootPath, fullPath, results, depth + 1);
      } else if (stat.isFile()) {
        const entry = this.buildEntry(rootPath, fullPath, stat.size);
        if (entry) results.push(entry);
      }
    }
  }

  private buildEntry(rootPath: string, filePath: string, fileSize: number): ProjectMapEntry | null {
    if (fileSize > 10 * 1024 * 1024) return null; // skip >10MB

    const ext      = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'other';
    const relPath  = relative(rootPath, filePath);

    let lineCount = 0;
    try {
      const content = readFileSync(filePath, 'utf8');
      lineCount = content.split('\n').length;
    } catch {
      lineCount = Math.round(fileSize / 40); // estimate
    }

    return {
      path:          relPath,
      language,
      lineCount,
      tokenEstimate: TokenEstimator.estimateLines(lineCount),
      description:   FileTreeBuilder.describe(relPath, language),
    };
  }

  private static describe(relPath: string, language: string): string {
    const parts = relPath.split('/');
    const name  = parts[parts.length - 1] ?? relPath;

    // Common file name heuristics
    if (name === 'index.ts' || name === 'index.js') return 'entry point';
    if (name.includes('test') || name.includes('spec')) return 'tests';
    if (name.includes('config')) return 'configuration';
    if (name.includes('type') || name.includes('model')) return 'types/models';
    if (name.includes('util') || name.includes('helper')) return 'utilities';
    if (name.includes('service')) return 'service';
    if (name.includes('controller')) return 'controller';
    if (name.includes('router') || name.includes('route')) return 'routes';
    if (name === 'README.md' || name === 'readme.md') return 'documentation';
    if (name === 'package.json') return 'npm package config';

    return language !== 'other' ? language : 'file';
  }
}
