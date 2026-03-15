import { create, type StoreApi } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import type { ProjectConfig, Task, TaskStoreState } from '../types';
import {
  deleteTasksAndCleanup,
  getSubtreeMaxDepth,
  getTaskDepth,
  normalizeProjectState,
  propagateDependencyDates,
} from './taskStoreUtils';
import { DEFAULT_PROJECT_CONFIG, mergeProjectConfig, normalizeHolidayList } from '../utils/projectConfig';

export interface ProjectData {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig?: ProjectConfig;
}

type TaskStoreHistoryState = Pick<
  TaskStoreState,
  'tasks' | 'rootIds' | 'projectConfig' | 'focusedTaskId' | 'selectedTaskIds'
>;

type TaskTemporalStore = StoreApi<TemporalState<TaskStoreHistoryState>>;

const initialTaskId = uuidv4();
const initialTask: Task = {
  id: initialTaskId,
  parentId: null,
  title: 'Project Root',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  duration: 1,
  progress: 0,
  isCollapsed: false,
  children: [],
  dependencies: [],
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
      selectedTaskIds: [],

      setFocusedTaskId: (id) => set({ focusedTaskId: id }),
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
          isCollapsed: false,
          children: [],
          dependencies: [],
        };

        set((state) => {
          const tasks = { ...state.tasks };
          const rootIds = [...state.rootIds];
          
          if (!targetId || !tasks[targetId]) {
            if (Object.keys(tasks).length === 0) {
              rootIds.push(newId);
              tasks[newId] = newTask;
              return { tasks, rootIds, focusedTaskId: newId, selectedTaskIds: [newId] };
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

            return { tasks, focusedTaskId: newId, selectedTaskIds: [newId] };
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
            return { tasks, rootIds, focusedTaskId: newId, selectedTaskIds: [newId] };
          }

          const parent = tasks[parentId];
          if (!parent) {
            rootIds.push(newId);
            tasks[newId] = { ...newTask, parentId: null };
            return { tasks, rootIds, focusedTaskId: newId, selectedTaskIds: [newId] };
          }

          const siblings = [...parent.children];
          const idx = siblings.indexOf(targetId);
          if (idx !== -1) {
            siblings.splice(idx + 1, 0, newId);
          } else {
            siblings.push(newId);
          }
          tasks[parentId] = { ...parent, children: siblings };

          return { tasks, focusedTaskId: newId, selectedTaskIds: [newId] };
        });
      },

      updateTask: (id, updates) => set((state) => {
        const oldTask = state.tasks[id];
        if (!oldTask) {
          return {};
        }

        let tasks = {
          ...state.tasks,
          [id]: { ...oldTask, ...updates },
        };

        if (updates.endDate !== undefined) {
          tasks = propagateDependencyDates(tasks, id, state.projectConfig.calendar);
        }

        return { tasks };
      }),

      deleteTask: (ids) => set((state) => {
        const idArray = Array.isArray(ids) ? ids : [ids];
        const nextGraph = deleteTasksAndCleanup(
          { tasks: state.tasks, rootIds: state.rootIds },
          idArray
        );

        return {
          tasks: nextGraph.tasks,
          rootIds: nextGraph.rootIds,
          focusedTaskId: state.focusedTaskId && nextGraph.tasks[state.focusedTaskId] ? state.focusedTaskId : null,
          selectedTaskIds: state.selectedTaskIds.filter((id) => nextGraph.tasks[id]),
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

      indentTask: (ids) => set((state) => {
        const idArray = Array.isArray(ids) ? ids : [ids];
        if (idArray.length === 0) {
          return {};
        }

        const tasks = { ...state.tasks };
        const firstId = idArray[0];
        const task = tasks[firstId];
        if (!task) {
          return {};
        }

        const parentId = task.parentId;
        const siblings = parentId ? tasks[parentId]?.children : state.rootIds;
        if (!siblings) {
          return {};
        }

        const sortedIds = idArray
          .filter((id) => siblings.includes(id))
          .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));

        if (sortedIds.length === 0) {
          return {};
        }

        const firstIdx = siblings.indexOf(sortedIds[0]);
        if (firstIdx <= 0) {
          return {};
        }

        const newParentId = siblings[firstIdx - 1];
        if (idArray.includes(newParentId)) {
          return {};
        }

        const newParent = tasks[newParentId];
        if (!newParent) {
          return {};
        }

        const newParentDepth = getTaskDepth(tasks, newParentId);
        for (const id of sortedIds) {
          const subtreeDepth = getSubtreeMaxDepth(tasks, id);
          if (newParentDepth + 1 + subtreeDepth > 3) {
            console.warn('Cannot indent: Resulting depth exceeds Level 4');
            return {};
          }
        }

        const newSiblings = siblings.filter((sid) => !sortedIds.includes(sid));
        const newParentChildren = [...newParent.children, ...sortedIds];
        const updates: Partial<TaskStoreState> = { tasks };

        if (parentId) {
          tasks[parentId] = { ...tasks[parentId], children: newSiblings };
        } else {
          updates.rootIds = newSiblings;
        }

        tasks[newParentId] = {
          ...newParent,
          children: newParentChildren,
          isCollapsed: false,
        };

        sortedIds.forEach((id) => {
          tasks[id] = { ...tasks[id], parentId: newParentId };
        });

        return updates;
      }),

      outdentTask: (ids) => set((state) => {
        const idArray = Array.isArray(ids) ? ids : [ids];
        if (idArray.length === 0) {
          return {};
        }

        const tasks = { ...state.tasks };
        const firstId = idArray[0];
        const task = tasks[firstId];
        if (!task?.parentId) {
          return {};
        }

        const currentParent = tasks[task.parentId];
        if (!currentParent) {
          return {};
        }

        const currentSiblings = currentParent.children;
        const sortedIds = idArray
          .filter((id) => currentSiblings.includes(id))
          .sort((a, b) => currentSiblings.indexOf(a) - currentSiblings.indexOf(b));

        if (sortedIds.length === 0) {
          return {};
        }

        const newSiblings = currentSiblings.filter((sid) => !sortedIds.includes(sid));
        let newContextIds: string[];
        let grandParentId: string | null = null;

        if (currentParent.parentId) {
          grandParentId = currentParent.parentId;
          const grandParent = tasks[grandParentId];
          if (!grandParent) {
            return {};
          }
          newContextIds = [...grandParent.children];
        } else {
          newContextIds = [...state.rootIds];
        }

        const parentIdx = newContextIds.indexOf(task.parentId);
        newContextIds.splice(parentIdx + 1, 0, ...sortedIds);

        const updates: Partial<TaskStoreState> = { tasks };

        tasks[task.parentId] = { ...currentParent, children: newSiblings };
        sortedIds.forEach((id) => {
          tasks[id] = { ...tasks[id], parentId: grandParentId };
        });

        if (grandParentId) {
          tasks[grandParentId] = { ...tasks[grandParentId], children: newContextIds };
        } else {
          updates.rootIds = newContextIds;
        }

        return updates;
      }),

      reorderTask: (activeId, overId) => set((state) => {
        if (activeId === overId) {
          return {};
        }

        const tasks = { ...state.tasks };
        const rootIds = [...state.rootIds];
        const activeTask = tasks[activeId];
        const overTask = tasks[overId];

        if (!activeTask || !overTask) {
          return {};
        }

        let current = overTask;
        while (current.parentId) {
          if (current.parentId === activeId) {
            return {};
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
            return {};
          }
          const siblings = [...parent.children];
          const idx = siblings.indexOf(overId);
          siblings.splice(idx + 1, 0, activeId);
          tasks[newParentId] = { ...parent, children: siblings };
        }

        tasks[activeId] = { ...activeTask, parentId: newParentId };

        return { tasks, rootIds };
      }),

      moveTask: (ids, direction) => set((state) => {
        const idArray = Array.isArray(ids) ? ids : [ids];
        if (idArray.length === 0) {
          return {};
        }

        const tasks = { ...state.tasks };
        const firstId = idArray[0];
        const task = tasks[firstId];
        if (!task) {
          return {};
        }

        const parentId = task.parentId;
        const siblings = parentId ? [...(tasks[parentId]?.children ?? [])] : [...state.rootIds];
        if (siblings.length === 0) {
          return {};
        }

        const sortedIds = idArray
          .filter((id) => siblings.includes(id))
          .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));

        if (sortedIds.length === 0) {
          return {};
        }

        const firstIdx = siblings.indexOf(sortedIds[0]);
        const lastIdx = siblings.indexOf(sortedIds[sortedIds.length - 1]);

        if ((lastIdx - firstIdx + 1) !== sortedIds.length) {
          return {};
        }

        if (direction === 'up') {
          if (firstIdx === 0) {
            return {};
          }
          siblings.splice(firstIdx, sortedIds.length);
          siblings.splice(firstIdx - 1, 0, ...sortedIds);
        } else {
          if (lastIdx === siblings.length - 1) {
            return {};
          }
          siblings.splice(firstIdx, sortedIds.length);
          siblings.splice(firstIdx + 1, 0, ...sortedIds);
        }

        if (parentId) {
          tasks[parentId] = { ...tasks[parentId], children: siblings };
          return { tasks };
        }

        return { tasks, rootIds: siblings };
      }),

      addDependency: (fromId, toId) => set((state) => {
        if (fromId === toId) {
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

        const tasks = { ...state.tasks };
        const targetTask = tasks[toId];
        if (!targetTask || targetTask.dependencies.includes(fromId)) {
          return {};
        }

        tasks[toId] = {
          ...targetTask,
          dependencies: [...targetTask.dependencies, fromId],
        };

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
    }),
    {
      partialize: (state) => ({
        tasks: state.tasks,
        rootIds: state.rootIds,
        projectConfig: state.projectConfig,
        focusedTaskId: state.focusedTaskId,
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
    selectedTaskIds: [],
  });
  getTemporalState().clear();
}
