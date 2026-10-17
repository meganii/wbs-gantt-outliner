import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { TaskDurationCell } from './TaskDurationCell';
import { TaskPlanDurationCell } from './TaskPlanDurationCell';
import { getTemporalState, useTaskStore } from '../../store/useTaskStore';

const initialState = useTaskStore.getState();

const getDuration = (id: string) => useTaskStore.getState().tasks[id].duration;
const getPlanDuration = (id: string) => useTaskStore.getState().tasks[id].planDuration;

const renderDurationCell = (taskId: string) => {
  const state = useTaskStore.getState();
  const { container } = render(
    <TaskDurationCell taskId={taskId} task={state.tasks[taskId]} columnWidths={state.projectConfig.columnWidths} />
  );
  const input = container.querySelector<HTMLInputElement>(`input[data-field="duration"]`);
  expect(input).not.toBeNull();
  return input!;
};

const renderPlanDurationCell = (taskId: string) => {
  const state = useTaskStore.getState();
  const { container } = render(
    <TaskPlanDurationCell
      taskId={taskId}
      task={state.tasks[taskId]}
      columnWidths={state.projectConfig.columnWidths}
      baselineLocked={state.projectConfig.baselineLocked ?? false}
    />
  );
  const input = container.querySelector<HTMLInputElement>(`input[data-field="planDuration"]`);
  expect(input).not.toBeNull();
  return input!;
};

describe('duration セルの確定タイミング (commit-on-blur / Enter)', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('実績期間: 入力中はストアを更新せず、blur で確定する', () => {
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderDurationCell(taskId);

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '7' } });

    // 1 文字ごとにはストアを書き換えない（O(N) 連鎖を起こさない）
    expect(getDuration(taskId)).toBe(1);

    fireEvent.blur(input);
    expect(getDuration(taskId)).toBe(7);
  });

  it('実績期間: Enter で確定する', () => {
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderDurationCell(taskId);

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getDuration(taskId)).toBe(5);
  });

  it('実績期間: Escape で編集を取り消す', () => {
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderDurationCell(taskId);

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(getDuration(taskId)).toBe(1);
  });

  it('実績期間: 数値にならない入力は元の値に戻す', () => {
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderDurationCell(taskId);

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(getDuration(taskId)).toBe(1);
  });

  it('予定期間: 入力中はストアを更新せず、blur で確定する', () => {
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderPlanDurationCell(taskId);

    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: '4' } });

    expect(getPlanDuration(taskId)).toBe(1);

    fireEvent.blur(input);
    expect(getPlanDuration(taskId)).toBe(4);
  });

  it('予定期間: ベースライン固定中は読み取り専用で編集できない', () => {
    act(() => {
      useTaskStore.getState().setBaselineLocked(true);
    });
    const taskId = useTaskStore.getState().rootIds[0];
    const input = renderPlanDurationCell(taskId);

    expect(input.readOnly).toBe(true);

    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.blur(input);

    expect(getPlanDuration(taskId)).toBe(1);
  });

  it('親タスクの期間セルは読み取り専用（子から自動計算）', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    let childId = '';
    act(() => {
      useTaskStore.getState().addTask(rootId, 'inside');
      childId = useTaskStore.getState().tasks[rootId].children[0];
    });
    expect(childId).not.toBe('');

    const parentDuration = renderDurationCell(rootId);
    expect(parentDuration.readOnly).toBe(true);

    fireEvent.change(parentDuration, { target: { value: '9' } });
    fireEvent.blur(parentDuration);
    expect(getDuration(rootId)).toBe(1);
  });
});
