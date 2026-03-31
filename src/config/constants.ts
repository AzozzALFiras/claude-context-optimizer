//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export const SERVER_NAME = 'claude-context-optimizer';
export const SERVER_VERSION = '1.0.0';

// Cache
export const CACHE_DB_FILENAME = 'context-optimizer.db';
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Token estimation
export const TOKEN_CHARS_RATIO = 4; // ~4 chars per token
export const MAX_SNIPPET_TOKENS = 2000;
export const CONTEXT_WARNING_THRESHOLD = 80_000;
export const CONTEXT_CRITICAL_THRESHOLD = 150_000;

// Log parsing
export const DEFAULT_LOG_CONTEXT_LINES = 3;
export const MAX_LOG_ENTRIES = 200;

// Project map
export const MAX_PROJECT_MAP_FILES = 1000;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Search
export const MAX_SEARCH_RESULTS = 50;
export const MAX_SEARCH_CONTEXT_LINES = 2;

// Directories to always ignore
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',
  'coverage',
  '.nyc_output',
  'target',
  'vendor',
  '.gradle',
  'Pods',
  '.DS_Store',
  '.idea',
  '.vscode',
  'out',
  '.cache',
  'tmp',
  'temp',
]);

// Files to always ignore
export const IGNORED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.env',
  '.env.local',
  '.env.production',
]);

// Log level patterns
export const LOG_LEVEL_PATTERNS = {
  FATAL:   /\b(FATAL|CRITICAL|EMERGENCY)\b/i,
  ERROR:   /\b(ERROR|ERR|Exception|Traceback|Error:|SEVERE)\b/i,
  WARN:    /\b(WARN|WARNING|DEPRECAT|DEPRECATED)\b/i,
  INFO:    /\b(INFO|INFORMATION)\b/i,
  DEBUG:   /\b(DEBUG|TRACE|VERBOSE)\b/i,
};

// Code file extensions by language
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript:  ['.ts', '.tsx', '.mts'],
  javascript:  ['.js', '.jsx', '.mjs', '.cjs'],
  python:      ['.py', '.pyw', '.pyx'],
  go:          ['.go'],
  rust:        ['.rs'],
  java:        ['.java'],
  csharp:      ['.cs'],
  cpp:         ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
  ruby:        ['.rb', '.rake'],
  php:         ['.php'],
  swift:       ['.swift'],
  kotlin:      ['.kt', '.kts'],
  scala:       ['.scala'],
  shell:       ['.sh', '.bash', '.zsh'],
  yaml:        ['.yml', '.yaml'],
  json:        ['.json'],
  toml:        ['.toml'],
  markdown:    ['.md', '.mdx'],
};

// Reverse map: extension → language
export const EXTENSION_TO_LANGUAGE: Record<string, string> = Object.entries(
  LANGUAGE_EXTENSIONS
).reduce((acc, [lang, exts]) => {
  exts.forEach(ext => { acc[ext] = lang; });
  return acc;
}, {} as Record<string, string>);
