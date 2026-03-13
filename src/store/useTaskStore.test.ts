import { describe, it, expect, beforeEach } from 'vitest';
import { getTemporalState, loadProjectState, useTaskStore } from './useTaskStore';
import { act } from '@testing-library/react';

// To properly test the store, we need to interact with it outside of a React component.
// We can grab the initial state to reset the store before each test.
const initialState = useTaskStore.getState();

describe('useTaskStore', () => {

  // Reset store before each test
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  describe('Initial State', () => {
    it('should have a root task', () => {
      const { tasks, rootIds } = useTaskStore.getState();
      expect(rootIds.length).toBe(1);
      const rootTask = tasks[rootIds[0]];
      expect(rootTask.title).toBe('Project Root');
      expect(rootTask.parentId).toBe(null);
    });
  });

  describe('addTask', () => {
    it('should add a new task after a target task', () => {
      const { rootIds } = useTaskStore.getState();
      const targetId = rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(targetId, 'after');
      });

      const { tasks, rootIds: newRootIds } = useTaskStore.getState();
      expect(newRootIds.length).toBe(2);
      const newTaskId = newRootIds[1];
      expect(tasks[newTaskId].parentId).toBe(null);
      expect(tasks[newTaskId].title).toBe('');
    });

    it('should add a new task inside a target task', () => {
      const { rootIds } = useTaskStore.getState();
      const targetId = rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(targetId, 'inside');
      });

      const { tasks } = useTaskStore.getState();
      const parentTask = tasks[targetId];
      expect(parentTask.children.length).toBe(1);
      const newTaskId = parentTask.children[0];
      expect(tasks[newTaskId].parentId).toBe(targetId);
    });
  });

  describe('deleteTask', () => {
    it('should delete a single task', () => {
      const { rootIds } = useTaskStore.getState();
      const targetId = rootIds[0];

      act(() => {
        useTaskStore.getState().deleteTask(targetId);
      });

      const { tasks, rootIds: newRootIds } = useTaskStore.getState();
      expect(newRootIds.length).toBe(0);
      expect(tasks[targetId]).toBeUndefined();
    });

    it('should delete descendants and dependency references together', () => {
      const parentId = useTaskStore.getState().rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(parentId, 'inside');
      });
      const childId = useTaskStore.getState().tasks[parentId].children[0];

      act(() => {
        useTaskStore.getState().addTask(childId, 'inside');
      });
      const grandChildId = useTaskStore.getState().tasks[childId].children[0];

      act(() => {
        useTaskStore.getState().addTask(parentId, 'after');
      });
      const siblingId = useTaskStore.getState().rootIds[1];

      act(() => {
        useTaskStore.getState().addDependency(childId, siblingId);
        useTaskStore.getState().setFocusedTaskId(childId);
        useTaskStore.getState().setSelectedTaskIds([parentId, childId]);
      });

      act(() => {
        useTaskStore.getState().deleteTask(parentId);
      });

      const { tasks, rootIds, focusedTaskId, selectedTaskIds } = useTaskStore.getState();
      expect(tasks[parentId]).toBeUndefined();
      expect(tasks[childId]).toBeUndefined();
      expect(tasks[grandChildId]).toBeUndefined();
      expect(rootIds).toEqual([siblingId]);
      expect(tasks[siblingId].dependencies).toEqual([]);
      expect(focusedTaskId).toBeNull();
      expect(selectedTaskIds).toEqual([]);
    });
  });

  describe('indentTask', () => {
    it('should indent a task, making it a child of its previous sibling', () => {
      // Setup: Add two tasks at the root
      const { rootIds } = useTaskStore.getState();
      const firstTaskId = rootIds[0];
      act(() => {
        useTaskStore.getState().addTask(firstTaskId, 'after');
      });

      const { rootIds: currentRootIds, tasks: currentTasks } = useTaskStore.getState();
      const secondTaskId = currentRootIds[1];
      expect(currentTasks[secondTaskId].parentId).toBe(null);

      // Indent the second task
      act(() => {
        useTaskStore.getState().indentTask(secondTaskId);
      });

      const { tasks, rootIds: newRootIds } = useTaskStore.getState();
      expect(newRootIds.length).toBe(1);
      expect(newRootIds[0]).toBe(firstTaskId);
      expect(tasks[secondTaskId].parentId).toBe(firstTaskId);
      expect(tasks[firstTaskId].children).toContain(secondTaskId);
    });
  });

  describe('outdentTask', () => {
    it('should outdent a task, making it a sibling of its parent', () => {
      // Setup: Add a child task
      const { rootIds } = useTaskStore.getState();
      const parentId = rootIds[0];
      act(() => {
        useTaskStore.getState().addTask(parentId, 'inside');
      });

      const childId = useTaskStore.getState().tasks[parentId].children[0];
      expect(useTaskStore.getState().tasks[childId].parentId).toBe(parentId);

      // Outdent the child task
      act(() => {
        useTaskStore.getState().outdentTask(childId);
      });

      const { tasks, rootIds: newRootIds } = useTaskStore.getState();
      expect(newRootIds.length).toBe(2);
      expect(newRootIds[1]).toBe(childId);
      expect(tasks[childId].parentId).toBe(null);
      expect(tasks[parentId].children.length).toBe(0);
    });
  });

  describe('addDependency', () => {
    it('should add a dependency between two tasks', () => {
      // Setup: Add two tasks
      const { rootIds } = useTaskStore.getState();
      const fromId = rootIds[0];
      act(() => {
        useTaskStore.getState().addTask(fromId, 'after');
      });
      const toId = useTaskStore.getState().rootIds[1];

      // Add dependency
      act(() => {
        useTaskStore.getState().addDependency(fromId, toId);
      });

      const { tasks } = useTaskStore.getState();
      expect(tasks[toId].dependencies).toContain(fromId);
    });

    it('should not add a dependency if it creates a cycle', () => {
      // Setup: Add two tasks with a dependency
      const { rootIds } = useTaskStore.getState();
      const task1Id = rootIds[0];
      act(() => {
        useTaskStore.getState().addTask(task1Id, 'after');
      });
      const task2Id = useTaskStore.getState().rootIds[1];
      act(() => {
        useTaskStore.getState().addDependency(task1Id, task2Id);
      });

      // Try to add a circular dependency
      act(() => {
        useTaskStore.getState().addDependency(task2Id, task1Id);
      });

      const { tasks } = useTaskStore.getState();
      // The dependency should not have been added
      expect(tasks[task1Id].dependencies).not.toContain(task2Id);
    });
  });

  describe('removeDependency', () => {
    it('should remove a dependency between two tasks', () => {
      // Setup: Add two tasks with a dependency
      const { rootIds } = useTaskStore.getState();
      const fromId = rootIds[0];
      act(() => {
        useTaskStore.getState().addTask(fromId, 'after');
      });
      const toId = useTaskStore.getState().rootIds[1];
       act(() => {
        useTaskStore.getState().addDependency(fromId, toId);
      });

      expect(useTaskStore.getState().tasks[toId].dependencies).toContain(fromId);

      // Remove dependency
      act(() => {
        useTaskStore.getState().removeDependency(fromId, toId);
      });

      const { tasks } = useTaskStore.getState();
      expect(tasks[toId].dependencies).not.toContain(fromId);
    });
  });

  describe('updateTask with Date Propagation', () => {
    it('should update a dependent task start date when its predecessor end date changes', () => {
      // Setup: task2 depends on task1
      const { rootIds } = useTaskStore.getState();
      const task1Id = rootIds[0];
      act(() => {
        useTaskStore.getState().updateTask(task1Id, { startDate: '2024-01-01', endDate: '2024-01-01', duration: 1 });
        useTaskStore.getState().addTask(task1Id, 'after');
      });
      const task2Id = useTaskStore.getState().rootIds[1];
      act(() => {
        useTaskStore.getState().updateTask(task2Id, { startDate: '2024-01-02', endDate: '2024-01-02', duration: 1 });
        useTaskStore.getState().addDependency(task1Id, task2Id);
      });

      const { tasks: initialTasks } = useTaskStore.getState();
      expect(initialTasks[task2Id].startDate).toBe('2024-01-02');

      // Action: Update task1's end date
      act(() => {
        useTaskStore.getState().updateTask(task1Id, { endDate: '2024-01-03' }); // 2 work days longer
      });

      const { tasks: updatedTasks } = useTaskStore.getState();
      // task2's start date should be the next workday after task1's new end date
      expect(updatedTasks[task2Id].startDate).toBe('2024-01-04');
    });
  });

  describe('Undo/Redo', () => {
    it('should undo a task addition', () => {
        const { rootIds } = useTaskStore.getState();
        const initialCount = rootIds.length;
        const targetId = rootIds[0];

        act(() => {
            useTaskStore.getState().addTask(targetId, 'after');
        });

        const { rootIds: newRootIds } = useTaskStore.getState();
        expect(newRootIds.length).toBe(initialCount + 1);

        act(() => {
            getTemporalState().undo();
        });

        const { rootIds: finalRootIds } = useTaskStore.getState();
        expect(finalRootIds.length).toBe(initialCount);
    });

    it('should redo a task addition after undo', () => {
        const { rootIds } = useTaskStore.getState();
        const targetId = rootIds[0];

        act(() => {
            useTaskStore.getState().addTask(targetId, 'after');
        });

        act(() => {
            getTemporalState().undo();
        });

        // Back to initial
        expect(useTaskStore.getState().rootIds.length).toBe(1);

        act(() => {
            getTemporalState().redo();
        });

        expect(useTaskStore.getState().rootIds.length).toBe(2);
    });

    it('should undo a task update', () => {
        const { rootIds, tasks } = useTaskStore.getState();
        const taskId = rootIds[0];
        const initialTitle = tasks[taskId].title;

        act(() => {
            useTaskStore.getState().updateTask(taskId, { title: 'Updated Title' });
        });

        expect(useTaskStore.getState().tasks[taskId].title).toBe('Updated Title');

        act(() => {
            getTemporalState().undo();
        });

        expect(useTaskStore.getState().tasks[taskId].title).toBe(initialTitle);
    });

    it('should track history correctly through multiple changes', () => {
        const { rootIds } = useTaskStore.getState();
        const taskId = rootIds[0];

        // Change 1
        act(() => {
            useTaskStore.getState().updateTask(taskId, { title: '1' });
        });
        // Change 2
        act(() => {
            useTaskStore.getState().updateTask(taskId, { title: '2' });
        });

        expect(useTaskStore.getState().tasks[taskId].title).toBe('2');

        // Undo 2 -> 1
        act(() => {
            getTemporalState().undo();
        });
        expect(useTaskStore.getState().tasks[taskId].title).toBe('1');

        // Undo 1 -> Initial
        act(() => {
            getTemporalState().undo();
        });
        expect(useTaskStore.getState().tasks[taskId].title).toBe('Project Root');
    });

    it('should restore focusedTaskId and selectedTaskIds after undo', () => {
        const { rootIds } = useTaskStore.getState();
        const taskId = rootIds[0];

        // 1. Initial state (focused/selected are empty/null)
        expect(useTaskStore.getState().focusedTaskId).toBeNull();
        expect(useTaskStore.getState().selectedTaskIds).toEqual([]);

        // 2. Focus and select a task
        act(() => {
            useTaskStore.getState().setFocusedTaskId(taskId);
            useTaskStore.getState().setSelectedTaskIds([taskId]);
        });

        // 3. Make a change to trigger history record (zundo ignores states with only focus change due to equality check)
        act(() => {
            useTaskStore.getState().updateTask(taskId, { title: 'Focused Change' });
        });

        expect(useTaskStore.getState().focusedTaskId).toBe(taskId);
        expect(useTaskStore.getState().selectedTaskIds).toEqual([taskId]);

        // 4. Clear focus/selection
        act(() => {
            useTaskStore.getState().setFocusedTaskId(null);
            useTaskStore.getState().setSelectedTaskIds([]);
        });

        // 5. Undo to restore title AND focus/selection
        act(() => {
            getTemporalState().undo();
        });

        expect(useTaskStore.getState().tasks[taskId].title).toBe('Project Root');
        expect(useTaskStore.getState().focusedTaskId).toBe(taskId);
        expect(useTaskStore.getState().selectedTaskIds).toEqual([taskId]);
    });

    it('should clear undo history after loading a project', () => {
        const rootTaskId = useTaskStore.getState().rootIds[0];

        act(() => {
            useTaskStore.getState().updateTask(rootTaskId, { title: 'Before Load' });
        });

        expect(getTemporalState().pastStates.length).toBeGreaterThan(0);

        act(() => {
            loadProjectState({
                tasks: {
                    imported: {
                        id: 'imported',
                        parentId: null,
                        title: 'Imported Root',
                        startDate: '2024-02-01',
                        endDate: '2024-02-01',
                        duration: 1,
                        progress: 0,
                        isCollapsed: false,
                        children: [],
                        dependencies: [],
                    },
                },
                rootIds: ['imported'],
            });
        });

        expect(useTaskStore.getState().rootIds).toEqual(['imported']);
        expect(getTemporalState().pastStates).toEqual([]);
        expect(getTemporalState().futureStates).toEqual([]);
    });
  });
});
