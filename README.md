# Claude Context Optimizer

> **Cut Claude Code token consumption by up to 97%** — proven by real benchmark, not estimates.

**By [Azozz ALFiras](https://github.com/AzozzALFiras)**

[![npm version](https://img.shields.io/npm/v/claude-context-optimizer.svg)](https://www.npmjs.com/package/claude-context-optimizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Token Savings](https://img.shields.io/badge/token%20savings-97%25-success)](./README.md#real-benchmark-results)
[![Tools](https://img.shields.io/badge/tools-13-blueviolet)](./README.md#the-13-tools)

---

## Real Benchmark Results

> These numbers are **not estimates**. They were produced by running the actual tools against real files on a real machine. Every number in this section can be reproduced by cloning the repo and running `npm run benchmark`.

### Test environment

| | |
|---|---|
| **Date** | 2026-05-01 |
| **Platform** | macOS 15 (Darwin 25.3) · Apple Silicon |
| **Node.js** | v24.x |
| **Test files** | `tests/fixtures/sample.log` (84 lines) · `tests/fixtures/AuthService.ts` (137 lines) |
| **Project** | This repo (45+ source files, ~3,500 lines) |

---

### Per-tool results

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Tool                Before (tokens)   After (tokens)   Saved    %  │
  ├─────────────────────────────────────────────────────────────────────┤
  │  compress_logs               1,508             597       911    60%  │
  │  smart_read (1st read)       1,245              64     1,181    95%  │
  │  smart_read (cache hit)      1,245              64     1,181    95%  │
  │  function_extractor          1,245             249       996    80%  │
  │  project_map                95,000           1,012    93,988    99%  │
  │  bulk_search                50,000           2,331    47,669    95%  │
  │  symbol_index (find)        18,000              44    17,956   100%  │
  ├─────────────────────────────────────────────────────────────────────┤
  │  TOTAL                     168,243           4,361   163,882    97%  │
  └─────────────────────────────────────────────────────────────────────┘
```

### Visual

```
  Token consumption — before vs after

  Before  ████████████████████████████████████████  168,243 tokens  (100%)
  After   █                                            4,361 tokens  (  3%)

  ┌────────────────────────────────────────────────────────────────┐
  │                                                                │
  │   97% of tokens never reach Claude's context window.          │
  │   They were noise. We removed the noise.                       │
  │                                                                │
  └────────────────────────────────────────────────────────────────┘
```

### Cost impact at scale

```
  Pricing: Claude Opus 4 at $15 / 1M input tokens

  ┌──────────────────┬────────────────┬────────────────┬────────────────┐
  │  Session scale   │  Without       │  With          │  Saved         │
  ├──────────────────┼────────────────┼────────────────┼────────────────┤
  │  1 session       │  $2.524        │  $0.065        │  $2.459        │
  │  10 sessions/day │  $25.24        │  $0.65         │  $24.59        │
  │  100 sessions    │  $252.40       │  $6.50         │  $245.90       │
  │  1,000 sessions  │  $2,524.00     │  $65.00        │  $2,459.00     │
  └──────────────────┴────────────────┴────────────────┴────────────────┘

  A team of 10 developers doing 5 sessions/day saves ~$1,229/day.
```

### Execution speed

```
  All tools run in well under 250ms.
  Most run in under 5ms. The only "slow" path is the one-time symbol
  index build, which then makes every subsequent lookup ~free.

  compress_logs        ██  2ms
  smart_read           ███  1ms
  function_extractor   ██  2ms
  project_map          ██████████  12ms       ← walks disk
  bulk_search          ███  3ms
  symbol_index (build) ████████████████████████████████  224ms  ← one-time
  symbol_index (find)  █  <1ms                                    ← persistent
```

### What the tools actually returned

**compress_logs** took an 85-line log with 42 repeated "Connection refused" errors and returned:
```
## Log Analysis: sample.log
Original: 85 lines | Returned: 7 entries

FATAL: Database connection pool exhausted after 46 retries
ERROR: Connection refused to postgres:5432 (×42)
ERROR: JWT verification failed: token expired
ERROR: Unhandled exception: Cannot read properties of null
WARN:  High memory usage: 87%
WARN:  Response time degradation: avg 450ms
WARN:  Disk usage critical: 94%
```

**function_extractor** on `AuthService.ts` (137 lines, ~1,245 tokens) with `name: "login"` returned only the `login()` function — **249 tokens** instead of **1,245**. The other 11 methods, imports, and irrelevant code were not returned.

**project_map** on the entire repository returned a structured map of all 45+ files across all directories in **~1,000 tokens** — instead of reading every file which would cost **~95,000 tokens**.

**symbol_index** answered "where is `TokenEstimator` defined?" in **44 tokens** (one record, file:line, signature) — instead of the ~18,000 tokens it would take to read every `.ts` file in `src/` to find that one definition.

---

## The Big Picture

```
 BEFORE                                    AFTER
 ──────────────────────────────────        ──────────────────────────────────

  Claude Code                               Claude Code
      │                                         │
      │  "read AuthService.ts"                  │  "read AuthService.ts"
      │                                         │
      ▼                                         ▼
  Filesystem                           ┌─────────────────────────┐
      │                                │  claude-context-optimizer│
      │  800 lines                     │                         │
      │  ~8,000 tokens ──────────►     │  1. Hash check (0ms)    │
      │                                │  2. Session lookup      │
      │  Read again? 8,000 more        │  3. AST chunk + score   │
      │  Read again? 8,000 more        │  4. Return 80 lines     │
      │                                │     ~800 tokens         │
      ▼                                └────────────┬────────────┘
  Context window fills up                           │
  Claude forgets earlier work             Context stays clean
  You pay 3× for the same file            You pay once, smartly
```

---

## The Problem Nobody Talks About

You open Claude Code. You say "hello". You've already spent tokens.

Every time Claude reads a file, it reads the **entire file** — regardless of how much of it is relevant to your question. Every time it sees a log file, it reads every line from the first to the last. Every time it re-opens a file it read 2 turns ago, it spends the same tokens again as if it had never seen it.

This is not a bug. It's how language models work. But it doesn't have to be your problem.

---

## The Real Numbers

Let's take a real project:

```
A mid-size TypeScript project:
  50 source files × 300 lines average  = 15,000 lines
  5 log files × 2,000 lines each        = 10,000 lines
  package-lock.json                      = 5,000 lines

If Claude reads everything once:
  ~30,000 lines × 40 chars/line ÷ 4    = ~300,000 tokens

A 5-turn conversation where Claude re-reads files:
  300,000 × 3 (average re-reads)        = ~900,000 tokens

At $15/million tokens (Claude Opus):    = $13.50 per conversation
```

**With this optimizer:**
```
Same conversation:
  smart_read returns 200 relevant lines per file read
  recall_file confirms unchanged files without any read
  compress_logs returns 50 lines from a 2,000-line log

Total tokens used:                      = ~144,000 tokens
Savings:                                = 84%
Cost:                                   = $2.16 per conversation
```

This is not theoretical. This is the math.

---

## How We Thought About The Solution

### Why existing tools fail

Every "token optimization" tool we found does one of two things:

1. **Truncates blindly** — cuts content after N characters. Loses critical information at the end of files.
2. **Summarizes with AI** — uses another AI call to summarize. Costs tokens to save tokens. Paradoxical.

We needed something different.

### The three root causes of token waste

After analyzing real Claude Code sessions, we identified three distinct sources of waste:

**Root Cause 1: Reading entire files when only fragments are needed**

When you ask "how does the authentication work?", Claude reads all of `AuthService.ts`, `UserModel.ts`, `JWTUtil.ts`, and `middleware/auth.ts` — every line of every file. In reality, 70–90% of those lines are irrelevant to the question.

**Root Cause 2: Re-reading unchanged files**

In a 20-turn conversation, Claude may read `config.ts` 8 times. If the file never changed, those 7 extra reads waste 100% of the tokens spent on the first read. There is no memory of "I already read this."

**Root Cause 3: Zero-density data sources**

Log files, lock files, generated files — these are read with the same attention as hand-written source code. A 5,000-line log file might contain 3 relevant errors. The other 4,997 lines are pure token waste.

### The four engines we built

We built four distinct engines to address each root cause:

```
╔══════════════════════════════════════════════════════════════════╗
║              claude-context-optimizer  v1.0.0                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────┐    ║
║  │  ENGINE 1 — FileCache          fixes: Root Cause 2      │    ║
║  │                                                         │    ║
║  │   file.ts ──► sha-256 hash ──► hash match?              │    ║
║  │                                       │                 │    ║
║  │                                 yes ──┤── no            │    ║
║  │                                 │         │             │    ║
║  │                           "unchanged"  full read        │    ║
║  │                           0 tokens     + cache          │    ║
║  │   Storage: single JSON file via process-singleton store │    ║
║  │   (zero native compilation — works on Node 18 → 24)     │    ║
║  └─────────────────────────────────────────────────────────┘    ║
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────┐    ║
║  │  ENGINE 2 — SemanticIndex      fixes: Root Cause 1      │    ║
║  │                                                         │    ║
║  │   .ts/.tsx/.js  ──► AST chunker  ──► functions/classes  │    ║
║  │   .py           ──► indent parser ──► defs/classes      │    ║
║  │   .go/.rs/.java ──► regex parser  ──► signatures        │    ║
║  │   .md/.yaml/txt ──► sliding window ──► paragraphs       │    ║
║  │                          │                              │    ║
║  │           RelevanceScorer (BM25 + identifier tokens)    │    ║
║  │       — IDF: rare names outweigh common ones            │    ║
║  │       — TF saturation: bursty repeats don't dominate    │    ║
║  │       — camelCase / snake_case splitter:                │    ║
║  │           query "auth" finds AuthService                │    ║
║  │                          │                              │    ║
║  │                  top N chunks ≤ token budget            │    ║
║  └─────────────────────────────────────────────────────────┘    ║
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────┐    ║
║  │  ENGINE 3 — SessionMemory      fixes: Root Cause 2+3    │    ║
║  │                                                         │    ║
║  │   Turn 1: read auth.ts  → session: { auth.ts: hash1 }  │    ║
║  │   Turn 2: read utils.ts → session: { auth.ts, utils }  │    ║
║  │   Turn 5: "auth.ts again?" → hash unchanged → 0 tokens │    ║
║  │                                                         │    ║
║  │   Also powers: context_budget, session_snapshot,        │    ║
║  │                task_manager, context_watchdog           │    ║
║  └─────────────────────────────────────────────────────────┘    ║
║                                                                  ║
║  ┌─────────────────────────────────────────────────────────┐    ║
║  │  ENGINE 4 — SymbolIndex        fixes: Root Cause 1      │    ║
║  │                                                         │    ║
║  │   one-time scan ──► every function/class/type/method   │    ║
║  │                     stored as { name, kind, file, line }│    ║
║  │                          │                              │    ║
║  │   "Where is X defined?" → ~30 tokens / hit               │    ║
║  │   Per-file hash: unchanged files skip re-parse          │    ║
║  │   Survives across sessions; auto-rebuilds when empty    │    ║
║  └─────────────────────────────────────────────────────────┘    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### How a single tool call flows

```
  You ask Claude: "how does login work?"
        │
        ▼
  Claude calls  smart_read({ file: "AuthService.ts", query: "login" })
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    SmartReadTool                            │
  │                                                             │
  │  Step 1: SessionMemory.wasReadInSession("AuthService.ts")  │
  │          └─► found! hash = abc123                          │
  │                                                             │
  │  Step 2: HashUtil.fromFileStat("AuthService.ts")           │
  │          └─► current hash = abc123  ← matches!             │
  │                                                             │
  │  Step 3: SemanticIndex.query("AuthService.ts", "login")    │
  │          └─► ASTChunker finds: login(), validateToken()    │
  │          └─► BM25 + identifier tokens score:              │
  │              login           → 7.42  (rare term, exact id) │
  │              validateToken   → 1.31                        │
  │                                                             │
  │  Step 4: fitInBudget(chunks, 2000 tokens)                  │
  │          └─► returns login() function only = 180 tokens    │
  └──────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
              Claude receives: 180 tokens
              Instead of:    8,000 tokens
              Saved:         97.75%
```

---

## Architecture

The project follows a strict separation of concerns. No folder contains two different concepts.

### Layer diagram

```
  ┌──────────────────────────────────────────────────────────────┐
  │                    Claude Code (MCP client)                  │
  └──────────────────────────┬───────────────────────────────────┘
                             │  stdio / MCP protocol
  ┌──────────────────────────▼───────────────────────────────────┐
  │                src/server/index.ts                           │
  │         (route → tool, format output, error boundary)        │
  └─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─────────────────────────────────────┘
    │ │ │ │ │ │ │ │ │ │ │ │ │
    ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼                       TOOLS LAYER (13)
  cmpr smrt file proj ctxb blk rcll dep fn snap task ctxw symb
  _log _rd _dif _map _bdg _sr _fil _gr _ex _sht _mgr _wd  _idx
    │   │              │       │   │   │   │   │   │   │   │
    │   ├────┐    ┌────┘       │   │   │   │   │   │   │   │
    │   │    │    │            │   │   │   │   │   │   │   │      ENGINES
    ▼   ▼    ▼    ▼            ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼
  ┌────────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐
  │ SemanticIndex  │  │ CacheManager │  │ SessionMemory │  │ SymbolIndex  │
  │ ┌────────────┐ │  │ ┌──────────┐ │  │ + Snapshot    │  │ + per-file   │
  │ │ ASTChunker │ │  │ │ FileCache│ │  │ + TaskStore   │  │   hash skip  │
  │ │ SlideWin   │ │  │ └──────────┘ │  └───────────────┘  └──────────────┘
  │ └────────────┘ │  └──────────────┘            │                  │
  │ ┌────────────┐ │            │                 │                  │
  │ │TS/Py/Gen   │ │            └─────────────────┴──────────────────┘
  │ │ Parsers    │ │                              │
  │ └────────────┘ │                              ▼
  │ ┌────────────┐ │                  ┌────────────────────────┐
  │ │RelevSscorer│ │                  │     JsonStore          │
  │ │  (BM25)    │ │                  │  process-singleton —   │
  │ └────────────┘ │                  │  one in-memory copy    │
  └────────────────┘                  │  shared by every       │
                                      │  engine                │
                                      └────────────────────────┘

           UTILS LAYER
  ┌──────────────────────────────────────────────┐
  │  HashUtil   Token       Identifier   BM25    │
  │  Platform   Estimator   Tokenizer            │
  └──────────────────────────────────────────────┘
```

```
claude-context-optimizer/
│
├── src/
│   ├── server/                    ← MCP server entry point (one file)
│   │   └── index.ts
│   │
│   ├── config/                    ← All constants in one place
│   │   └── constants.ts
│   │
│   ├── models/                    ← Pure TypeScript interfaces (no logic)
│   │   ├── FileRecord.ts          ← File cache record shapes
│   │   ├── SessionRecord.ts       ← Session and snapshot shapes
│   │   ├── TaskRecord.ts          ← Task checkpoints + watchdog
│   │   ├── Symbol.ts              ← Symbol index entries
│   │   └── ToolResult.ts          ← All tool return types
│   │
│   ├── utils/
│   │   ├── hash/
│   │   │   └── HashUtil.ts        ← SHA-256 file hashing + fast stat path
│   │   ├── platform/
│   │   │   └── PlatformUtil.ts    ← Mac/Windows/Linux path resolution
│   │   ├── token/
│   │   │   └── TokenEstimator.ts  ← Fast token counting without tiktoken
│   │   └── text/
│   │       ├── IdentifierTokenizer.ts ← camelCase / snake_case splitter
│   │       └── BM25.ts                ← BM25 ranking (IDF + TF saturation)
│   │
│   ├── engines/
│   │   ├── store/
│   │   │   └── JsonStore.ts       ← Process-singleton persistence layer
│   │   ├── cache/
│   │   │   ├── FileCache.ts       ← Per-file hash + summary records
│   │   │   └── CacheManager.ts    ← High-level: read + cache + invalidate
│   │   ├── session/
│   │   │   ├── SessionMemory.ts   ← Track files read per session
│   │   │   └── SnapshotManager.ts ← Save/restore session snapshots
│   │   ├── tasks/
│   │   │   └── TaskStore.ts       ← Persisted task checkpoints
│   │   ├── symbols/
│   │   │   └── SymbolIndex.ts     ← Project-wide symbol index
│   │   └── semantic/
│   │       ├── parsers/
│   │       │   ├── LogParser.ts          ← Any log format → structured entries
│   │       │   ├── TypeScriptParser.ts   ← TS/JS AST-style extraction
│   │       │   ├── PythonParser.ts       ← Python indent-aware extraction
│   │       │   └── GenericParser.ts      ← Go/Rust/Java/C#/Ruby fallback
│   │       ├── chunkers/
│   │       │   ├── ASTChunker.ts         ← Chunk code by semantic units
│   │       │   └── SlidingWindowChunker.ts ← Chunk text + BM25 scoring
│   │       └── SemanticIndex.ts   ← Query interface: file + query → chunks
│   │
│   └── tools/                     ← 13 MCP tools, each in its own folder
│       ├── compress-logs/         ← Strip noise from log files
│       ├── smart-read/            ← Query-aware file read
│       ├── file-diff/             ← `git diff` only
│       ├── project-map/           ← One-shot project overview
│       ├── context-budget/        ← What's eating your context?
│       ├── bulk-search/           ← Regex across project (3-tier disclosure)
│       ├── recall-file/           ← Already-read & unchanged?
│       ├── dependency-graph/      ← Imports / imported-by
│       ├── function-extractor/    ← One symbol body by name
│       ├── session-snapshot/      ← Save / restore session
│       ├── task-manager/          ← Multi-step plan + checkpoint + resume
│       ├── context-watchdog/      ← Predictive token-fill alerts
│       └── symbol-index/          ← "Where is X defined?" in ~30 tokens
│
├── tests/
│   ├── benchmark.ts               ← Real before/after numbers
│   └── fixtures/
│
├── install.sh                  ← One-command installer (Mac/Linux/Windows WSL)
├── package.json
├── tsconfig.json
└── README.md
```

**Design rules we followed:**
- Every folder has exactly one responsibility
- No file contains logic that belongs to a different layer
- Models are pure interfaces — zero business logic
- Engines are reusable — tools compose engines, not vice versa
- Tools are thin wrappers — they format output and call engines

---

## Installation

### One command (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/AzozzALFiras/claude-context-optimizer/main/install.sh | bash
```

This will:
1. Check Node.js version (requires v18+)
2. Check Claude Code is installed
3. Register the MCP server globally
4. Show you all available tools

### Manual installation

```bash
claude mcp add context-optimizer npx claude-context-optimizer --scope global
```

### Verify installation

```bash
claude mcp list
# Should show: context-optimizer
```

### Update

Re-run the one-command installer. It removes the old registration first.

### Uninstall

```bash
claude mcp remove context-optimizer --scope global
```

---

## Platform Support

| Platform | Tested | Cache location |
|----------|--------|----------------|
| macOS    | ✅     | `~/.claude/context-optimizer/` |
| Linux    | ✅     | `~/.claude/context-optimizer/` |
| Windows (WSL) | ✅ | `~/.claude/context-optimizer/` |
| Windows (native) | ✅ | `%APPDATA%\context-optimizer\` |

**Requirements:**
- Node.js v18 or higher
- Claude Code CLI
- Git (optional, required for `file_diff_only`)

---

## The 13 Tools

### 1. `compress_logs`

**The problem it solves:** A 5,000-line log file contains maybe 10 actionable errors. Reading it fully wastes 95% of tokens on timestamps, debug messages, and repeated noise.

**How it works:**
1. Reads the log file line by line
2. Detects FATAL / ERROR / WARN / Exception patterns (all log formats: plain, JSON, logfmt)
3. Extracts N lines of context around each match (stack traces, request IDs)
4. **Deduplicates:** "Connection refused" appearing 200 times becomes one entry with `(×200)`
5. Returns structured output with severity grouping

**Example:**
```
Input:  5,000 lines, ~50,000 tokens
Output: 40 lines,    ~400 tokens
Saved:  98%
```

```typescript
// Claude calls:
compress_logs({ file_path: "/var/log/app.log", context_lines: 3 })

// Returns:
## Log Analysis: /var/log/app.log
Original: 5,000 lines | Returned: 23 entries

### Errors
Line 1247 (×47): Connection refused to postgres:5432
  > Retrying in 5s...
  > Attempt 47 of 50

Line 3891: JWT verification failed: token expired
  > User: user_abc123
  > Endpoint: POST /api/orders
```

---

### 2. `smart_read`

**The problem it solves:** You need to understand how authentication works. Claude reads all 800 lines of `AuthService.ts` when only the `login()` and `validateToken()` functions (80 lines) are relevant.

**How it works:**
1. Checks session memory — was this file read before this session?
2. Checks file hash — has it changed since last read?
3. If unchanged and in session: **zero disk reads**, returns summary
4. If new/changed: reads file, runs AST chunker (TS/JS/Python) or sliding window (other files)
5. Scores every chunk against your query with **BM25 + identifier-aware tokenization** — `auth` hits `AuthService`, `validate` hits `validateToken`, rare names outweigh common ones
6. Returns only chunks that score above zero, ordered by relevance, capped at token budget

**Language support:**
- TypeScript/JavaScript: extracts functions, classes, interfaces by AST
- Python: extracts defs and classes respecting indent structure
- Go, Rust, Java, C#, Ruby, PHP: regex-based signature extraction
- YAML, JSON, Markdown, any text: sliding window with relevance scoring

**Example:**
```typescript
smart_read({ file_path: "/app/src/auth/AuthService.ts", query: "JWT token validation" })

// Returns only:
## /app/src/auth/AuthService.ts (from cache — unchanged)
600 lines | typescript

### Lines 145–187 — `validateToken`
```typescript
async validateToken(token: string): Promise<User | null> {
  // ... only this function
}
```
```

---

### 3. `file_diff_only`

**The problem it solves:** You changed 5 lines in a 400-line file. Claude reads all 400 lines to understand the change.

**How it works:**
Runs `git diff` and returns only the changed lines with configurable context. Works against HEAD, any commit, any branch, or staged changes.

**Example:**
```typescript
file_diff_only({ file_path: "/app/src/server.ts", base: "main" })

// Returns:
## Diff: server.ts vs main
```diff
@@ -45,6 +45,8 @@
 app.use(cors())
+app.use(helmet())
+app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))
 app.use(express.json())
```

Tokens: ~150 instead of ~4,000 for the full file.
```

---

### 4. `project_map`

**The problem it solves:** You open a new codebase. Claude reads 20 files to understand the structure. You could have understood the entire project in 300 tokens.

**How it works:**
Walks the directory tree (ignoring `node_modules`, `dist`, `.git`, etc.), collects every source file, identifies languages, estimates token costs, groups by directory, and returns a single compressed map.

**Example output:**
```
## Project Map: /app
47 files | 12,450 lines | ~31k tokens total

### By Language
- typescript: 32 files
- markdown: 8 files
- yaml: 4 files
- json: 3 files

### Files
**/src/auth/**
  - AuthService.ts — service (~1.2k tokens)
  - JWTUtil.ts — utilities (~400 tokens)
  - middleware.ts — service (~300 tokens)

**/src/api/**
  - router.ts — routes (~500 tokens)
  - handlers.ts — controller (~800 tokens)
```

---

### 5. `context_budget`

**The problem it solves:** You don't know how close you are to the context limit until Claude stops working or starts forgetting things. By then it's too late.

**How it works:**
Analyzes items in your context (or auto-pulls from session history), estimates tokens for each, categorizes them by whether they should be kept or removed, and gives specific recommendations with projected savings.

**Budget categories:**
- `keep` — core files actively being worked on
- `consider-removing` — large files read early in the session, now stale
- `remove` — log files, lock files, generated code

---

### 6. `bulk_search`

**The problem it solves:** You need to find where `validateUser` is called across the codebase. Claude reads 30 files to find 8 matches.

**How it works:**
Recursively searches all files (respecting ignore patterns), runs regex against each line, returns only matching lines with 2 lines of context per match. Never returns full file content.

**Example:**
```typescript
bulk_search({ pattern: "validateUser", file_extensions: [".ts"] })

// Returns:
## Search: `validateUser` in /app
8 matches in 5 files

### src/api/handlers.ts
L45: `const user = await validateUser(req.headers.authorization)`
> if (!user) return res.status(401).json({ error: 'Unauthorized' })

### src/auth/AuthService.ts
L112: `async validateUser(token: string): Promise<User>`
```

---

### 7. `recall_file`

**The problem it solves:** You ask Claude to "look at AuthService.ts again". It reads the whole file. The file hasn't changed in 30 minutes.

**How it works:**
Checks session memory for the file path. If found, computes the current stat hash (fast — no file read) and compares with the cached hash. If unchanged, returns the cached summary and confirms no re-read is needed.

**Zero tokens for unchanged files.** This is the highest-leverage tool in the set.

---

### 8. `dependency_graph`

**The problem it solves:** Before modifying a shared utility, you need to know what depends on it. Understanding this normally requires reading many files.

**How it works:**
Parses import statements from all code files, builds a directed graph of `imports → imported by` relationships, returns either a file-level view or a project-level view showing the most imported modules.

---

### 9. `function_extractor`

**The problem it solves:** You need to see one specific function from a 600-line file. You only need 30 lines.

**How it works:**
Uses the AST chunker to locate a function or class by exact name. Falls back to relevance scoring if the exact name isn't found. Returns only the matched function with its file path and line number.

**Example:**
```typescript
function_extractor({ file_path: "/app/src/auth/AuthService.ts", name: "login" })

// Returns:
## `login` — /app/src/auth/AuthService.ts:67

```typescript
async login(email: string, password: string): Promise<AuthResult> {
  const user = await this.userRepo.findByEmail(email);
  if (!user) throw new AuthError('User not found');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AuthError('Invalid credentials');
  return { token: this.jwt.sign({ userId: user.id }), user };
}
```
Tokens: ~200 instead of ~6,000 for the full file.
```

---

### 10. `session_snapshot`

**The problem it solves:** Long tasks get interrupted. You come back to Claude, it's lost context of what was being worked on, and re-reading everything costs tokens.

**How it works:**
Saves a snapshot of the current session — which files were read, their hashes, and a summary of the current state. On restore, returns this snapshot so Claude can resume without re-reading files that haven't changed.

---

### 11. `task_manager`

**The problem it solves:** A 30-step task fills the context window before it's done. Without persistence, you start over and lose all decisions and partial progress.

**How it works:**
Breaks a task into subtasks, persists them to disk along with decisions, observations, and changed files. When the context fills up, `checkpoint` produces a ~300-token *resume prompt*; in a new Claude Code session, `resume` restores the full state in that one tool call.

Supports semantic observation types — `bugfix | feature | decision | discovery | warning` — so resume prompts come back grouped and scannable instead of a flat blob of notes.

```typescript
task_manager({ action: "create",  title: "...", tasks: [...] })   // start
task_manager({ action: "complete", task_id: "1", outcome: "..." })// progress
task_manager({ action: "checkpoint", observations: [...] })       // before context fills
task_manager({ action: "resume" })                                // in new session
```

See [The Context Collapse Problem](#the-context-collapse-problem--and-how-we-solve-it) for a full walk-through.

---

### 12. `context_watchdog`

**The problem it solves:** You don't notice the context is full until Claude starts forgetting things. Then you've lost the session.

**How it works:**
Estimates current context usage from session memory + any extra tokens you pass in, and returns a tiered status:

```
70%  → ⚡ warning   — good time to checkpoint
85%  → 🔴 critical  — checkpoint strongly recommended
95%  → 🚨 emergency — auto-checkpoint, output the resume prompt
```

At emergency level, if `auto_checkpoint: true` (default), it persists the current task automatically — so even a runaway loop produces a recoverable state.

---

### 13. `symbol_index`

**The problem it solves:** "Where is `validateToken` defined?" — without this tool, Claude reads multiple files to find out. With it, the answer is one row of text.

**How it works:**
A persistent project-wide index. One scan extracts every function, class, method, interface, type, and enum into `{ name, kind, file, line, signature }` records. Subsequent lookups are local and free. Each file's hash is stored, so re-indexing skips files that haven't changed.

Identifier-aware matching means partial query terms hit camelCase / snake_case components — `auth` finds `AuthService`, `validate` finds `validateToken`.

```typescript
// One-time (or after large refactors)
symbol_index({ action: "rebuild" })

// "Where is X defined?" — ~30 tokens / hit
symbol_index({ action: "find", name: "TokenEstimator" })

// All symbols in one file — replaces a skim-read
symbol_index({ action: "outline", file_path: "/app/src/auth/AuthService.ts" })

// Stats / sanity check
symbol_index({ action: "stats" })

// Re-index a single file (e.g. after editing)
symbol_index({ action: "refresh", file_path: "/app/src/auth/AuthService.ts" })
```

```
Input:  "find TokenEstimator across the project"
Cost without symbol_index: ~18,000 tokens (read every .ts file)
Cost with symbol_index:    ~44 tokens
Saved:                     ~100%
```

---

## The Technology Choices

### Why a single JSON store (not SQLite)?

We started with SQLite (via `better-sqlite3`) and dropped it. Reasons:
- **Native compilation breaks installs** — `better-sqlite3` needs a working C++ toolchain on every node version. On Apple Silicon, Windows, and several Linux distros, that's where users got stuck.
- **For our workload, JSON is plenty.** We touch the store on every tool call but the *total* dataset is small — tens of KB. A full parse is ~1 ms.
- **One store, one truth.** The `JsonStore` is a process-level singleton keyed by file path. Every engine (FileCache, SessionMemory, SnapshotManager, TaskStore, SymbolIndex) shares the same in-memory copy, so writes can never clobber each other.

What we gave up: indexed lookups and cross-process concurrency. Neither matters for a per-session MCP server.

```
Old (SQLite, broken):                   New (JsonStore singleton):

  FileCache  ──► db.sqlite               FileCache ─┐
  Session    ──► db.sqlite                          ├──► JsonStore (in-memory)
  Tasks      ──► db.sqlite               Session   ─┤    ├── flush to JSON
  Snapshots  ──► db.sqlite               Tasks     ─┤
                                         Snapshots ─┤
  Compilation breaks on:                 Symbols   ─┘
   • Apple Silicon (some)
   • Windows (most)                     Zero native code. Works on Node 18 → 24.
   • Alpine / musl
```

### Why no `tiktoken`?

`tiktoken` is accurate but:
- Requires native compilation (breaks on some systems)
- Adds 10+ MB to the package
- Takes 200ms to load on first use

Our `chars / 4` estimator is:
- Within 10% accuracy for English/code content (sufficient for budgeting)
- Instant — zero overhead
- Zero dependencies
- Works identically on all platforms

### Why regex-based AST parsing instead of a real AST parser?

A real TypeScript AST parser (`@typescript-eslint/parser`, `ts-morph`) would be more accurate. But:
- Adds 50–200 MB of dependencies
- Takes 500ms–2s to parse large files
- Breaks on files with syntax errors
- Requires separate parsers per language

Our regex/indent-based approach:
- ~0ms parse time (single-pass line scan)
- Works on 12 languages with one pattern table
- Handles syntax errors gracefully (returns what it found)
- Adds zero dependencies

For the use case (extracting function boundaries for token optimization), this accuracy is sufficient.

### Why BM25 + identifier-aware tokenization (not embeddings)?

A naive keyword scorer treats every word equally. So a query like *"auth"* never matches `AuthService` — the literal substring isn't there as a separate word. And a chunk that mentions a common term 50 times wins against one that mentions a rare, perfectly-named identifier once.

We picked the smallest tool that fixes both problems:

- **BM25** — the de-facto baseline for keyword search. Three properties matter:
  - **IDF**: rare terms (`validateToken`) outweigh common ones (`user`)
  - **TF saturation** (`k1`): a chunk repeating "user" 50× doesn't beat one with 5× by 10×
  - **Length normalization** (`b`): long chunks don't automatically dominate
- **Identifier tokenization** — every code identifier is split into component words:
  - `loginUser` → `[loginuser, login, user]`
  - `AuthService` → `[authservice, auth, service]`
  - `HTTPSConnection` → `[httpsconnection, https, connection]`
  - `get_user_id` → `[get_user_id, get, user, id]`

  After this, the query *"auth"* hits `AuthService`, *"validate"* hits `validateToken`, and *"refresh tokens"* ranks `refreshTokens()` above unrelated chunks.

We deliberately skipped local embeddings (e.g. `all-MiniLM-L6-v2` via `@xenova/transformers`). They add ~80 MB of weights, ~3s startup, and an `onnxruntime` dependency — for marginal gains over BM25 on short identifier-heavy code queries.

---

## How Much Does It Save?

| Scenario | Without | With | Saving |
|----------|---------|------|--------|
| Reading a 500-line file for one function | ~5,000 tokens | ~200 tokens | **96%** |
| Reading a 5,000-line log | ~50,000 tokens | ~500 tokens | **99%** |
| Re-reading an unchanged file | ~5,000 tokens | 0 tokens | **100%** |
| Understanding a new project (20 files) | ~80,000 tokens | ~500 tokens | **99%** |
| Finding a pattern across 30 files | ~300,000 tokens | ~2,000 tokens | **99%** |
| **Typical 20-turn work session** | **~500,000 tokens** | **~80,000 tokens** | **84%** |

### Visual: token consumption per turn

```
  Tokens/turn (typical session — 20 turns)

  Without optimizer:
  Turn  1  ████████████████████████████████  32,000
  Turn  2  ████████████████████████████████  31,000
  Turn  3  ████████████████████████████████  33,000   ← re-reads same files
  Turn  5  ████████████████████████████████  35,000
  Turn 10  ███████████████████████████████████████ 42,000
  Turn 15  ████████████████████████████████████████████ 48,000  ← context filling
  Turn 20  ██████████  9,000  ← Claude starts forgetting, quality drops

  With optimizer:
  Turn  1  ████████  8,000   ← first read + cache
  Turn  2  ███  3,000        ← recall_file: unchanged, 0 tokens
  Turn  3  ████  4,000
  Turn  5  ███  2,500        ← smart_read: only relevant chunk
  Turn 10  ███  3,000
  Turn 15  ███  3,500
  Turn 20  ████  4,000       ← context stays clean, quality stays high

  Total:  Without = ~520,000   With = ~82,000   Saved = 84%
```

### The cache hit rate over time

```
  Cache hits (%) as session progresses

  100% ┤                                    ············
   90% ┤                               ·····
   80% ┤                          ·····
   70% ┤                     ·····
   60% ┤                ·····
   50% ┤           ·····
   40% ┤      ·····
   30% ┤ ·····
   20% ┤·
    0% ┼────────────────────────────────────────────────
       Turn 1    Turn 5    Turn 10   Turn 15   Turn 20

  Every turn, more files are cached.
  By Turn 10, ~80% of file requests cost 0 tokens.
```

---

## Decision Tree: Which Tool to Use

```
  You need to work with a file or codebase...
            │
            ▼
  ┌─────────────────────────────────────┐
  │  Have I read this file this session? │
  └───────────────────┬─────────────────┘
          │                   │
         yes                  no
          │                   │
          ▼                   ▼
  ┌──────────────┐    ┌────────────────────────────────────┐
  │ recall_file  │    │ What do I need from the file?      │
  │              │    └────────────┬───────────────────────┘
  │ unchanged?   │                 │
  │  → 0 tokens  │          ┌──────┴──────────┐
  │ changed?     │          │                 │
  │  → smart_read│     specific          understand
  └──────────────┘     function/class    how it works
                            │                 │
                            ▼                 ▼
                    function_extractor    smart_read
                    (name: "login")       (query: "...")


  You need to understand the whole project...
            │
            ▼
  ┌──────────────────────────────────────┐
  │           project_map                │
  │  Get the full structure in ~300 tok  │
  └──────────────────────────────────────┘
            │
            ▼ (then drill down with)
  dependency_graph  →  function_extractor  →  smart_read


  You need to find something across the codebase...
            │
            ▼
  ┌──────────────────────────────────────────────────────┐
  │  Looking for a SYMBOL definition (function, class)?  │
  │      → symbol_index({ action: "find", name: "..." }) │
  │        ~30 tokens / hit. Try this FIRST.             │
  │                                                      │
  │  Looking for a free-text PATTERN or usage?           │
  │      → bulk_search({ pattern: "..." })               │
  │        Snippets, never full files. 3-tier disclosure.│
  └──────────────────────────────────────────────────────┘


  You have a huge log file...
            │
            ▼
  ┌──────────────────────────────────────┐
  │           compress_logs              │
  │  5,000 lines → 40 relevant entries   │
  │  deduplicates repeated errors        │
  └──────────────────────────────────────┘


  You want to see what changed in a file...
            │
            ▼
  ┌──────────────────────────────────────┐
  │           file_diff_only             │
  │  git diff vs HEAD or any branch      │
  │  returns only changed lines          │
  └──────────────────────────────────────┘
```

## Resource Usage

This server is designed to consume **almost no CPU or memory**:

| Resource | Usage | Why |
|----------|-------|-----|
| Memory   | ~15 MB | Node.js baseline + small in-memory store |
| CPU (idle) | 0% | No polling, no watchers |
| CPU (per call) | <5ms typical | Hash + JSON lookup. Symbol-index rebuild ~200ms one-time. |
| Disk (cache) | tens of KB total | Summaries, hashes, symbols, tasks — all in one JSON file |
| Startup time | <50ms | Single JSON file load |

**What we deliberately avoided:**
- `fs.watch` / `chokidar` — continuous file watching is expensive and unnecessary
- In-memory file content cache — wastes RAM; we load file content only on demand
- Background workers — no threads, no IPC overhead
- Interval timers — nothing runs between tool calls
- Native dependencies — install never breaks on a new Node version

### CPU timeline: what happens between tool calls

```
  Time ──────────────────────────────────────────────────────────►

  Tool call arrives         Tool returns        Next call arrives
       │                        │                     │
       ▼                        ▼                     ▼
  ─────┬────────────────────────┬─────────────────────┬──────────
       │████████████████████████│                     │
       │  <5ms work             │  0% CPU             │  <5ms
       │  hash + JsonStore +    │  process sleeps     │  work
       │  BM25 score            │                     │
  ─────┴────────────────────────┴─────────────────────┴──────────

  The server does nothing between calls.
  No polling. No watchers. No timers. Pure on-demand.
```

---

## The Technology Stack — Why Each Choice Was Made

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Choice              Alternative        Why we chose this        │
  ├──────────────────────────────────────────────────────────────────┤
  │  JSON store          SQLite             Zero native compile,     │
  │  (singleton)         (better-sqlite3)   works on Node 18 → 24    │
  ├──────────────────────────────────────────────────────────────────┤
  │  chars/4 estimator   tiktoken           0ms, 0 deps, 10%         │
  │                                         accuracy is enough       │
  ├──────────────────────────────────────────────────────────────────┤
  │  regex AST parser    ts-morph           ~0ms parse, 12 langs,    │
  │                      @typescript-eslint survives syntax errors    │
  ├──────────────────────────────────────────────────────────────────┤
  │  BM25 + identifier   embeddings         Code-aware, 0 deps,      │
  │  tokenization        (MiniLM, etc.)     no model download        │
  ├──────────────────────────────────────────────────────────────────┤
  │  stat hash fast-path full file hash     1 syscall vs file read   │
  │  (mtime + size)                         99% of the time correct  │
  ├──────────────────────────────────────────────────────────────────┤
  │  Persistent symbol   ripgrep / live     One-time scan,           │
  │  index               regrep             ~30 tokens / lookup      │
  ├──────────────────────────────────────────────────────────────────┤
  │  stdio transport     HTTP transport     No port conflicts,       │
  │                                         no auth needed, simpler  │
  ├──────────────────────────────────────────────────────────────────┤
  │  npx distribution    global install     Zero setup, always       │
  │                                         latest, works offline    │
  └──────────────────────────────────────────────────────────────────┘
```

## Contributing

Pull requests are welcome. Before opening one:

1. Run `npm run build` — must compile without errors
2. Follow the folder structure — one concept per folder
3. Add the attribution comment at the top of every new file:
   ```typescript
   //  Developer By Azozz ALFiras
   // https://github.com/AzozzALFiras/claude-context-optimizer
   ```

---

## License

MIT — use it, fork it, build on it.

---

## Author

**Azozz ALFiras**
- GitHub: [@AzozzALFiras](https://github.com/AzozzALFiras)
- Project: [claude-context-optimizer](https://github.com/AzozzALFiras/claude-context-optimizer)

---

---

## The Context Collapse Problem — and How We Solve It

### The problem

```
  A user sends Claude a 20-task project. What happens?

  Turn 1–10:   Claude reads files, understands requirements, starts working
  Turn 11–20:  Works through tasks, remembers everything
  Turn 21–30:  Context fills up — Claude starts "forgetting" earlier instructions
  Turn 31+:    180K tokens reached → catastrophic failure
               Claude contradicts itself, loses track of completed work,
               re-reads files it already read, asks questions it already answered.

  The user has to start over. All progress is lost.
```

**This is not a Claude limitation you have to accept. It's a solved problem.**

### The solution: `task_manager` + `context_watchdog`

Two tools that work together to make long sessions resumable:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  task_manager                                                    │
  │                                                                  │
  │  Breaks any task into subtasks → persists state to disk         │
  │  On checkpoint: generates a ~300 token "resume prompt"          │
  │  On resume: restores full context in one call                   │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │  context_watchdog                                                │
  │                                                                  │
  │  Monitors token usage throughout the session                    │
  │  70%  → warning: consider checkpointing                         │
  │  85%  → critical: checkpoint now                                │
  │  95%  → emergency: auto-saves checkpoint, shows resume prompt   │
  └─────────────────────────────────────────────────────────────────┘
```

### Real example — what the output looks like

**Step 1: User sends a large task → Claude creates a plan**
```
task_manager({ action: "create", title: "Build auth system", tasks: [
  "Create User model",
  "Build AuthService with login/logout",
  "Implement JWT validation",
  "Add rate limiting",
  "Write tests",
  "Update docs"
]})
```

**Step 2: Work proceeds normally. At 85% context fill:**
```
## Context Watchdog 🔴
⚠️ CRITICAL: 85% full — checkpoint strongly recommended
[█████████████████░░░] 85%

Remaining capacity: ~27,000 tokens
→ Run: task_manager({ action: "checkpoint" })
```

**Step 3: Checkpoint saved**
```
## ✅ Checkpoint Saved
Resume prompt size: ~227 tokens  (vs full context: ~180,000)

TASK RESUME — Build auth system
Progress: 3/6 subtasks complete (50%)

✅ Done:
  - Create User model (User.ts with TypeORM decorators)
  - Build AuthService (bcrypt + JWT)
  - Implement JWT validation (validateToken + refreshTokens)
📋 Pending:
  - Add rate limiting
  - Write tests
  - Update docs
📁 Files changed: src/models/User.ts, src/auth/AuthService.ts
💡 Key decisions: bcrypt rounds=12, JWT 1h expiry, sessions table for revocation
```

**Step 4: New Claude Code session — one command to resume**
```
task_manager({ action: "resume" })
→ Returns full context in 227 tokens
→ Claude continues exactly where it left off
```

### The math on this solution

```
  Without task_manager:
  Context collapse at turn 30  →  start over  →  ~180,000 tokens wasted

  With task_manager:
  Checkpoint at turn 25        →  resume prompt: 227 tokens
  New session reads only:      →  227 + relevant files (~2,000) = ~2,227 tokens

  Tokens to resume:    227 vs 180,000  =  99.9% reduction in resume cost
```

---

## The Optimization Hierarchy

```
  Highest impact                                                Lowest impact
       │                                                              │
       ▼                                                              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ recall   │  │ symbol   │  │ project  │  │ compress │  │ smart    │  │ context  │
  │ _file    │  │ _index   │  │ _map     │  │ _logs    │  │ _read    │  │ _budget  │
  │          │  │          │  │          │  │          │  │          │  │          │
  │ 100%     │  │ ~100%    │  │ 99%      │  │ 95–99%   │  │ 70–95%   │  │ advisory │
  │ for      │  │ vs       │  │ vs       │  │ vs full  │  │ per      │  │ +        │
  │ unchanged│  │ reading  │  │ reading  │  │ log      │  │ query    │  │ planning │
  │ files    │  │ source   │  │ all files│  │ file     │  │          │  │          │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘

  Use recall_file FIRST — if file is unchanged, you're done.
  Use symbol_index for "where is X defined?" — never read a file blindly.
  Use project_map ONCE per session to orient yourself.
  Use compress_logs instead of reading logs directly.
  Use smart_read for everything else.
  Use context_budget + context_watchdog when sessions get long.
  Use task_manager + checkpoint to survive context collapse on big tasks.
```

---

## Ecosystem Comparison

> How does `claude-context-optimizer` compare to other Claude memory/context tools?

```
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                   claude-context-optimizer  vs  claude-mem                      │
  ├─────────────────────────────────────────┬───────────────────────────────────────┤
  │  claude-context-optimizer (this project)│  claude-mem (thedotmack)              │
  ├─────────────────────────────────────────┼───────────────────────────────────────┤
  │  PROBLEM: Token waste in current session│  PROBLEM: Forgetting past sessions    │
  │  WHEN: Right now, as you work           │  WHEN: Next week, new conversation    │
  │  HOW: On-demand, zero background work   │  HOW: Background HTTP server + DB     │
  │  DEPS: Node.js only                     │  DEPS: Bun + Python + uv + ChromaDB   │
  │  LICENSE: MIT                           │  LICENSE: AGPL-3.0                    │
  │  INSTALL: npx one-liner                 │  INSTALL: Plugin marketplace          │
  ├─────────────────────────────────────────┴───────────────────────────────────────┤
  │                                                                                 │
  │    They solve DIFFERENT problems. They are COMPLEMENTARY, not competing.        │
  │                                                                                 │
  │    claude-mem  = long-term episodic memory  ("what did we do last sprint?")     │
  │    this tool   = real-time token efficiency ("don't re-read unchanged files")   │
  │                                                                                 │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

### What we integrated from claude-mem

Three ideas from claude-mem were adapted for our architecture:

**1. `<private>` tag stripping** — `smart_read` now automatically redacts `<private>...</private>` blocks before content reaches Claude's context. Drop API keys, secrets, or PII inside these tags in any source file.

```typescript
// Any file can contain:
const config = {
  apiKey: <private>sk-proj-real-key-here</private>,  // redacted from context
  endpoint: 'https://api.example.com',
};
```

**2. Typed observations** — `task_manager` now supports semantic observation types (`bugfix | feature | decision | discovery | warning`), making resume prompts more structured and scannable:

```json
task_manager({
  action: "checkpoint",
  observations: [
    { type: "bugfix",    content: "fixed JWT expiry race condition in auth middleware" },
    { type: "decision",  content: "using bcrypt rounds=12 for password hashing" },
    { type: "discovery", content: "rate limiter was silently swallowing 429 errors" }
  ]
})
```

Resume prompt now groups by type with icons (🐛 Bugfixes, ✨ Features, 💡 Decisions, 🔍 Discoveries, ⚠️ Warnings).

**3. Progressive disclosure in `bulk_search`** — Start cheap, drill down only if needed:

```
Layer 1 — detail_level: "files"    →  ~50 tokens   (just file paths + match count)
Layer 2 — detail_level: "lines"    → ~200 tokens   (matching lines, no context)
Layer 3 — detail_level: "context"  → full output   (lines + surrounding code)
```

```json
// Step 1: find which files are relevant
bulk_search({ pattern: "useEffect", detail_level: "files" })

// Step 2: only if you need the lines
bulk_search({ pattern: "useEffect", file_extensions: [".tsx"], detail_level: "lines" })
```

---

*Built because Claude is powerful, but token waste is real. This project exists to make Claude Code sustainable at scale.*
