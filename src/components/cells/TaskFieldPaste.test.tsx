import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { TaskTextCell } from './TaskTextCell';
import { TaskOutlineCell } from './TaskOutlineCell';
import { getTemporalState, useTaskStore } from '../../store/useTaskStore';

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
    useTaskStore.getState().setSelectedTaskIds([ids[0]]);
  });
  return ids;
};

const paste = (input: HTMLInputElement, text: string) => {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
};

const renderTextCell = (taskId: string, field: 'description' | 'assignee' | 'deliverables') => {
  const state = useTaskStore.getState();
  const { container } = render(
    <TaskTextCell
      taskId={taskId}
      task={state.tasks[taskId]}
      columnWidths={state.projectConfig.columnWidths}
      field={field}
      placeholder=""
    />
  );
  const input = container.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  expect(input).not.toBeNull();
  return input!;
};

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

describe('テキスト列の貼り付け（Excel ライクな一括入力）', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('複数行選択 + 単一値: 選択行すべてに同一値を入れる', () => {
    const ids = setupRows(['A', 'B', 'C']);
    act(() => {
      useTaskStore.getState().setSelectedTaskIds([ids[0], ids[2]]);
    });

    const input = renderTextCell(ids[0], 'assignee');
    act(() => {
      paste(input, 'Bob');
    });

    const { tasks } = useTaskStore.getState();
    expect(tasks[ids[0]].assignee).toBe('Bob');
    expect(tasks[ids[2]].assignee).toBe('Bob');
    expect(tasks[ids[1]].assignee).toBeUndefined();
  });

  it('1 行選択 + 複数行: その行から下へ充填する', () => {
    const ids = setupRows(['A', 'B', 'C']);

    const input = renderTextCell(ids[0], 'description');
    act(() => {
      paste(input, 'D1\nD2');
    });

    const { tasks } = useTaskStore.getState();
    expect(tasks[ids[0]].description).toBe('D1');
    expect(tasks[ids[1]].description).toBe('D2');
    expect(tasks[ids[2]].description).toBeUndefined();
  });

  it('1 行選択 + 単一値は現在セルのみの通常の貼り付けに任せる', () => {
    const ids = setupRows(['A', 'B']);

    const input = renderTextCell(ids[0], 'assignee');
    act(() => {
      paste(input, 'Bob');
    });

    // 既定動作に任せるため、ストアは（この fireEvent では）更新されない
    const { tasks } = useTaskStore.getState();
    expect(tasks[ids[0]].assignee).toBeUndefined();
    expect(tasks[ids[1]].assignee).toBeUndefined();
  });

  it('タスク名: 複数行選択 + 単一値で選択行のタスク名を揃える（新規タスクは作らない）', () => {
    const ids = setupRows(['A', 'B', 'C']);
    act(() => {
      useTaskStore.getState().setSelectedTaskIds([ids[0], ids[1]]);
    });
    const rootCount = useTaskStore.getState().rootIds.length;

    const input = renderTitleCell(ids[0]);
    act(() => {
      paste(input, 'Same');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(tasks[ids[0]].title).toBe('Same');
    expect(tasks[ids[1]].title).toBe('Same');
    expect(tasks[ids[2]].title).toBe('C');
    expect(rootIds.length).toBe(rootCount);
  });

  it('タスク名: 1 行選択 + 複数行は従来どおり新規タスクを一括登録する', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().setSelectedTaskIds([rootId]);
    });

    const input = renderTitleCell(rootId);
    act(() => {
      paste(input, 'X\nY');
    });

    const { tasks, rootIds } = useTaskStore.getState();
    expect(rootIds.length).toBe(3);
    expect(rootIds.slice(1).map((id) => tasks[id].title)).toEqual(['X', 'Y']);
  });
});
