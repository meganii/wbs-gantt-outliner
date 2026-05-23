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

    const ipcListeners: Record<string, Function> = {};
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        on: vi.fn((channel, listener) => {
          ipcListeners[channel] = listener;
          return () => {
            delete ipcListeners[channel];
          };
        }),
        trigger: (channel: string, ...args: any[]) => {
          ipcListeners[channel]?.({}, ...args);
        },
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

  it('switches views via Ctrl + 1, 2, 3 keyboard shortcuts', () => {
    render(<App />);

    const wbsBtn = screen.getByRole('button', { name: 'WBS' });
    const integratedBtn = screen.getByRole('button', { name: 'Integrated' });
    const ganttBtn = screen.getByRole('button', { name: 'Gantt' });

    expect(integratedBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');

    // Switch to WBS view (Ctrl + 1)
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(wbsBtn.className).toContain('bg-white');
    expect(integratedBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');

    // Switch to Gantt view (Ctrl + 3)
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    expect(ganttBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(integratedBtn.className).not.toContain('bg-white');

    // Switch back to Integrated view (Ctrl + 2)
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(integratedBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');
  });

  it('switches views via switch-view IPC event', () => {
    render(<App />);

    const wbsBtn = screen.getByRole('button', { name: 'WBS' });
    const integratedBtn = screen.getByRole('button', { name: 'Integrated' });
    const ganttBtn = screen.getByRole('button', { name: 'Gantt' });

    expect(integratedBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');

    // Switch to WBS view (IPC)
    act(() => {
      (window.ipcRenderer as any).trigger('switch-view', 'wbs');
    });
    expect(wbsBtn.className).toContain('bg-white');
    expect(integratedBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');

    // Switch to Gantt view (IPC)
    act(() => {
      (window.ipcRenderer as any).trigger('switch-view', 'gantt');
    });
    expect(ganttBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(integratedBtn.className).not.toContain('bg-white');

    // Switch back to Integrated view (IPC)
    act(() => {
      (window.ipcRenderer as any).trigger('switch-view', 'integrated');
    });
    expect(integratedBtn.className).toContain('bg-white');
    expect(wbsBtn.className).not.toContain('bg-white');
    expect(ganttBtn.className).not.toContain('bg-white');
  });
});
