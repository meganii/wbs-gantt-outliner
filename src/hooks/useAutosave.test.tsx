import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { AUTOSAVE_DELAY_MS, useAutosave } from './useAutosave';
import { useTaskStore } from '../store/useTaskStore';
import { useSessionStore } from '../store/useSessionStore';
import { readAutosave } from '../utils/autosave';

const initialState = useTaskStore.getState();

function Probe() {
  useAutosave();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ dirty: false });
  act(() => {
    useTaskStore.setState(initialState, true);
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave', () => {
  it('writes the project and marks it dirty after the debounce delay', () => {
    render(<Probe />);

    act(() => {
      useTaskStore.setState((state) => ({
        projectConfig: { ...state.projectConfig, viewMode: 'Week' },
      }));
    });

    // デバウンス中はまだ書かない
    expect(readAutosave()).toBeNull();
    expect(useSessionStore.getState().dirty).toBe(true);

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    const envelope = readAutosave();
    expect(envelope?.dirty).toBe(true);
    expect(envelope?.project.projectConfig.viewMode).toBe('Week');
  });

  it('flushes immediately on pagehide (reload / tab close)', () => {
    render(<Probe />);

    act(() => {
      useTaskStore.setState((state) => ({
        projectConfig: { ...state.projectConfig, viewMode: 'Month' },
      }));
    });

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(readAutosave()?.project.projectConfig.viewMode).toBe('Month');
  });

  it('does not write a pristine session (no unsaved changes)', () => {
    render(<Probe />);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(readAutosave()).toBeNull();
  });

  it('ignores changes outside the saved project slices', () => {
    render(<Probe />);

    act(() => {
      useTaskStore.setState({ focusedTaskId: null });
    });

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(readAutosave()).toBeNull();
    expect(useSessionStore.getState().dirty).toBe(false);
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(<Probe />);
    unmount();

    act(() => {
      useTaskStore.setState((state) => ({
        projectConfig: { ...state.projectConfig, viewMode: 'Week' },
      }));
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });

    expect(readAutosave()).toBeNull();
  });
});
