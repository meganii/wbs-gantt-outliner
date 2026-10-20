import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import { parseDatePaste, planDatePaste, resolveDateInput } from './datePaste';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    parentId: null,
    title: overrides.id,
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    duration: 5,
    progress: 0,
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...overrides,
  };
}

const tasks: Record<string, Task> = {
  a: makeTask({ id: 'a' }),
  b: makeTask({ id: 'b', startDate: '2027-03-01', endDate: '2027-03-05' }),
  c: makeTask({ id: 'c', startDate: '2026-12-30', endDate: '2027-01-05' }),
  parent: makeTask({ id: 'parent', children: ['a'] }),
};

const visualOrder = ['a', 'b', 'c', 'parent'];

describe('parseDatePaste', () => {
  it('改行・空白・空行を正規化する', () => {
    expect(parseDatePaste(' 10/05 \n\n10/06\n')).toEqual(['10/05', '10/06']);
  });

  it('タブ区切りは 1 列目を日付として採用する', () => {
    expect(parseDatePaste('2026/10/05\tメモ\n2026/10/06\tメモ')).toEqual([
      '2026/10/05',
      '2026/10/06',
    ]);
  });
});

describe('resolveDateInput', () => {
  it('MM/DD は既存値の年を維持する', () => {
    expect(resolveDateInput('10/20', 'startDate', tasks.a)).toBe('2026-10-20');
  });

  it('開始日が空なら終了日の年を使い、終了日を追い越す場合は前年へ回す', () => {
    const task = makeTask({ id: 'empty', startDate: null, endDate: '2027-01-05' });
    expect(resolveDateInput('12/31', 'startDate', task)).toBe('2026-12-31');
    expect(resolveDateInput('01/10', 'startDate', task)).toBe('2026-01-10');
  });

  it('終了日が開始日より前になる MM/DD は翌年として解釈する', () => {
    expect(resolveDateInput('01/05', 'endDate', tasks.c)).toBe('2027-01-05');
  });

  it('明示的な年が開始日より前なら null', () => {
    expect(resolveDateInput('2026/01/05', 'endDate', tasks.c)).toBeNull();
  });

  it('不正な日付は null', () => {
    expect(resolveDateInput('02/30', 'startDate', tasks.a)).toBeNull();
  });
});

describe('planDatePaste', () => {
  it('単一セル + 単一値は即時確定プランを返す', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: '10/20',
      selectedTaskIds: ['a'],
      visualOrder,
      tasks,
    });

    expect(plan).toMatchObject({
      isSingle: true,
      focusedValue: '2026-10-20',
      invalidCount: 0,
      skippedCount: 0,
    });
    expect(plan?.targets).toEqual([{ id: 'a', value: '2026-10-20' }]);
  });

  it('複数行選択 + 単一値は各行の年で解決して全行へ配る', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: '10/20',
      selectedTaskIds: ['a', 'b'],
      visualOrder,
      tasks,
    });

    expect(plan?.isSingle).toBe(false);
    expect(plan?.targets).toEqual([
      { id: 'a', value: '2026-10-20' },
      { id: 'b', value: '2027-10-20' },
    ]);
  });

  it('複数行選択 + 複数値は視覚順に割り当てる', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: '2026/11/01\n2027/04/01',
      selectedTaskIds: ['a', 'b'],
      visualOrder,
      tasks,
    });

    expect(plan?.targets).toEqual([
      { id: 'a', value: '2026-11-01' },
      { id: 'b', value: '2027-04-01' },
    ]);
  });

  it('1 行選択 + 複数行は下方向へ充填する', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: '11/01\n11/02\n11/03',
      selectedTaskIds: ['a'],
      visualOrder,
      tasks,
    });

    expect(plan?.targets).toEqual([
      { id: 'a', value: '2026-11-01' },
      { id: 'b', value: '2027-11-02' },
      { id: 'c', value: '2026-11-03' },
    ]);
  });

  it('親タスクはスキップし、不正値は invalidCount に数える', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: '11/01\ninvalid\n11/03\n11/04',
      selectedTaskIds: ['a', 'b', 'c', 'parent'],
      visualOrder,
      tasks,
    });

    expect(plan?.targets).toEqual([
      { id: 'a', value: '2026-11-01' },
      { id: 'c', value: '2026-11-03' },
    ]);
    expect(plan?.invalidCount).toBe(1);
    expect(plan?.skippedCount).toBe(1);
  });

  it('単一値が不正なら既定の貼り付けに任せる（null）', () => {
    const plan = planDatePaste({
      taskId: 'a',
      field: 'startDate',
      text: 'invalid',
      selectedTaskIds: ['a'],
      visualOrder,
      tasks,
    });
    expect(plan).toBeNull();
  });
});
