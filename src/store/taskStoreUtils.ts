import { format, parseISO, isValid } from 'date-fns';
import type { ProjectConfig, Task } from '../types';
import { addWorkDays, calculateEndDate, getWorkDaysCount } from '../utils/date';

export interface TaskGraphState {
  tasks: Record<string, Task>;
  rootIds: string[];
}

/**
 * 進捗率からステータスを導出する（規則 7）。
 * 0% = 未着手 / 1〜99% = 進行中 / 100% = 完了。手入力はしない。
 */
export function deriveStatus(progress: number): string {
  if (progress >= 100) return '完了';
  if (progress > 0) return '進行中';
  return '未着手';
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

/**
 * `startId` から依存関係（dependencies）をたどって `targetId` に到達できるか。
 * 依存の循環検出・循環依存の切断に使う。visited 管理の反復 DFS なので、
 * 入力が既に循環していても停止する。
 */
export function hasDependencyPath(
  tasks: Record<string, Task>,
  startId: string,
  targetId: string
): boolean {
  const visited = new Set<string>();
  const stack: string[] = [startId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === targetId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const task = tasks[currentId];
    if (!task) continue;
    task.dependencies.forEach((depId) => stack.push(depId));
  }

  return false;
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

export function shiftDescendants(
  tasks: Record<string, Task>,
  parentId: string,
  newParentStart: Date,
  calendar: ProjectConfig['calendar']
): Record<string, Task> {
  const nextTasks = { ...tasks };
  const parent = nextTasks[parentId];
  if (!parent || !parent.startDate) return nextTasks;

  const oldParentStart = parseISO(parent.startDate);
  if (!isValid(oldParentStart)) return nextTasks;

  // 1. Collect all descendant IDs recursively
  const getDescendantIds = (id: string): string[] => {
    const task = nextTasks[id];
    if (!task) return [];
    const list: string[] = [];
    task.children.forEach((childId) => {
      list.push(childId);
      list.push(...getDescendantIds(childId));
    });
    return list;
  };

  const descendantIds = getDescendantIds(parentId);
  if (descendantIds.length === 0) return nextTasks;

  // 2. Shift each descendant
  descendantIds.forEach((descId) => {
    const descTask = nextTasks[descId];
    if (!descTask || !descTask.startDate) return;

    const descStart = parseISO(descTask.startDate);
    if (!isValid(descStart)) return;

    // Calculate work days offset from oldParentStart to descStart
    const offset = getWorkDaysCount(oldParentStart, descStart, calendar) - 1;

    // Calculate new start date
    const newDescStart = addWorkDays(newParentStart, offset, calendar);
    const newDescEnd = calculateEndDate(newDescStart, descTask.duration, calendar);

    nextTasks[descId] = {
      ...descTask,
      startDate: format(newDescStart, 'yyyy-MM-dd'),
      endDate: format(newDescEnd, 'yyyy-MM-dd'),
    };
  });

  return nextTasks;
}

export function propagateDependencyDates(
  tasks: Record<string, Task>,
  changedTaskId: string,
  calendar: ProjectConfig['calendar']
): Record<string, Task> {
  let nextTasks = { ...tasks };
  const dependents = Object.values(nextTasks)
    .filter((task) => task.dependencies.includes(changedTaskId))
    .map((task) => task.id);

  const queue = [...dependents];
  const visited = new Set(dependents);
  const parentsToRecalculate = new Set<string>();

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

      // If it's a parent task, shift all of its descendants recursively!
      if (currentTask.children.length > 0) {
        // Collect descendant IDs before shifting to add them to queue
        const getDescendantIds = (id: string): string[] => {
          const t = nextTasks[id];
          if (!t) return [];
          const list: string[] = [];
          t.children.forEach((childId) => {
            list.push(childId);
            list.push(...getDescendantIds(childId));
          });
          return list;
        };
        const descIds = getDescendantIds(currentId);

        // Shift them
        nextTasks = shiftDescendants(nextTasks, currentId, newStartDate, calendar);

        // Add shifted descendants to queue and visited set so their dependents propagate
        descIds.forEach((descId) => {
          if (!visited.has(descId)) {
            queue.push(descId);
            visited.add(descId);
          }
          const parentId = nextTasks[descId]?.parentId;
          if (parentId) {
            parentsToRecalculate.add(parentId);
          }
        });
      }

      const duration = currentTask.duration;
      const newEndDate = calculateEndDate(newStartDate, duration, calendar);

      nextTasks[currentId] = {
        ...nextTasks[currentId],
        startDate: format(newStartDate, 'yyyy-MM-dd'),
        endDate: format(newEndDate, 'yyyy-MM-dd'),
        duration,
      };

      if (nextTasks[currentId].parentId) {
        parentsToRecalculate.add(nextTasks[currentId].parentId!);
      }

      Object.values(nextTasks).forEach((task) => {
        if (task.dependencies.includes(currentId) && !visited.has(task.id)) {
          queue.push(task.id);
          visited.add(task.id);
        }
      });
    }
  }

  // Final pass: Recalculate parent dates for all modified tasks
  parentsToRecalculate.forEach((parentId) => {
    if (nextTasks[parentId]) {
      nextTasks = recalculateParentDatesRecursive(nextTasks, parentId, calendar);
    }
  });

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

    let totalDuration = 0;
    let weightedProgressSum = 0;

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

      const childDur = child.duration || 1;
      totalDuration += childDur;
      weightedProgressSum += (child.progress || 0) * childDur;
    });

    const parentProgress = totalDuration > 0 ? Math.round(weightedProgressSum / totalDuration) : 0;

    const updatedParent: Task = { ...parent };
    let changed = false;

    // Update progress（親 = 子の期間重み付け平均）
    if (updatedParent.progress !== parentProgress) {
      updatedParent.progress = parentProgress;
      changed = true;
    }

    // Update status（進捗率から導出）
    const parentStatus = deriveStatus(parentProgress);
    if (updatedParent.status !== parentStatus) {
      updatedParent.status = parentStatus;
      changed = true;
    }

    // Update startDate（子の最小開始）
    const minStartStr = minStartDate ? format(minStartDate, 'yyyy-MM-dd') : null;
    if (updatedParent.startDate !== minStartStr) {
      updatedParent.startDate = minStartStr;
      changed = true;
    }

    // Update endDate（子の最大終了）
    const maxEndStr = maxEndDate ? format(maxEndDate, 'yyyy-MM-dd') : null;
    if (updatedParent.endDate !== maxEndStr) {
      updatedParent.endDate = maxEndStr;
      changed = true;
    }

    // Recalculate parent's duration if start or end changed
    if (updatedParent.startDate && updatedParent.endDate) {
      const start = parseISO(updatedParent.startDate);
      const end = parseISO(updatedParent.endDate);
      if (isValid(start) && isValid(end) && start <= end) {
        const newDuration = getWorkDaysCount(start, end, calendar);
        if (updatedParent.duration !== newDuration) {
          updatedParent.duration = newDuration;
          changed = true;
        }
      }
    } else {
      if (updatedParent.duration !== 0) {
        updatedParent.duration = 0;
        changed = true;
      }
    }

    if (changed) {
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

export function applyDateCalculations(
  oldTask: Task,
  updates: Partial<Task>,
  calendar: ProjectConfig['calendar']
): Partial<Task> {
  const nextUpdates = { ...updates };

  // 進捗率が変わったら、ステータスは進捗率から導出する（規則 7）。
  // 進捗率は日付を書き換えない（規則 2）。
  if (nextUpdates.progress !== undefined) {
    nextUpdates.status = deriveStatus(Math.min(100, Math.max(0, nextUpdates.progress)));
  }

  // 親タスクの日付・期間は子からロールアップする（規則 6）。ここでは日付を触らない。
  if (oldTask.children.length > 0) {
    return nextUpdates;
  }

  const hasStart = nextUpdates.startDate !== undefined;
  const hasEnd = nextUpdates.endDate !== undefined;
  const hasDuration = nextUpdates.duration !== undefined;

  // 1. 期間の入力 → 開始日を固定して終了日を導出する
  //    （保存される期間は「開始日〜終了日の稼働日数」に一致する）
  if (hasDuration && !hasEnd) {
    const startStr = nextUpdates.startDate ?? oldTask.startDate;
    if (startStr) {
      nextUpdates.endDate = format(
        calculateEndDate(new Date(startStr), nextUpdates.duration!, calendar),
        'yyyy-MM-dd'
      );
    }
  }
  // 2. 開始日の入力 → 期間を保ったまま終了日を移動する
  else if (hasStart && !hasEnd) {
    const startStr = nextUpdates.startDate;
    if (startStr) {
      const duration = hasDuration ? nextUpdates.duration! : (oldTask.duration || 1);
      nextUpdates.endDate = format(calculateEndDate(new Date(startStr), duration, calendar), 'yyyy-MM-dd');
    }
  }
  // 3. 終了日の入力 → 開始日を固定して期間を導出する
  else if (hasEnd && !hasDuration) {
    const startStr = nextUpdates.startDate ?? oldTask.startDate;
    const endStr = nextUpdates.endDate;
    if (startStr && endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      if (end >= start) {
        nextUpdates.duration = getWorkDaysCount(start, end, calendar);
      }
    }
  }

  return nextUpdates;
}

export function indentTaskInGraph(
  state: TaskGraphState,
  ids: string[],
  calendar: ProjectConfig['calendar']
): TaskGraphState {
  const idArray = Array.isArray(ids) ? ids : [ids];
  if (idArray.length === 0) {
    return state;
  }

  const tasks = { ...state.tasks };
  const rootIds = [...state.rootIds];
  const firstId = idArray[0];
  const task = tasks[firstId];
  if (!task) {
    return state;
  }

  const parentId = task.parentId;
  const siblings = parentId ? tasks[parentId]?.children : rootIds;
  if (!siblings) {
    return state;
  }

  const sortedIds = idArray
    .filter((id) => siblings.includes(id))
    .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));

  if (sortedIds.length === 0) {
    return state;
  }

  const firstIdx = siblings.indexOf(sortedIds[0]);
  if (firstIdx <= 0) {
    return state;
  }

  const newParentId = siblings[firstIdx - 1];
  if (idArray.includes(newParentId)) {
    return state;
  }

  const newParent = tasks[newParentId];
  if (!newParent) {
    return state;
  }

  const newParentDepth = getTaskDepth(tasks, newParentId);
  for (const id of sortedIds) {
    const subtreeDepth = getSubtreeMaxDepth(tasks, id);
    if (newParentDepth + 1 + subtreeDepth > 3) {
      console.warn('Cannot indent: Resulting depth exceeds Level 4');
      return state;
    }
  }

  const newSiblings = siblings.filter((sid) => !sortedIds.includes(sid));
  const newParentChildren = [...newParent.children, ...sortedIds];

  const nextRootIds = parentId ? rootIds : newSiblings;

  if (parentId) {
    tasks[parentId] = { ...tasks[parentId], children: newSiblings };
  }

  tasks[newParentId] = {
    ...newParent,
    children: newParentChildren,
    isCollapsed: false,
  };

  sortedIds.forEach((id) => {
    const childTask = tasks[id];
    const hasDate = childTask.startDate && childTask.endDate;

    const parentHasDate = newParent.startDate && newParent.endDate;

    const taskUpdates: Partial<Task> = { parentId: newParentId };

    // 子に日程が無ければ、親の日程を引き継ぐ（開始日 / 終了日 / 期間）。
    if (!hasDate && parentHasDate) {
      taskUpdates.startDate = newParent.startDate;
      taskUpdates.endDate = newParent.endDate;
      taskUpdates.duration = newParent.duration;
    }

    tasks[id] = { ...childTask, ...taskUpdates };
  });

  let updatedTasks = cleanupHierarchicalDependencies(tasks);
  if (parentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, parentId, calendar);
  }
  if (newParentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, newParentId, calendar);
  }

  return {
    tasks: updatedTasks,
    rootIds: nextRootIds,
  };
}

export function outdentTaskInGraph(
  state: TaskGraphState,
  ids: string[],
  calendar: ProjectConfig['calendar']
): TaskGraphState {
  const idArray = Array.isArray(ids) ? ids : [ids];
  if (idArray.length === 0) {
    return state;
  }

  const tasks = { ...state.tasks };
  const firstId = idArray[0];
  const task = tasks[firstId];
  if (!task?.parentId) {
    return state;
  }

  const currentParent = tasks[task.parentId];
  if (!currentParent) {
    return state;
  }

  const currentSiblings = currentParent.children;
  const sortedIds = idArray
    .filter((id) => currentSiblings.includes(id))
    .sort((a, b) => currentSiblings.indexOf(a) - currentSiblings.indexOf(b));

  if (sortedIds.length === 0) {
    return state;
  }

  const newSiblings = currentSiblings.filter((sid) => !sortedIds.includes(sid));
  let newContextIds: string[];
  let grandParentId: string | null = null;

  if (currentParent.parentId) {
    grandParentId = currentParent.parentId;
    const grandParent = tasks[grandParentId];
    if (!grandParent) {
      return state;
    }
    newContextIds = [...grandParent.children];
  } else {
    newContextIds = [...state.rootIds];
  }

  const parentIdx = newContextIds.indexOf(task.parentId);
  newContextIds.splice(parentIdx + 1, 0, ...sortedIds);

  tasks[task.parentId] = { ...currentParent, children: newSiblings };
  sortedIds.forEach((id) => {
    tasks[id] = { ...tasks[id], parentId: grandParentId };
  });

  const nextRootIds = grandParentId ? [...state.rootIds] : newContextIds;

  if (grandParentId) {
    tasks[grandParentId] = { ...tasks[grandParentId], children: newContextIds };
  }

  let updatedTasks = cleanupHierarchicalDependencies(tasks);
  if (task.parentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, task.parentId, calendar);
  }
  if (grandParentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, grandParentId, calendar);
  }

  return {
    tasks: updatedTasks,
    rootIds: nextRootIds,
  };
}

export function reorderTaskInGraph(
  state: TaskGraphState,
  activeId: string,
  overId: string,
  calendar: ProjectConfig['calendar']
): TaskGraphState {
  if (activeId === overId) {
    return state;
  }

  const tasks = { ...state.tasks };
  const rootIds = [...state.rootIds];
  const activeTask = tasks[activeId];
  const overTask = tasks[overId];

  if (!activeTask || !overTask) {
    return state;
  }

  let current = overTask;
  while (current.parentId) {
    if (current.parentId === activeId) {
      return state;
    }
    const parent = tasks[current.parentId];
    if (!parent) {
      break;
    }
    current = parent;
  }

  if (activeTask.parentId) {
    const parent = tasks[activeTask.parentId];
    if (parent) {
      tasks[activeTask.parentId] = {
        ...parent,
        children: parent.children.filter((id) => id !== activeId),
      };
    }
  } else {
    const idx = rootIds.indexOf(activeId);
    if (idx !== -1) {
      rootIds.splice(idx, 1);
    }
  }

  const newParentId = overTask.parentId;
  if (!newParentId) {
    const idx = rootIds.indexOf(overId);
    rootIds.splice(idx + 1, 0, activeId);
  } else {
    const parent = tasks[newParentId];
    if (!parent) {
      return state;
    }
    const siblings = [...parent.children];
    const idx = siblings.indexOf(overId);
    siblings.splice(idx + 1, 0, activeId);
    tasks[newParentId] = { ...parent, children: siblings };
  }

  tasks[activeId] = { ...activeTask, parentId: newParentId };

  let updatedTasks = cleanupHierarchicalDependencies(tasks);
  if (activeTask.parentId && activeTask.parentId !== newParentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, activeTask.parentId, calendar);
  }
  if (newParentId && activeTask.parentId !== newParentId) {
    updatedTasks = recalculateParentDatesRecursive(updatedTasks, newParentId, calendar);
  }

  return { tasks: updatedTasks, rootIds };
}

export function moveTaskInGraph(
  state: TaskGraphState,
  ids: string[],
  direction: 'up' | 'down'
): TaskGraphState {
  const idArray = Array.isArray(ids) ? ids : [ids];
  if (idArray.length === 0) {
    return state;
  }

  const tasks = { ...state.tasks };
  const firstId = idArray[0];
  const task = tasks[firstId];
  if (!task) {
    return state;
  }

  const parentId = task.parentId;
  const siblings = parentId ? [...(tasks[parentId]?.children ?? [])] : [...state.rootIds];
  if (siblings.length === 0) {
    return state;
  }

  const sortedIds = idArray
    .filter((id) => siblings.includes(id))
    .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));

  if (sortedIds.length === 0) {
    return state;
  }

  const firstIdx = siblings.indexOf(sortedIds[0]);
  const lastIdx = siblings.indexOf(sortedIds[sortedIds.length - 1]);

  if ((lastIdx - firstIdx + 1) !== sortedIds.length) {
    return state;
  }

  if (direction === 'up') {
    if (firstIdx === 0) {
      return state;
    }
    siblings.splice(firstIdx, sortedIds.length);
    siblings.splice(firstIdx - 1, 0, ...sortedIds);
  } else {
    if (lastIdx === siblings.length - 1) {
      return state;
    }
    siblings.splice(firstIdx, sortedIds.length);
    siblings.splice(firstIdx + 1, 0, ...sortedIds);
  }

  if (parentId) {
    tasks[parentId] = { ...tasks[parentId], children: siblings };
    return { tasks, rootIds: state.rootIds };
  }

  return { tasks, rootIds: siblings };
}

