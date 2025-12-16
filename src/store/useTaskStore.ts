import { create } from 'zustand';
import type { Task, ProjectConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

interface TaskState {
  tasks: Record<string, Task>;
  rootIds: string[]; // Top-level ordered IDs
  projectConfig: ProjectConfig;
  focusedTaskId: string | null;
  
  // Actions
  setFocusedTaskId: (id: string | null) => void;
  addTask: (targetId: string, position?: 'after' | 'inside') => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleCollapse: (id: string) => void;
  indentTask: (id: string) => void;
  outdentTask: (id: string) => void;
  reorderTask: (activeId: string, overId: string) => void;
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

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {
    [initialTaskId]: initialTask,
  },
  rootIds: [initialTaskId],
  projectConfig: DEFAULT_CONFIG,
  focusedTaskId: null,

  setFocusedTaskId: (id) => set({ focusedTaskId: id }),

  addTask: (targetId, position = 'after') => {
    const newId = uuidv4();
    const newTask: Task = {
      id: newId,
      parentId: null, 
      title: '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      duration: 1,
      progress: 0,
      isCollapsed: false,
      children: [],
      dependencies: [],
    };

    set((state) => {
      const tasks = { ...state.tasks };
      const rootIds = [...state.rootIds];
      
      // Helper to find and remove from current list is complex if not tracking parent
      // But we have parentId in Task.
      
      const targetTask = tasks[targetId];
      
      if (position === 'inside') {
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

  updateTask: (id, updates) => set((state) => ({
    tasks: { ...state.tasks, [id]: { ...state.tasks[id], ...updates } }
  })),

  deleteTask: (id) => set((state) => {
    // Basic delete: remove from parent's children and from tasks map
    // Does NOT recurse yet (orphan cleanup required in robust app)
    const tasks = { ...state.tasks };
    const task = tasks[id];
    if (!task) return {}; // No-op

    // Remove from parent
    if (task.parentId) {
      const parent = tasks[task.parentId];
      if (parent) {
         tasks[task.parentId] = {
           ...parent,
           children: parent.children.filter(childId => childId !== id)
         };
      }
    } else {
      // Remove from rootIds
      return { 
        tasks: (() => { delete tasks[id]; return tasks; })(), 
        rootIds: state.rootIds.filter(rid => rid !== id) 
      };
    }
    
    delete tasks[id];
    return { tasks };
  }),

  indentTask: (id: string) => set((state) => {
    const tasks = { ...state.tasks };
    const task = tasks[id];
    
    // 1. Identify current parent and siblings
    let siblings: string[] = [];
    if (task.parentId) {
      siblings = tasks[task.parentId].children;
    } else {
      siblings = state.rootIds;
    }
    
    const idx = siblings.indexOf(id);
    if (idx <= 0) return {}; // No previous sibling to become child of
    
    // 2. Identify new parent (previous sibling)
    const prevSiblingId = siblings[idx - 1];
    const newParent = tasks[prevSiblingId];
    
    // 3. Remove from current position
    // We need to clone the arrays to trigger updates
    const newSiblings = [...siblings];
    newSiblings.splice(idx, 1);
    
    // 4. Add to new parent's children
    const newParentChildren = [...newParent.children, id];
    
    // 5. Update state
    const updates: Partial<TaskState> = { tasks };
    
    if (task.parentId) {
      tasks[task.parentId] = { ...tasks[task.parentId], children: newSiblings };
    } else {
      updates.rootIds = newSiblings;
    }
    
    tasks[prevSiblingId] = { 
      ...newParent, 
      children: newParentChildren,
      isCollapsed: false // Ensure expanded to show the new child
    };
    
    tasks[id] = { ...task, parentId: prevSiblingId };
    
    return updates;
  }),

  outdentTask: (id: string) => set((state) => {
    const tasks = { ...state.tasks };
    const task = tasks[id];
    
    if (!task.parentId) return {}; // Already root
    
    const currentParent = tasks[task.parentId];
    
    // 1. Remove from current parent
    const currentSiblings = [...currentParent.children];
    const idx = currentSiblings.indexOf(id);
    currentSiblings.splice(idx, 1);
    
    // 2. Identify new context (grandparent)
    let newContextIds: string[];
    let grandParentId: string | null = null;
    
    if (currentParent.parentId) {
      grandParentId = currentParent.parentId;
      newContextIds = [...tasks[grandParentId].children];
    } else {
      newContextIds = [...state.rootIds];
    }
    
    // 3. Insert after current parent
    const parentIdx = newContextIds.indexOf(task.parentId);
    newContextIds.splice(parentIdx + 1, 0, id);
    
    // 4. Update state
    const updates: Partial<TaskState> = { tasks };
    
    tasks[task.parentId] = { ...currentParent, children: currentSiblings };
    tasks[id] = { ...task, parentId: grandParentId };
    
    if (grandParentId) {
      tasks[grandParentId] = { ...tasks[grandParentId], children: newContextIds };
    } else {
      updates.rootIds = newContextIds;
    }
    
    return updates;
  }),

  toggleCollapse: (id) => set((state) => ({
    tasks: { ...state.tasks, [id]: { ...state.tasks[id], isCollapsed: !state.tasks[id].isCollapsed } }
  })),

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
}));
