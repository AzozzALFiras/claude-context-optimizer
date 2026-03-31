#!/usr/bin/env node
//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { CacheManager }           from '../engines/cache/CacheManager.js';
import { SessionMemory }          from '../engines/session/SessionMemory.js';
import { CompressLogsTool }       from '../tools/compress-logs/CompressLogsTool.js';
import { SmartReadTool }          from '../tools/smart-read/SmartReadTool.js';
import { FileDiffTool }           from '../tools/file-diff/FileDiffTool.js';
import { ProjectMapTool }         from '../tools/project-map/ProjectMapTool.js';
import { ContextBudgetTool }      from '../tools/context-budget/ContextBudgetTool.js';
import { BulkSearchTool }         from '../tools/bulk-search/BulkSearchTool.js';
import { RecallFileTool }         from '../tools/recall-file/RecallFileTool.js';
import { DependencyGraphTool }    from '../tools/dependency-graph/DependencyGraphTool.js';
import { FunctionExtractorTool }  from '../tools/function-extractor/FunctionExtractorTool.js';
import { SessionSnapshotTool }    from '../tools/session-snapshot/SessionSnapshotTool.js';
import { TaskManagerTool }        from '../tools/task-manager/TaskManagerTool.js';
import { ContextWatchdogTool }    from '../tools/context-watchdog/ContextWatchdogTool.js';
import { SERVER_NAME, SERVER_VERSION } from '../config/constants.js';

// Shared singletons — one DB connection per process
const cache   = new CacheManager();
const session = new SessionMemory();

// Tool instances
const tools = {
  compress_logs:      new CompressLogsTool(),
  smart_read:         new SmartReadTool(cache, session),
  file_diff_only:     new FileDiffTool(),
  project_map:        new ProjectMapTool(),
  context_budget:     new ContextBudgetTool(session),
  bulk_search:        new BulkSearchTool(),
  recall_file:        new RecallFileTool(cache, session),
  dependency_graph:   new DependencyGraphTool(),
  function_extractor: new FunctionExtractorTool(cache),
  session_snapshot:   new SessionSnapshotTool(session),
  task_manager:       new TaskManagerTool(session),
  context_watchdog:   new ContextWatchdogTool(session),
};

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name:        'compress_logs',
      description: 'Summarize a large log file — returns only errors, warnings, and fatals with context. Deduplicates repeated entries. Saves 90–95% tokens vs reading the full file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path:     { type: 'string', description: 'Absolute path to the log file' },
          context_lines: { type: 'number', description: 'Lines of context around each entry (default: 3)' },
          max_entries:   { type: 'number', description: 'Maximum entries to return (default: 100)' },
        },
        required: ['file_path'],
      },
    },
    {
      name:        'smart_read',
      description: 'Read a file and return only the sections relevant to a specific query. Uses AST parsing for code files. Caches results — re-reading unchanged files costs 0 tokens.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path:  { type: 'string', description: 'Absolute path to the file' },
          query:      { type: 'string', description: 'What you are looking for in this file' },
          max_tokens: { type: 'number', description: 'Token budget for returned content (default: 2000)' },
        },
        required: ['file_path', 'query'],
      },
    },
    {
      name:        'file_diff_only',
      description: 'Return the git diff of a file instead of reading it fully. Ideal for understanding recent changes. Saves 85% tokens vs full file read.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file' },
          base:      { type: 'string', description: 'Base commit or branch (default: HEAD)' },
          staged:    { type: 'boolean', description: 'Show staged changes only (default: false)' },
          context:   { type: 'number', description: 'Lines of context around changes (default: 3)' },
        },
        required: ['file_path'],
      },
    },
    {
      name:        'project_map',
      description: 'Generate a compressed map of the entire project — all files, languages, and token estimates. Understand any codebase in ~300 tokens instead of reading every file.',
      inputSchema: {
        type: 'object',
        properties: {
          root_path:            { type: 'string', description: 'Root directory to map (default: cwd)' },
          show_token_estimates: { type: 'boolean', description: 'Include per-file token estimates (default: true)' },
        },
      },
    },
    {
      name:        'context_budget',
      description: 'Analyze current token usage and get recommendations on what to remove from context. Tracks all files read this session.',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Items to analyze',
            items: {
              type: 'object',
              properties: {
                label:    { type: 'string' },
                content:  { type: 'string' },
                priority: { type: 'number', description: '1–10, higher = keep (default: 5)' },
              },
              required: ['label', 'content'],
            },
          },
          include_session: { type: 'boolean', description: 'Include session file history (default: true)' },
        },
      },
    },
    {
      name:        'bulk_search',
      description: 'Search all files in a project with a regex pattern. Returns only matching lines with context — no full file reads. Saves 90% tokens vs reading files one by one.',
      inputSchema: {
        type: 'object',
        properties: {
          root_path:        { type: 'string', description: 'Root directory to search (default: cwd)' },
          pattern:          { type: 'string', description: 'Regex pattern to search for' },
          file_extensions:  { type: 'array', items: { type: 'string' }, description: 'Filter by extensions e.g. [".ts", ".js"]' },
          case_sensitive:   { type: 'boolean', description: 'Case sensitive search (default: false)' },
          context_lines:    { type: 'number', description: 'Lines of context around matches (default: 2)' },
          detail_level:     { type: 'string', enum: ['files', 'lines', 'context'], description: 'Progressive disclosure: "files" (~50 tokens), "lines" (~200 tokens), "context" (full, default). Start with "files" to locate matches cheaply.' },
        },
        required: ['pattern'],
      },
    },
    {
      name:        'recall_file',
      description: 'Check if a file was already read this session and whether it has changed. Returns cached summary and tokens saved if unchanged. Zero disk reads for unchanged files.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['file_path'],
      },
    },
    {
      name:        'dependency_graph',
      description: 'Visualize import/dependency relationships for a file or entire project. Understand code structure without reading every file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path:  { type: 'string', description: 'Analyze dependencies of a specific file' },
          root_path:  { type: 'string', description: 'Analyze entire project (default: cwd)' },
          depth:      { type: 'number', description: 'How deep to follow imports (default: 2)' },
        },
      },
    },
    {
      name:        'function_extractor',
      description: 'Extract a specific function or class by name from any code file. Returns only that function — not the whole file. Saves 95% tokens for large files.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the code file' },
          name:      { type: 'string', description: 'Function or class name to extract' },
        },
        required: ['file_path', 'name'],
      },
    },
    {
      name:        'session_snapshot',
      description: 'Save or restore a snapshot of the current session context. Use to resume long tasks without re-reading files.',
      inputSchema: {
        type: 'object',
        properties: {
          action:  { type: 'string', enum: ['save', 'restore', 'list'], description: 'Action to perform' },
          label:   { type: 'string', description: 'Label for the snapshot (save only)' },
          summary: { type: 'string', description: 'Custom summary (save only, auto-generated if omitted)' },
        },
        required: ['action'],
      },
    },
    {
      name:        'task_manager',
      description: 'Break a large multi-step task into subtasks and persist progress to disk. When context fills up, call checkpoint to save state. In a new session, call resume to continue from exactly where you left off — in ~300 tokens instead of re-reading everything.',
      inputSchema: {
        type: 'object',
        properties: {
          action:        { type: 'string', enum: ['create', 'update', 'checkpoint', 'resume', 'status', 'complete', 'list'] },
          title:         { type: 'string', description: 'Task title (create only)' },
          tasks:         { type: 'array', items: { type: 'string' }, description: 'List of subtask descriptions (create only)' },
          task_id:       { type: 'string', description: 'Subtask ID or description to mark complete' },
          task_status:   { type: 'string', enum: ['done', 'in_progress', 'skipped', 'blocked'], description: 'New status (complete action)' },
          outcome:       { type: 'string', description: 'Brief result of the completed task' },
          completed:     { type: 'array', items: { type: 'string' }, description: 'Task IDs/descriptions to mark done (checkpoint)' },
          in_progress:   { type: 'string', description: 'Task ID/description currently being worked on' },
          decisions:     { type: 'array', items: { type: 'string' }, description: 'Key decisions made (e.g. "using bcrypt rounds=12")' },
          observations:  { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['decision', 'bugfix', 'feature', 'discovery', 'warning'] }, content: { type: 'string' } }, required: ['type', 'content'] }, description: 'Typed observations — semantic tags (bugfix/feature/decision/discovery/warning) for richer resume prompts' },
          files_changed: { type: 'array', items: { type: 'string' }, description: 'Files modified so far' },
          notes:         { type: 'string', description: 'Free-form notes for resuming' },
          project_path:  { type: 'string', description: 'Project root path (default: cwd)' },
        },
        required: ['action'],
      },
    },
    {
      name:        'context_watchdog',
      description: 'Monitor token usage and warn BEFORE the context window fills up. At 70% → warning. At 85% → critical. At 95% → emergency with auto-checkpoint. Call this periodically during long tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          extra_tokens:    { type: 'number', description: 'Additional tokens not tracked in session (e.g. long system prompts)' },
          project_path:    { type: 'string', description: 'Project path for active task lookup (default: cwd)' },
          auto_checkpoint: { type: 'boolean', description: 'Auto-save task checkpoint at emergency level (default: true)' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safeArgs = (args ?? {}) as Record<string, unknown>;

  try {
    let result;

    switch (name) {
      case 'compress_logs':
        result = tools.compress_logs.execute(safeArgs as Parameters<CompressLogsTool['execute']>[0]);
        break;
      case 'smart_read':
        result = tools.smart_read.execute(safeArgs as Parameters<SmartReadTool['execute']>[0]);
        break;
      case 'file_diff_only':
        result = tools.file_diff_only.execute(safeArgs as Parameters<FileDiffTool['execute']>[0]);
        break;
      case 'project_map':
        result = tools.project_map.execute(safeArgs as Parameters<ProjectMapTool['execute']>[0]);
        break;
      case 'context_budget':
        result = tools.context_budget.execute(safeArgs as Parameters<ContextBudgetTool['execute']>[0]);
        break;
      case 'bulk_search':
        result = tools.bulk_search.execute(safeArgs as Parameters<BulkSearchTool['execute']>[0]);
        break;
      case 'recall_file':
        result = tools.recall_file.execute(safeArgs as Parameters<RecallFileTool['execute']>[0]);
        break;
      case 'dependency_graph':
        result = tools.dependency_graph.execute(safeArgs as Parameters<DependencyGraphTool['execute']>[0]);
        break;
      case 'function_extractor':
        result = tools.function_extractor.execute(safeArgs as Parameters<FunctionExtractorTool['execute']>[0]);
        break;
      case 'session_snapshot':
        result = tools.session_snapshot.execute(safeArgs as Parameters<SessionSnapshotTool['execute']>[0]);
        break;
      case 'task_manager':
        result = tools.task_manager.execute(safeArgs as Parameters<TaskManagerTool['execute']>[0]);
        break;
      case 'context_watchdog':
        result = tools.context_watchdog.execute(safeArgs as Parameters<ContextWatchdogTool['execute']>[0]);
        break;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    const tokenNote = result.tokensSaved
      ? `\n\n---\n*Tokens saved: ~${result.tokensSaved.toLocaleString()}*`
      : '';

    return {
      content: [{ type: 'text', text: result.content + tokenNote }],
      isError: !result.success,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Tool error: ${message}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  // Periodic cleanup (once per startup)
  try {
    cache.purgeExpired();
    session.purgeExpiredSessions();
  } catch { /* non-critical */ }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
