import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

describe('useTaskStore.addTasks (複数行の一括登録)', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('参照タスクの直後に、貼り付けた順序で兄弟として追加する', () => {
    const rootId = useTaskStore.getState().rootIds[0];

    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'A', depth: 0 },
          { title: 'B', depth: 0 },
          { title: 'C', depth: 0 },
        ],
        rootId,
        'after'
      );
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(rootIds).toEqual([rootId, ...ids]);
    expect(ids.map((id) => tasks[id].title)).toEqual(['A', 'B', 'C']);
    ids.forEach((id) => expect(tasks[id].parentId).toBe(null));
  });

  it('新規タスクは addTask と同じ既定値を持つ', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks([{ title: 'A', depth: 0 }], rootId, 'after');
    });

    const task = useTaskStore.getState().tasks[ids[0]];
    expect(task.duration).toBe(1);
    expect(task.planDuration).toBe(1);
    expect(task.progress).toBe(0);
    expect(task.startDate).toBe(null);
    expect(task.planStartDate).toBe(null);
    expect(task.children).toEqual([]);
    expect(task.dependencies).toEqual([]);
  });

  it('深さに応じて親子関係を組み立てる', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'A', depth: 0 },
          { title: 'B', depth: 1 },
          { title: 'C', depth: 2 },
          { title: 'D', depth: 1 },
        ],
        rootId,
        'after'
      );
    });

    const { tasks } = useTaskStore.getState();
    const [a, b, c, d] = ids;
    expect(tasks[a].parentId).toBe(null);
    expect(tasks[b].parentId).toBe(a);
    expect(tasks[c].parentId).toBe(b);
    expect(tasks[d].parentId).toBe(a);
    expect(tasks[a].children).toEqual([b, d]);
    expect(tasks[b].children).toEqual([c]);
  });

  it('深さ上限（4 階層）を超える行はクランプする', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'A', depth: 0 },
          { title: 'B', depth: 1 },
          { title: 'C', depth: 2 },
          { title: 'D', depth: 3 },
          { title: 'E', depth: 4 },
        ],
        rootId,
        'after'
      );
    });

    const { tasks } = useTaskStore.getState();
    const [a, b, c, d, e] = ids;
    // A(root) > B > C > D が上限。E は D と同じ深さにクランプされる。
    expect(tasks[b].parentId).toBe(a);
    expect(tasks[c].parentId).toBe(b);
    expect(tasks[d].parentId).toBe(c);
    expect(tasks[e].parentId).toBe(c);
    expect(tasks[d].parentId).toBe(tasks[e].parentId);
  });

  it('追加後に新規タスクを選択し、先頭にフォーカスする', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'A', depth: 0 },
          { title: 'B', depth: 0 },
        ],
        rootId,
        'after'
      );
    });

    const { selectedTaskIds, focusedTaskId, focusedTaskField } = useTaskStore.getState();
    expect(selectedTaskIds).toEqual(ids);
    expect(focusedTaskId).toBe(ids[0]);
    expect(focusedTaskField).toBe('title');
  });

  it('Undo は 1 回で貼り付け全体を取り消す', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTasks(
        [
          { title: 'A', depth: 0 },
          { title: 'B', depth: 0 },
          { title: 'C', depth: 0 },
        ],
        rootId,
        'after'
      );
    });

    expect(getTemporalState().pastStates.length).toBe(1);

    act(() => {
      getTemporalState().undo();
    });

    expect(useTaskStore.getState().rootIds).toEqual([rootId]);
  });

  it('referenceTitle で参照タスクのタイトルも同じ set で更新する', () => {
    const rootId = useTaskStore.getState().rootIds[0];

    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'B', depth: 0 },
          { title: 'C', depth: 0 },
        ],
        rootId,
        'after',
        { referenceTitle: 'A' }
      );
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(tasks[rootId].title).toBe('A');
    expect(rootIds).toEqual([rootId, ...ids]);
    expect(ids.map((id) => tasks[id].title)).toEqual(['B', 'C']);
  });

  it('空セルへの貼り付け（1 行目を参照タスクに採用）でも階層が崩れない', () => {
    const rootId = useTaskStore.getState().rootIds[0];

    let ids: string[] = [];
    act(() => {
      // 1 行目 "A" は参照タスク（rootId）に採用済み。残りを直後に追加する。
      ids = useTaskStore.getState().addTasks(
        [
          { title: 'B', depth: 0 },
          { title: 'C', depth: 0 },
          { title: 'D', depth: 1 },
        ],
        rootId,
        'after',
        { referenceTitle: 'A' }
      );
    });

    const { tasks, rootIds } = useTaskStore.getState();
    const [b, c, d] = ids;
    expect(tasks[rootId].title).toBe('A');
    expect(rootIds).toEqual([rootId, b, c]);
    expect(tasks[b].parentId).toBe(null);
    expect(tasks[c].parentId).toBe(null);
    expect(tasks[d].parentId).toBe(c);
  });

  it('items が空で referenceTitle も無ければ何もしない', () => {
    const before = getTemporalState().pastStates.length;
    let ids: string[] = [];
    act(() => {
      ids = useTaskStore.getState().addTasks([], null, 'after');
    });

    expect(ids).toEqual([]);
    expect(getTemporalState().pastStates.length).toBe(before);
  });
});
