import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

/**
 * `updateTask` の相互非干渉（isolation）回帰テスト。
 *
 * あるタスクの日程や進捗率を更新したとき、依存関係にない兄弟タスクや他のタスクを
 * 意図せず書き換えないことを固定する。過去に「無関係なタスクのバーが動く」
 * （パターンC）退行が起きたため、日程編集・進捗編集の双方で確認する。
 *
 * 2 層モデルでは日付は 1 系統（startDate / endDate）で、進捗率は日付を書き換えない（規則 2）。
 * ここでは「編集対象以外が変わらない」ことだけを検証する。
 *
 * 旧 `verify_bug.test.ts`（デバッグ用の検証ファイル）を再編したもの。
 */
describe('updateTask isolation (unrelated tasks are not modified)', () => {
  let parentId = '';
  let taskAId = '';
  let taskBId = '';

  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();

      // parent -> [Task A, Task B]
      parentId = useTaskStore.getState().rootIds[0];
      useTaskStore.getState().addTask(parentId, 'inside');
      taskAId = useTaskStore.getState().tasks[parentId].children[0];
      useTaskStore.getState().addTask(taskAId, 'after');
      taskBId = useTaskStore.getState().tasks[parentId].children[1];

      useTaskStore.getState().updateTask(taskAId, {
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        duration: 3,
      });
      useTaskStore.getState().updateTask(taskBId, {
        startDate: '2026-06-04',
        endDate: '2026-06-06',
        duration: 3,
      });
    });
  });

  it('editing one task leaves an unrelated sibling untouched', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, {
        startDate: '2026-06-02',
        endDate: '2026-06-04',
        duration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 編集したタスクだけが変わる
    expect(tasks[taskAId].startDate).toBe('2026-06-02');
    expect(tasks[taskAId].endDate).toBe('2026-06-04');

    // 兄弟は不変
    expect(tasks[taskBId].startDate).toBe('2026-06-04');
    expect(tasks[taskBId].endDate).toBe('2026-06-06');

    // 親は子から算出される（最小開始＝A、最大終了＝B）
    expect(tasks[parentId].startDate).toBe('2026-06-02');
    expect(tasks[parentId].endDate).toBe('2026-06-06');
  });

  it('editing progress does not move dates or unrelated tasks (規則 2)', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, { progress: 100 });
    });

    const { tasks } = useTaskStore.getState();

    // 進捗率を変えても日付は動かない
    expect(tasks[taskAId].startDate).toBe('2026-06-01');
    expect(tasks[taskAId].endDate).toBe('2026-06-03');
    expect(tasks[taskAId].status).toBe('完了');

    // 兄弟の日付も不変
    expect(tasks[taskBId].startDate).toBe('2026-06-04');
    expect(tasks[taskBId].endDate).toBe('2026-06-06');

    // 親の日付は不変、進捗率だけ子からロールアップされる
    expect(tasks[parentId].startDate).toBe('2026-06-01');
    expect(tasks[parentId].endDate).toBe('2026-06-06');
    expect(tasks[parentId].progress).toBe(50);
  });
});
