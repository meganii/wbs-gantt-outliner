import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

const setupRows = (titles: string[]): string[] => {
  const rootId = useTaskStore.getState().rootIds[0];
  let ids: string[] = [];
  act(() => {
    ids = useTaskStore.getState().addTasks(
      titles.map((title) => ({ title, depth: 0 })),
      rootId,
      'after'
    );
  });
  return ids;
};

describe('useTaskStore.setTaskFieldValues (一括入力)', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('値が 1 個なら全行に同一値をセットする', () => {
    const ids = setupRows(['A', 'B', 'C']);

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'assignee', 'Bob');
    });

    const { tasks } = useTaskStore.getState();
    expect(ids.map((id) => tasks[id].assignee)).toEqual(['Bob', 'Bob', 'Bob']);
  });

  it('値が複数なら順番に対応させる', () => {
    const ids = setupRows(['A', 'B', 'C']);

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'description', ['d1', 'd2', 'd3']);
    });

    const { tasks } = useTaskStore.getState();
    expect(ids.map((id) => tasks[id].description)).toEqual(['d1', 'd2', 'd3']);
  });

  it('値が行数より少ない場合、対応する値が無い行は変更しない', () => {
    const ids = setupRows(['A', 'B', 'C']);

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'assignee', ['x', 'y']);
    });

    const { tasks } = useTaskStore.getState();
    expect(tasks[ids[0]].assignee).toBe('x');
    expect(tasks[ids[1]].assignee).toBe('y');
    expect(tasks[ids[2]].assignee).toBeUndefined();
  });

  it('空文字でセルをクリアできる', () => {
    const ids = setupRows(['A', 'B']);

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'assignee', 'Bob');
    });
    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'assignee', '');
    });

    const { tasks } = useTaskStore.getState();
    expect(ids.map((id) => tasks[id].assignee)).toEqual(['', '']);
  });

  it('変更が無いときは履歴を増やさない', () => {
    const ids = setupRows(['A', 'B']);
    const before = getTemporalState().pastStates.length;

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'assignee', ['', '']);
    });

    expect(getTemporalState().pastStates.length).toBe(before);
  });

  it('Undo は 1 回で一括入力を取り消す', () => {
    const ids = setupRows(['A', 'B', 'C']);
    const before = getTemporalState().pastStates.length;

    act(() => {
      useTaskStore.getState().setTaskFieldValues(ids, 'title', 'Same');
    });
    expect(getTemporalState().pastStates.length).toBe(before + 1);

    act(() => {
      getTemporalState().undo();
    });

    const { tasks } = useTaskStore.getState();
    expect(ids.map((id) => tasks[id].title)).toEqual(['A', 'B', 'C']);
  });
});
