import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

describe('GanttChart WBS Hierarchy and Shortcuts', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('renders task names, WBS numbers, and hierarchy depth indentation correctly', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    
    // Add child task under root to form a hierarchy
    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
    });

    const tasksState = useTaskStore.getState().tasks;
    const childId = tasksState[rootId].children[0];

    // Set some titles
    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'Parent Task' });
      useTaskStore.getState().updateTask(childId, { title: 'Child Task' });
    });

    const { container } = render(<GanttChart showNames />);

    // Get the sticky task name column cells (skicking the first header cell)
    const allCells = Array.from(container.querySelectorAll('.sticky.left-0'));
    const cells = allCells.slice(1) as HTMLDivElement[];
    expect(cells.length).toBe(2);

    // Parent cell
    const parentCell = cells[0];
    const parentOutlineCell = parentCell.querySelector('.flex.items-center.flex-1.h-full') as HTMLDivElement;
    const parentInput = parentCell.querySelector('input')!;
    expect(parentInput.value).toBe('Parent Task');
    expect(parentCell.textContent).toContain('1');
    expect(parentOutlineCell.style.paddingLeft).toBe('8px'); // depth 0: 0 * 20 + 8 = 8px

    // Child cell
    const childCell = cells[1];
    const childOutlineCell = childCell.querySelector('.flex.items-center.flex-1.h-full') as HTMLDivElement;
    const childInput = childCell.querySelector('input')!;
    expect(childInput.value).toBe('Child Task');
    expect(childCell.textContent).toContain('1.1');
    expect(childOutlineCell.style.paddingLeft).toBe('28px'); // depth 1: 1 * 20 + 8 = 28px
  });

  it('toggles collapse state when clicking the chevron button', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    
    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
    });

    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'Parent Task' });
    });

    const { container } = render(<GanttChart showNames />);

    // Initially, it should be expanded
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);

    // Click the chevron button inside the first task cell
    const allCells = Array.from(container.querySelectorAll('.sticky.left-0'));
    const firstTaskCell = allCells[1];
    expect(firstTaskCell).not.toBeNull();

    const chevronButton = firstTaskCell!.querySelector('.lucide-chevron-down, .lucide-chevron-right')?.closest('button');
    expect(chevronButton).not.toBeNull();

    act(() => {
      fireEvent.click(chevronButton!);
    });

    // It should now be collapsed
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(true);

    act(() => {
      fireEvent.click(chevronButton!);
    });

    // It should be expanded again
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);
  });

  it('selects task on click', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    
    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'Parent Task' });
    });

    const { container } = render(<GanttChart showNames />);

    const allCells = Array.from(container.querySelectorAll('.sticky.left-0'));
    const firstTaskCell = allCells[1];
    expect(firstTaskCell).not.toBeNull();

    act(() => {
      fireEvent.mouseDown(firstTaskCell!);
    });

    expect(useTaskStore.getState().selectedTaskIds).toContain(rootId);
    expect(useTaskStore.getState().focusedTaskId).toBe(rootId);
  });

  it('collapses and expands selected tasks via Alt + ArrowUp/ArrowDown', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    
    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
    });

    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'Parent Task' });
      useTaskStore.getState().setSelectedTaskIds([rootId]);
      useTaskStore.getState().setFocusedTaskId(null);
    });

    render(<GanttChart showNames />);

    // Initially expanded
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);

    // Fire Alt + ArrowUp globally
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true });
    });

    // Should collapse
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(true);

    // Fire Alt + ArrowDown globally
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
    });

    // Should expand
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);
  });

  it('resizes Task Name column on dragging the resizer', () => {
    const { container } = render(<GanttChart showNames />);

    // Get the Task Name header cell (the first sticky left element)
    const headerCell = container.querySelector('.sticky.left-0');
    expect(headerCell).not.toBeNull();
    expect(headerCell?.textContent).toContain('Task Name');

    // Get the resizer div inside the header cell
    const resizer = headerCell!.querySelector('.cursor-col-resize');
    expect(resizer).not.toBeNull();

    // The initial width of taskName is 200 (based on DEFAULT_PROJECT_CONFIG)
    expect(useTaskStore.getState().projectConfig.columnWidths.taskName).toBe(200);

    // Simulate drag start on the resizer
    fireEvent.mouseDown(resizer!, { clientX: 200 });

    // Drag to delta +50px
    fireEvent.mouseMove(document, { clientX: 250 });

    // Verify it updated the store width to 250!
    expect(useTaskStore.getState().projectConfig.columnWidths.taskName).toBe(250);

    // Release mouse
    fireEvent.mouseUp(document);
  });

  it('moves selection up and down with ArrowUp / ArrowDown, and extends selection with Shift', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    
    act(() => {
      useTaskStore.getState().addTask(rootId, 'after');
    });

    const rootIds = useTaskStore.getState().rootIds;
    const secondId = rootIds[1];

    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'First Task' });
      useTaskStore.getState().updateTask(secondId, { title: 'Second Task' });
      useTaskStore.getState().setSelectedTaskIds([rootId]);
      useTaskStore.getState().setFocusedTaskId(rootId);
    });

    render(<GanttChart showNames />);

    // Press ArrowDown to move to the second task
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    });

    // Selection should move to secondId
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId]);
    expect(useTaskStore.getState().focusedTaskId).toBe(secondId);

    // Press ArrowUp to move back to the first task
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    });

    // Selection should move back to rootId
    expect(useTaskStore.getState().selectedTaskIds).toEqual([rootId]);
    expect(useTaskStore.getState().focusedTaskId).toBe(rootId);

    // Press Shift + ArrowDown to extend selection
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', shiftKey: true });
    });

    // Both should be selected
    expect(useTaskStore.getState().selectedTaskIds).toContain(rootId);
    expect(useTaskStore.getState().selectedTaskIds).toContain(secondId);
  });

  it('allows day-level precision when drawing ranges in Week view mode', () => {
    // Mock system time to make date calculations predictable
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));

    // Set viewMode to 'Week'
    act(() => {
      useTaskStore.getState().setViewMode('Week');
    });

    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, { title: 'Test Task' });
    });

    const { container } = render(<GanttChart showNames />);

    // Find the bar area of the task row (the drag surface, which is cursor-crosshair)
    const barArea = container.querySelector('.cursor-crosshair') as HTMLDivElement;
    expect(barArea).not.toBeNull();

    // Mock getBoundingClientRect for the barArea to have a predictable size and position
    barArea.getBoundingClientRect = () => ({
      left: 0,
      right: 9000,
      top: 50,
      bottom: 82,
      width: 9000,
      height: 32,
      x: 0,
      y: 50,
      toJSON: () => {}
    } as DOMRect);

    // We want drag start relative X to be 143px.
    // clientX = left + relativeX = 0 + 143 = 143.
    fireEvent.mouseDown(barArea, { button: 0, clientX: 143, clientY: 66 });

    // Drag to deltaX = 43px.
    // new clientX = 143 + 43 = 186.
    fireEvent.mouseMove(window, { clientX: 186, clientY: 66 });

    // Mouse up to end drag
    fireEvent.mouseUp(window);

    // Verify task is updated with exact day-level precision instead of being rounded to week boundaries!
    const task = useTaskStore.getState().tasks[rootId];
    // New logic: no task dates → fallback to today-centered range
    // today = 2026-05-23, Week mode fallback: start = startOfWeek(addMonths(today, -1)) = startOfWeek(2026-04-23) = 2026-04-20 (Mon)
    // clientX=143, cellWidth=100 → weekIndex=1 → week starting 2026-04-27
    // relativeX=43, daysPerCell=7, pixPerDay=100/7 → dayOffset = floor(43/(100/7)) = floor(3.01) = 3
    // planStartDate = 2026-04-27 + 3days = 2026-04-30 (Thu)
    // planEndDate = 2026-04-30 + 3 more days = 2026-05-03 (Sun), or with drag end at clientX=186:
    //   weekIndex2 = floor(186/100)=1, relX2=86, dayOffset2=floor(86/14.28)=6 → 2026-04-27+6=2026-05-03
    expect(task.planStartDate).toBe('2026-04-30');
    expect(task.planEndDate).toBe('2026-05-03');
    expect(task.planDuration).toBe(2); // Apr 30 (Thu), May 1 (Fri) are work days; May 2 (Sat), May 3 (Sun) are weekends.

    vi.useRealTimers();
  });
});
