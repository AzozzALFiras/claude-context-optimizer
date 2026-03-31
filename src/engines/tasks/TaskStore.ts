//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { JsonStore } from '../store/JsonStore.js';
import type { TaskCheckpoint, TaskItem, Observation } from '../../models/TaskRecord.js';

const TABLE = 'tasks';

export class TaskStore {
  private store: JsonStore;

  constructor() {
    this.store = new JsonStore('context-optimizer.json');
  }

  save(checkpoint: TaskCheckpoint): void {
    this.store.set(TABLE, checkpoint.id, {
      ...checkpoint,
      tasks:        JSON.stringify(checkpoint.tasks),
      decisions:    JSON.stringify(checkpoint.decisions),
      observations: JSON.stringify(checkpoint.observations ?? []),
      filesChanged: JSON.stringify(checkpoint.filesChanged),
    });
  }

  get(id: string): TaskCheckpoint | null {
    const row = this.store.get(TABLE, id);
    if (!row) return null;
    return this.mapRow(row);
  }

  getLatestForProject(projectPath: string): TaskCheckpoint | null {
    const all = this.store.all(TABLE)
      .filter(r => r['projectPath'] === projectPath)
      .sort((a, b) => (b['updatedAt'] as number) - (a['updatedAt'] as number));
    return all.length > 0 ? this.mapRow(all[0]) : null;
  }

  getAll(): TaskCheckpoint[] {
    return this.store.all(TABLE)
      .sort((a, b) => (b['updatedAt'] as number) - (a['updatedAt'] as number))
      .map(r => this.mapRow(r));
  }

  delete(id: string): void {
    this.store.delete(TABLE, id);
  }

  private mapRow(row: Record<string, unknown>): TaskCheckpoint {
    return {
      id:           row['id'] as string,
      title:        row['title'] as string,
      projectPath:  row['projectPath'] as string,
      createdAt:    row['createdAt'] as number,
      updatedAt:    row['updatedAt'] as number,
      tasks:        JSON.parse(row['tasks'] as string) as TaskItem[],
      decisions:    JSON.parse(row['decisions'] as string) as string[],
      observations: row['observations'] ? JSON.parse(row['observations'] as string) as Observation[] : [],
      filesChanged: JSON.parse(row['filesChanged'] as string) as string[],
      notes:        row['notes'] as string,
      resumePrompt: row['resumePrompt'] as string,
    };
  }
}
