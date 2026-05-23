import { describe, it, expect, beforeEach } from 'vitest';
import { getTemporalState, loadProjectState, useTaskStore } from './useTaskStore';
import { act } from '@testing-library/react';
import type { ProjectConfig } from '../types';
import { propagateDependencyDates } from './taskStoreUtils';

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

    it('should initialize the default work calendar', () => {
      const { projectConfig } = useTaskStore.getState();
      expect(projectConfig.calendar.workDays).toEqual([1, 2, 3, 4, 5]);
      expect(projectConfig.calendar.holidays).toEqual([]);
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

  describe('setAllCollapsed', () => {
    it('should collapse and expand every task that has children', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const childId = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(childId, 'inside');
      });

      act(() => {
        useTaskStore.getState().setAllCollapsed(true);
      });

      let { tasks } = useTaskStore.getState();
      expect(tasks[rootId].isCollapsed).toBe(true);
      expect(tasks[childId].isCollapsed).toBe(true);

      act(() => {
        useTaskStore.getState().setAllCollapsed(false);
      });

      tasks = useTaskStore.getState().tasks;
      expect(tasks[rootId].isCollapsed).toBe(false);
      expect(tasks[childId].isCollapsed).toBe(false);
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

    it('should copy parent schedule dates (Plan and Actual) to child task if child has no dates and parent has them', () => {
      const { rootIds } = useTaskStore.getState();
      const firstTaskId = rootIds[0]; // will be parent
      act(() => {
        useTaskStore.getState().updateTask(firstTaskId, {
          planStartDate: '2026-05-11',
          planEndDate: '2026-05-13',
          planDuration: 3,
          startDate: '2026-05-11',
          endDate: '2026-05-13',
          duration: 3,
        });
        useTaskStore.getState().addTask(firstTaskId, 'after'); // second task (child)
      });

      const secondTaskId = useTaskStore.getState().rootIds[1];

      // Verify child initially has no dates
      const childInitial = useTaskStore.getState().tasks[secondTaskId];
      expect(childInitial.planStartDate).toBeNull();
      expect(childInitial.startDate).toBeNull();

      // Indent child under parent
      act(() => {
        useTaskStore.getState().indentTask(secondTaskId);
      });

      const { tasks } = useTaskStore.getState();
      const parentTask = tasks[firstTaskId];
      const childTask = tasks[secondTaskId];

      // Child should have inherited parent's dates
      expect(childTask.planStartDate).toBe('2026-05-11');
      expect(childTask.planEndDate).toBe('2026-05-13');
      expect(childTask.planDuration).toBe(3);
      expect(childTask.startDate).toBe('2026-05-11');
      expect(childTask.endDate).toBe('2026-05-13');
      expect(childTask.duration).toBe(3);

      // Parent's dates should remain unchanged
      expect(parentTask.planStartDate).toBe('2026-05-11');
      expect(parentTask.planEndDate).toBe('2026-05-13');
      expect(parentTask.planDuration).toBe(3);
      expect(parentTask.startDate).toBe('2026-05-11');
      expect(parentTask.endDate).toBe('2026-05-13');
      expect(parentTask.duration).toBe(3);
    });

    it('should NOT copy dates if child task already has dates set, and should recalculate parent dates based on child (existing behavior)', () => {
      const { rootIds } = useTaskStore.getState();
      const firstTaskId = rootIds[0];
      act(() => {
        useTaskStore.getState().updateTask(firstTaskId, {
          planStartDate: '2026-05-10',
          planEndDate: '2026-05-12',
          planDuration: 3,
        });
        useTaskStore.getState().addTask(firstTaskId, 'after');
      });

      const secondTaskId = useTaskStore.getState().rootIds[1];

      // Give child its own dates
      act(() => {
        useTaskStore.getState().updateTask(secondTaskId, {
          planStartDate: '2026-05-15',
          planEndDate: '2026-05-16',
          planDuration: 2,
        });
      });

      // Indent child under parent
      act(() => {
        useTaskStore.getState().indentTask(secondTaskId);
      });

      const { tasks } = useTaskStore.getState();
      const parentTask = tasks[firstTaskId];
      const childTask = tasks[secondTaskId];

      // Child task should keep its own dates
      expect(childTask.planStartDate).toBe('2026-05-15');
      expect(childTask.planEndDate).toBe('2026-05-16');

      // Parent task should recalculate based on child
      expect(parentTask.planStartDate).toBe('2026-05-15');
      expect(parentTask.planEndDate).toBe('2026-05-16');
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

  describe('setCalendarHolidays', () => {
    it('should sort, de-duplicate, and ignore invalid holidays', () => {
      act(() => {
        useTaskStore.getState().setCalendarHolidays([
          '2026-05-03',
          'invalid-date',
          '2026-01-01',
          '2026-05-03',
        ]);
      });

      const { projectConfig } = useTaskStore.getState();
      expect(projectConfig.calendar.holidays).toEqual(['2026-01-01', '2026-05-03']);
    });
  });

  describe('updateTask with Date Propagation', () => {
    it('should update a dependent task plan start date when its predecessor plan end date changes', () => {
      // Setup: task2 depends on task1
      const { rootIds } = useTaskStore.getState();
      const task1Id = rootIds[0];
      act(() => {
        useTaskStore.getState().updateTask(task1Id, { planStartDate: '2024-01-01', planEndDate: '2024-01-01', planDuration: 1 });
        useTaskStore.getState().addTask(task1Id, 'after');
      });
      const task2Id = useTaskStore.getState().rootIds[1];
      act(() => {
        useTaskStore.getState().updateTask(task2Id, { planStartDate: '2024-01-02', planEndDate: '2024-01-02', planDuration: 1 });
        useTaskStore.getState().addDependency(task1Id, task2Id);
      });

      const { tasks: initialTasks } = useTaskStore.getState();
      expect(initialTasks[task2Id].planStartDate).toBe('2024-01-02');

      // Action: Update task1's plan end date
      act(() => {
        useTaskStore.getState().updateTask(task1Id, { planEndDate: '2024-01-03' }); // 2 work days longer
      });

      const { tasks: updatedTasks } = useTaskStore.getState();
      // task2's plan start date should be the next workday after task1's new plan end date
      expect(updatedTasks[task2Id].planStartDate).toBe('2024-01-04');
      // Actual dates should remain null
      expect(updatedTasks[task2Id].startDate).toBeNull();
    });
  });

  describe('Parent Date Propagation', () => {
    it('should propagate min startDate and max endDate to parent task when a child task\'s dates are set', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Add a child task inside the root
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      // Set child 1 dates
      act(() => {
        useTaskStore.getState().updateTask(child1Id, {
          startDate: '2024-01-05',
          endDate: '2024-01-10',
          duration: 4,
        });
      });

      const { tasks } = useTaskStore.getState();
      expect(tasks[rootId].startDate).toBe('2024-01-05');
      expect(tasks[rootId].endDate).toBe('2024-01-10');
    });

    it('should update parent task startDate when child 2 is set with an earlier startDate', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(child1Id, 'after');
      });
      const child2Id = useTaskStore.getState().tasks[rootId].children[1];

      act(() => {
        useTaskStore.getState().updateTask(child1Id, {
          startDate: '2024-01-05',
          endDate: '2024-01-10',
          duration: 4,
        });
        useTaskStore.getState().updateTask(child2Id, {
          startDate: '2024-01-02',
          endDate: '2024-01-04',
          duration: 3,
        });
      });

      const { tasks } = useTaskStore.getState();
      // Parent startDate should be min of both child start dates (2024-01-02)
      expect(tasks[rootId].startDate).toBe('2024-01-02');
      // Parent endDate should be max of both child end dates (2024-01-10)
      expect(tasks[rootId].endDate).toBe('2024-01-10');
    });

    it('should recalculate parent dates when a child task is deleted', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(child1Id, 'after');
      });
      const child2Id = useTaskStore.getState().tasks[rootId].children[1];

      act(() => {
        useTaskStore.getState().updateTask(child1Id, {
          startDate: '2024-01-05',
          endDate: '2024-01-10',
          duration: 4,
        });
        useTaskStore.getState().updateTask(child2Id, {
          startDate: '2024-01-02',
          endDate: '2024-01-04',
          duration: 3,
        });
      });

      // Assert parent has dates from both
      expect(useTaskStore.getState().tasks[rootId].startDate).toBe('2024-01-02');

      // Delete the child task with the earlier start date
      act(() => {
        useTaskStore.getState().deleteTask(child2Id);
      });

      const { tasks } = useTaskStore.getState();
      // Parent startDate should revert to child 1's startDate (2024-01-05)
      expect(tasks[rootId].startDate).toBe('2024-01-05');
      expect(tasks[rootId].endDate).toBe('2024-01-10');
    });
  });

  describe('Hierarchical Dependency Cleanup', () => {
    it('should automatically clear dependency between child1 and child2 when child2 is indented under child1', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Add Child 1 and Child 2 as siblings
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(child1Id, 'after');
      });
      const child2Id = useTaskStore.getState().tasks[rootId].children[1];

      // Setup dependency: child2 depends on child1
      act(() => {
        useTaskStore.getState().addDependency(child1Id, child2Id);
      });

      // Verify initial dependency exists
      expect(useTaskStore.getState().tasks[child2Id].dependencies).toContain(child1Id);

      // Indent child 2 so it becomes a child of child 1
      act(() => {
        useTaskStore.getState().indentTask(child2Id);
      });

      // Verify the dependency has been automatically cleared
      const { tasks } = useTaskStore.getState();
      expect(tasks[child2Id].parentId).toBe(child1Id);
      expect(tasks[child2Id].dependencies).not.toContain(child1Id);
    });

    it('should restore cleared dependency and reset hierarchy when undoing the indent', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Add Child 1 and Child 2 as siblings
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(child1Id, 'after');
      });
      const child2Id = useTaskStore.getState().tasks[rootId].children[1];

      // Setup dependency
      act(() => {
        useTaskStore.getState().addDependency(child1Id, child2Id);
      });

      // Indent child 2
      act(() => {
        useTaskStore.getState().indentTask(child2Id);
      });

      expect(useTaskStore.getState().tasks[child2Id].dependencies).not.toContain(child1Id);

      // Undo the indent
      act(() => {
        getTemporalState().undo();
      });

      const { tasks } = useTaskStore.getState();
      // Verify child 2 is sibling again
      expect(tasks[child2Id].parentId).toBe(rootId);
      // Verify dependency is restored
      expect(tasks[child2Id].dependencies).toContain(child1Id);
    });

    it('should block manual addition of dependency involving any parent tasks', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Add Child 1 inside root to make it a parent task
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });

      // Add another root task sibling
      act(() => {
        useTaskStore.getState().addTask(rootId, 'after');
      });
      const siblingId = useTaskStore.getState().rootIds[1];

      // Attempt to add a dependency from siblingId (child task) to rootId (parent task)
      act(() => {
        useTaskStore.getState().addDependency(siblingId, rootId);
      });

      // Verify dependency is NOT added (blocked because rootId has children)
      expect(useTaskStore.getState().tasks[rootId].dependencies).not.toContain(siblingId);

      // Attempt reverse direction (rootId to siblingId)
      act(() => {
        useTaskStore.getState().addDependency(rootId, siblingId);
      });

      // Verify dependency is NOT added (blocked because rootId has children)
      expect(useTaskStore.getState().tasks[siblingId].dependencies).not.toContain(rootId);
    });
  });

  describe('loadProjectState', () => {
    it('should merge missing project config fields with defaults', () => {
      act(() => {
        loadProjectState({
          tasks: useTaskStore.getState().tasks,
          rootIds: useTaskStore.getState().rootIds,
          projectConfig: {
            calendar: {
              workDays: [1, 2, 3, 4, 5],
            } as ProjectConfig['calendar'],
            viewMode: 'Week',
            columnWidths: {
              taskDescription: 320,
            } as ProjectConfig['columnWidths'],
          },
        });
      });

      const { projectConfig } = useTaskStore.getState();
      expect(projectConfig.viewMode).toBe('Week');
      expect(projectConfig.calendar.holidays).toEqual([]);
      expect(projectConfig.columnWidths.taskDescription).toBe(320);
      expect(projectConfig.columnWidths.date).toBe(224);
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

  describe('Parent Task Date Propagation through Dependencies', () => {
    it('should shift all children tasks together with parent when parent task shifts due to a dependency', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Setup task hierarchy:
      // Parent B (child of Root) -> Child B1, Child B2
      // Predecessor A (sibling of Parent B)
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside'); // Child under root (Parent B)
      });
      const parentBId = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(parentBId, 'inside'); // Child B1
      });
      const childB1Id = useTaskStore.getState().tasks[parentBId].children[0];

      act(() => {
        useTaskStore.getState().addTask(childB1Id, 'after'); // Child B2
      });
      const childB2Id = useTaskStore.getState().tasks[parentBId].children[1];

      // Add Predecessor A
      act(() => {
        useTaskStore.getState().addTask(parentBId, 'after');
      });
      const predAId = useTaskStore.getState().tasks[rootId].children[1];

      // Set initial dates (both plan and actual)
      act(() => {
        useTaskStore.getState().updateTask(predAId, {
          planStartDate: '2026-05-11',
          planEndDate: '2026-05-13',
          planDuration: 3,
          startDate: '2026-05-11', // Monday
          endDate: '2026-05-13',   // Wednesday (3 days duration)
          duration: 3,
        });

        useTaskStore.getState().updateTask(childB1Id, {
          planStartDate: '2026-05-11',
          planEndDate: '2026-05-12',
          planDuration: 2,
          startDate: '2026-05-11',
          endDate: '2026-05-12',
          duration: 2,
        });

        useTaskStore.getState().updateTask(childB2Id, {
          planStartDate: '2026-05-13',
          planEndDate: '2026-05-15',
          planDuration: 3,
          startDate: '2026-05-13',
          endDate: '2026-05-15',
          duration: 3,
        });
      });

      // Verify parent dates are correctly computed initially
      let state = useTaskStore.getState();
      expect(state.tasks[parentBId].planStartDate).toBe('2026-05-11');
      expect(state.tasks[parentBId].planEndDate).toBe('2026-05-15');
      expect(state.tasks[parentBId].startDate).toBe('2026-05-11');
      expect(state.tasks[parentBId].endDate).toBe('2026-05-15');

      // Setup the dependency manually in the tasks state to bypass addDependency block for parent task
      act(() => {
        const state = useTaskStore.getState();
        const tasks = { ...state.tasks };
        tasks[parentBId] = {
          ...tasks[parentBId],
          dependencies: [predAId],
        };
        useTaskStore.setState({ tasks });
      });

      // Now trigger propagateDependencyDates manually to test the engine
      act(() => {
        const state = useTaskStore.getState();
        const updatedTasks = propagateDependencyDates(state.tasks, predAId, state.projectConfig.calendar);
        useTaskStore.setState({ tasks: updatedTasks });
      });

      state = useTaskStore.getState();
      // Predecessor A should not move
      expect(state.tasks[predAId].planEndDate).toBe('2026-05-13');

      // Parent B's plan start date must be pushed to 2026-05-14 (Thursday)
      expect(state.tasks[parentBId].planStartDate).toBe('2026-05-14');
      // Parent B's actual start date must remain 2026-05-11 (decoupled)
      expect(state.tasks[parentBId].startDate).toBe('2026-05-11');

      // Child B1 (plan was starting 2026-05-11 Monday, offset 0 work days) -> plan should now start 2026-05-14 Thursday
      expect(state.tasks[childB1Id].planStartDate).toBe('2026-05-14');
      expect(state.tasks[childB1Id].planEndDate).toBe('2026-05-15'); // 2 work days duration (Thu, Fri)
      // Child B1's actual dates must remain unchanged
      expect(state.tasks[childB1Id].startDate).toBe('2026-05-11');

      // Child B2 (plan was starting 2026-05-13 Wednesday, offset 2 work days: Tue, Wed) -> plan should now start 2026-05-18 Monday (skip Sat, Sun)
      expect(state.tasks[childB2Id].planStartDate).toBe('2026-05-18');
      expect(state.tasks[childB2Id].planEndDate).toBe('2026-05-20');
      // Child B2's actual dates must remain unchanged
      expect(state.tasks[childB2Id].startDate).toBe('2026-05-13');

      // Parent B's overall plan end date should be 2026-05-20 (max of children's plan end dates)
      expect(state.tasks[parentBId].planEndDate).toBe('2026-05-20');
      // Parent B's actual end date should remain 2026-05-15
      expect(state.tasks[parentBId].endDate).toBe('2026-05-15');
    });
  });

  describe('Baseline Plan and Actual Date Synchronization & Locking', () => {
    it('should NOT synchronize plan and actual dates when baseline is not locked', () => {
      const { rootIds } = useTaskStore.getState();
      const taskId = rootIds[0];

      // 1. Update actual date, plan date should remain null/unchanged
      act(() => {
        useTaskStore.getState().updateTask(taskId, {
          startDate: '2026-05-25',
          endDate: '2026-05-27',
          duration: 3,
        });
      });

      let task = useTaskStore.getState().tasks[taskId];
      expect(task.startDate).toBe('2026-05-25');
      expect(task.planStartDate).toBe('2026-05-23'); // Project root's default initial planStartDate
      expect(task.planEndDate).toBe('2026-05-23');

      // 2. Update plan date, actual date should remain unchanged
      act(() => {
        useTaskStore.getState().updateTask(taskId, {
          planStartDate: '2026-06-01',
          planEndDate: '2026-06-05',
          planDuration: 5,
        });
      });

      task = useTaskStore.getState().tasks[taskId];
      expect(task.planStartDate).toBe('2026-06-01');
      expect(task.startDate).toBe('2026-05-25'); // Unchanged
    });

    it('should ignore plan updates and only modify actual dates when baseline is locked', () => {
      const { rootIds } = useTaskStore.getState();
      const taskId = rootIds[0];

      // 1. Establish initial stable dates
      act(() => {
        useTaskStore.getState().setBaselineLocked(false);
        useTaskStore.getState().updateTask(taskId, {
          planStartDate: '2026-05-25',
          planEndDate: '2026-05-27',
          planDuration: 3,
        });
        useTaskStore.getState().setBaselineLocked(true);
      });

      // 2. Update actual date, plan should remain locked
      act(() => {
        useTaskStore.getState().updateTask(taskId, {
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          duration: 3,
        });
      });

      let task = useTaskStore.getState().tasks[taskId];
      expect(task.startDate).toBe('2026-06-01');
      expect(task.planStartDate).toBe('2026-05-25'); // Unchanged

      // 3. Attempt updating plan date, it should be ignored
      act(() => {
        useTaskStore.getState().updateTask(taskId, {
          planStartDate: '2026-06-10',
          planEndDate: '2026-06-12',
          planDuration: 3,
        });
      });

      task = useTaskStore.getState().tasks[taskId];
      expect(task.planStartDate).toBe('2026-05-25'); // Unchanged (updates blocked)
    });

    it('should calculate plan dates for parent tasks separately', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // 1. Add child task
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const childId = useTaskStore.getState().tasks[rootId].children[0];

      // 2. Lock baseline and shift child actual date
      act(() => {
        useTaskStore.getState().setBaselineLocked(false);
        useTaskStore.getState().updateTask(childId, {
          planStartDate: '2026-05-25',
          planEndDate: '2026-05-27',
          planDuration: 3,
          startDate: '2026-05-25',
          endDate: '2026-05-27',
          duration: 3,
        });
        useTaskStore.getState().setBaselineLocked(true);
      });

      // Parent plan and actual should match initially
      let parent = useTaskStore.getState().tasks[rootId];
      expect(parent.startDate).toBe('2026-05-25');
      expect(parent.planStartDate).toBe('2026-05-25');

      // 3. Move child actual date (plan stays same)
      act(() => {
        useTaskStore.getState().updateTask(childId, {
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          duration: 3,
        });
      });

      parent = useTaskStore.getState().tasks[rootId];
      expect(parent.startDate).toBe('2026-06-01');
      expect(parent.planStartDate).toBe('2026-05-25'); // Separately calculated from child plan date
    });

    it('should propagate dependency changes to plan dates when baseline is not locked', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Create two sibling tasks
      act(() => {
        useTaskStore.getState().addTask(rootId, 'after');
      });
      const siblingId = useTaskStore.getState().rootIds[1];

      // Set initial plan dates and actual dates
      act(() => {
        useTaskStore.getState().setBaselineLocked(false);
        useTaskStore.getState().updateTask(rootId, {
          planStartDate: '2026-05-25',
          planEndDate: '2026-05-25',
          planDuration: 1,
          startDate: '2026-05-25',
          endDate: '2026-05-25',
          duration: 1,
        });
        useTaskStore.getState().updateTask(siblingId, {
          planStartDate: '2026-05-26',
          planEndDate: '2026-05-26',
          planDuration: 1,
          startDate: '2026-05-26',
          endDate: '2026-05-26',
          duration: 1,
        });
      });

      // Add dependency: sibling depends on root
      act(() => {
        useTaskStore.getState().addDependency(rootId, siblingId);
      });

      // Shift predecessor (root) plan date
      act(() => {
        useTaskStore.getState().updateTask(rootId, {
          planStartDate: '2026-06-01',
          planEndDate: '2026-06-01',
          planDuration: 1,
        });
      });

      // Sibling plan date should shift, but actual date must remain unchanged (2026-05-26)
      const sibling = useTaskStore.getState().tasks[siblingId];
      expect(sibling.planStartDate).toBe('2026-06-02');
      expect(sibling.startDate).toBe('2026-05-26'); // Unchanged
    });

    it('should NOT propagate dependency changes to actual dates when baseline is locked', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Create two sibling tasks
      act(() => {
        useTaskStore.getState().addTask(rootId, 'after');
      });
      const siblingId = useTaskStore.getState().rootIds[1];

      // Set initial dates
      act(() => {
        useTaskStore.getState().setBaselineLocked(false);
        useTaskStore.getState().updateTask(rootId, {
          planStartDate: '2026-05-25',
          planEndDate: '2026-05-25',
          planDuration: 1,
          startDate: '2026-05-25',
          endDate: '2026-05-25',
          duration: 1,
        });
        useTaskStore.getState().updateTask(siblingId, {
          planStartDate: '2026-05-26',
          planEndDate: '2026-05-26',
          planDuration: 1,
          startDate: '2026-05-26',
          endDate: '2026-05-26',
          duration: 1,
        });
      });

      // Add dependency: sibling depends on root
      act(() => {
        useTaskStore.getState().addDependency(rootId, siblingId);
      });

      // Lock baseline
      act(() => {
        useTaskStore.getState().setBaselineLocked(true);
      });

      // Shift predecessor actual date (root)
      act(() => {
        useTaskStore.getState().updateTask(rootId, {
          startDate: '2026-06-01',
          endDate: '2026-06-01',
          duration: 1,
        });
      });

      // Sibling actual dates should NOT shift because dependencies do not apply to actual dates
      const sibling = useTaskStore.getState().tasks[siblingId];
      expect(sibling.startDate).toBe('2026-05-26'); // Unchanged
      expect(sibling.planStartDate).toBe('2026-05-26'); // Unchanged plan date
    });
  });

  describe('Parent Task Progress and Status Propagation', () => {
    it('should recursively calculate parent progress and status based on child tasks progress', () => {
      const rootId = useTaskStore.getState().rootIds[0];

      // Add two children to root
      act(() => {
        useTaskStore.getState().addTask(rootId, 'inside');
      });
      const child1Id = useTaskStore.getState().tasks[rootId].children[0];

      act(() => {
        useTaskStore.getState().addTask(child1Id, 'after');
      });
      const child2Id = useTaskStore.getState().tasks[rootId].children[1];

      // Set child 1 dates and duration
      act(() => {
        useTaskStore.getState().updateTask(child1Id, {
          startDate: '2026-05-11',
          endDate: '2026-05-11', // 1 day
          duration: 1,
          progress: 0,
        });
      });

      // Set child 2 dates and duration
      act(() => {
        useTaskStore.getState().updateTask(child2Id, {
          startDate: '2026-05-11',
          endDate: '2026-05-13', // 3 days
          duration: 3,
          progress: 0,
        });
      });

      // Initially progress should be 0, status '未着手'
      let root = useTaskStore.getState().tasks[rootId];
      expect(root.progress).toBe(0);
      expect(root.status).toBe('未着手');

      // Update child 1 progress to 100%
      act(() => {
        useTaskStore.getState().updateTask(child1Id, { progress: 100 });
      });

      // Parent progress: (100 * 1 + 0 * 3) / (1 + 3) = 25%
      root = useTaskStore.getState().tasks[rootId];
      expect(root.progress).toBe(25);
      expect(root.status).toBe('進行中');

      // Update child 2 progress to 100%
      act(() => {
        useTaskStore.getState().updateTask(child2Id, { progress: 100 });
      });

      // Parent progress: 100%
      root = useTaskStore.getState().tasks[rootId];
      expect(root.progress).toBe(100);
      expect(root.status).toBe('完了');
    });
  });
});

