import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { Outliner } from './Outliner';
import { IntegratedView } from './IntegratedView';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/**
 * Shift + 矢印キー / Shift + クリックによる範囲選択の回帰テスト。
 *
 * セルは React.memo + 「関数 props を無視する」比較関数でメモ化されているため、
 * onSelectionChange の古いクロージャがセルに残りやすい。選択ハンドラが
 * アンカー/選択状態をクロージャから読むと、2 行目から Shift+↓ したときに
 * 起点が失われて 1 行しか選択されない（＝意図した複数行を選べない）退行が起きる。
 */
describe('Shift+Arrow range selection', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createFourTasks = () => {
    const firstId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });
    const secondId = useTaskStore.getState().rootIds[1];
    act(() => {
      useTaskStore.getState().addTask(secondId, 'after');
    });
    const thirdId = useTaskStore.getState().rootIds[2];
    act(() => {
      useTaskStore.getState().addTask(thirdId, 'after');
    });
    const fourthId = useTaskStore.getState().rootIds[3];
    return { firstId, secondId, thirdId, fourthId };
  };

  it('Outliner: Shift+ArrowDown extends from the clicked row', () => {
    const { secondId, thirdId } = createFourTasks();
    const { container } = render(<Outliner showDetails />);

    const secondTitle = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${secondId}"][data-field="title"]`
    )!;
    fireEvent.focus(secondTitle);
    fireEvent.mouseDown(secondTitle);
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId]);

    // 1 回目: 2 行目 -> 3 行目（起点を失わず 2 行選択）
    fireEvent.keyDown(secondTitle, { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId, thirdId]);
  });

  it('Outliner: repeated Shift+ArrowDown grows the range', () => {
    const { secondId, thirdId, fourthId } = createFourTasks();
    const { container } = render(<Outliner showDetails />);

    const titleInput = (id: string) =>
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${id}"][data-field="title"]`
      )!;

    fireEvent.focus(titleInput(secondId));
    fireEvent.mouseDown(titleInput(secondId));

    fireEvent.keyDown(titleInput(secondId), { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId, thirdId]);

    // フォーカスは 3 行目へ移っている
    fireEvent.keyDown(titleInput(thirdId), { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId, thirdId, fourthId]);
  });

  it('Outliner: Shift+ArrowUp extends upward from the clicked row', () => {
    const { secondId, thirdId, fourthId } = createFourTasks();
    const { container } = render(<Outliner showDetails />);

    const fourthTitle = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${fourthId}"][data-field="title"]`
    )!;
    fireEvent.focus(fourthTitle);
    fireEvent.mouseDown(fourthTitle);

    fireEvent.keyDown(fourthTitle, { key: 'ArrowUp', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([thirdId, fourthId]);

    const thirdTitle = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${thirdId}"][data-field="title"]`
    )!;
    fireEvent.keyDown(thirdTitle, { key: 'ArrowUp', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId, thirdId, fourthId]);
  });

  it('IntegratedView: Shift+ArrowDown extends from the clicked row', () => {
    const { secondId, thirdId } = createFourTasks();
    const { container } = render(
      <IntegratedView outlinerWidth={800} onResizeStart={() => {}} />
    );

    const secondTitle = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${secondId}"][data-field="title"]`
    )!;
    fireEvent.focus(secondTitle);
    fireEvent.mouseDown(secondTitle);
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId]);

    fireEvent.keyDown(secondTitle, { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([secondId, thirdId]);
  });

  it('GanttChart: repeated Shift+ArrowDown keeps the anchor and grows', () => {
    const firstId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(firstId, 'after');
    });
    const secondId = useTaskStore.getState().rootIds[1];
    act(() => {
      useTaskStore.getState().addTask(secondId, 'after');
    });
    const thirdId = useTaskStore.getState().rootIds[2];

    const { container } = render(<GanttChart showNames />);
    const titleInput = (id: string) =>
      container.querySelector<HTMLInputElement>(
        `input[data-task-id="${id}"][data-field="title"]`
      )!;

    fireEvent.focus(titleInput(firstId));
    fireEvent.mouseDown(titleInput(firstId));
    fireEvent.keyDown(titleInput(firstId), { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId, secondId]);

    // 2 回目も起点を失わず 3 行に伸びる（直前の選択末尾を起点にすると [second, third] に縮む）
    fireEvent.keyDown(titleInput(secondId), { key: 'ArrowDown', shiftKey: true });
    expect(useTaskStore.getState().selectedTaskIds).toEqual([firstId, secondId, thirdId]);
  });
});
