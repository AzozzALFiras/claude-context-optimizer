//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative, dirname, resolve } from 'path';
import { TypeScriptParser } from '../../engines/semantic/parsers/TypeScriptParser.js';
import { PythonParser } from '../../engines/semantic/parsers/PythonParser.js';
import { GenericParser } from '../../engines/semantic/parsers/GenericParser.js';
import { IGNORED_DIRECTORIES, EXTENSION_TO_LANGUAGE } from '../../config/constants.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult, DependencyNode } from '../../models/ToolResult.js';

export class DependencyGraphTool {
  execute(args: { file_path?: string; root_path?: string; depth?: number }): ToolResult {
    const { file_path, root_path = process.cwd(), depth = 2 } = args;

    if (file_path) {
      return this.analyzeFile(file_path, root_path, depth);
    }
    return this.analyzeProject(root_path);
  }

  private analyzeFile(filePath: string, rootPath: string, maxDepth: number): ToolResult {
    const graph = new Map<string, DependencyNode>();
    this.buildGraph(filePath, rootPath, graph, 0, maxDepth);

    const output = DependencyGraphTool.formatGraph(graph, filePath);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
    };
  }

  private analyzeProject(rootPath: string): ToolResult {
    const files   = this.collectCodeFiles(rootPath);
    const graph   = new Map<string, DependencyNode>();

    for (const file of files.slice(0, 50)) { // limit for performance
      const relPath = relative(rootPath, file);
      if (!graph.has(relPath)) {
        graph.set(relPath, { path: relPath, imports: [], importedBy: [] });
      }
      const imports = this.extractImports(file);
      graph.get(relPath)!.imports = imports;

      for (const imp of imports) {
        if (!graph.has(imp)) {
          graph.set(imp, { path: imp, imports: [], importedBy: [] });
        }
        graph.get(imp)!.importedBy.push(relPath);
      }
    }

    const output = DependencyGraphTool.formatProjectGraph(graph, rootPath);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
    };
  }

  private buildGraph(
    filePath: string,
    rootPath: string,
    graph: Map<string, DependencyNode>,
    depth: number,
    maxDepth: number,
  ): void {
    const relPath = relative(rootPath, filePath);
    if (graph.has(relPath) || depth > maxDepth) return;

    const imports = this.extractImports(filePath);
    graph.set(relPath, { path: relPath, imports, importedBy: [] });

    for (const imp of imports) {
      const absImp = this.resolveImport(imp, filePath, rootPath);
      if (absImp) {
        const impRel = relative(rootPath, absImp);
        if (!graph.get(impRel)) {
          this.buildGraph(absImp, rootPath, graph, depth + 1, maxDepth);
        }
        const node = graph.get(impRel);
        if (node) node.importedBy.push(relPath);
      }
    }
  }

  private extractImports(filePath: string): string[] {
    let content: string;
    try { content = readFileSync(filePath, 'utf8'); } catch { return []; }

    const ext      = extname(filePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';

    switch (language) {
      case 'typescript':
      case 'javascript':
        return TypeScriptParser.extractImports(content);
      case 'python':
        return PythonParser.extractImports(content);
      default:
        return GenericParser.extractImports(content, language);
    }
  }

  private resolveImport(importPath: string, fromFile: string, rootPath: string): string | null {
    if (!importPath.startsWith('.')) return null; // skip node_modules

    const dir   = dirname(fromFile);
    const exts  = ['.ts', '.tsx', '.js', '.jsx', '.py'];
    let   base  = resolve(dir, importPath);

    for (const ext of exts) {
      const candidate = base + ext;
      try { statSync(candidate); return candidate; } catch { /* continue */ }
    }

    // Try as directory index
    for (const ext of exts) {
      const candidate = join(base, `index${ext}`);
      try { statSync(candidate); return candidate; } catch { /* continue */ }
    }

    return null;
  }

  private collectCodeFiles(rootPath: string): string[] {
    const results: string[] = [];
    this.walkDir(rootPath, results, 0);
    return results;
  }

  private walkDir(dir: string, results: string[], depth: number): void {
    if (depth > 5) return;
    let items: string[];
    try { items = readdirSync(dir); } catch { return; }

    for (const item of items) {
      if (IGNORED_DIRECTORIES.has(item) || item.startsWith('.')) continue;
      const fullPath = join(dir, item);
      let stat;
      try { stat = statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        this.walkDir(fullPath, results, depth + 1);
      } else {
        const ext = extname(item).toLowerCase();
        if (EXTENSION_TO_LANGUAGE[ext]) results.push(fullPath);
      }
    }
  }

  private static formatGraph(graph: Map<string, DependencyNode>, entryFile: string): string {
    const lines = [`## Dependency Graph: ${entryFile}`, ''];

    for (const [path, node] of graph) {
      lines.push(`**${path}**`);
      if (node.imports.length > 0) {
        lines.push(`  imports: ${node.imports.slice(0, 5).join(', ')}`);
      }
      if (node.importedBy.length > 0) {
        lines.push(`  used by: ${node.importedBy.slice(0, 5).join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private static formatProjectGraph(graph: Map<string, DependencyNode>, rootPath: string): string {
    const sorted = [...graph.values()].sort((a, b) => b.importedBy.length - a.importedBy.length);

    const lines = [
      `## Project Dependency Graph: ${rootPath}`,
      `**${graph.size} modules**`,
      '',
      '### Most imported modules',
    ];

    for (const node of sorted.slice(0, 20)) {
      if (node.importedBy.length === 0) continue;
      lines.push(`- **${node.path}** — imported by ${node.importedBy.length} module(s)`);
    }

    return lines.join('\n');
  }
}
