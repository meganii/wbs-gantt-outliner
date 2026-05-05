import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { getTemporalState, useTaskStore } from './store/useTaskStore';

const initialState = useTaskStore.getState();

describe('App collapse controls', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });

    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        on: vi.fn(() => () => {}),
      },
      writable: true,
      configurable: true,
    });
  });

  it('collapses and expands all tasks from header buttons', () => {
    const rootId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);
  });

  it('collapses and expands all tasks from keyboard shortcuts', () => {
    const rootId = useTaskStore.getState().rootIds[0];

    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
    });

    render(<App />);

    fireEvent.keyDown(window, { key: 'ArrowUp', ctrlKey: true, altKey: true });
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(true);

    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true, altKey: true });
    expect(useTaskStore.getState().tasks[rootId].isCollapsed).toBe(false);
  });
});
