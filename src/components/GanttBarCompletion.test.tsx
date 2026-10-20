import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { IntegratedView } from './IntegratedView';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

const reset = () => {
  act(() => {
    useTaskStore.setState(initialState, true);
    getTemporalState().clear();
  });
};

/** ガントの現在の日程バー（操作対象の 1 本）を取り出す。 */
const scheduleBar = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLDivElement>(`[data-gantt-bar="schedule"][data-task-id="${id}"]`);

/** バー内の進捗塗り（`aria-hidden` の子要素は塗りのみ）。 */
const progressFill = (bar: HTMLElement) => bar.querySelector<HTMLDivElement>('[aria-hidden="true"]');

/**
 * ガントのバーの見た目で進捗状態を読み取れることを固定する。
 *
 * 現在の日程バー 1 本に進捗を塗る方式なので、塗りが 100% まで到達した完了タスクは
 * 色（緑）でも分かるようにしている。WBS のステータス列（`TaskStatusCell`）が
 * 「完了 = 緑」なので、色の意味を合わせている。
 */
describe('gantt bar completion color', () => {
  beforeEach(() => {
    reset();
  });

  const seedThreeStages = () => {
    const ids: string[] = [];
    act(() => {
      const store = useTaskStore.getState();
      const first = store.rootIds[0];
      store.addTask(first, 'after');
      const second = useTaskStore.getState().rootIds[1];
      store.addTask(second, 'after');
      const third = useTaskStore.getState().rootIds[2];
      ids.push(first, second, third);

      const base = { startDate: '2026-05-25', endDate: '2026-05-29', duration: 5 };
      useTaskStore.getState().updateTask(first, { ...base, title: '未着工', progress: 0, status: '未着手' });
      useTaskStore.getState().updateTask(second, { ...base, title: '進行中', progress: 50, status: '進行中' });
      useTaskStore.getState().updateTask(third, { ...base, title: '完了', progress: 100, status: '完了' });
    });
    return ids;
  };

  it('完了（100%）のバーは緑、進行中は青、未着工は無塗り', () => {
    const [notStarted, inProgress, completed] = seedThreeStages();
    const { container } = render(<IntegratedView outlinerWidth={600} onResizeStart={() => {}} />);

    // 未着工: 青い枠のまま、塗りなし
    const notStartedBar = scheduleBar(container, notStarted)!;
    expect(notStartedBar.className).toContain('bg-brand-100');
    expect(notStartedBar.className).not.toContain('bg-green-100');
    expect(progressFill(notStartedBar)).toBeNull();

    // 進行中: 青い塗りが progress% の幅で入る
    const inProgressBar = scheduleBar(container, inProgress)!;
    expect(inProgressBar.className).toContain('bg-brand-100');
    const inProgressFill = progressFill(inProgressBar)!;
    expect(inProgressFill.className).toContain('bg-brand-600');
    expect(inProgressFill.style.width).toBe('50%');

    // 完了: 枠も塗りも緑になり、塗りは 100%
    const completedBar = scheduleBar(container, completed)!;
    expect(completedBar.className).toContain('bg-green-100');
    expect(completedBar.className).toContain('border-green-400');
    const completedFill = progressFill(completedBar)!;
    expect(completedFill.className).toContain('bg-green-600');
    expect(completedFill.className).not.toContain('bg-brand-600');
    expect(completedFill.style.width).toBe('100%');
  });

  it('親タスクは子がすべて完了（ロールアップ 100%）のとき緑になる', () => {
    let parentId = '';
    let childId = '';
    act(() => {
      const store = useTaskStore.getState();
      parentId = store.rootIds[0];
      store.addTask(parentId, 'inside');
      childId = useTaskStore.getState().tasks[parentId].children[0];
      const base = { startDate: '2026-05-25', endDate: '2026-05-29', duration: 5 };
      useTaskStore.getState().updateTask(parentId, base);
      useTaskStore.getState().updateTask(childId, { ...base, title: '子', progress: 100, status: '完了' });
    });

    const { container } = render(<IntegratedView outlinerWidth={600} onResizeStart={() => {}} />);

    const parent = useTaskStore.getState().tasks[parentId];
    expect(parent.progress).toBe(100);

    const parentBar = scheduleBar(container, parentId)!;
    expect(parentBar.className).toContain('bg-green-200/70');
    expect(parentBar.className).not.toContain('bg-slate-300/80');
    expect(progressFill(parentBar)!.className).toContain('bg-green-500/80');
  });
});
