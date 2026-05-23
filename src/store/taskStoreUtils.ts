import { format, parseISO, isValid } from 'date-fns';
import type { ProjectConfig, Task } from '../types';
import { addWorkDays, calculateEndDate, getWorkDaysCount } from '../utils/date';

export interface TaskGraphState {
  tasks: Record<string, Task>;
  rootIds: string[];
}

export function getTaskDepth(tasks: Record<string, Task>, id: string): number {
  let depth = 0;
  let current = tasks[id];

  while (current?.parentId) {
    depth += 1;
    current = tasks[current.parentId];
  }

  return depth;
}

export function getSubtreeMaxDepth(tasks: Record<string, Task>, id: string): number {
  const task = tasks[id];
  if (!task || task.children.length === 0) {
    return 0;
  }

  return 1 + Math.max(...task.children.map((childId) => getSubtreeMaxDepth(tasks, childId)));
}

export function collectSubtreeIds(tasks: Record<string, Task>, ids: string[]): Set<string> {
  const collected = new Set<string>();
  const stack = [...ids];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || collected.has(currentId)) {
      continue;
    }

    const task = tasks[currentId];
    if (!task) {
      continue;
    }

    collected.add(currentId);
    stack.push(...task.children);
  }

  return collected;
}

export function deleteTasksAndCleanup(state: TaskGraphState, ids: string[]): TaskGraphState {
  const idsToDelete = collectSubtreeIds(state.tasks, ids);
  if (idsToDelete.size === 0) {
    return state;
  }

  const nextTasks: Record<string, Task> = {};

  Object.values(state.tasks).forEach((task) => {
    if (idsToDelete.has(task.id)) {
      return;
    }

    nextTasks[task.id] = {
      ...task,
      children: task.children.filter((childId) => !idsToDelete.has(childId)),
      dependencies: task.dependencies.filter((depId) => !idsToDelete.has(depId)),
    };
  });

  const nextRootIds = state.rootIds.filter((id) => !idsToDelete.has(id));

  return {
    tasks: nextTasks,
    rootIds: nextRootIds,
  };
}

export function propagateDependencyDates(
  tasks: Record<string, Task>,
  changedTaskId: string,
  calendar: ProjectConfig['calendar']
): Record<string, Task> {
  const nextTasks = { ...tasks };
  const dependents = Object.values(nextTasks)
    .filter((task) => task.dependencies.includes(changedTaskId))
    .map((task) => task.id);

  const queue = [...dependents];
  const visited = new Set(dependents);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentTask = nextTasks[currentId];
    if (!currentTask) {
      continue;
    }

    let maxPredecessorEndDate: Date | null = null;

    currentTask.dependencies.forEach((depId) => {
      const depTask = nextTasks[depId];
      if (!depTask?.endDate) {
        return;
      }

      const depEndDate = parseISO(depTask.endDate);
      if (!isValid(depEndDate)) {
        return;
      }

      if (!maxPredecessorEndDate || depEndDate > maxPredecessorEndDate) {
        maxPredecessorEndDate = depEndDate;
      }
    });

    if (maxPredecessorEndDate) {
      const newStartDate = addWorkDays(maxPredecessorEndDate, 1, calendar);
      const newEndDate = calculateEndDate(newStartDate, currentTask.duration, calendar);

      nextTasks[currentId] = {
        ...currentTask,
        startDate: format(newStartDate, 'yyyy-MM-dd'),
        endDate: format(newEndDate, 'yyyy-MM-dd'),
      };

      Object.values(nextTasks).forEach((task) => {
        if (task.dependencies.includes(currentId) && !visited.has(task.id)) {
          queue.push(task.id);
          visited.add(task.id);
        }
      });
    }
  }

  return nextTasks;
}

export function normalizeProjectState(
  tasks: Record<string, Task>,
  rootIds: string[]
): TaskGraphState {
  const taskIds = new Set(Object.keys(tasks));
  const normalizedTasks: Record<string, Task> = {};

  Object.values(tasks).forEach((task) => {
    normalizedTasks[task.id] = {
      ...task,
      children: task.children.filter((childId, index, arr) => (
        taskIds.has(childId) && childId !== task.id && arr.indexOf(childId) === index
      )),
      dependencies: task.dependencies.filter((depId, index, arr) => (
        taskIds.has(depId) && depId !== task.id && arr.indexOf(depId) === index
      )),
      parentId: task.parentId && taskIds.has(task.parentId) ? task.parentId : null,
    };
  });

  Object.values(normalizedTasks).forEach((task) => {
    task.children.forEach((childId) => {
      const child = normalizedTasks[childId];
      if (child) {
        normalizedTasks[childId] = { ...child, parentId: task.id };
      }
    });
  });

  const computedRootIds = Object.values(normalizedTasks)
    .filter((task) => task.parentId === null)
    .map((task) => task.id);

  const orderedRootIds = rootIds.filter((id, index, arr) => (
    computedRootIds.includes(id) && arr.indexOf(id) === index
  ));

  computedRootIds.forEach((id) => {
    if (!orderedRootIds.includes(id)) {
      orderedRootIds.push(id);
    }
  });

  return {
    tasks: normalizedTasks,
    rootIds: orderedRootIds,
  };
}

export function recalculateParentDatesRecursive(
  tasks: Record<string, Task>,
  parentId: string,
  calendar: ProjectConfig['calendar']
): Record<string, Task> {
  let nextTasks = { ...tasks };
  let currentParentId: string | null = parentId;

  while (currentParentId) {
    const parent: Task | undefined = nextTasks[currentParentId];
    if (!parent) break;

    const childrenIds = parent.children;
    if (childrenIds.length === 0) {
      break;
    }

    let minStartDate: Date | null = null;
    let maxEndDate: Date | null = null;

    childrenIds.forEach((childId: string) => {
      const child: Task | undefined = nextTasks[childId];
      if (!child) return;

      if (child.startDate) {
        const start = parseISO(child.startDate);
        if (isValid(start)) {
          if (!minStartDate || start < minStartDate) {
            minStartDate = start;
          }
        }
      }

      if (child.endDate) {
        const end = parseISO(child.endDate);
        if (isValid(end)) {
          if (!maxEndDate || end > maxEndDate) {
            maxEndDate = end;
          }
        }
      }
    });

    const updatedParent: Task = { ...parent };
    let changed = false;

    // Update startDate
    const minStartStr = minStartDate ? format(minStartDate, 'yyyy-MM-dd') : null;
    if (updatedParent.startDate !== minStartStr) {
      updatedParent.startDate = minStartStr;
      changed = true;
    }

    // Update endDate
    const maxEndStr = maxEndDate ? format(maxEndDate, 'yyyy-MM-dd') : null;
    if (updatedParent.endDate !== maxEndStr) {
      updatedParent.endDate = maxEndStr;
      changed = true;
    }

    // Recalculate parent's duration if start or end changed
    if (changed) {
      if (updatedParent.startDate && updatedParent.endDate) {
        const start = parseISO(updatedParent.startDate);
        const end = parseISO(updatedParent.endDate);
        if (isValid(start) && isValid(end) && start <= end) {
          updatedParent.duration = getWorkDaysCount(start, end, calendar);
        }
      } else {
        updatedParent.duration = 1;
      }

      nextTasks[currentParentId] = updatedParent;

      // Propagate dependency dates for this parent
      nextTasks = propagateDependencyDates(nextTasks, currentParentId, calendar);

      // Move up to the grandparent
      currentParentId = updatedParent.parentId;
    } else {
      break;
    }
  }

  return nextTasks;
}

export function cleanupHierarchicalDependencies(tasks: Record<string, Task>): Record<string, Task> {
  const nextTasks = { ...tasks };

  // For each task, check if it has parent-child / ancestor-descendant dependency
  Object.keys(nextTasks).forEach((taskId) => {
    const task = nextTasks[taskId];
    if (!task) return;

    // Get all ancestors of this task
    const ancestors = new Set<string>();
    let curr: Task | undefined = nextTasks[task.parentId || ''];
    while (curr) {
      ancestors.add(curr.id);
      curr = nextTasks[curr.parentId || ''];
    }

    // 1. Remove ancestors from this task's dependencies (child depends on ancestor)
    let depChanged = false;
    const filteredDeps = task.dependencies.filter((depId) => {
      if (ancestors.has(depId)) {
        depChanged = true;
        return false;
      }
      return true;
    });

    if (depChanged) {
      nextTasks[taskId] = {
        ...nextTasks[taskId],
        dependencies: filteredDeps,
      };
    }

    // 2. Remove this child from any ancestor's dependencies (ancestor depends on child)
    ancestors.forEach((ancId) => {
      const ancestor: Task | undefined = nextTasks[ancId];
      if (ancestor && ancestor.dependencies.includes(taskId)) {
        nextTasks[ancId] = {
          ...ancestor,
          dependencies: ancestor.dependencies.filter((depId) => depId !== taskId),
        };
      }
    });
  });

  return nextTasks;
}
