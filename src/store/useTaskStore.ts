import { create, type StoreApi } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import type { ProjectConfig, Task, TaskStoreState } from '../types';
import {
  deleteTasksAndCleanup,
  propagateDependencyDates,
  recalculateParentDatesRecursive,
  applyDateCalculations,
  indentTaskInGraph,
  outdentTaskInGraph,
  reorderTaskInGraph,
  moveTaskInGraph,
  getTaskDepth,
  hasDependencyPath,
} from './taskStoreUtils';
import { DEFAULT_PROJECT_CONFIG, normalizeHolidayList } from '../utils/projectConfig';
import { validateProjectState } from '../utils/validateProjectState';

export interface ProjectData {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig?: ProjectConfig;
}

type TaskStoreHistoryState = Pick<
  TaskStoreState,
  'tasks' | 'rootIds' | 'projectConfig' | 'focusedTaskId' | 'focusedTaskField' | 'selectedTaskIds'
>;

type TaskTemporalStore = StoreApi<TemporalState<TaskStoreHistoryState>>;

const initialTaskId = uuidv4();
const initialTask: Task = {
  id: initialTaskId,
  parentId: null,
  title: 'Project Root',
  startDate: null,
  endDate: null,
  duration: 1,
  progress: 0,
  status: '',
  isCollapsed: false,
  children: [],
  dependencies: [],
  planStartDate: format(new Date(), 'yyyy-MM-dd'),
  planEndDate: format(new Date(), 'yyyy-MM-dd'),
  planDuration: 1,
};

/** 階層の最大深さ（0 始まり。level 4 まで）。addTask の depth 判定と揃える。 */
const MAX_TASK_DEPTH = 3;

/** 新規タスクの既定値（addTask / addTasks で共通）。 */
function createBlankTask(id: string, title = ''): Task {
  return {
    id,
    parentId: null,
    title,
    startDate: null,
    endDate: null,
    duration: 1,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    planStartDate: null,
    planEndDate: null,
    planDuration: 1,
  };
}

const taskStore = create<TaskStoreState>()(
  temporal(
    (set) => ({
      tasks: {
        [initialTaskId]: initialTask,
      },
      rootIds: [initialTaskId],
      projectConfig: DEFAULT_PROJECT_CONFIG,
      focusedTaskId: null,
      focusedTaskField: 'title',
      selectedTaskIds: [],
      dragState: null,
      mousePos: null,
      todayFocusRequestId: 0,

      setFocusedTaskId: (id) => set({ focusedTaskId: id }),
      setFocusedTaskCell: (id, field) => set({ focusedTaskId: id, focusedTaskField: field }),
      setSelectedTaskIds: (ids) => set({ selectedTaskIds: ids }),

      addTask: (targetId?, position = 'after') => {
        const newId = uuidv4();
        const newTask: Task = createBlankTask(newId);

        set((state) => {
          const tasks = { ...state.tasks };
          const rootIds = [...state.rootIds];
          
          if (!targetId || !tasks[targetId]) {
            if (Object.keys(tasks).length === 0) {
              rootIds.push(newId);
              tasks[newId] = newTask;
              return {
                tasks,
                rootIds,
                focusedTaskId: newId,
                focusedTaskField: 'title',
                selectedTaskIds: [newId],
              };
            }
            return {};
          }

          const targetTask = tasks[targetId];

          if (position === 'inside') {
            if (getTaskDepth(tasks, targetId) >= 3) {
              console.warn('Cannot add child: Maximum depth reached (Level 4)');
              return {};
            }

            newTask.parentId = targetId;
            tasks[newId] = newTask;
            tasks[targetId] = {
              ...targetTask,
              children: [newTask.id, ...targetTask.children],
              isCollapsed: false,
            };

            return { tasks, focusedTaskId: newId, focusedTaskField: 'title', selectedTaskIds: [newId] };
          }

          const parentId = targetTask.parentId;
          newTask.parentId = parentId;
          tasks[newId] = newTask;

          if (parentId === null) {
            const idx = rootIds.indexOf(targetId);
            if (idx !== -1) {
              rootIds.splice(idx + 1, 0, newId);
            } else {
              rootIds.push(newId);
            }
            return {
              tasks,
              rootIds,
              focusedTaskId: newId,
              focusedTaskField: 'title',
              selectedTaskIds: [newId],
            };
          }

          const parent = tasks[parentId];
          if (!parent) {
            rootIds.push(newId);
            tasks[newId] = { ...newTask, parentId: null };
            return {
              tasks,
              rootIds,
              focusedTaskId: newId,
              focusedTaskField: 'title',
              selectedTaskIds: [newId],
            };
          }

          const siblings = [...parent.children];
          const idx = siblings.indexOf(targetId);
          if (idx !== -1) {
            siblings.splice(idx + 1, 0, newId);
          } else {
            siblings.push(newId);
          }
          tasks[parentId] = { ...parent, children: siblings };

          return { tasks, focusedTaskId: newId, focusedTaskField: 'title', selectedTaskIds: [newId] };
        });
      },

      addTasks: (items, referenceTaskId, position = 'after', options) => {
        const newIds: string[] = [];
        const referenceTitle = options?.referenceTitle;
        const hasItems = items.length > 0;
        const hasReferenceTitle = referenceTitle !== undefined;

        if (!hasItems && !hasReferenceTitle) {
          return newIds;
        }

        // set は戻り値を返せないため、ID は先に確定させて戻り値にする。
        const plannedItems = items.map((item) => ({ ...item, id: uuidv4() }));
        plannedItems.forEach((item) => newIds.push(item.id));

        set((state) => {
          const tasks = { ...state.tasks };
          const rootIds = [...state.rootIds];

          // 貼り付け先セルのタイトルも同じ set で確定させ、Undo を 1 操作にまとめる。
          if (hasReferenceTitle && referenceTaskId && tasks[referenceTaskId]) {
            tasks[referenceTaskId] = { ...tasks[referenceTaskId], title: referenceTitle };
          }

          if (!hasItems) {
            return { tasks };
          }

          const reference = referenceTaskId ? tasks[referenceTaskId] : undefined;
          const rootParentId =
            position === 'inside'
              ? reference
                ? reference.id
                : null
              : reference
                ? reference.parentId
                : null;
          const baseDepth = rootParentId ? getTaskDepth(tasks, rootParentId) : -1;

          // afterId が見つからなければ末尾へ追加する。
          const insertChild = (
            parentId: string | null,
            afterId: string | null,
            childId: string
          ) => {
            if (parentId === null) {
              const idx = afterId ? rootIds.indexOf(afterId) : -1;
              if (idx !== -1) rootIds.splice(idx + 1, 0, childId);
              else rootIds.push(childId);
              return;
            }

            const parent = tasks[parentId];
            if (!parent) {
              rootIds.push(childId);
              tasks[childId] = { ...tasks[childId], parentId: null };
              return;
            }

            const siblings = [...parent.children];
            const idx = afterId ? siblings.indexOf(afterId) : -1;
            if (idx !== -1) siblings.splice(idx + 1, 0, childId);
            else siblings.push(childId);
            tasks[parentId] = { ...parent, children: siblings, isCollapsed: false };
          };

          // 同階層の最後のノード。afterId と親の解決に使う。
          const lastIdAtDepth: Record<number, string> = {};
          if (reference) {
            lastIdAtDepth[baseDepth + 1] = reference.id;
          }
          let prevDepth = baseDepth;

          plannedItems.forEach((item) => {
            const desiredDepth = baseDepth + 1 + Math.max(0, item.depth);
            // 前の行より 1 段ずつしか深くならない。深さ上限もクランプする。
            const effectiveDepth = Math.max(
              baseDepth + 1,
              Math.min(desiredDepth, prevDepth + 1, MAX_TASK_DEPTH)
            );

            const parentId =
              effectiveDepth - 1 <= baseDepth
                ? rootParentId
                : lastIdAtDepth[effectiveDepth - 1] ?? rootParentId;

            const afterId = lastIdAtDepth[effectiveDepth] ?? null;

            tasks[item.id] = { ...createBlankTask(item.id, item.title), parentId };
            insertChild(parentId, afterId, item.id);

            // より深い階層の記録は使わなくなるため捨てる。
            Object.keys(lastIdAtDepth).forEach((key) => {
              if (Number(key) > effectiveDepth) {
                delete lastIdAtDepth[Number(key)];
              }
            });
            lastIdAtDepth[effectiveDepth] = item.id;
            prevDepth = effectiveDepth;
          });

          return {
            tasks,
            rootIds,
            focusedTaskId: newIds[0] ?? state.focusedTaskId,
            focusedTaskField: 'title',
            selectedTaskIds: newIds,
          };
        });

        return newIds;
      },

      setTaskFieldValues: (ids, field, values) => set((state) => {
        const list = Array.isArray(values) ? values : [values];
        if (ids.length === 0 || list.length === 0) {
          return {};
        }

        const tasks = { ...state.tasks };
        let changed = false;

        ids.forEach((id, index) => {
          const task = tasks[id];
          if (!task) {
            return;
          }

          // 値が 1 個なら全行に同一値、複数なら順番に対応させる。
          const value = list.length === 1 ? list[0] : list[index];
          if (value === undefined || (task[field] ?? '') === value) {
            return;
          }

          tasks[id] = { ...task, [field]: value };
          changed = true;
        });

        return changed ? { tasks } : {};
      }),

      updateTask: (id, updates) => set((state) => {
        const oldTask = state.tasks[id];
        if (!oldTask) {
          return {};
        }

        const baselineLocked = state.projectConfig.baselineLocked ?? false;
        let finalUpdates = { ...updates };

        if (baselineLocked) {
          // Ignore plan updates when baseline is locked
          delete finalUpdates.planStartDate;
          delete finalUpdates.planEndDate;
          delete finalUpdates.planDuration;
        } else {
          // Bidirectional sync before calculation
          if (finalUpdates.planStartDate !== undefined) finalUpdates.startDate = finalUpdates.planStartDate;
          if (finalUpdates.planEndDate !== undefined) finalUpdates.endDate = finalUpdates.planEndDate;
          if (finalUpdates.planDuration !== undefined) finalUpdates.duration = finalUpdates.planDuration;

          if (finalUpdates.startDate !== undefined) finalUpdates.planStartDate = finalUpdates.startDate;
          if (finalUpdates.endDate !== undefined) finalUpdates.planEndDate = finalUpdates.endDate;
          if (finalUpdates.duration !== undefined) finalUpdates.planDuration = finalUpdates.duration;
        }

        // Apply automatic date & duration calculations
        finalUpdates = applyDateCalculations(oldTask, finalUpdates, state.projectConfig.calendar);

        if (!baselineLocked) {
          // Sync any calculated values after calculation
          if (finalUpdates.planStartDate !== undefined) finalUpdates.startDate = finalUpdates.planStartDate;
          if (finalUpdates.planEndDate !== undefined) finalUpdates.endDate = finalUpdates.planEndDate;
          if (finalUpdates.planDuration !== undefined) finalUpdates.duration = finalUpdates.planDuration;

          if (finalUpdates.startDate !== undefined) finalUpdates.planStartDate = finalUpdates.startDate;
          if (finalUpdates.endDate !== undefined) finalUpdates.planEndDate = finalUpdates.endDate;
          if (finalUpdates.duration !== undefined) finalUpdates.planDuration = finalUpdates.duration;
        }

        let tasks = {
          ...state.tasks,
          [id]: { ...oldTask, ...finalUpdates },
        };

        if (
          finalUpdates.endDate !== undefined ||
          finalUpdates.startDate !== undefined ||
          finalUpdates.planEndDate !== undefined ||
          finalUpdates.planStartDate !== undefined ||
          finalUpdates.progress !== undefined ||
          finalUpdates.status !== undefined
        ) {
          tasks = propagateDependencyDates(tasks, id, state.projectConfig.calendar, baselineLocked);
          if (oldTask.parentId) {
            tasks = recalculateParentDatesRecursive(tasks, oldTask.parentId, state.projectConfig.calendar, baselineLocked);
          }
        }

        return { tasks };
      }),

      endDragUpdate: (id, updates) => set((state) => {
        const oldTask = state.tasks[id];
        if (!oldTask) {
          return { dragState: null, mousePos: null };
        }

        const baselineLocked = state.projectConfig.baselineLocked ?? false;
        let finalUpdates = { ...updates };

        if (baselineLocked) {
          // Ignore plan updates when baseline is locked
          delete finalUpdates.planStartDate;
          delete finalUpdates.planEndDate;
          delete finalUpdates.planDuration;
        } else {
          // Bidirectional sync before calculation
          if (finalUpdates.planStartDate !== undefined) finalUpdates.startDate = finalUpdates.planStartDate;
          if (finalUpdates.planEndDate !== undefined) finalUpdates.endDate = finalUpdates.planEndDate;
          if (finalUpdates.planDuration !== undefined) finalUpdates.duration = finalUpdates.planDuration;

          if (finalUpdates.startDate !== undefined) finalUpdates.planStartDate = finalUpdates.startDate;
          if (finalUpdates.endDate !== undefined) finalUpdates.planEndDate = finalUpdates.endDate;
          if (finalUpdates.duration !== undefined) finalUpdates.planDuration = finalUpdates.duration;
        }

        // Apply automatic date & duration calculations
        finalUpdates = applyDateCalculations(oldTask, finalUpdates, state.projectConfig.calendar);

        if (!baselineLocked) {
          // Sync any calculated values after calculation
          if (finalUpdates.planStartDate !== undefined) finalUpdates.startDate = finalUpdates.planStartDate;
          if (finalUpdates.planEndDate !== undefined) finalUpdates.endDate = finalUpdates.planEndDate;
          if (finalUpdates.planDuration !== undefined) finalUpdates.duration = finalUpdates.planDuration;

          if (finalUpdates.startDate !== undefined) finalUpdates.planStartDate = finalUpdates.startDate;
          if (finalUpdates.endDate !== undefined) finalUpdates.planEndDate = finalUpdates.endDate;
          if (finalUpdates.duration !== undefined) finalUpdates.planDuration = finalUpdates.duration;
        }

        let tasks = {
          ...state.tasks,
          [id]: { ...oldTask, ...finalUpdates },
        };

        if (
          finalUpdates.endDate !== undefined ||
          finalUpdates.startDate !== undefined ||
          finalUpdates.planEndDate !== undefined ||
          finalUpdates.planStartDate !== undefined ||
          finalUpdates.progress !== undefined ||
          finalUpdates.status !== undefined
        ) {
          tasks = propagateDependencyDates(tasks, id, state.projectConfig.calendar, baselineLocked);
          if (oldTask.parentId) {
            tasks = recalculateParentDatesRecursive(tasks, oldTask.parentId, state.projectConfig.calendar, baselineLocked);
          }
        }

        return {
          tasks,
          dragState: null,
          mousePos: null,
        };
      }),

      deleteTask: (ids) => set((state) => {
        const idArray = Array.isArray(ids) ? ids : [ids];
        const parentIdsToRecalculate = new Set<string>();
        idArray.forEach((id) => {
          const task = state.tasks[id];
          if (task && task.parentId) {
            parentIdsToRecalculate.add(task.parentId);
          }
        });

        const nextGraph = deleteTasksAndCleanup(
          { tasks: state.tasks, rootIds: state.rootIds },
          idArray
        );

        let updatedTasks = nextGraph.tasks;
        const baselineLocked = state.projectConfig.baselineLocked ?? false;
        parentIdsToRecalculate.forEach((parentId) => {
          if (updatedTasks[parentId]) {
            updatedTasks = recalculateParentDatesRecursive(updatedTasks, parentId, state.projectConfig.calendar, baselineLocked);
          }
        });

        return {
          tasks: updatedTasks,
          rootIds: nextGraph.rootIds,
          focusedTaskId: state.focusedTaskId && updatedTasks[state.focusedTaskId] ? state.focusedTaskId : null,
          selectedTaskIds: state.selectedTaskIds.filter((id) => updatedTasks[id]),
        };
      }),

      toggleCollapse: (id) => set((state) => {
        const task = state.tasks[id];
        if (!task) {
          return {};
        }

        return {
          tasks: {
            ...state.tasks,
            [id]: { ...task, isCollapsed: !task.isCollapsed },
          },
        };
      }),

      setCollapsed: (ids, isCollapsed) => set((state) => {
        const tasks = { ...state.tasks };
        ids.forEach((id) => {
          if (tasks[id]) {
            tasks[id] = { ...tasks[id], isCollapsed };
          }
        });
        return { tasks };
      }),

      setAllCollapsed: (isCollapsed) => set((state) => {
        const tasks = { ...state.tasks };
        let hasChanges = false;

        Object.values(state.tasks).forEach((task) => {
          if (task.children.length === 0 || task.isCollapsed === isCollapsed) {
            return;
          }

          tasks[task.id] = { ...task, isCollapsed };
          hasChanges = true;
        });

        if (!hasChanges) {
          return {};
        }

        return { tasks };
      }),

      indentTask: (ids) => set((state) => {
        return indentTaskInGraph(
          { tasks: state.tasks, rootIds: state.rootIds },
          Array.isArray(ids) ? ids : [ids],
          state.projectConfig.calendar
        );
      }),

      outdentTask: (ids) => set((state) => {
        return outdentTaskInGraph(
          { tasks: state.tasks, rootIds: state.rootIds },
          Array.isArray(ids) ? ids : [ids],
          state.projectConfig.calendar
        );
      }),

      reorderTask: (activeId, overId) => set((state) => {
        return reorderTaskInGraph(
          { tasks: state.tasks, rootIds: state.rootIds },
          activeId,
          overId,
          state.projectConfig.calendar
        );
      }),

      moveTask: (ids, direction) => set((state) => {
        return moveTaskInGraph(
          { tasks: state.tasks, rootIds: state.rootIds },
          Array.isArray(ids) ? ids : [ids],
          direction
        );
      }),

      addDependency: (fromId, toId) => set((state) => {
        if (fromId === toId) {
          return {};
        }

        // Prohibit dependencies involving any parent tasks
        const fromTask = state.tasks[fromId];
        const toTask = state.tasks[toId];
        if (!fromTask || !toTask) {
          return {};
        }
        if (fromTask.children.length > 0 || toTask.children.length > 0) {
          console.warn('Cannot add dependency involving parent tasks');
          return {};
        }

        // Check for parent-child / ancestor-descendant relationship to prevent loops
        const isAncestor = (ancId: string, descId: string): boolean => {
          let curr = state.tasks[descId];
          while (curr) {
            if (curr.parentId === ancId) return true;
            curr = state.tasks[curr.parentId || ''];
          }
          return false;
        };

        if (isAncestor(fromId, toId) || isAncestor(toId, fromId)) {
          console.warn('Cannot add dependency between parent/ancestor and child/descendant tasks');
          return {};
        }

        if (hasDependencyPath(state.tasks, fromId, toId)) {
          console.warn('Cycle detected, cannot add dependency');
          return {};
        }

        let tasks = { ...state.tasks };
        const targetTask = tasks[toId];
        if (!targetTask || targetTask.dependencies.includes(fromId)) {
          return {};
        }

        tasks[toId] = {
          ...targetTask,
          dependencies: [...targetTask.dependencies, fromId],
        };

        const baselineLocked = state.projectConfig.baselineLocked ?? false;
        tasks = propagateDependencyDates(tasks, fromId, state.projectConfig.calendar, baselineLocked);

        return { tasks };
      }),

      removeDependency: (fromId, toId) => set((state) => {
        const tasks = { ...state.tasks };
        const targetTask = tasks[toId];
        if (!targetTask) {
          return {};
        }

        tasks[toId] = {
          ...targetTask,
          dependencies: targetTask.dependencies.filter((id) => id !== fromId),
        };

        return { tasks };
      }),

      setCalendarHolidays: (holidays) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          calendar: {
            ...state.projectConfig.calendar,
            holidays: normalizeHolidayList(holidays),
          },
        },
      })),

      setViewMode: (viewMode) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          viewMode,
        },
      })),

      setColumnWidth: (columnId, width) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          columnWidths: {
            ...state.projectConfig.columnWidths,
            [columnId]: Math.max(50, width), // Prevent columns from becoming too small
          },
        },
      })),

      setBaselineLocked: (baselineLocked) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          baselineLocked,
        },
      })),

      setVisibleColumns: (visibleColumns) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          visibleColumns,
        },
      })),

      setIntegratedColumns: (integratedColumns) => set((state) => ({
        projectConfig: {
          ...state.projectConfig,
          integratedColumns,
        },
      })),

      setDragState: (dragState) => set({ dragState }),
      setMousePos: (mousePos) => set({ mousePos }),
      requestScrollToToday: () =>
        set((state) => ({ todayFocusRequestId: state.todayFocusRequestId + 1 })),
    }),
    {
      partialize: (state) => ({
        tasks: state.tasks,
        rootIds: state.rootIds,
        projectConfig: state.projectConfig,
        focusedTaskId: state.focusedTaskId,
        focusedTaskField: state.focusedTaskField,
        selectedTaskIds: state.selectedTaskIds,
      }),
      equality: (a, b) =>
        a.tasks === b.tasks &&
        a.rootIds === b.rootIds &&
        a.projectConfig === b.projectConfig,
    }
  )
);

export const useTaskStore = taskStore as typeof taskStore & {
  temporal: TaskTemporalStore;
};

export function getTemporalState(): TemporalState<TaskStoreHistoryState> {
  return useTaskStore.temporal.getState();
}

export interface LoadProjectStateResult {
  ok: boolean;
  /** 修復した内容の要約（ok:true のときのみ意味を持つ）。 */
  warnings: string[];
  /** 読み込めなかった理由（ok:false のときのみ）。 */
  error?: string;
}

/**
 * プロジェクト状態を読み込む。IPC 経由かどうかに依存しない単一の入口。
 * 入力は実行時に検証・正規化され、読み込めない場合はストアを変更しない。
 */
export function loadProjectState(input: unknown): LoadProjectStateResult {
  const validation = validateProjectState(input);
  if (!validation.ok) {
    return { ok: false, warnings: [], error: validation.error };
  }

  useTaskStore.setState({
    ...useTaskStore.getState(),
    tasks: validation.tasks,
    rootIds: validation.rootIds,
    projectConfig: validation.projectConfig,
    focusedTaskId: null,
    focusedTaskField: 'title',
    selectedTaskIds: [],
  });
  getTemporalState().clear();

  return { ok: true, warnings: validation.warnings };
}
