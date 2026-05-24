import { create, type StoreApi } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import type { ProjectConfig, Task, TaskStoreState } from '../types';
import {
  deleteTasksAndCleanup,
  normalizeProjectState,
  propagateDependencyDates,
  recalculateParentDatesRecursive,
  applyDateCalculations,
  indentTaskInGraph,
  outdentTaskInGraph,
  reorderTaskInGraph,
  moveTaskInGraph,
  getTaskDepth,
} from './taskStoreUtils';
import { DEFAULT_PROJECT_CONFIG, mergeProjectConfig, normalizeHolidayList } from '../utils/projectConfig';

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

      setFocusedTaskId: (id) => set({ focusedTaskId: id }),
      setFocusedTaskCell: (id, field) => set({ focusedTaskId: id, focusedTaskField: field }),
      setSelectedTaskIds: (ids) => set({ selectedTaskIds: ids }),

      addTask: (targetId?, position = 'after') => {
        const newId = uuidv4();
        const newTask: Task = {
          id: newId,
          parentId: null,
          title: '',
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
        }

        // Apply automatic date & duration calculations
        finalUpdates = applyDateCalculations(oldTask, finalUpdates, state.projectConfig.calendar);

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

        const checkCycle = (
          currentId: string,
          targetId: string,
          visited: Set<string> = new Set()
        ): boolean => {
          if (currentId === targetId) {
            return true;
          }
          if (visited.has(currentId)) {
            return false;
          }
          visited.add(currentId);

          const task = state.tasks[currentId];
          if (!task) {
            return false;
          }

          return task.dependencies.some((depId) => checkCycle(depId, targetId, visited));
        };

        if (checkCycle(fromId, toId)) {
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
      equality: (a, b) => (
        a.tasks === b.tasks &&
        a.rootIds === b.rootIds &&
        a.projectConfig === b.projectConfig
      ),
    }
  )
);

export const useTaskStore = taskStore as typeof taskStore & {
  temporal: TaskTemporalStore;
};

export function getTemporalState(): TemporalState<TaskStoreHistoryState> {
  return useTaskStore.temporal.getState();
}

export function loadProjectState(data: ProjectData): void {
  const normalized = normalizeProjectState(data.tasks, data.rootIds);
  useTaskStore.setState({
    ...useTaskStore.getState(),
    tasks: normalized.tasks,
    rootIds: normalized.rootIds,
    projectConfig: mergeProjectConfig(data.projectConfig),
    focusedTaskId: null,
    focusedTaskField: 'title',
    selectedTaskIds: [],
  });
  getTemporalState().clear();
}
