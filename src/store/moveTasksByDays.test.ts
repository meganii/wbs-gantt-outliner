import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';
import type { Task } from '../types';

const initialState = useTaskStore.getState();

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    parentId: null,
    title: id,
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    duration: 1,
    progress: 0,
    status: '未着手',
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...overrides,
  };
}

function loadGraph(tasks: Task[], rootIds: string[]) {
  const taskMap = Object.fromEntries(tasks.map((task) => [task.id, task]));
  act(() => {
    useTaskStore.setState({
      tasks: taskMap,
      rootIds,
      selectedTaskIds: [],
      focusedTaskId: null,
      dragState: null,
      mousePos: null,
    });
    getTemporalState().clear();
  });
}

const snapshot = (id: string) => {
  const task = useTaskStore.getState().tasks[id];
  return {
    startDate: task.startDate,
    endDate: task.endDate,
    duration: task.duration,
  };
};

describe('moveTasksByDays', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('moves multiple leaves by the same days in one set / one undo entry', () => {
    loadGraph(
      [
        makeTask('a', { startDate: '2026-06-01', endDate: '2026-06-02', duration: 2 }),
        makeTask('b', { startDate: '2026-06-03', endDate: '2026-06-04', duration: 2 }),
      ],
      ['a', 'b']
    );

    let taskUpdates = 0;
    let previousTasks = useTaskStore.getState().tasks;
    const unsubscribe = useTaskStore.subscribe((state) => {
      if (state.tasks !== previousTasks) {
        taskUpdates += 1;
        previousTasks = state.tasks;
      }
    });

    act(() => {
      useTaskStore.getState().moveTasksByDays(['a', 'b'], 2);
    });
    unsubscribe();

    expect(snapshot('a')).toEqual({
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      duration: 2,
    });
    expect(snapshot('b')).toEqual({
      startDate: '2026-06-05',
      endDate: '2026-06-06',
      duration: 1,
    });
    expect(taskUpdates).toBe(1);
    expect(getTemporalState().pastStates).toHaveLength(1);

    act(() => {
      getTemporalState().undo();
    });

    expect(snapshot('a')).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      duration: 2,
    });
    expect(snapshot('b')).toEqual({
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      duration: 2,
    });
  });

  it('ignores parent tasks in the selection and rolls the parent up after moving children', () => {
    loadGraph(
      [
        makeTask('parent', {
          startDate: '2026-06-01',
          endDate: '2026-06-06',
          duration: 6,
          children: ['c1', 'c2'],
        }),
        makeTask('c1', {
          parentId: 'parent',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          duration: 2,
        }),
        makeTask('c2', {
          parentId: 'parent',
          startDate: '2026-06-05',
          endDate: '2026-06-06',
          duration: 2,
        }),
      ],
      ['parent']
    );

    act(() => {
      useTaskStore.getState().moveTasksByDays(['parent', 'c1'], 2);
    });

    expect(snapshot('c1')).toEqual({
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      duration: 2,
    });
    // 選択外の子は動かさない
    expect(snapshot('c2')).toEqual({
      startDate: '2026-06-05',
      endDate: '2026-06-06',
      duration: 2,
    });
    // 親は子の min〜max にロールアップされる
    expect(snapshot('parent')).toEqual({
      startDate: '2026-06-03',
      endDate: '2026-06-06',
      duration: 3,
    });
  });

  it('does not double-move selected predecessor/successor (relative dates are kept)', () => {
    loadGraph(
      [
        makeTask('a', { startDate: '2026-06-04', endDate: '2026-06-05', duration: 2 }),
        makeTask('b', {
          startDate: '2026-06-08',
          endDate: '2026-06-09',
          duration: 2,
          dependencies: ['a'],
        }),
      ],
      ['a', 'b']
    );

    act(() => {
      useTaskStore.getState().moveTasksByDays(['a', 'b'], 1);
    });

    // 明示移動を優先し、依存伝播で b が 06-08 に引き戻されない
    expect(snapshot('a')).toEqual({
      startDate: '2026-06-05',
      endDate: '2026-06-06',
      duration: 1,
    });
    expect(snapshot('b')).toEqual({
      startDate: '2026-06-09',
      endDate: '2026-06-10',
      duration: 2,
    });
  });

  it('propagates to unselected successors', () => {
    loadGraph(
      [
        makeTask('a', { startDate: '2026-06-01', endDate: '2026-06-02', duration: 2 }),
        makeTask('b', {
          startDate: '2026-06-03',
          endDate: '2026-06-04',
          duration: 2,
          dependencies: ['a'],
        }),
      ],
      ['a', 'b']
    );

    act(() => {
      useTaskStore.getState().moveTasksByDays(['a'], 2);
    });

    expect(snapshot('a')).toEqual({
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      duration: 2,
    });
    // a の終了日の翌稼働日へ伝播（期間は維持）
    expect(snapshot('b')).toEqual({
      startDate: '2026-06-05',
      endDate: '2026-06-08',
      duration: 2,
    });
  });

  it('does nothing for zero days, missing dates, parent-only selections, or unknown IDs', () => {
    loadGraph(
      [
        makeTask('parent', {
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          duration: 2,
          children: ['child'],
        }),
        makeTask('child', {
          parentId: 'parent',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          duration: 2,
        }),
        makeTask('empty', { startDate: null, endDate: null, duration: 1 }),
      ],
      ['parent', 'empty']
    );

    const before = useTaskStore.getState().tasks;

    act(() => {
      useTaskStore.getState().moveTasksByDays(['child'], 0);
      useTaskStore.getState().moveTasksByDays(['empty'], 2);
      useTaskStore.getState().moveTasksByDays(['parent'], 2);
      useTaskStore.getState().moveTasksByDays(['missing'], 2);
      useTaskStore.getState().moveTasksByDays([], 2);
    });

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(getTemporalState().pastStates).toHaveLength(0);
  });

  it('recalculates duration across weekends and holidays', () => {
    loadGraph(
      [
        makeTask('a', { startDate: '2026-06-05', endDate: '2026-06-08', duration: 2 }),
      ],
      ['a']
    );
    act(() => {
      useTaskStore.getState().setCalendarHolidays(['2026-06-09']);
      getTemporalState().clear();
    });

    act(() => {
      useTaskStore.getState().moveTasksByDays(['a'], 1);
    });

    // 06-05(金)〜06-08(月) → 06-06(土)〜06-09(火)。06-09 は祝日なので稼働日は 1。
    expect(snapshot('a')).toEqual({
      startDate: '2026-06-06',
      endDate: '2026-06-09',
      duration: 1,
    });
  });

  it('does not shift selected children when a parent is shifted by dependency propagation', () => {
    loadGraph(
      [
        // p の後続である q（親）が動くと、その子 c2 は shiftDescendants で動く。
        // c2 が選択中なら固定される。
        makeTask('p', { startDate: '2026-06-01', endDate: '2026-06-02', duration: 2 }),
        makeTask('q', {
          startDate: '2026-06-03',
          endDate: '2026-06-04',
          duration: 2,
          dependencies: ['p'],
          children: ['c2'],
        }),
        makeTask('c2', {
          parentId: 'q',
          startDate: '2026-06-03',
          endDate: '2026-06-04',
          duration: 2,
        }),
      ],
      ['p', 'q']
    );

    act(() => {
      useTaskStore.getState().moveTasksByDays(['p', 'c2'], 3);
    });

    expect(snapshot('p')).toEqual({
      startDate: '2026-06-04',
      endDate: '2026-06-05',
      duration: 2,
    });
    // 選択中の c2 は明示移動（+3 日）を優先し、親 q のシフトに巻き込まれない
    expect(snapshot('c2')).toEqual({
      startDate: '2026-06-06',
      endDate: '2026-06-07',
      duration: 0,
    });
  });
});
