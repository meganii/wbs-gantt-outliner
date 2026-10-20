import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import type { Task } from '../types';

const initialState = useTaskStore.getState();

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    parentId: null,
    title: id,
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    duration: 2,
    progress: 0,
    status: '未着手',
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...overrides,
  };
}

function renderChart(selectedTaskIds: string[] = []) {
  act(() => {
    useTaskStore.setState({
      tasks: {
        a: makeTask('a'),
        b: makeTask('b', { startDate: '2026-06-03', endDate: '2026-06-04' }),
      },
      rootIds: ['a', 'b'],
      selectedTaskIds,
      focusedTaskId: selectedTaskIds[selectedTaskIds.length - 1] ?? null,
      dragState: null,
      mousePos: null,
    });
    getTemporalState().clear();
  });

  return render(<GanttChart showNames />);
}

const findBar = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-task-id="${id}"][data-gantt-bar="schedule"]`) as HTMLDivElement;

describe('Gantt multi move', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  it('previews all selected bars with the same delta and moves them on drop', () => {
    const { container } = renderChart(['a', 'b']);
    const barA = findBar(container, 'a');
    const barB = findBar(container, 'b');
    const leftA = parseFloat(barA.style.left);
    const leftB = parseFloat(barB.style.left);

    fireEvent.mouseDown(barA, { button: 0, clientX: 200, clientY: 50 });
    // 選択済みバーのドラッグは選択を維持したまま一括移動になる
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a', 'b']);
    expect(useTaskStore.getState().dragState?.affectedTaskIds).toEqual(['a', 'b']);

    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });

    // 40px/日なので +2 日 = +80px。両方のバーが同じだけ動く。
    expect(parseFloat(findBar(container, 'a').style.left)).toBe(leftA + 80);
    expect(parseFloat(findBar(container, 'b').style.left)).toBe(leftB + 80);
    expect(container.querySelector('[data-gantt-delta-badge]')?.textContent).toBe('+2日');

    fireEvent.mouseUp(window);

    expect(useTaskStore.getState().tasks.a.startDate).toBe('2026-06-03');
    expect(useTaskStore.getState().tasks.b.startDate).toBe('2026-06-05');
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a', 'b']);
    expect(getTemporalState().pastStates).toHaveLength(1);
  });

  it('draws an outline only on selected bars', () => {
    const { container } = renderChart(['a']);
    const barA = findBar(container, 'a');
    const barB = findBar(container, 'b');

    expect(barA.className).toContain('ring-2');
    expect(barA.className).toContain('ring-brand-500');
    expect(barB.className).not.toContain('ring-2');
  });

  it('toggles selection with Cmd/Ctrl+click and does not start a drag', () => {
    const { container } = renderChart([]);
    const barA = findBar(container, 'a');
    const barB = findBar(container, 'b');

    fireEvent.mouseDown(barA, { button: 0, clientX: 200, metaKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a']);
    expect(useTaskStore.getState().dragState).toBeNull();

    fireEvent.mouseDown(barB, { button: 0, clientX: 200, ctrlKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a', 'b']);

    fireEvent.mouseDown(barA, { button: 0, clientX: 200, metaKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['b']);

    // 修飾キー付きクリックでは日付が変わらない
    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });
    fireEvent.mouseUp(window);
    expect(useTaskStore.getState().tasks.a.startDate).toBe('2026-06-01');
    expect(useTaskStore.getState().tasks.b.startDate).toBe('2026-06-03');
  });

  it('deselects a selected bar on a plain click when multiple tasks are selected', () => {
    const { container } = renderChart(['a', 'b']);
    const barA = findBar(container, 'a');

    fireEvent.mouseDown(barA, { button: 0, clientX: 200, clientY: 50 });
    // ドラッグせずに離すと、そのバーだけ選択解除する
    fireEvent.mouseUp(window);

    expect(useTaskStore.getState().selectedTaskIds).toEqual(['b']);
    expect(useTaskStore.getState().dragState).toBeNull();
    expect(useTaskStore.getState().tasks.a.startDate).toBe('2026-06-01');
    expect(useTaskStore.getState().tasks.b.startDate).toBe('2026-06-03');
    expect(getTemporalState().pastStates).toHaveLength(0);

    // 単一選択のバーはクリックしても選択を維持する
    const barB = findBar(container, 'b');
    fireEvent.mouseDown(barB, { button: 0, clientX: 200, clientY: 50 });
    fireEvent.mouseUp(window);
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['b']);
  });

  it('selects a parent bar but never starts a move drag', () => {
    act(() => {
      useTaskStore.setState({
        tasks: {
          parent: makeTask('parent', {
            startDate: '2026-06-01',
            endDate: '2026-06-02',
            children: ['child'],
          }),
          child: makeTask('child', { parentId: 'parent' }),
        },
        rootIds: ['parent'],
        selectedTaskIds: [],
        focusedTaskId: null,
        dragState: null,
        mousePos: null,
      });
      getTemporalState().clear();
    });

    const { container } = render(<GanttChart showNames />);
    const parentBar = findBar(container, 'parent');

    fireEvent.mouseDown(parentBar, { button: 0, clientX: 200, clientY: 50 });
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['parent']);
    expect(parentBar.className).toContain('ring-2');
    expect(useTaskStore.getState().dragState).toBeNull();

    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });
    fireEvent.mouseUp(window);

    expect(useTaskStore.getState().tasks.parent.startDate).toBe('2026-06-01');
    expect(useTaskStore.getState().tasks.child.startDate).toBe('2026-06-01');
  });

  it('selects a range with Shift+click on bars', () => {
    const { container } = renderChart([]);
    const barA = findBar(container, 'a');
    const barB = findBar(container, 'b');

    // 起点を作る（クリックのみ）
    fireEvent.mouseDown(barA, { button: 0, clientX: 200 });
    fireEvent.mouseUp(window);
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a']);

    fireEvent.mouseDown(barB, { button: 0, clientX: 200, shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual(['a', 'b']);
    expect(useTaskStore.getState().dragState).toBeNull();
  });
});
