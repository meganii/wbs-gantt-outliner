import { describe, it, expect } from 'vitest';
import { planCellPaste } from './cellPastePlan';

const visualOrder = ['a', 'b', 'c', 'd'];

describe('planCellPaste', () => {
  it('空の貼り付けは null（既定動作）', () => {
    expect(
      planCellPaste({ taskId: 'a', text: '\n', selectedTaskIds: ['a'], visualOrder })
    ).toBeNull();
  });

  it('1 行選択 + 単一値は通常の貼り付けに任せる（null）', () => {
    expect(
      planCellPaste({ taskId: 'a', text: 'X', selectedTaskIds: ['a'], visualOrder })
    ).toBeNull();
  });

  it('1 行選択 + 複数行はその行から下へ充填する', () => {
    expect(
      planCellPaste({ taskId: 'b', text: 'X\nY', selectedTaskIds: ['b'], visualOrder })
    ).toEqual({ targetIds: ['b', 'c'], values: ['X', 'Y'] });
  });

  it('1 行選択 + 複数行で下の行が足りない場合はある分だけ充填する', () => {
    expect(
      planCellPaste({ taskId: 'd', text: 'X\nY\nZ', selectedTaskIds: ['d'], visualOrder })
    ).toEqual({ targetIds: ['d'], values: ['X'] });
  });

  it('複数行選択 + 単一値は選択行すべてに同一値を入れる（視覚順）', () => {
    expect(
      planCellPaste({
        taskId: 'a',
        text: 'Z',
        selectedTaskIds: ['c', 'a'],
        visualOrder,
      })
    ).toEqual({ targetIds: ['a', 'c'], values: ['Z', 'Z'] });
  });

  it('複数行選択 + 複数行は選択行へ順に割り当てる（余った行は変更しない）', () => {
    expect(
      planCellPaste({
        taskId: 'a',
        text: 'X\nY\nZ',
        selectedTaskIds: ['a', 'b'],
        visualOrder,
      })
    ).toEqual({ targetIds: ['a', 'b'], values: ['X', 'Y'] });
  });

  it('複数行選択で末尾改行のみ（値 1 個）なら同一値として扱う', () => {
    expect(
      planCellPaste({
        taskId: 'a',
        text: 'X\n',
        selectedTaskIds: ['a', 'b'],
        visualOrder,
      })
    ).toEqual({ targetIds: ['a', 'b'], values: ['X', 'X'] });
  });

  it('複数の選択があっても貼り付け先が選択に含まれなければ単一扱いになる', () => {
    // taskId 'b' は選択に含まれない → 複数行は「b から下へ充填」
    expect(
      planCellPaste({
        taskId: 'b',
        text: 'X\nY',
        selectedTaskIds: ['a', 'c'],
        visualOrder,
      })
    ).toEqual({ targetIds: ['b', 'c'], values: ['X', 'Y'] });
    // 単一値は通常動作
    expect(
      planCellPaste({
        taskId: 'b',
        text: 'X',
        selectedTaskIds: ['a', 'c'],
        visualOrder,
      })
    ).toBeNull();
  });
});
