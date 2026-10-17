import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

describe('GanttChart UI Interactions', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('moves task plan dates on plan bar drag (when baseline is unlocked)', () => {
    // 1. System time mock to make dates predictable
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));

    const rootId = useTaskStore.getState().rootIds[0];
    
    // Set explicit plan dates
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Plan Drag Test',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-26',
        planDuration: 2,
      });
    });

    const { container } = render(<GanttChart showNames />);

    // Find the Plan Bar (blue bar)
    const planBar = container.querySelector(`[data-task-id="${rootId}"].bg-blue-100`) as HTMLDivElement;
    expect(planBar).not.toBeNull();

    // 2. Drag the plan bar to the right by 80px (which equals 2 days because cellWidth is 40)
    // Drag start
    fireEvent.mouseDown(planBar, { button: 0, clientX: 200, clientY: 50 });

    // Drag move
    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });

    // Drag end
    fireEvent.mouseUp(window);

    // 3. Verify task dates are shifted by +2 days
    const updatedTask = useTaskStore.getState().tasks[rootId];
    expect(updatedTask.planStartDate).toBe('2026-05-27');
    expect(updatedTask.planEndDate).toBe('2026-05-28');
    expect(updatedTask.planDuration).toBe(2);

    vi.useRealTimers();
  });

  it('resizes task plan duration on right resize handle drag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));

    const rootId = useTaskStore.getState().rootIds[0];
    
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Plan Resize Test',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-26',
        planDuration: 2,
      });
    });

    const { container } = render(<GanttChart showNames />);

    const planBar = container.querySelector(`[data-task-id="${rootId}"].bg-blue-100`) as HTMLDivElement;
    expect(planBar).not.toBeNull();

    // Find the right resize handle (the second cursor-ew-resize element inside the bar)
    const resizers = planBar.querySelectorAll('.cursor-ew-resize');
    const rightResizer = resizers[1] as HTMLDivElement;
    expect(rightResizer).not.toBeNull();

    // Drag the right handle to the right by 40px (+1 day)
    fireEvent.mouseDown(rightResizer, { button: 0, clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 240 });
    fireEvent.mouseUp(window);

    // Verify task endDate is shifted by +1 day, and planDuration becomes 3 (including weekend? No, getWorkDaysCount handles weekends)
    const updatedTask = useTaskStore.getState().tasks[rootId];
    expect(updatedTask.planEndDate).toBe('2026-05-27');
    expect(updatedTask.planDuration).toBe(3);

    vi.useRealTimers();
  });

  it('creates dependency when dragging dependency handle to target task bar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));

    const rootIds = useTaskStore.getState().rootIds;
    const taskAId = rootIds[0];
    
    // Add task B after task A
    let taskBId = '';
    act(() => {
      useTaskStore.getState().addTask(taskAId, 'after');
      const ids = useTaskStore.getState().rootIds;
      taskBId = ids[1];
      
      useTaskStore.getState().updateTask(taskAId, { title: 'Task A', planStartDate: '2026-05-25', planEndDate: '2026-05-26' });
      useTaskStore.getState().updateTask(taskBId, { title: 'Task B', planStartDate: '2026-05-27', planEndDate: '2026-05-28' });
    });

    const { container } = render(<GanttChart showNames />);

    // Get plan bar for A and its dependency connector
    const planBarA = container.querySelector(`[data-task-id="${taskAId}"].bg-blue-100`) as HTMLDivElement;
    const depConnector = planBarA.querySelector('[title="Drag to create dependency"]') as HTMLDivElement;
    expect(depConnector).not.toBeNull();

    // Get plan bar for B
    const planBarB = container.querySelector(`[data-task-id="${taskBId}"].bg-blue-100`) as HTMLDivElement;
    expect(planBarB).not.toBeNull();

    // Start dependency drag
    fireEvent.mouseDown(depConnector, { button: 0, clientX: 300, clientY: 50 });
    
    // Move drag over task B's bar
    fireEvent.mouseMove(window, { clientX: 300, clientY: 82 });

    // Drop on task B
    fireEvent.mouseUp(planBarB);

    // Verify task B has task A as a dependency
    const updatedTaskB = useTaskStore.getState().tasks[taskBId];
    expect(updatedTaskB.dependencies).toContain(taskAId);

    vi.useRealTimers();
  });
});
