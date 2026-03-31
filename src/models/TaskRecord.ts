//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';

/**
 * Observation type — inspired by claude-mem's tagging system.
 * Adds semantic meaning to decisions so resume prompts are more structured.
 */
export type ObservationType = 'decision' | 'bugfix' | 'feature' | 'discovery' | 'warning';

export interface Observation {
  type:    ObservationType;
  content: string;
}

export interface TaskItem {
  id:          string;
  description: string;
  status:      TaskStatus;
  outcome?:    string;   // brief result when done
  blockedBy?:  string;   // reason if blocked
}

export interface TaskCheckpoint {
  id:           string;
  title:        string;
  projectPath:  string;
  createdAt:    number;
  updatedAt:    number;

  tasks:        TaskItem[];

  // Key context for resuming without re-reading files
  decisions:     string[];       // "using bcrypt rounds=12", "JWT 1h expiry" (legacy plain strings)
  observations?: Observation[];  // typed observations: bugfix | feature | decision | discovery | warning
  filesChanged:  string[];       // files that were modified
  notes:         string;         // free-form notes

  // Auto-generated — everything Claude needs in ~300 tokens
  resumePrompt: string;
}

export interface WatchdogStatus {
  estimatedTokens: number;
  limitTokens:     number;
  usagePercent:    number;
  level:           'safe' | 'warning' | 'critical' | 'emergency';
  message:         string;
  recommendation:  string;
}
