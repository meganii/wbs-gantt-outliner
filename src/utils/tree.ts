import type { Task } from '../types';

export interface FlattenedItem {
  id: string;
  depth: number;
  task: Task;
  wbsNumber: string;
}

export function flattenTree(
  tasks: Record<string, Task>,
  rootIds: string[],
  depth = 0,
  result: FlattenedItem[] = [],
  parentWbs = ''
): FlattenedItem[] {
  rootIds.forEach((id, index) => {
    const task = tasks[id];
    if (!task) return;
    
    // Calculate WBS: if parentWbs is empty, use '1', '2'. Else '1.1', '1.2'
    const currentWbs = parentWbs ? `${parentWbs}.${index + 1}` : `${index + 1}`;
    
    result.push({ id, depth, task, wbsNumber: currentWbs });
    
    if (!task.isCollapsed && task.children.length > 0) {
      flattenTree(tasks, task.children, depth + 1, result, currentWbs);
    }
  });
  return result;
}
