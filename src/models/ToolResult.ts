//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export interface ToolResult {
  success: boolean;
  content: string;
  tokensSaved?: number;
  tokensUsed?: number;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  lineNumber: number;
  level: 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  contextLines: string[];
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
}

export interface CompressedLogResult {
  originalLines: number;
  returnedLines: number;
  fatals: LogEntry[];
  errors: LogEntry[];
  warnings: LogEntry[];
  tokensSaved: number;
  summary: string;
}

export interface ProjectMapEntry {
  path: string;
  language: string;
  lineCount: number;
  tokenEstimate: number;
  description: string;
}

export interface DependencyNode {
  path: string;
  imports: string[];
  importedBy: string[];
}

export interface BudgetItem {
  label: string;
  tokenCount: number;
  priority: 'keep' | 'consider-removing' | 'remove';
  reason: string;
}
