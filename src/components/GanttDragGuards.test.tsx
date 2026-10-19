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

  it('sets a one-day schedule on a single click (no movement) in the timeline area', () => {
    act(() => {
      useTaskStore.getState().setViewMode('Day');
    });
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Click To Schedule',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
    });

    const { container } = render(<GanttChart showNames />);
    // バーが無い余白（行全体のドラッグ面）を対象にする
    const rowArea = container.querySelector('.cursor-crosshair') as HTMLDivElement;
    expect(rowArea).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(rowArea, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    const after = snapshot(rootId);
    // クリックした日 1 日分の日程に確定する
    expect(after.startDate).not.toBe(before.startDate);
    expect(after.startDate).toBe(after.endDate);
    expect(after.duration).toBe(1);
    expect(useTaskStore.getState().dragState).toBeNull();
  });

  it('creates a one-day schedule by a single click on a task that has no dates', () => {
    act(() => {
      useTaskStore.getState().setViewMode('Day');
    });
    const rootId = useTaskStore.getState().rootIds[0];
    let newId = '';
    act(() => {
      useTaskStore.getState().addTask(rootId, 'after');
      newId = useTaskStore.getState().focusedTaskId!;
    });
    expect(useTaskStore.getState().tasks[newId].startDate).toBeNull();

    const { container } = render(<GanttChart showNames />);
    const rowArea = container.querySelector(
      `[data-task-id="${newId}"].cursor-crosshair`
    ) as HTMLDivElement;
    expect(rowArea).not.toBeNull();

    fireEvent.mouseDown(rowArea, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    const after = snapshot(newId);
    expect(after.startDate).toBeTruthy();
    expect(after.startDate).toBe(after.endDate);
    expect(after.duration).toBe(1);
    expect(useTaskStore.getState().dragState).toBeNull();
  });

  it('does not rewrite dates when the schedule bar is clicked (the bar consumes the click)', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Schedule Bar Click',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
    });

    const { container } = render(<GanttChart showNames />);
    const scheduleBar = container.querySelector(
      `[data-task-id="${rootId}"][data-gantt-bar="schedule"]`
    ) as HTMLDivElement;
    expect(scheduleBar).not.toBeNull();

    const before = snapshot(rootId);

    fireEvent.mouseDown(scheduleBar, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);

    // draw-range が発火していないこと（=行のハンドラに伝播していないこと）
    expect(useTaskStore.getState().dragState).toBeNull();
    expect(snapshot(rootId)).toEqual(before);
  });

  it('renders a single movable bar and a non-interactive baseline ghost', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Baseline Ghost',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
      useTaskStore.getState().setBaseline('register');
    });

    const { container } = render(<GanttChart showNames />);

    // 操作可能なバーは現在の日程バー 1 本だけ
    const bars = container.querySelectorAll('[data-gantt-bar]');
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute('data-gantt-bar')).toBe('schedule');

    // 基準計画は非操作のゴーストとして表示される
    const baselineGhost = container.querySelector('[title^="基準計画:"]') as HTMLDivElement;
    expect(baselineGhost).not.toBeNull();
    expect(baselineGhost.className).toContain('pointer-events-none');
  });

  it('still commits a schedule range when the timeline area is actually dragged', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(rootId, {
        title: 'Real Draw Range',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
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
    expect(after.startDate! <= after.endDate!).toBe(true);
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
