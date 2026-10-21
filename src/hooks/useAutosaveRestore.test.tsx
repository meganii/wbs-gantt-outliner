import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useAutosaveRestore } from './useAutosaveRestore';
import { useTaskStore } from '../store/useTaskStore';
import { useSessionStore } from '../store/useSessionStore';
import { useNotificationStore } from '../store/useNotificationStore';
import {
  AUTOSAVE_STORAGE_KEY,
  serializeProject,
  writeAutosave,
} from '../utils/autosave';
import { DEFAULT_PROJECT_CONFIG } from '../utils/projectConfig';
import type { Task } from '../types';

const initialState = useTaskStore.getState();

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parentId: null,
    startDate: null,
    endDate: null,
    duration: 0,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...partial,
  };
}

function storeAutosave(dirty: boolean): void {
  writeAutosave(
    serializeProject({
      tasks: { restored: task({ id: 'restored', title: '復元されたタスク' }) },
      rootIds: ['restored'],
      projectConfig: DEFAULT_PROJECT_CONFIG,
      milestones: [],
    }),
    dirty
  );
}

function Probe() {
  useAutosaveRestore();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  useNotificationStore.setState({ notifications: [] });
  useSessionStore.setState({ dirty: false });
  act(() => {
    useTaskStore.setState(initialState, true);
  });
});

describe('useAutosaveRestore', () => {
  it('restores the autosaved project before the first paint', () => {
    storeAutosave(true);

    render(<Probe />);

    const state = useTaskStore.getState();
    expect(state.rootIds).toEqual(['restored']);
    expect(state.tasks.restored.title).toBe('復元されたタスク');
    expect(useSessionStore.getState().dirty).toBe(true);

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('前回の編集内容を復元しました');
    expect(notifications[0].details).toHaveLength(1);
  });

  it('keeps the saved project clean when the autosave was saved', () => {
    storeAutosave(false);

    render(<Probe />);

    expect(useTaskStore.getState().tasks.restored).toBeDefined();
    expect(useSessionStore.getState().dirty).toBe(false);
    expect(useNotificationStore.getState().notifications[0].details).toBeUndefined();
  });

  it('does nothing when there is no autosave', () => {
    render(<Probe />);

    expect(useTaskStore.getState().tasks[useTaskStore.getState().rootIds[0]].title).toBe(
      'Project Root'
    );
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('discards a corrupt autosave instead of failing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, '{ broken');

    render(<Probe />);

    expect(localStorage.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    warn.mockRestore();
  });

  it('discards an autosave that no longer matches the schema', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 検証を通らない形（tasks 欠落）だが、封筒としては正しい
    localStorage.setItem(
      AUTOSAVE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        dirty: true,
        project: { schemaVersion: 4, rootIds: [] },
      })
    );

    render(<Probe />);

    expect(localStorage.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    warn.mockRestore();
  });
});
