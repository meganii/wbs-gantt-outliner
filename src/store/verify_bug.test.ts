import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from './useTaskStore';

describe('Unrelated task movement bug verification', () => {
  beforeEach(() => {
    // Reset store with mock tasks
    useTaskStore.setState({
      tasks: {
        'root': {
          id: 'root',
          parentId: null,
          title: 'Project Root',
          startDate: '2026-06-01',
          endDate: '2026-06-10',
          duration: 8,
          progress: 0,
          status: '',
          isCollapsed: false,
          children: ['task-A', 'task-B'],
          dependencies: [],
          planStartDate: '2026-06-01',
          planEndDate: '2026-06-10',
          planDuration: 8,
        },
        'task-A': {
          id: 'task-A',
          parentId: 'root',
          title: 'Task A',
          startDate: '2026-06-01',
          endDate: '2026-06-03',
          duration: 3,
          progress: 0,
          status: '',
          isCollapsed: false,
          children: [],
          dependencies: [],
          planStartDate: '2026-06-01',
          planEndDate: '2026-06-03',
          planDuration: 3,
        },
        'task-B': {
          id: 'task-B',
          parentId: 'root',
          title: 'Task B',
          startDate: '2026-06-04',
          endDate: '2026-06-06',
          duration: 3,
          progress: 0,
          status: '',
          isCollapsed: false,
          children: [],
          dependencies: [],
          planStartDate: '2026-06-04',
          planEndDate: '2026-06-06',
          planDuration: 3,
        }
      },
      rootIds: ['root'],
      projectConfig: {
        calendar: {
          workDays: [1, 2, 3, 4, 5],
          holidays: [],
        },
        viewMode: 'Day',
        columnWidths: {
          taskName: 150,
          description: 100,
          assignee: 80,
          deliverables: 80,
          status: 80,
          progress: 80,
          planDuration: 60,
          planDate: 120,
          duration: 60,
          date: 120,
        },
        baselineLocked: false,
      },
      selectedTaskIds: [],
      focusedTaskId: null,
    });
  });

  it('should not update Task B when Task A is updated', () => {
    const store = useTaskStore.getState();
    
    // Check initial dates
    expect(store.tasks['task-A'].planStartDate).toBe('2026-06-01');
    expect(store.tasks['task-B'].planStartDate).toBe('2026-06-04');
    expect(store.tasks['root'].planStartDate).toBe('2026-06-01');

    // Update Task A (move it forward by 1 day)
    store.updateTask('task-A', {
      planStartDate: '2026-06-02',
      planEndDate: '2026-06-04',
    });

    const updatedStore = useTaskStore.getState();

    // Task A should be updated
    expect(updatedStore.tasks['task-A'].planStartDate).toBe('2026-06-02');
    expect(updatedStore.tasks['task-A'].planEndDate).toBe('2026-06-04');

    // Task B should NOT be updated
    expect(updatedStore.tasks['task-B'].planStartDate).toBe('2026-06-04');
    expect(updatedStore.tasks['task-B'].planEndDate).toBe('2026-06-06');

    // Parent Root should be recalculated (min planStartDate = 2026-06-02, max planEndDate = 2026-06-06)
    expect(updatedStore.tasks['root'].planStartDate).toBe('2026-06-02');
    expect(updatedStore.tasks['root'].planEndDate).toBe('2026-06-06');
  });

  it('should sync startDate and planStartDate when baselineLocked is false', () => {
    const store = useTaskStore.getState();
    
    // Update Task A (move it forward by 1 day)
    store.updateTask('task-A', {
      planStartDate: '2026-06-02',
      planEndDate: '2026-06-04',
    });

    const updatedStore = useTaskStore.getState();

    // Task A plan and actual dates should be synced
    expect(updatedStore.tasks['task-A'].planStartDate).toBe('2026-06-02');
    expect(updatedStore.tasks['task-A'].startDate).toBe('2026-06-02');

    // Task B should NOT be updated
    expect(updatedStore.tasks['task-B'].planStartDate).toBe('2026-06-04');
    expect(updatedStore.tasks['task-B'].startDate).toBe('2026-06-04');
  });

  it('should NOT sync planStartDate when baselineLocked is true', () => {
    // Set baselineLocked to true
    useTaskStore.setState({
      projectConfig: {
        ...useTaskStore.getState().projectConfig,
        baselineLocked: true,
      }
    });

    const store = useTaskStore.getState();
    
    // Update Task A actual dates
    store.updateTask('task-A', {
      startDate: '2026-06-02',
      endDate: '2026-06-04',
    });

    const updatedStore = useTaskStore.getState();

    // Task A actual dates should change, but plan dates should remain unchanged
    expect(updatedStore.tasks['task-A'].startDate).toBe('2026-06-02');
    expect(updatedStore.tasks['task-A'].planStartDate).toBe('2026-06-01');

    // Task B should NOT be updated at all
    expect(updatedStore.tasks['task-B'].startDate).toBe('2026-06-04');
    expect(updatedStore.tasks['task-B'].planStartDate).toBe('2026-06-04');
  });
});
