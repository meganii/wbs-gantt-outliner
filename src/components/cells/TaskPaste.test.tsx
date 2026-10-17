import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { TaskOutlineCell } from './TaskOutlineCell';
import { getTemporalState, useTaskStore } from '../../store/useTaskStore';

const initialState = useTaskStore.getState();

const renderTitleCell = (taskId: string) => {
  const state = useTaskStore.getState();
  const { container } = render(
    <TaskOutlineCell
      taskId={taskId}
      task={state.tasks[taskId]}
      columnWidths={state.projectConfig.columnWidths}
    />
  );
  const input = container.querySelector<HTMLInputElement>('input[data-field="title"]');
  expect(input).not.toBeNull();
  return input!;
};

const paste = (input: HTMLInputElement, text: string) => {
  fireEvent.paste(input, {
    clipboardData: {
      getData: () => text,
    },
  });
};

describe('TaskOutlineCell の複数行貼り付け（一括登録）', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('単一行の貼り付けではタスクを追加しない（通常の貼り付けに任せる）', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    const input = renderTitleCell(rootId);

    act(() => {
      paste(input, 'Hello');
    });

    expect(useTaskStore.getState().rootIds).toEqual([rootId]);
  });

  it('複数行の貼り付けで参照タスクの直後にまとめて追加する', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    const input = renderTitleCell(rootId);

    act(() => {
      paste(input, 'A\nB\nC');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(rootIds.length).toBe(4);
    expect(rootIds[0]).toBe(rootId);
    expect(rootIds.slice(1).map((id) => tasks[id].title)).toEqual(['A', 'B', 'C']);
  });

  it('インデント付きの複数行を階層化して登録する', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    const input = renderTitleCell(rootId);

    act(() => {
      paste(input, 'A\n\tB');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    const aId = rootIds[1];
    expect(tasks[aId].title).toBe('A');
    expect(tasks[aId].children.length).toBe(1);
    const bId = tasks[aId].children[0];
    expect(tasks[bId].title).toBe('B');
    expect(tasks[bId].parentId).toBe(aId);
  });

  it('Excel のタブ区切りは 1 列目をタスク名にする', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    const input = renderTitleCell(rootId);

    act(() => {
      paste(input, 'A\t説明\t担当\nB\t説明2\t担当2');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(rootIds.slice(1).map((id) => tasks[id].title)).toEqual(['A', 'B']);
  });

  it('空のセルに貼り付けると 1 行目をそのセルに使い、残りを直後に追加する', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.setState((state) => ({
        tasks: { ...state.tasks, [rootId]: { ...state.tasks[rootId], title: '' } },
      }));
    });

    const input = renderTitleCell(rootId);
    act(() => {
      paste(input, 'A\nB');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(tasks[rootId].title).toBe('A');
    expect(rootIds.length).toBe(2);
    expect(tasks[rootIds[1]].title).toBe('B');
  });
});
