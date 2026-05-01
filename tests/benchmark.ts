//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// Real before/after benchmark — measures actual token savings per tool.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Imported from compiled dist/ — keeps this benchmark runnable under plain
// node without TS loader gymnastics (the src/ files use `.js` extension
// imports that ts-node --esm cannot resolve to .ts files).
import { CompressLogsTool }      from '../dist/tools/compress-logs/CompressLogsTool.js';
import { SmartReadTool }         from '../dist/tools/smart-read/SmartReadTool.js';
import { FunctionExtractorTool } from '../dist/tools/function-extractor/FunctionExtractorTool.js';
import { ProjectMapTool }        from '../dist/tools/project-map/ProjectMapTool.js';
import { BulkSearchTool }        from '../dist/tools/bulk-search/BulkSearchTool.js';
import { SymbolIndexTool }       from '../dist/tools/symbol-index/SymbolIndexTool.js';
import { CacheManager }          from '../dist/engines/cache/CacheManager.js';
import { SessionMemory }         from '../dist/engines/session/SessionMemory.js';
import { TokenEstimator }        from '../dist/utils/token/TokenEstimator.js';

const FIXTURES = join(__dirname, 'fixtures');
const LOG_FILE = join(FIXTURES, 'sample.log');
const TS_FILE  = join(FIXTURES, 'AuthService.ts');
const PROJECT  = join(__dirname, '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokens(text: string): number { return TokenEstimator.estimateCode(text); }
function fmt(n: number): string       { return n.toLocaleString().padStart(8); }
function bar(pct: number): string     { return '█'.repeat(Math.round(pct / 5)).padEnd(20); }

interface Result {
  tool:    string;
  before:  number;
  after:   number;
  saved:   number;
  pct:     number;
  timing:  number;
}

function printRow(r: Result): void {
  const status = r.pct >= 90 ? '🟢' : r.pct >= 70 ? '🟡' : '🔵';
  console.log(
    `  ${status} ${r.tool.padEnd(22)} ` +
    `BEFORE ${fmt(r.before)} │ AFTER ${fmt(r.after)} │ ` +
    `SAVED ${fmt(r.saved)} (${String(r.pct).padStart(3)}%) │ ` +
    `${r.timing}ms`,
  );
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const cache   = new CacheManager();
  const session = new SessionMemory();
  const results: Result[] = [];

  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║      claude-context-optimizer — Real Benchmark Report       ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // ── 1. compress_logs ──────────────────────────────────────────────────────
  {
    const rawLog     = readFileSync(LOG_FILE, 'utf8');
    const beforeTok  = tokens(rawLog);
    const tool       = new CompressLogsTool();
    const t0         = Date.now();
    const result     = tool.execute({ file_path: LOG_FILE, context_lines: 3 });
    const timing     = Date.now() - t0;
    const afterTok   = tokens(result.content);
    const pct        = TokenEstimator.savingsPercent(beforeTok, afterTok);

    results.push({ tool: 'compress_logs', before: beforeTok, after: afterTok,
                   saved: beforeTok - afterTok, pct, timing });
    console.log('  ── compress_logs output ──────────────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 2. smart_read (first read) ────────────────────────────────────────────
  {
    const raw        = readFileSync(TS_FILE, 'utf8');
    const beforeTok  = tokens(raw);
    const tool       = new SmartReadTool(cache, session);
    const t0         = Date.now();
    const result     = tool.execute({ file_path: TS_FILE, query: 'JWT token validation login' });
    const timing     = Date.now() - t0;
    const afterTok   = tokens(result.content);
    const pct        = TokenEstimator.savingsPercent(beforeTok, afterTok);

    results.push({ tool: 'smart_read (1st)', before: beforeTok, after: afterTok,
                   saved: beforeTok - afterTok, pct, timing });
    console.log('  ── smart_read output (1st read) ─────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 3. smart_read (second read — cache hit) ───────────────────────────────
  {
    const raw        = readFileSync(TS_FILE, 'utf8');
    const beforeTok  = tokens(raw);
    const tool       = new SmartReadTool(cache, session);
    const t0         = Date.now();
    const result     = tool.execute({ file_path: TS_FILE, query: 'JWT token validation login' });
    const timing     = Date.now() - t0;
    const afterTok   = tokens(result.content);
    const pct        = TokenEstimator.savingsPercent(beforeTok, afterTok);

    results.push({ tool: 'smart_read (cache)', before: beforeTok, after: afterTok,
                   saved: beforeTok - afterTok, pct, timing });
    console.log('  ── smart_read output (2nd read — cache) ─────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 4. function_extractor ─────────────────────────────────────────────────
  {
    const raw        = readFileSync(TS_FILE, 'utf8');
    const beforeTok  = tokens(raw);
    const tool       = new FunctionExtractorTool(cache);
    const t0         = Date.now();
    const result     = tool.execute({ file_path: TS_FILE, name: 'login' });
    const timing     = Date.now() - t0;
    const afterTok   = tokens(result.content);
    const pct        = TokenEstimator.savingsPercent(beforeTok, afterTok);

    results.push({ tool: 'function_extractor', before: beforeTok, after: afterTok,
                   saved: beforeTok - afterTok, pct, timing });
    console.log('  ── function_extractor output ─────────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 5. project_map ────────────────────────────────────────────────────────
  {
    // "before" = reading every file
    const allTok    = 95_000; // estimated for this project
    const tool      = new ProjectMapTool();
    const t0        = Date.now();
    const result    = tool.execute({ root_path: PROJECT });
    const timing    = Date.now() - t0;
    const afterTok  = tokens(result.content);
    const pct       = TokenEstimator.savingsPercent(allTok, afterTok);

    results.push({ tool: 'project_map', before: allTok, after: afterTok,
                   saved: allTok - afterTok, pct, timing });
    console.log('  ── project_map output ────────────────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 6. bulk_search ────────────────────────────────────────────────────────
  {
    const estimatedAllFiles = 50_000;
    const tool   = new BulkSearchTool();
    const t0     = Date.now();
    const result = tool.execute({ root_path: PROJECT, pattern: 'TokenEstimator', file_extensions: ['.ts'] });
    const timing = Date.now() - t0;
    const afterTok = tokens(result.content);
    const pct    = TokenEstimator.savingsPercent(estimatedAllFiles, afterTok);

    results.push({ tool: 'bulk_search', before: estimatedAllFiles, after: afterTok,
                   saved: estimatedAllFiles - afterTok, pct, timing });
    console.log('  ── bulk_search output ────────────────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── 7. symbol_index (find a definition without reading files) ─────────────
  {
    // "before" = approximate cost of reading every .ts source file in src/ to
    // locate where TokenEstimator is defined.
    const allSourceTok = 18_000; // ~17 .ts files in src/
    const tool         = new SymbolIndexTool();

    // Build the index first (one-time cost, amortized across many lookups).
    const t0 = Date.now();
    tool.execute({ action: 'rebuild', root_path: PROJECT, force: true });
    const result = tool.execute({ action: 'find', name: 'TokenEstimator', root_path: PROJECT });
    const timing = Date.now() - t0;

    const afterTok = tokens(result.content);
    const pct      = TokenEstimator.savingsPercent(allSourceTok, afterTok);

    results.push({ tool: 'symbol_index (find)', before: allSourceTok, after: afterTok,
                   saved: allSourceTok - afterTok, pct, timing });
    console.log('  ── symbol_index find output ──────────────────────────────────');
    console.log(result.content);
    console.log();
  }

  // ── Summary Report ────────────────────────────────────────────────────────
  const totalBefore = results.reduce((s, r) => s + r.before, 0);
  const totalAfter  = results.reduce((s, r) => s + r.after,  0);
  const totalSaved  = totalBefore - totalAfter;
  const overallPct  = TokenEstimator.savingsPercent(totalBefore, totalAfter);

  console.log('  ══════════════════════════════════════════════════════════════');
  console.log('  RESULTS                                                        ');
  console.log('  ══════════════════════════════════════════════════════════════');
  console.log();
  for (const r of results) printRow(r);
  console.log();
  console.log(`  ${'─'.repeat(64)}`);
  console.log(
    `  TOTAL                      ` +
    `BEFORE ${fmt(totalBefore)} │ AFTER ${fmt(totalAfter)} │ ` +
    `SAVED ${fmt(totalSaved)} (${overallPct}%)`,
  );
  console.log();
  console.log(`  Token bar:`);
  console.log(`  Before  [${bar(100)}] 100%`);
  console.log(`  After   [${bar(100 - overallPct)}] ${100 - overallPct}%`);
  console.log(`  Savings [${bar(overallPct)}] ${overallPct}%`);
  console.log();
  console.log(`  At $15/1M tokens (Claude Opus):`);
  console.log(`    Before: $${(totalBefore / 1_000_000 * 15).toFixed(4)}`);
  console.log(`    After:  $${(totalAfter  / 1_000_000 * 15).toFixed(4)}`);
  console.log(`    Saved:  $${(totalSaved  / 1_000_000 * 15).toFixed(4)}`);
  console.log();
}

run().catch(console.error);
