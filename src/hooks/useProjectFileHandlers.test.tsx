import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectFileHandlers } from './useProjectFileHandlers';
import { useNotificationStore } from '../store/useNotificationStore';
import { useTaskStore } from '../store/useTaskStore';
import type { Task } from '../types';

const initialState = useTaskStore.getState();

function stubIpc(result: unknown): void {
  const invoke = vi.fn().mockResolvedValue(result);
  window.ipcRenderer = {
    invoke,
    send: vi.fn(),
    on: vi.fn(),
  } as unknown as typeof window.ipcRenderer;
}

function validTask(): Task {
  return {
    id: 'x',
    parentId: null,
    title: 'X',
    startDate: '2026-05-25',
    endDate: '2026-05-25',
    duration: 1,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    planStartDate: '2026-05-25',
    planEndDate: '2026-05-25',
    planDuration: 1,
  };
}

describe('useProjectFileHandlers.handleLoad', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  it('notifies success when a valid project is loaded', async () => {
    stubIpc(JSON.stringify({ tasks: { x: validTask() }, rootIds: ['x'], schemaVersion: 2 }));

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('info');
    expect(useTaskStore.getState().tasks['x'].title).toBe('X');
  });

  it('migrates a legacy project and notifies a warning', async () => {
    stubIpc(
      JSON.stringify({
        tasks: {
          x: {
            ...validTask(),
            progress: 100,
            planStartDate: '2026-05-11',
            planEndDate: '2026-05-11',
            planDuration: 1,
          },
        },
        rootIds: ['x'],
        projectConfig: { baselineLocked: true },
      })
    );

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('warning');

    const task = useTaskStore.getState().tasks['x'];
    // 旧「予定」= 基準計画、旧「実績」= 予定として引き継がれる
    expect(task.baselineStartDate).toBe('2026-05-11');
    expect(task.planStartDate).toBe('2026-05-25');
    expect(task.startDate).toBe('2026-05-25');
    expect(task.endDate).toBe('2026-05-25');
  });

  it('notifies a warning with details when the file is repaired', async () => {
    stubIpc(
      JSON.stringify({
        tasks: { x: { id: 'x', parentId: null, title: 'X' } },
        rootIds: ['x'],
      })
    );

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('warning');
    expect(notifications[0].details?.length ?? 0).toBeGreaterThan(0);
  });

  it('notifies an error when the project cannot be loaded', async () => {
    stubIpc(JSON.stringify({ rootIds: [] })); // tasks 欠落

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
  });

  it('notifies an error when the JSON is malformed', async () => {
    stubIpc('{ not json');

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].level).toBe('error');
  });

  it('does nothing when the open dialog is cancelled', async () => {
    stubIpc(null);

    const { result } = renderHook(() => useProjectFileHandlers());
    await act(async () => {
      await result.current.handleLoad();
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
