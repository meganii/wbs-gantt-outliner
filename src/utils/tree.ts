import type { Task } from '../types';

export interface FlattenedItem {
  id: string;
  depth: number;
  task: Task;
}

export function flattenTree(
  tasks: Record<string, Task>,
  rootIds: string[],
  depth = 0,
  result: FlattenedItem[] = []
): FlattenedItem[] {
  for (const id of rootIds) {
    const task = tasks[id];
    if (!task) continue;
    
    result.push({ id, depth, task });
    
    if (!task.isCollapsed && task.children.length > 0) {
      flattenTree(tasks, task.children, depth + 1, result);
    }
  }
  return result;
}
