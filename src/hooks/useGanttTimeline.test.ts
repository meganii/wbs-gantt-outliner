import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isSameDay, parseISO } from 'date-fns';
import { useGanttTimeline } from './useGanttTimeline';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import type { Task } from '../types';
import type { FlattenedItem } from '../utils/tree';

const initialState = useTaskStore.getState();

function task(): Task {
  return {
    id: 'x',
    parentId: null,
    title: 'X',
    startDate: '2026-05-23',
    endDate: '2026-05-23',
    duration: 1,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
  };
}

describe('useGanttTimeline milestones', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('extends the timeline range to include milestone dates', () => {
    const root = task();
    act(() => {
      useTaskStore.setState({
        ...useTaskStore.getState(),
        tasks: { x: root },
        rootIds: ['x'],
        projectConfig: {
          ...useTaskStore.getState().projectConfig,
          viewMode: 'Day',
        },
        milestones: [],
      });
    });

    const items: FlattenedItem[] = [
      { id: 'x', depth: 0, task: root, wbsNumber: '1' },
    ];

    const { result } = renderHook(() => useGanttTimeline(items));

    expect(
      result.current.timeRange.some((date) => isSameDay(date, parseISO('2026-12-31')))
    ).toBe(false);

    act(() => {
      useTaskStore.getState().addMilestone({
        title: '年末チェック',
        date: '2026-12-31',
      });
    });

    expect(result.current.timeRange.length).toBeGreaterThan(0);
    expect(
      result.current.timeRange.some((date) => isSameDay(date, parseISO('2026-12-31')))
    ).toBe(true);
  });
});
