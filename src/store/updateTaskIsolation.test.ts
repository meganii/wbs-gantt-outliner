import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

/**
 * `updateTask` の相互非干渉（isolation）回帰テスト。
 *
 * あるタスクの日程を更新したとき、依存関係にない兄弟タスクや他のタスクを
 * 意図せず書き換えないことを固定する。過去に「無関係なタスクのバーが動く」
 * （パターンC）退行が起きたため、予定編集・実績編集の双方で確認する。
 *
 * 予定（plan*）と実績（startDate/endDate）は独立しており、双方向同期は行わない。
 * この一般仕様は `useTaskStore.test.ts` の "Plan / Actual are independent" が担う。
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
        planStartDate: '2026-06-01',
        planEndDate: '2026-06-03',
        planDuration: 3,
      });
      useTaskStore.getState().updateTask(taskBId, {
        planStartDate: '2026-06-04',
        planEndDate: '2026-06-06',
        planDuration: 3,
      });
    });
  });

  it('editing one task leaves an unrelated sibling untouched', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, {
        planStartDate: '2026-06-02',
        planEndDate: '2026-06-04',
        planDuration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 編集したタスクだけが変わる
    expect(tasks[taskAId].planStartDate).toBe('2026-06-02');
    expect(tasks[taskAId].planEndDate).toBe('2026-06-04');

    // 兄弟は予定・実績とも不変
    expect(tasks[taskBId].planStartDate).toBe('2026-06-04');
    expect(tasks[taskBId].planEndDate).toBe('2026-06-06');
    expect(tasks[taskBId].startDate).toBeNull();
    expect(tasks[taskBId].endDate).toBeNull();

    // 親は子から算出される（最小開始＝A、最大終了＝B）
    expect(tasks[parentId].planStartDate).toBe('2026-06-02');
    expect(tasks[parentId].planEndDate).toBe('2026-06-06');
  });

  it('a plan edit does not sync the actual dates (no bidirectional sync)', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, {
        planStartDate: '2026-06-02',
        planEndDate: '2026-06-04',
        planDuration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 予定を編集しても実績は空のまま（未着工）
    expect(tasks[taskAId].startDate).toBeNull();
    expect(tasks[taskAId].endDate).toBeNull();

    // 兄弟も不変
    expect(tasks[taskBId].planStartDate).toBe('2026-06-04');
    expect(tasks[taskBId].startDate).toBeNull();
  });

  it('an actual-date edit does not touch the plan, dependencies, or other tasks', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, {
        startDate: '2026-06-02',
        endDate: '2026-06-04',
        duration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 実績は変わるが予定は動かない
    expect(tasks[taskAId].startDate).toBe('2026-06-02');
    expect(tasks[taskAId].endDate).toBe('2026-06-04');
    expect(tasks[taskAId].planStartDate).toBe('2026-06-01');
    expect(tasks[taskAId].planEndDate).toBe('2026-06-03');

    // 兄弟は予定・実績とも不変
    expect(tasks[taskBId].startDate).toBeNull();
    expect(tasks[taskBId].planStartDate).toBe('2026-06-04');

    // 親の予定は不変（子の予定が変わっていないため）
    expect(tasks[parentId].planStartDate).toBe('2026-06-01');
    expect(tasks[parentId].planEndDate).toBe('2026-06-06');

    // 親の実績は子の実績からロールアップされる
    expect(tasks[parentId].startDate).toBe('2026-06-02');
    expect(tasks[parentId].endDate).toBe('2026-06-04');
  });
});
