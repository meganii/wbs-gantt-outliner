import { describe, it, expect } from 'vitest';
import { getMilestoneDateRange, normalizeMilestones, sortMilestones } from './milestones';
import type { Milestone } from '../types';

describe('sortMilestones', () => {
  it('sorts by date and then title without mutating the input', () => {
    const input: Milestone[] = [
      { id: 'b', title: 'B', date: '2026-10-20' },
      { id: 'a', title: 'A', date: '2026-10-18' },
      { id: 'c', title: 'C', date: '2026-10-20' },
    ];

    const sorted = sortMilestones(input);

    expect(sorted.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('normalizeMilestones', () => {
  it('returns an empty array without warnings when milestones are absent', () => {
    const warnings: string[] = [];

    expect(normalizeMilestones(undefined, warnings)).toEqual([]);
    expect(normalizeMilestones(null, warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('ignores a non-array value and records a warning', () => {
    const warnings: string[] = [];

    expect(normalizeMilestones({ id: 'x' }, warnings)).toEqual([]);
    expect(warnings.join('\n')).toContain('不正');
  });

  it('drops invalid entries, repairs IDs and titles, and sorts the result', () => {
    const warnings: string[] = [];
    const result = normalizeMilestones(
      [
        { id: 'a', title: 'A', date: '2026-10-20' },
        { id: 'a', title: 'B', date: '2026-10-18' },
        { title: '   ', date: '2026-10-19' },
        { title: 'invalid date', date: '2026-02-30' },
        null,
      ],
      warnings
    );

    expect(result.map((m) => m.date)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ]);
    // 重複 ID は -2 を付けて一意にする
    expect(result[0].id).toBe('a-2');
    // 欠損 ID は milestone-N で補完する
    expect(result[1].id).toBe('milestone-3');
    // 空タイトルは既定値にする
    expect(result[1].title).toBe('マイルストーン');

    const message = warnings.join('\n');
    expect(message).toContain('2 件を除外');
    expect(message).toContain('2 件を補完');
    expect(message).toContain('タイトル 1 件');
  });

  it('trims strings and keeps a non-empty note', () => {
    const result = normalizeMilestones([
      { id: 'm1', title: '  設計凍結  ', date: '2026-10-20', note: '  完了条件  ' },
    ]);

    expect(result).toEqual([
      { id: 'm1', title: '設計凍結', date: '2026-10-20', note: '完了条件' },
    ]);
  });
});

describe('getMilestoneDateRange', () => {
  it('returns the min and max epoch ms while ignoring invalid dates', () => {
    const result = getMilestoneDateRange([
      { id: 'a', title: 'A', date: '2026-10-20' },
      { id: 'b', title: 'B', date: '2026-09-01' },
      { id: 'c', title: 'C', date: 'not-a-date' },
    ]);

    expect(result.minMs).toBe(new Date('2026-09-01').getTime());
    expect(result.maxMs).toBe(new Date('2026-10-20').getTime());
  });

  it('returns nulls when there are no valid milestones', () => {
    expect(getMilestoneDateRange([])).toEqual({ minMs: null, maxMs: null });
  });
});
