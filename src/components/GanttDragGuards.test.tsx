import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { KeyboardSensor, PointerSensor } from '@dnd-kit/core';
import type { PointerSensorOptions } from '@dnd-kit/core';
import { GanttChart } from './GanttChart';
import { useRowSortSensors } from '../hooks/useRowSortSensors';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

const snapshot = (id: string) => {
  const task = useTaskStore.getState().tasks[id];
  return {
    startDate: task.startDate,
    endDate: task.endDate,
    duration: task.duration,
    planStartDate: task.planStartDate,
    planEndDate: task.planEndDate,
    planDuration: task.planDuration,
  };
};

describe('Gantt drag guards', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets a one-day plan on a single click (no movement) in the timeline area', () => {
    act(() => {
      useTaskStore.getState().setViewMode('Day');
    });
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Click To Plan',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-27',
        planDuration: 3,
      });
    });

    const { container } = render(<GanttChart showNames />);
    // 予定バーが無い余白（行全体のドラッグ面）を対象にする
    const rowArea = container.querySelector('.cursor-crosshair') as HTMLDivElement;
    expect(rowArea).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(rowArea, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    const after = snapshot(rootId);
    // クリックした日 1 日分の予定に確定する
    expect(after.planStartDate).not.toBe(before.planStartDate);
    expect(after.planStartDate).toBe(after.planEndDate);
    expect(after.planDuration).toBe(1);
    expect(useTaskStore.getState().dragState).toBeNull();
  });

  it('creates a one-day plan by a single click on a task that has no plan', () => {
    act(() => {
      useTaskStore.getState().setViewMode('Day');
    });
    const rootId = useTaskStore.getState().rootIds[0];
    let newId = '';
    act(() => {
      useTaskStore.getState().addTask(rootId, 'after');
      newId = useTaskStore.getState().focusedTaskId!;
    });
    expect(useTaskStore.getState().tasks[newId].planStartDate).toBeNull();

    const { container } = render(<GanttChart showNames />);
    const rowArea = container.querySelector(
      `[data-task-id="${newId}"].cursor-crosshair`
    ) as HTMLDivElement;
    expect(rowArea).not.toBeNull();

    fireEvent.mouseDown(rowArea, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    const after = snapshot(newId);
    expect(after.planStartDate).toBeTruthy();
    expect(after.planStartDate).toBe(after.planEndDate);
    expect(after.planDuration).toBe(1);
    expect(useTaskStore.getState().dragState).toBeNull();
  });

  it('does not rewrite dates when the plan bar is clicked while the baseline is locked', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Locked Plan Bar',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-27',
        planDuration: 3,
      });
      useTaskStore.getState().setBaselineLocked(true);
    });

    const { container } = render(<GanttChart showNames />);
    const planBar = container.querySelector(
      `[data-task-id="${rootId}"].bg-blue-100`
    ) as HTMLDivElement;
    expect(planBar).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(planBar, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    // draw-range が発火していないこと（=行のハンドラに伝播していないこと）
    expect(useTaskStore.getState().dragState).toBeNull();
    expect(snapshot(rootId)).toEqual(before);
  });

  it('does not rewrite dates when the actual bar is clicked while the baseline is locked', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Locked Actual Bar',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-27',
        planDuration: 3,
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
      useTaskStore.getState().setBaselineLocked(true);
    });

    const { container } = render(<GanttChart showNames />);
    const actualBar = container.querySelector('[title^="Actual:"]') as HTMLDivElement;
    expect(actualBar).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(actualBar, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    expect(snapshot(rootId)).toEqual(before);
  });

  it('still commits a plan range when the timeline area is actually dragged', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Real Draw Range',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-27',
        planDuration: 3,
      });
    });

    const { container } = render(<GanttChart showNames />);
    const rowArea = container.querySelector('.cursor-crosshair') as HTMLDivElement;
    expect(rowArea).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(rowArea, { button: 0, clientX: 200, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 320, clientY: 50 });
    fireEvent.mouseUp(window);

    const after = snapshot(rootId);
    expect(after).not.toEqual(before);
    // 開始 <= 終了 になること
    expect(after.planStartDate! <= after.planEndDate!).toBe(true);
    expect(useTaskStore.getState().dragState).toBeNull();
  });
});

describe('row sort sensors', () => {
  it('enables only PointerSensor with a drag threshold (KeyboardSensor must stay disabled)', () => {
    const { result } = renderHook(() => useRowSortSensors());
    const sensors = result.current;

    expect(sensors).toHaveLength(1);
    expect(sensors[0].sensor).toBe(PointerSensor);
    expect(sensors.some((sensor) => sensor.sensor === KeyboardSensor)).toBe(false);
    expect(
      (sensors[0].options as PointerSensorOptions).activationConstraint
    ).toEqual({ distance: 5 });
  });
});
