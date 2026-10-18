import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMemo } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { flattenTree } from '../utils/tree';
import { Outliner } from './Outliner';
import { GanttChart } from './GanttChart';
import { IntegratedView } from './IntegratedView';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import { formatToShow } from '../utils/date';

const initialState = useTaskStore.getState();

/**
 * P1（描画性能）Step 4 のセル memo 化・参照安定化で壊れやすい操作の回帰テスト。
 *
 * セルは `React.memo` + `cellPropsEqual`（関数 props を無視）でメモ化され、
 * 選択状態や派生値の更新が「行の再レンダー」に依存する。ここでは
 * セル編集の確定・派生値の同期・Undo・キーボード移動・依存線の操作・
 * ガントの日付操作が、メモ化後も正しく反映されることを固定する。
 */
const reset = () => {
  act(() => {
    useTaskStore.setState(initialState, true);
    getTemporalState().clear();
  });
};

const titleInput = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLInputElement>(`input[data-task-id="${id}"][data-field="title"]`)!;
const fieldInput = (container: HTMLElement, id: string, field: string) =>
  container.querySelector<HTMLInputElement>(`input[data-task-id="${id}"][data-field="${field}"]`)!;

const IntegratedWrapper = () => {
  const tasks = useTaskStore((s) => s.tasks);
  const rootIds = useTaskStore((s) => s.rootIds);
  const items = useMemo(() => flattenTree(tasks, rootIds), [tasks, rootIds]);
  return <IntegratedView outlinerWidth={800} onResizeStart={() => {}} flattenedItems={items} />;
};

describe('cell editing and derived values', () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('duration commit updates the displayed end date', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'T',
        startDate: '2026-05-25',
        endDate: '2026-05-26',
        duration: 2,
      });
    });
    const { container } = render(<Outliner showDetails />);
    const dur = fieldInput(container, id, 'duration');
    fireEvent.focus(dur);
    fireEvent.change(dur, { target: { value: '5' } });
    fireEvent.blur(dur);

    const task = useTaskStore.getState().tasks[id];
    expect(task.duration).toBe(5);
    // 期間を編集すると終了日が動く（開始日はそのまま）
    expect(task.startDate).toBe('2026-05-25');
    expect(task.endDate).toBe('2026-05-29');

    const endInput = fieldInput(container, id, 'endDate');
    const span = endInput.parentElement!.querySelector('span')!;
    expect(span.textContent).toBe(formatToShow(task.endDate));
    expect(span.textContent).toBe('05/29');
  });

  it('title edit then undo restores the input', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, { title: 'Original' });
    });
    const { container } = render(<Outliner showDetails />);
    const input = titleInput(container, id);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Edited' } });
    fireEvent.blur(input);
    expect(useTaskStore.getState().tasks[id].title).toBe('Edited');

    act(() => {
      getTemporalState().undo();
    });
    expect(useTaskStore.getState().tasks[id].title).toBe('Original');
    expect(titleInput(container, id).value).toBe('Original');
  });

  it('Escape clears the selection from a cell', () => {
    const id = useTaskStore.getState().rootIds[0];
    const { container } = render(<Outliner showDetails />);
    const input = titleInput(container, id);
    fireEvent.focus(input);
    fireEvent.mouseDown(input);
    expect(useTaskStore.getState().selectedTaskIds).toEqual([id]);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([]);
  });

  it('ArrowDown on startDate focuses the next row startDate', () => {
    const firstId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });
    const secondId = useTaskStore.getState().rootIds[1];
    const { container } = render(<Outliner showDetails />);

    const first = fieldInput(container, firstId, 'startDate');
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(fieldInput(container, secondId, 'startDate'));
    expect(useTaskStore.getState().focusedTaskId).toBe(secondId);
    expect(useTaskStore.getState().focusedTaskField).toBe('startDate');
  });

  it('status is display-only and derived from progress', () => {
    const id = useTaskStore.getState().rootIds[0];
    const { container } = render(<Outliner showDetails />);

    // ステータス列は select を持たない（進捗率から導出される表示専用）
    expect(
      container.querySelector(`select[data-task-id="${id}"][data-field="status"]`)
    ).toBeNull();

    const progress = fieldInput(container, id, 'progress');
    fireEvent.focus(progress);
    fireEvent.change(progress, { target: { value: '100' } });
    fireEvent.blur(progress);

    expect(useTaskStore.getState().tasks[id].status).toBe('完了');
  });

  it('progress input clamps and commits on blur', () => {
    const id = useTaskStore.getState().rootIds[0];
    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'progress');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(useTaskStore.getState().tasks[id].progress).toBe(100);
  });

  it('Delete removes all selected rows', () => {
    const firstId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });
    const secondId = useTaskStore.getState().rootIds[1];
    const { container } = render(<Outliner showDetails />);

    fireEvent.mouseDown(titleInput(container, firstId));
    fireEvent.mouseDown(titleInput(container, secondId), { shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId, secondId]);

    fireEvent.keyDown(titleInput(container, secondId), { key: 'Delete' });
    expect(useTaskStore.getState().tasks[firstId]).toBeUndefined();
    expect(useTaskStore.getState().tasks[secondId]).toBeUndefined();
  });

  it('Ctrl+click toggles selection', () => {
    const aId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(aId, 'after');
    });
    const bId = useTaskStore.getState().rootIds[1];
    const { container } = render(<Outliner showDetails />);
    fireEvent.mouseDown(titleInput(container, aId));
    fireEvent.mouseDown(titleInput(container, bId), { ctrlKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([aId, bId]);
    fireEvent.mouseDown(titleInput(container, bId), { ctrlKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([aId]);
  });

  it('parent rollup shows in the DOM after a child date edit', () => {
    const parentId = useTaskStore.getState().rootIds[0];
    let childId = '';
    act(() => {
      useTaskStore.getState().setIntegratedColumns(['taskName', 'date']);
      useTaskStore.getState().addTask(parentId, 'inside');
      childId = useTaskStore.getState().tasks[parentId].children[0];
      useTaskStore.getState().updateTask(childId, {
        startDate: '2026-05-25',
        endDate: '2026-05-26',
      });
    });

    // App と同様に flattenedItems を外から渡す（購読して再計算する）
    const { container } = render(<IntegratedWrapper />);
    expect(fieldInput(container, parentId, 'startDate')).not.toBeNull();

    act(() => {
      useTaskStore.getState().updateTask(childId, {
        startDate: '2026-06-01',
        endDate: '2026-06-02',
      });
    });

    expect(useTaskStore.getState().tasks[parentId].startDate).toBe('2026-06-01');
    const span = fieldInput(container, parentId, 'startDate').parentElement!.querySelector('span')!;
    expect(span.textContent).toBe('06/01');
  });

  it('IntegratedView without the flattenedItems prop still tracks store changes', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().setIntegratedColumns(['taskName', 'date']);
      useTaskStore.getState().updateTask(id, {
        title: 'fallback',
        startDate: '2026-05-25',
        endDate: '2026-05-26',
      });
    });
    const { container } = render(
      <IntegratedView outlinerWidth={800} onResizeStart={() => {}} />
    );
    expect(fieldInput(container, id, 'startDate')).not.toBeNull();

    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-06-08',
        endDate: '2026-06-09',
      });
    });
    const span = fieldInput(container, id, 'startDate').parentElement!.querySelector('span')!;
    expect(span.textContent).toBe('06/08');
  });
});

describe('gantt interaction', () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clicking a dependency line deletes it (after confirm)', () => {
    const aId = useTaskStore.getState().rootIds[0];
    let bId = '';
    act(() => {
      useTaskStore.getState().addTask(aId, 'after');
      bId = useTaskStore.getState().rootIds[1];
      useTaskStore.getState().updateTask(aId, { startDate: '2026-05-25', endDate: '2026-05-26' });
      useTaskStore.getState().updateTask(bId, { startDate: '2026-05-27', endDate: '2026-05-28' });
      useTaskStore.getState().addDependency(aId, bId);
    });
    expect(useTaskStore.getState().tasks[bId].dependencies).toEqual([aId]);

    const { container } = render(<GanttChart showNames />);
    const line = container.querySelector('path[marker-end]')!;
    expect(line).not.toBeNull();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(line);
    confirmSpy.mockRestore();

    expect(useTaskStore.getState().tasks[bId].dependencies).toEqual([]);
  });

  it('IntegratedView schedule bar drag commits new dates', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'IV drag',
        startDate: '2026-05-25',
        endDate: '2026-05-26',
        duration: 2,
      });
    });
    const { container } = render(<IntegratedWrapper />);
    const bar = container.querySelector(`[data-gantt-bar="schedule"][data-task-id="${id}"]`)!;
    expect(bar).not.toBeNull();
    fireEvent.mouseDown(bar, { button: 0, clientX: 200, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });
    fireEvent.mouseUp(window);
    const task = useTaskStore.getState().tasks[id];
    expect(task.startDate).toBe('2026-05-27');
    expect(task.endDate).toBe('2026-05-28');
    expect(useTaskStore.getState().dragState).toBeNull();
  });

  it('IntegratedView dependency handle drag creates a dependency', () => {
    const aId = useTaskStore.getState().rootIds[0];
    let bId = '';
    act(() => {
      useTaskStore.getState().addTask(aId, 'after');
      bId = useTaskStore.getState().rootIds[1];
      useTaskStore.getState().updateTask(aId, { startDate: '2026-05-25', endDate: '2026-05-26' });
      useTaskStore.getState().updateTask(bId, { startDate: '2026-05-27', endDate: '2026-05-28' });
    });
    const { container } = render(<IntegratedWrapper />);
    const barA = container.querySelector(`[data-gantt-bar="schedule"][data-task-id="${aId}"]`)!;
    const handle = barA.querySelector('[title="Drag to create dependency"]')!;
    const barB = container.querySelector(`[data-gantt-bar="schedule"][data-task-id="${bId}"]`)!;
    fireEvent.mouseDown(handle, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 82 });
    fireEvent.mouseUp(barB);
    expect(useTaskStore.getState().tasks[bId].dependencies).toContain(aId);
  });

  it('IntegratedView single click on a day cell sets a one-day schedule', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'IV click',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
    });
    const { container } = render(<IntegratedWrapper />);
    const rowArea = container.querySelector(
      `[data-task-id="${id}"].cursor-crosshair`
    ) as HTMLDivElement;
    expect(rowArea).not.toBeNull();
    fireEvent.mouseDown(rowArea, { button: 0, clientX: 300, clientY: 50 });
    fireEvent.mouseUp(window);
    const task = useTaskStore.getState().tasks[id];
    expect(task.startDate).toBe(task.endDate);
    expect(task.duration).toBe(1);
    expect(useTaskStore.getState().dragState).toBeNull();
  });
});
