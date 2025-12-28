import { create } from 'zustand';
import type { Task, ProjectConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { addWorkDays, calculateEndDate } from '../utils/date';

interface TaskState {
  tasks: Record<string, Task>;
  rootIds: string[]; // Top-level ordered IDs
  projectConfig: ProjectConfig;
  focusedTaskId: string | null;
  selectedTaskIds: string[]; // Set of selected IDs

  // Actions
  setFocusedTaskId: (id: string | null) => void;
  setSelectedTaskIds: (ids: string[]) => void;
  // selectTask: (id: string, toggle: boolean, range: boolean) => void; // Implemented in component via helpers usually, or store. 
  // Store needs sorted list for range.
  
  addTask: (targetId: string, position?: 'after' | 'inside') => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (ids: string | string[]) => void; // Updated signature
  toggleCollapse: (id: string) => void;
  setCollapsed: (ids: string[], isCollapsed: boolean) => void;
  indentTask: (ids: string | string[]) => void;
  outdentTask: (ids: string | string[]) => void;
  reorderTask: (activeId: string, overId: string) => void;
  moveTask: (id: string | string[], direction: 'up' | 'down') => void;
  addDependency: (fromId: string, toId: string) => void;
  removeDependency: (fromId: string, toId: string) => void;
  setViewMode: (viewMode: ProjectConfig['viewMode']) => void;
}

const DEFAULT_CONFIG: ProjectConfig = {
  calendar: {
    workDays: [1, 2, 3, 4, 5], 
    holidays: [],
  },
  viewMode: 'Day',
};

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

const getTaskDepth = (tasks: Record<string, Task>, id: string): number => {
  let depth = 0;
  let current = tasks[id];
  while (current && current.parentId) {
    depth++;
    current = tasks[current.parentId];
  }
  return depth;
};

const getSubtreeMaxDepth = (tasks: Record<string, Task>, id: string): number => {
  const task = tasks[id];
  if (!task || task.children.length === 0) return 0;
  return 1 + Math.max(...task.children.map(childId => getSubtreeMaxDepth(tasks, childId)));
};

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {
    [initialTaskId]: initialTask,
  },
  rootIds: [initialTaskId],
  projectConfig: DEFAULT_CONFIG,
  focusedTaskId: null,
  selectedTaskIds: [],

  setFocusedTaskId: (id) => set({ focusedTaskId: id }),
  setSelectedTaskIds: (ids) => set({ selectedTaskIds: ids }),

  addTask: (targetId, position = 'after') => {
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
      
      const targetTask = tasks[targetId];
      
      if (position === 'inside') {
        // Limit depth to Level 4 (depth 3)
        if (getTaskDepth(tasks, targetId) >= 3) {
          console.warn('Cannot add child: Maximum depth reached (Level 4)');
          return {};
        }

        // Add as first child of targetId
        newTask.parentId = targetId;
        tasks[newId] = newTask;
        
        // Update parent's children
        tasks[targetId] = {
          ...tasks[targetId],
          children: [newTask.id, ...tasks[targetId].children],
          isCollapsed: false, // Auto-expand
        };
        
        return { tasks, focusedTaskId: newId };
      } 
      else {
        // 'after': Add as sibling after targetId
        const parentId = targetTask.parentId;
        newTask.parentId = parentId;
        tasks[newId] = newTask;
        
        if (parentId === null) {
          // It's a root task
          const idx = rootIds.indexOf(targetId);
          if (idx !== -1) {
            rootIds.splice(idx + 1, 0, newId);
          } else {
            rootIds.push(newId);
          }
          return { tasks, rootIds, focusedTaskId: newId };
        } else {
          // It's a child task
          const parent = tasks[parentId];
          const siblings = [...parent.children];
          const idx = siblings.indexOf(targetId);
          if (idx !== -1) {
            siblings.splice(idx + 1, 0, newId);
          } else {
            siblings.push(newId);
          }
           tasks[parentId] = { ...parent, children: siblings };
           return { tasks, focusedTaskId: newId };
        }
      }
    });
  },

  updateTask: (id, updates) => set((state) => {
    // ... existing updateTask logic ...
    const tasks = { ...state.tasks };
    const oldTask = tasks[id];
    const newTask = { ...oldTask, ...updates };
    tasks[id] = newTask;

    // Date Propagation Logic
    const needsPropagation = updates.endDate !== undefined;

    if (needsPropagation) {
      const dependents: string[] = [];
      Object.values(tasks).forEach(task => {
        if (task.dependencies.includes(id)) {
          dependents.push(task.id);
        }
      });

      let propagationQueue = [...dependents];
      const visited = new Set(dependents);

      while (propagationQueue.length > 0) {
        const currentId = propagationQueue.shift()!;
        const currentTask = tasks[currentId];

        let maxPredecessorEndDate: Date | null = null;
        currentTask.dependencies.forEach(depId => {
          const depTask = tasks[depId];
          const depEndDate = new Date(depTask.endDate);
          if (!maxPredecessorEndDate || depEndDate > maxPredecessorEndDate) {
            maxPredecessorEndDate = depEndDate;
          }
        });

        if (maxPredecessorEndDate) {
          // New start date is the day after the latest predecessor ends
          const newStartDate = addWorkDays(maxPredecessorEndDate, 1, state.projectConfig.calendar.holidays);
          const newEndDate = calculateEndDate(newStartDate, currentTask.duration, state.projectConfig.calendar.holidays);

          tasks[currentId] = {
            ...currentTask,
            startDate: format(newStartDate, 'yyyy-MM-dd'),
            endDate: format(newEndDate, 'yyyy-MM-dd'),
          };

          // Add dependents of the current task to the queue if not visited
          Object.values(tasks).forEach(task => {
            if (task.dependencies.includes(currentId) && !visited.has(task.id)) {
              propagationQueue.push(task.id);
              visited.add(task.id);
            }
          });
        }
      }
    }

    return { tasks };
  }),

  deleteTask: (ids) => set((state) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    const tasks = { ...state.tasks };
    let rootIds = [...state.rootIds];
    
    idArray.forEach(id => {
       const task = tasks[id];
       if (!task) return;
       
       if (task.parentId) {
         const parent = tasks[task.parentId];
         if (parent) {
           tasks[task.parentId] = {
             ...parent,
             children: parent.children.filter(childId => childId !== id)
           };
         }
       } else {
         rootIds = rootIds.filter(rid => rid !== id);
       }
       delete tasks[id];
    });
    
    return { tasks, rootIds, selectedTaskIds: [] }; 
  }),

  toggleCollapse: (id) => set((state) => {
    const task = state.tasks[id];
    if (!task) return {};
    
    return {
      tasks: {
        ...state.tasks,
        [id]: { ...task, isCollapsed: !task.isCollapsed }
      }
    };
  }),

  setCollapsed: (ids: string[], isCollapsed: boolean) => set((state) => {
    const tasks = { ...state.tasks };
    ids.forEach(id => {
      if (tasks[id]) {
        tasks[id] = { ...tasks[id], isCollapsed };
      }
    });
    return { tasks };
  }),

  indentTask: (ids: string | string[]) => set((state) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return {};
    
    const tasks = { ...state.tasks };
    
    const firstId = idArray[0];
    const task = tasks[firstId];
    if (!task) return {};

    const parentId = task.parentId;
    let siblings: string[];
    if (parentId) {
      siblings = tasks[parentId].children;
    } else {
      siblings = state.rootIds;
    }

    const sortedIds = idArray
      .filter(id => siblings.includes(id))
      .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
      
    if (sortedIds.length === 0) return {};

    const firstIdx = siblings.indexOf(sortedIds[0]);
    if (firstIdx <= 0) return {};
    
    const newParentId = siblings[firstIdx - 1];
    if (idArray.includes(newParentId)) return {}; 
    
    const newParent = tasks[newParentId];

    // Limit depth check
    const newParentDepth = getTaskDepth(tasks, newParentId);
    for (const id of sortedIds) {
      const subtreeDepth = getSubtreeMaxDepth(tasks, id);
      if (newParentDepth + 1 + subtreeDepth > 3) {
        console.warn('Cannot indent: Resulting depth exceeds Level 4');
        return {};
      }
    }
    
    const newSiblings = siblings.filter(sid => !sortedIds.includes(sid));
    const newParentChildren = [...newParent.children, ...sortedIds];
    
    const updates: Partial<TaskState> = { tasks };
    
    if (parentId) {
      tasks[parentId] = { ...tasks[parentId], children: newSiblings };
    } else {
      updates.rootIds = newSiblings;
    }
    
    tasks[newParentId] = {
      ...newParent,
      children: newParentChildren,
      isCollapsed: false
    };
    
    sortedIds.forEach(id => {
      tasks[id] = { ...tasks[id], parentId: newParentId };
    });
    
    return updates;
  }),

  outdentTask: (ids: string | string[]) => set((state) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return {};
    
    const tasks = { ...state.tasks };
    const firstId = idArray[0];
    const task = tasks[firstId];
    if (!task.parentId) return {}; // Already root
    
    const currentParent = tasks[task.parentId];
    
    // Same logic: Verify and sort
    const currentSiblings = currentParent.children;
    const sortedIds = idArray
      .filter(id => currentSiblings.includes(id))
      .sort((a, b) => currentSiblings.indexOf(a) - currentSiblings.indexOf(b));

    if (sortedIds.length === 0) return {};

    // Remove all ids from current parent
    const newSiblings = currentSiblings.filter(sid => !sortedIds.includes(sid));
    
    // Identify new context
    let newContextIds: string[];
    let grandParentId: string | null = null;
    
    if (currentParent.parentId) {
      grandParentId = currentParent.parentId;
      newContextIds = [...tasks[grandParentId].children];
    } else {
      newContextIds = [...state.rootIds];
    }
    
    // Insert after current parent
    const parentIdx = newContextIds.indexOf(task.parentId);
    newContextIds.splice(parentIdx + 1, 0, ...sortedIds);
    
    // Update
    const updates: Partial<TaskState> = { tasks };
    
    tasks[task.parentId] = { ...currentParent, children: newSiblings };
    
    sortedIds.forEach(id => {
      tasks[id] = { ...tasks[id], parentId: grandParentId };
    });
    
    if (grandParentId) {
      tasks[grandParentId] = { ...tasks[grandParentId], children: newContextIds };
    } else {
      updates.rootIds = newContextIds;
    }
    
    return updates;
  }),

  reorderTask: (activeId: string, overId: string) => set((state) => {
    if (activeId === overId) return {};

    const tasks = { ...state.tasks };
    const rootIds = [...state.rootIds];
    
    const activeTask = tasks[activeId];
    const overTask = tasks[overId];
    
    // Prevent moving parent into its own child (cycle check)
    let current = overTask;
    while (current.parentId) {
      if (current.parentId === activeId) return {}; // Cycle detected
      current = tasks[current.parentId];
    }
    
    // 1. Remove active from old location
    if (activeTask.parentId) {
      const parent = tasks[activeTask.parentId];
      tasks[activeTask.parentId] = {
        ...parent,
        children: parent.children.filter(id => id !== activeId)
      };
    } else {
      const idx = rootIds.indexOf(activeId);
      if (idx !== -1) rootIds.splice(idx, 1);
    }
    
    // 2. Insert at new location (after overTask)
    // We want to insert AFTER the overTask among its siblings.
    let newParentId = overTask.parentId;
    
    // If we are moving it to root level
    if (!newParentId) {
      const idx = rootIds.indexOf(overId);
      rootIds.splice(idx + 1, 0, activeId);
    } else {
      const parent = tasks[newParentId];
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
    if (idArray.length === 0) return {};
    
    const tasks = { ...state.tasks };
    
    const firstId = idArray[0];
    const task = tasks[firstId];
    const parentId = task.parentId;
    
    let siblings: string[];
    if (parentId) {
       siblings = [...tasks[parentId].children];
    } else {
       siblings = [...state.rootIds];
    }
    
    // Sort and Check Connectivity
    const sortedIds = idArray
      .filter(id => siblings.includes(id)) // Ensure same parent/level
      .sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
    
    if (sortedIds.length === 0) return {};
    
    const firstIdx = siblings.indexOf(sortedIds[0]);
    const lastIdx = siblings.indexOf(sortedIds[sortedIds.length - 1]);
    
    // Check contiguous
    if ((lastIdx - firstIdx + 1) !== sortedIds.length) {
       // Not contiguous - abort move to avoid corruption
       return {};
    }
    
    if (direction === 'up') {
       if (firstIdx === 0) return {}; 
       // Start of block is at firstIdx.
       // Prev sibling is at firstIdx - 1.
       
       // Remove block
       siblings.splice(firstIdx, sortedIds.length);
       // Insert block before prev sibling (at firstIdx - 1)
       siblings.splice(firstIdx - 1, 0, ...sortedIds);
       
    } else {
       // Move Down
       if (lastIdx === siblings.length - 1) return {};
       
       // Remove block
       siblings.splice(firstIdx, sortedIds.length);
       // Insert block after next sibling
       // Next sibling was at lastIdx + 1. 
       // After removal, next sibling is at firstIdx (since we removed 'length' items, and next was at first + length)
       // So we want to insert AFTER next sibling.
       // Insert at firstIdx + 1.
       siblings.splice(firstIdx + 1, 0, ...sortedIds);
    }
    
    if (parentId) {
      tasks[parentId] = { ...tasks[parentId], children: siblings };
      return { tasks };
    } else {
      return { tasks, rootIds: siblings };
    }
  }),

  addDependency: (fromId, toId) => set((state) => {
    if (fromId === toId) return {};
    
    // Cycle check: fromId depends on toId?
    const checkCycle = (currentId: string, targetId: string, visited: Set<string> = new Set()): boolean => {
      if (currentId === targetId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      
      const task = state.tasks[currentId];
      if (!task || !task.dependencies) return false;
      
      return task.dependencies.some(depId => checkCycle(depId, targetId, visited));
    };
    
    if (checkCycle(fromId, toId)) {
      console.warn('Cycle detected, cannot add dependency');
      return {};
    }

    const tasks = { ...state.tasks };
    const targetTask = tasks[toId];
    if (!targetTask) return {};
    
    // Avoid duplicate
    if (targetTask.dependencies.includes(fromId)) return {};
    
    tasks[toId] = {
      ...targetTask,
      dependencies: [...targetTask.dependencies, fromId]
    };
    
    return { tasks };
  }),

  removeDependency: (fromId, toId) => set((state) => {
    const tasks = { ...state.tasks };
    const targetTask = tasks[toId];
    if (!targetTask) return {};

    tasks[toId] = {
      ...targetTask,
      dependencies: targetTask.dependencies.filter(id => id !== fromId)
    };

    return { tasks };
  }),

  setViewMode: (viewMode) => set((state) => ({
    projectConfig: {
      ...state.projectConfig,
      viewMode,
    },
  })),
}));
