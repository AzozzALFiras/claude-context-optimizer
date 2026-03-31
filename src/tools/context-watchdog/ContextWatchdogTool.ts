//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer
//
// Proactive context monitor — warns BEFORE the context fills up.
// The key principle: act at 70%, not at 100%. At 100% it's too late.

import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { TaskStore }     from '../../engines/tasks/TaskStore.js';
import { TaskManagerTool } from '../task-manager/TaskManagerTool.js';
import { TokenEstimator }  from '../../utils/token/TokenEstimator.js';
import {
  CONTEXT_WARNING_THRESHOLD,
  CONTEXT_CRITICAL_THRESHOLD,
} from '../../config/constants.js';
import type { ToolResult } from '../../models/ToolResult.js';
import type { WatchdogStatus } from '../../models/TaskRecord.js';

// Claude's practical context limit (conservative — degradation starts before hard limit)
const CONTEXT_LIMIT = 180_000;
const WARN_AT       = 0.70;   // 70%  → warning
const CRITICAL_AT   = 0.85;   // 85%  → checkpoint recommended
const EMERGENCY_AT  = 0.95;   // 95%  → auto-checkpoint

export class ContextWatchdogTool {
  private session:   SessionMemory;
  private taskStore: TaskStore;

  constructor(session: SessionMemory) {
    this.session   = session;
    this.taskStore = new TaskStore();
  }

  execute(args: {
    // Optional: caller can pass additional items not tracked in session
    extra_tokens?:   number;
    project_path?:   string;
    auto_checkpoint?: boolean;  // if true + emergency level, auto-save
  }): ToolResult {
    const { extra_tokens = 0, project_path = process.cwd(), auto_checkpoint = true } = args;

    const sessionRecord = this.session.getSessionRecord();
    const sessionTokens = sessionRecord?.totalTokensUsed ?? 0;
    const totalEstimate = sessionTokens + extra_tokens;

    const status = this.computeStatus(totalEstimate);
    const activeTask = this.taskStore.getLatestForProject(project_path);

    // Auto-checkpoint at emergency level
    let autoSaved = false;
    if (status.level === 'emergency' && auto_checkpoint && activeTask) {
      activeTask.resumePrompt = TaskManagerTool.buildResumePrompt(activeTask);
      this.taskStore.save(activeTask);
      autoSaved = true;
    }

    const output = this.format(status, totalEstimate, sessionTokens, activeTask?.title, autoSaved);
    return {
      success:    true,
      content:    output,
      tokensUsed: TokenEstimator.estimate(output),
      metadata: {
        usagePercent:  status.usagePercent,
        level:         status.level,
        totalEstimate,
        autoCheckpointCreated: autoSaved,
      },
    };
  }

  private computeStatus(tokens: number): WatchdogStatus {
    const pct = tokens / CONTEXT_LIMIT;

    if (pct >= EMERGENCY_AT) {
      return {
        estimatedTokens: tokens,
        limitTokens:     CONTEXT_LIMIT,
        usagePercent:    Math.round(pct * 100),
        level:           'emergency',
        message:         `🚨 EMERGENCY: ${Math.round(pct * 100)}% full — context about to collapse`,
        recommendation:  'Run task_manager({ action: "checkpoint" }) NOW. Start a new Claude Code session and call task_manager({ action: "resume" }) immediately.',
      };
    }
    if (pct >= CRITICAL_AT) {
      return {
        estimatedTokens: tokens,
        limitTokens:     CONTEXT_LIMIT,
        usagePercent:    Math.round(pct * 100),
        level:           'critical',
        message:         `⚠️  CRITICAL: ${Math.round(pct * 100)}% full — checkpoint strongly recommended`,
        recommendation:  'Save a checkpoint with task_manager({ action: "checkpoint" }) before continuing.',
      };
    }
    if (pct >= WARN_AT) {
      return {
        estimatedTokens: tokens,
        limitTokens:     CONTEXT_LIMIT,
        usagePercent:    Math.round(pct * 100),
        level:           'warning',
        message:         `⚡ WARNING: ${Math.round(pct * 100)}% full — consider checkpointing soon`,
        recommendation:  'Good time to save progress: task_manager({ action: "checkpoint" })',
      };
    }
    return {
      estimatedTokens: tokens,
      limitTokens:     CONTEXT_LIMIT,
      usagePercent:    Math.round(pct * 100),
      level:           'safe',
      message:         `✅ SAFE: ${Math.round(pct * 100)}% of context used`,
      recommendation:  'Context is healthy. Continue working.',
    };
  }

  private format(
    status:       WatchdogStatus,
    total:        number,
    sessionOnly:  number,
    taskTitle:    string | undefined,
    autoSaved:    boolean,
  ): string {
    const remaining  = CONTEXT_LIMIT - total;
    const barFull    = Math.round(status.usagePercent / 5);
    const barEmpty   = 20 - barFull;
    const bar        = '█'.repeat(barFull) + '░'.repeat(barEmpty);
    const levelColor = { safe: '🟢', warning: '🟡', critical: '🔴', emergency: '🚨' }[status.level];

    const lines = [
      `## Context Watchdog ${levelColor}`,
      '',
      `**${status.message}**`,
      '',
      `\`[${bar}]\` ${status.usagePercent}%`,
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Estimated tokens used | ${TokenEstimator.formatTokenCount(total)} |`,
      `| Session file reads | ${TokenEstimator.formatTokenCount(sessionOnly)} |`,
      `| Remaining capacity | ~${TokenEstimator.formatTokenCount(remaining)} |`,
      `| Context limit | ${TokenEstimator.formatTokenCount(CONTEXT_LIMIT)} |`,
    ];

    if (taskTitle) lines.push(`| Active task | ${taskTitle} |`);

    lines.push('', `### Recommendation`, status.recommendation);

    if (autoSaved) {
      lines.push('', '---', '> ⚡ **Auto-checkpoint created** — task state saved automatically at emergency level.');
      lines.push('> In a new session, call `task_manager({ action: "resume" })` to continue.');
    }

    if (status.level === 'critical' || status.level === 'emergency') {
      lines.push('', '### Immediate Actions', '');
      lines.push('**1. Checkpoint your task:**');
      lines.push('```');
      lines.push('task_manager({ action: "checkpoint", notes: "describe current state" })');
      lines.push('```');
      lines.push('**2. In a new Claude Code session:**');
      lines.push('```');
      lines.push('task_manager({ action: "resume" })');
      lines.push('```');
      lines.push('**3. Optionally free context by removing stale files:**');
      lines.push('```');
      lines.push('context_budget({ include_session: true })');
      lines.push('```');
    }

    return lines.join('\n');
  }
}
