import { describe, it, expect } from 'vitest';
import { parseTaskPaste } from './parseTaskPaste';

describe('parseTaskPaste', () => {
  it('空文字は空配列を返す', () => {
    expect(parseTaskPaste('')).toEqual([]);
  });

  it('単一行は深さ 0 の 1 件になる', () => {
    expect(parseTaskPaste('Task A')).toEqual([{ title: 'Task A', depth: 0 }]);
  });

  it('複数行を順序どおりフラットに返す', () => {
    expect(parseTaskPaste('A\nB\nC')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 0 },
      { title: 'C', depth: 0 },
    ]);
  });

  it('CRLF / CR の改行にも対応する', () => {
    expect(parseTaskPaste('A\r\nB\rC')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 0 },
      { title: 'C', depth: 0 },
    ]);
  });

  it('空白のみの行はスキップする', () => {
    expect(parseTaskPaste('A\n\n   \nB')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 0 },
    ]);
  });

  it('タブのインデントで階層化する', () => {
    expect(parseTaskPaste('A\n\tB\n\t\tC\n\tD')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
      { title: 'C', depth: 2 },
      { title: 'D', depth: 1 },
    ]);
  });

  it('スペース 2 個でも 4 個でもインデントとして扱う', () => {
    expect(parseTaskPaste('A\n  B\n    C')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
      { title: 'C', depth: 2 },
    ]);
  });

  it('行頭タブだけの行は列モードにしない（インデントとして扱う）', () => {
    expect(parseTaskPaste('A\n\tB')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
    ]);
  });

  it('Excel のタブ区切りは 1 列目のみをタスク名に採用する', () => {
    expect(parseTaskPaste('A\t説明\t担当\nB\t説明2\t担当2')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 0 },
    ]);
  });

  it('列モードでも先頭のスペースはインデントとして階層化する', () => {
    expect(parseTaskPaste('A\t説明\n  B\t説明2')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
    ]);
  });

  it('列モードで 1 列目が空の行はタスクを作らない', () => {
    expect(parseTaskPaste('A\tx\n\tB\ty')).toEqual([{ title: 'A', depth: 0 }]);
  });

  it('前後の空白を除去する', () => {
    expect(parseTaskPaste('  A  \n\t B ')).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
    ]);
  });
});
