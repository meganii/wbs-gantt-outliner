import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { Outliner } from './Outliner';
import { IntegratedView } from './IntegratedView';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/** セルの入力要素の親（セルの外枠 div）を返す。 */
function cellWrapper(
  container: HTMLElement,
  taskId: string,
  field: string
): HTMLElement | null {
  const input = container.querySelector<HTMLElement>(
    `[data-task-id="${taskId}"][data-field="${field}"]`
  );
  return input ? (input.parentElement as HTMLElement) : null;
}

function titleInput(container: HTMLElement, taskId: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(
    `input[data-task-id="${taskId}"][data-field="title"]`
  )!;
}

/** 日付セル内の開始日 / 終了日それぞれのフィールド枠を返す。 */
function dateFieldWrapper(
  container: HTMLElement,
  taskId: string,
  field: 'startDate' | 'endDate'
): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-date-cell="${taskId}"] [data-date-field-wrapper="${field}"]`
  );
}

/** ストアに count 件のタスクを直列に作り、その ID を表示順で返す。 */
function seedTasks(count: number): string[] {
  const ids: string[] = [useTaskStore.getState().rootIds[0]];
  for (let i = 1; i < count; i += 1) {
    const prev = ids[i - 1];
    act(() => {
      useTaskStore.getState().addTask(prev, 'after');
    });
    ids.push(useTaskStore.getState().rootIds[i]);
  }
  return ids;
}

/** from 行をクリック → to 行を Shift+クリックで範囲選択する。 */
function selectRange(container: HTMLElement, fromId: string, toId: string) {
  fireEvent.mouseDown(titleInput(container, fromId));
  fireEvent.mouseDown(titleInput(container, toId), { shiftKey: true });
}

describe('複数行選択時のフォーカス列ハイライト', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('複数行選択中は、フォーカスした列のセルが選択行だけ帯状に強調される', () => {
    const [firstId, secondId, thirdId, fourthId] = seedTasks(4);
    const { container } = render(<Outliner showDetails />);
    selectRange(container, firstId, thirdId);

    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId, secondId, thirdId]);

    // 説明列のセルにフォーカスする
    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="description"]`
      )!
    );
    expect(useTaskStore.getState().focusedTaskField).toBe('description');

    // 選択した 3 行の説明列に帯が付く
    for (const id of [firstId, secondId, thirdId]) {
      expect(cellWrapper(container, id, 'description')!.className).toContain('bg-brand-200');
    }
    // 選択外の行には帯が付かない
    expect(cellWrapper(container, fourthId, 'description')!.className).not.toContain(
      'bg-brand-200'
    );
    // 他の列（担当者）には帯が付かない（行選択の背景だけ）
    expect(cellWrapper(container, firstId, 'assignee')!.className).not.toContain('bg-brand-200');
  });

  it('単一選択では列の帯を出さない（行選択との区別を保つ）', () => {
    const [firstId] = seedTasks(1);
    const { container } = render(<Outliner showDetails />);

    fireEvent.mouseDown(titleInput(container, firstId));
    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="description"]`
      )!
    );

    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId]);
    expect(cellWrapper(container, firstId, 'description')!.className).not.toContain(
      'bg-brand-200'
    );
  });

  it('日付・期間列は非ホバー時の薄い opacity を打ち消して帯を表示する', () => {
    const [firstId, secondId, thirdId] = seedTasks(3);
    const { container } = render(<Outliner showDetails />);
    selectRange(container, firstId, thirdId);

    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="duration"]`
      )!
    );

    for (const id of [firstId, secondId, thirdId]) {
      const wrapper = cellWrapper(container, id, 'duration')!;
      expect(wrapper.className).toContain('bg-brand-200');
      // opacity-50 を !opacity-100 で上書きする
      expect(wrapper.className).toContain('!opacity-100');
    }
  });

  it('日付列は開始日にフォーカスすると開始日だけを帯状に強調する', () => {
    const [firstId, secondId, thirdId] = seedTasks(3);
    const { container } = render(<Outliner showDetails />);
    selectRange(container, firstId, thirdId);

    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="startDate"]`
      )!
    );

    expect(useTaskStore.getState().focusedTaskField).toBe('startDate');
    for (const id of [firstId, secondId, thirdId]) {
      expect(dateFieldWrapper(container, id, 'startDate')!.className).toContain('bg-brand-200');
      expect(dateFieldWrapper(container, id, 'endDate')!.className).not.toContain('bg-brand-200');
    }
  });

  it('日付列は終了日にフォーカスすると終了日だけを帯状に強調する', () => {
    const [firstId, secondId, thirdId] = seedTasks(3);
    const { container } = render(<Outliner showDetails />);
    selectRange(container, firstId, thirdId);

    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="endDate"]`
      )!
    );

    expect(useTaskStore.getState().focusedTaskField).toBe('endDate');
    for (const id of [firstId, secondId, thirdId]) {
      expect(dateFieldWrapper(container, id, 'endDate')!.className).toContain('bg-brand-200');
      expect(dateFieldWrapper(container, id, 'startDate')!.className).not.toContain('bg-brand-200');
    }
  });

  it('統合表示でもフォーカス列が選択行にまたがって強調される', () => {
    const [firstId, secondId, thirdId] = seedTasks(3);
    const { container } = render(
      <IntegratedView outlinerWidth={480} onResizeStart={() => {}} />
    );
    selectRange(container, firstId, thirdId);

    fireEvent.focus(
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${firstId}"][data-field="progress"]`
      )!
    );

    expect(useTaskStore.getState().focusedTaskField).toBe('progress');
    for (const id of [firstId, secondId, thirdId]) {
      expect(cellWrapper(container, id, 'progress')!.className).toContain('bg-brand-200');
    }
  });
});
