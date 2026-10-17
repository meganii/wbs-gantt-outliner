import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

/**
 * `updateTask` の相互非干渉（isolation）回帰テスト。
 *
 * あるタスクの日程を更新したとき、依存関係にない兄弟タスクや他のタスクを
 * 意図せず書き換えないことを固定する。過去に「無関係なタスクのバーが動く」
 * （パターンC）退行が起きたため、同期/ロックの各モードで確認する。
 *
 * 同期・ロックの一般仕様（予定↔実績の同期、固定中の予定無視）は
 * `useTaskStore.test.ts` の "Baseline Plan and Actual Date Synchronization &
 * Locking" が担う。ここでは「編集対象以外が変わらない」ことだけを検証する。
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
      useTaskStore.getState().setBaselineLocked(false);

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
    expect(tasks[taskBId].startDate).toBe('2026-06-04');
    expect(tasks[taskBId].endDate).toBe('2026-06-06');

    // 親は子から算出される（最小開始＝A、最大終了＝B）
    expect(tasks[parentId].planStartDate).toBe('2026-06-02');
    expect(tasks[parentId].planEndDate).toBe('2026-06-06');
  });

  it('with baseline unlocked, the plan edit syncs only the edited task', () => {
    act(() => {
      useTaskStore.getState().updateTask(taskAId, {
        planStartDate: '2026-06-02',
        planEndDate: '2026-06-04',
        planDuration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 編集したタスクは予定と実績が同期する
    expect(tasks[taskAId].startDate).toBe('2026-06-02');
    expect(tasks[taskAId].endDate).toBe('2026-06-04');

    // 兄弟は同期対象外（変わらない）
    expect(tasks[taskBId].planStartDate).toBe('2026-06-04');
    expect(tasks[taskBId].startDate).toBe('2026-06-04');
  });

  it('with baseline locked, an actual-date edit does not touch the plan or other tasks', () => {
    act(() => {
      useTaskStore.getState().setBaselineLocked(true);
      useTaskStore.getState().updateTask(taskAId, {
        startDate: '2026-06-02',
        endDate: '2026-06-04',
        duration: 3,
      });
    });

    const { tasks } = useTaskStore.getState();

    // 実績は変わるが予定はロックされたまま
    expect(tasks[taskAId].startDate).toBe('2026-06-02');
    expect(tasks[taskAId].planStartDate).toBe('2026-06-01');

    // 兄弟は予定・実績とも不変
    expect(tasks[taskBId].startDate).toBe('2026-06-04');
    expect(tasks[taskBId].planStartDate).toBe('2026-06-04');

    // 親の予定も不変（子の予定が変わっていないため）
    expect(tasks[parentId].planStartDate).toBe('2026-06-01');
    expect(tasks[parentId].planEndDate).toBe('2026-06-06');
  });
});
