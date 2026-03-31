//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { randomUUID } from 'crypto';
import { TaskStore }    from '../../engines/tasks/TaskStore.js';
import { SessionMemory } from '../../engines/session/SessionMemory.js';
import { TokenEstimator } from '../../utils/token/TokenEstimator.js';
import type { ToolResult } from '../../models/ToolResult.js';
import type { TaskCheckpoint, TaskItem, TaskStatus, Observation, ObservationType } from '../../models/TaskRecord.js';

type Action = 'create' | 'update' | 'checkpoint' | 'resume' | 'status' | 'list' | 'complete';

export class TaskManagerTool {
  private store:   TaskStore;
  private session: SessionMemory;

  constructor(session: SessionMemory) {
    this.store   = new TaskStore();
    this.session = session;
  }

  execute(args: {
    action:        Action;
    title?:        string;
    tasks?:        string[];
    completed?:    string[];
    in_progress?:  string;
    decisions?:     string[];
    observations?:  Array<{ type: ObservationType; content: string }>;
    files_changed?: string[];
    notes?:         string;
    project_path?:  string;
    task_id?:       string;
    task_status?:   TaskStatus;
    outcome?:       string;
  }): ToolResult {
    switch (args.action) {
      case 'create':     return this.create(args);
      case 'update':     return this.update(args);
      case 'checkpoint': return this.checkpoint(args);
      case 'resume':     return this.resume(args.project_path ?? process.cwd());
      case 'status':     return this.status(args.project_path ?? process.cwd());
      case 'complete':   return this.completeTask(args);
      case 'list':       return this.list();
      default:
        return { success: false, content: 'Unknown action. Use: create | update | checkpoint | resume | status | complete | list' };
    }
  }

  // ── Create a new task plan ─────────────────────────────────────────────────

  private create(args: { title?: string; tasks?: string[]; project_path?: string; notes?: string }): ToolResult {
    const title   = args.title       ?? 'Untitled Task';
    const rawList = args.tasks       ?? [];
    const project = args.project_path ?? process.cwd();

    const tasks: TaskItem[] = rawList.map((desc, i) => ({
      id:          String(i + 1),
      description: desc,
      status:      'pending',
    }));

    const checkpoint: TaskCheckpoint = {
      id:           randomUUID().slice(0, 8),
      title,
      projectPath:  project,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
      tasks,
      decisions:    [],
      filesChanged: [],
      notes:        args.notes ?? '',
      resumePrompt: '',
    };

    checkpoint.resumePrompt = TaskManagerTool.buildResumePrompt(checkpoint);
    this.store.save(checkpoint);

    return {
      success: true,
      content: this.formatPlan(checkpoint),
      metadata: { taskId: checkpoint.id, taskCount: tasks.length },
    };
  }

  // ── Mark a task complete or update its status ──────────────────────────────

  private completeTask(args: {
    task_id?:     string;
    task_status?: TaskStatus;
    outcome?:     string;
    project_path?: string;
  }): ToolResult {
    const cp = this.store.getLatestForProject(args.project_path ?? process.cwd());
    if (!cp) return { success: false, content: 'No active task plan found. Use `create` first.' };

    const target = cp.tasks.find(t => t.id === args.task_id || t.description.includes(args.task_id ?? ''));
    if (!target) return { success: false, content: `Task "${args.task_id}" not found.` };

    target.status  = args.task_status ?? 'done';
    target.outcome = args.outcome ?? '';
    cp.updatedAt   = Date.now();
    cp.resumePrompt = TaskManagerTool.buildResumePrompt(cp);
    this.store.save(cp);

    const done    = cp.tasks.filter(t => t.status === 'done').length;
    const pending = cp.tasks.filter(t => t.status === 'pending').length;

    return {
      success: true,
      content: [
        `✅ **"${target.description}"** marked as ${target.status}`,
        `Progress: ${done}/${cp.tasks.length} tasks done (${Math.round(done/cp.tasks.length*100)}%)`,
        pending > 0 ? `Next: ${cp.tasks.find(t => t.status === 'pending')?.description}` : '🎉 All tasks complete!',
      ].join('\n'),
    };
  }

  // ── Checkpoint: save full state before context fills up ───────────────────

  private checkpoint(args: {
    completed?:     string[];
    in_progress?:   string;
    decisions?:     string[];
    observations?:  Array<{ type: ObservationType; content: string }>;
    files_changed?: string[];
    notes?:         string;
    project_path?:  string;
  }): ToolResult {
    const projectPath = args.project_path ?? process.cwd();
    let cp = this.store.getLatestForProject(projectPath);

    // Merge session file history into filesChanged
    const sessionFiles = this.session.getSessionFiles()
      .map(f => f.filePath)
      .filter(Boolean);

    if (cp) {
      // Update existing checkpoint
      if (args.completed) {
        for (const desc of args.completed) {
          const task = cp.tasks.find(t => t.description.includes(desc) || t.id === desc);
          if (task) task.status = 'done';
        }
      }
      if (args.in_progress) {
        const task = cp.tasks.find(t => t.description.includes(args.in_progress!) || t.id === args.in_progress);
        if (task) task.status = 'in_progress';
      }
      if (args.decisions)    cp.decisions    = [...new Set([...cp.decisions, ...args.decisions])];
      if (args.observations) {
        cp.observations = [...(cp.observations ?? []), ...args.observations];
      }
      if (args.files_changed) cp.filesChanged = [...new Set([...cp.filesChanged, ...args.files_changed])];
      cp.filesChanged = [...new Set([...cp.filesChanged, ...sessionFiles])];
      if (args.notes) cp.notes = args.notes;
      cp.updatedAt = Date.now();
    } else {
      // Create a bare-bones checkpoint from what we know
      cp = {
        id:           randomUUID().slice(0, 8),
        title:        'Unnamed Task',
        projectPath,
        createdAt:    Date.now(),
        updatedAt:    Date.now(),
        tasks:        (args.completed ?? []).map((d, i) => ({ id: String(i+1), description: d, status: 'done' })),
        decisions:    args.decisions ?? [],
        filesChanged: [...new Set([...(args.files_changed ?? []), ...sessionFiles])],
        notes:        args.notes ?? '',
        resumePrompt: '',
      };
    }

    cp.resumePrompt = TaskManagerTool.buildResumePrompt(cp);
    this.store.save(cp);

    const tokens = TokenEstimator.estimate(cp.resumePrompt);
    return {
      success:    true,
      content:    this.formatCheckpointSaved(cp, tokens),
      tokensUsed: tokens,
      metadata:   { checkpointId: cp.id, resumeTokens: tokens },
    };
  }

  // ── Resume: load state into a fresh context window ────────────────────────

  private resume(projectPath: string): ToolResult {
    const cp = this.store.getLatestForProject(projectPath);
    if (!cp) {
      return {
        success: true,
        content: `No saved task for ${projectPath}. Start a new task with \`task_manager({ action: "create", ... })\`.`,
      };
    }

    const ago  = Math.round((Date.now() - cp.updatedAt) / 60000);
    const done = cp.tasks.filter(t => t.status === 'done').length;

    return {
      success:    true,
      content:    this.formatResume(cp, done, ago),
      tokensUsed: TokenEstimator.estimate(cp.resumePrompt),
    };
  }

  // ── Status: quick progress view ───────────────────────────────────────────

  private status(projectPath: string): ToolResult {
    const cp = this.store.getLatestForProject(projectPath);
    if (!cp) return { success: true, content: 'No active task. Use `create` to start one.' };

    const done       = cp.tasks.filter(t => t.status === 'done').length;
    const inProgress = cp.tasks.filter(t => t.status === 'in_progress');
    const pending    = cp.tasks.filter(t => t.status === 'pending');
    const pct        = Math.round((done / cp.tasks.length) * 100);

    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20);

    const lines = [
      `## Task: ${cp.title}`,
      `**Progress:** [${bar}] ${pct}% (${done}/${cp.tasks.length})`,
      '',
    ];

    if (inProgress.length > 0) {
      lines.push('### 🔄 In Progress');
      inProgress.forEach(t => lines.push(`- ${t.description}`));
      lines.push('');
    }

    if (done > 0) {
      lines.push(`### ✅ Done (${done})`);
      cp.tasks.filter(t => t.status === 'done').forEach(t =>
        lines.push(`- ${t.description}${t.outcome ? ` — *${t.outcome}*` : ''}`));
      lines.push('');
    }

    if (pending.length > 0) {
      lines.push(`### 📋 Pending (${pending.length})`);
      pending.forEach(t => lines.push(`- ${t.description}`));
      lines.push('');
    }

    if (cp.decisions.length > 0) {
      lines.push('### 💡 Key Decisions');
      cp.decisions.forEach(d => lines.push(`- ${d}`));
    }

    return { success: true, content: lines.join('\n') };
  }

  // ── Update fields without full checkpoint ─────────────────────────────────

  private update(args: { decisions?: string[]; observations?: Array<{ type: ObservationType; content: string }>; files_changed?: string[]; notes?: string; project_path?: string }): ToolResult {
    const cp = this.store.getLatestForProject(args.project_path ?? process.cwd());
    if (!cp) return { success: false, content: 'No active task found.' };

    if (args.decisions)     cp.decisions    = [...new Set([...cp.decisions, ...args.decisions])];
    if (args.observations)  cp.observations = [...(cp.observations ?? []), ...args.observations];
    if (args.files_changed) cp.filesChanged = [...new Set([...cp.filesChanged, ...args.files_changed])];
    if (args.notes)         cp.notes        = args.notes;
    cp.updatedAt    = Date.now();
    cp.resumePrompt = TaskManagerTool.buildResumePrompt(cp);
    this.store.save(cp);

    return { success: true, content: `Task updated. Resume prompt: ~${TokenEstimator.estimate(cp.resumePrompt)} tokens.` };
  }

  // ── List all tasks ────────────────────────────────────────────────────────

  private list(): ToolResult {
    const all = this.store.getAll();
    if (all.length === 0) return { success: true, content: 'No saved tasks.' };

    const lines = ['## Saved Tasks', ''];
    for (const cp of all.slice(0, 10)) {
      const done = cp.tasks.filter(t => t.status === 'done').length;
      const pct  = Math.round((done / Math.max(cp.tasks.length, 1)) * 100);
      const ago  = Math.round((Date.now() - cp.updatedAt) / 60000);
      lines.push(`- **${cp.title}** — ${pct}% done · updated ${ago}m ago · ID: \`${cp.id}\``);
    }

    return { success: true, content: lines.join('\n') };
  }

  // ── Resume prompt generator ───────────────────────────────────────────────
  // This is the heart of the system — a compressed summary ~300 tokens

  static buildResumePrompt(cp: TaskCheckpoint): string {
    const done       = cp.tasks.filter(t => t.status === 'done');
    const inProgress = cp.tasks.filter(t => t.status === 'in_progress');
    const pending    = cp.tasks.filter(t => t.status === 'pending');
    const pct        = Math.round((done.length / Math.max(cp.tasks.length, 1)) * 100);

    const lines = [
      `TASK RESUME — ${cp.title}`,
      `Progress: ${done.length}/${cp.tasks.length} subtasks complete (${pct}%)`,
      '',
    ];

    if (done.length > 0) {
      lines.push('✅ Done:');
      done.forEach(t => lines.push(`  - ${t.description}${t.outcome ? ` (${t.outcome})` : ''}`));
    }

    if (inProgress.length > 0) {
      lines.push('🔄 In Progress:');
      inProgress.forEach(t => lines.push(`  - ${t.description}`));
    }

    if (pending.length > 0) {
      lines.push('📋 Pending:');
      pending.slice(0, 8).forEach(t => lines.push(`  - ${t.description}`));
      if (pending.length > 8) lines.push(`  ... and ${pending.length - 8} more`);
    }

    if (cp.filesChanged.length > 0) {
      lines.push('📁 Files changed:');
      lines.push('  ' + cp.filesChanged.slice(0, 8).join(', '));
    }

    // Typed observations (bugfix/feature/decision/discovery/warning) — shows before plain decisions
    if (cp.observations && cp.observations.length > 0) {
      const ICONS: Record<string, string> = { decision: '💡', bugfix: '🐛', feature: '✨', discovery: '🔍', warning: '⚠️' };
      const grouped = cp.observations.reduce<Record<string, Observation[]>>((acc, o) => {
        (acc[o.type] = acc[o.type] ?? []).push(o);
        return acc;
      }, {});
      for (const [type, items] of Object.entries(grouped)) {
        lines.push(`${ICONS[type] ?? '📌'} ${type.charAt(0).toUpperCase() + type.slice(1)}s:`);
        items.slice(0, 3).forEach(o => lines.push(`  - ${o.content}`));
      }
    }

    if (cp.decisions.length > 0) {
      lines.push('💡 Key decisions:');
      cp.decisions.slice(0, 5).forEach(d => lines.push(`  - ${d}`));
    }

    if (cp.notes) {
      lines.push(`📝 Notes: ${cp.notes}`);
    }

    lines.push('');
    lines.push('To continue: call task_manager({ action: "status" }) then proceed with the next pending task.');

    return lines.join('\n');
  }

  // ── Formatters ────────────────────────────────────────────────────────────

  private formatPlan(cp: TaskCheckpoint): string {
    const lines = [
      `## Task Plan Created: "${cp.title}"`,
      `**ID:** \`${cp.id}\` | **Tasks:** ${cp.tasks.length}`,
      '',
      '### Task List',
    ];

    cp.tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.description}`));

    lines.push('', '### How to use', '```');
    lines.push('task_manager({ action: "complete", task_id: "1", outcome: "brief result" })');
    lines.push('task_manager({ action: "checkpoint" })  ← save before context fills');
    lines.push('task_manager({ action: "resume" })       ← restore in new context');
    lines.push('```');

    return lines.join('\n');
  }

  private formatCheckpointSaved(cp: TaskCheckpoint, resumeTokens: number): string {
    const done    = cp.tasks.filter(t => t.status === 'done').length;
    const pending = cp.tasks.filter(t => t.status === 'pending').length;

    return [
      `## ✅ Checkpoint Saved`,
      `**Task:** ${cp.title} | **ID:** \`${cp.id}\``,
      `**Progress:** ${done} done, ${pending} pending`,
      `**Resume prompt size:** ~${resumeTokens} tokens *(vs full context: ~180,000)*`,
      '',
      '### Resume Prompt (paste in new context)',
      '```',
      cp.resumePrompt,
      '```',
      '',
      '**Or in a new Claude Code session:**',
      '```',
      `task_manager({ action: "resume" })`,
      '```',
    ].join('\n');
  }

  private formatResume(cp: TaskCheckpoint, done: number, agoMin: number): string {
    return [
      `## Context Restored ✅`,
      `**Task:** ${cp.title}`,
      `**Last updated:** ${agoMin} minute(s) ago`,
      `**Progress:** ${done}/${cp.tasks.length} tasks (${Math.round(done/cp.tasks.length*100)}%)`,
      '',
      '### Full State',
      '```',
      cp.resumePrompt,
      '```',
      '',
      `Files changed: ${cp.filesChanged.slice(0, 5).join(', ')}${cp.filesChanged.length > 5 ? '...' : ''}`,
      '',
      'Context restored. Continue from where you left off.',
    ].join('\n');
  }
}
