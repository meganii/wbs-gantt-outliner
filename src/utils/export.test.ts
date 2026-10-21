import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelExportBuffer } from './export';
import { DEFAULT_PROJECT_CONFIG } from './projectConfig';
import type { Task } from '../types';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    parentId: null,
    startDate: null,
    endDate: null,
    duration: 0,
    progress: 0,
    status: '',
    isCollapsed: false,
    children: [],
    dependencies: [],
    ...partial,
  };
}

const parent = task({
  id: 'p',
  title: '設計',
  children: ['c'],
  startDate: '2026-05-11',
  endDate: '2026-05-15',
  duration: 5,
  progress: 50,
  status: '進行中',
});

const child = task({
  id: 'c',
  parentId: 'p',
  title: '基本設計',
  startDate: '2026-05-11',
  endDate: '2026-05-13',
  duration: 3,
  progress: 100,
  status: '完了',
  baselineStartDate: '2026-05-12',
  baselineEndDate: '2026-05-14',
  baselineDuration: 3,
});

async function buildAndLoad() {
  const buffer = await buildExcelExportBuffer({
    tasks: { p: parent, c: child },
    rootIds: ['p'],
    projectConfig: DEFAULT_PROJECT_CONFIG,
  });
  const workbook = new ExcelJS.Workbook();
  // ExcelJS の型定義は Node の Buffer を要求するが、実行時は Uint8Array も受け付ける。
  // アプリ側の tsconfig に Node 型を入れないため、ここだけシグネチャを合わせる
  // （メソッド内部で this を使うので bind したうえで呼ぶ）。
  const load = (
    workbook.xlsx.load as unknown as (data: Uint8Array) => Promise<ExcelJS.Workbook>
  ).bind(workbook.xlsx);
  await load(buffer);
  return { buffer, workbook };
}

describe('buildExcelExportBuffer', () => {
  it('returns an xlsx file signature', async () => {
    const { buffer } = await buildAndLoad();
    // xlsx は ZIP コンテナ。先頭 2 バイトが 'PK'。
    expect(Array.from(buffer.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it('writes the gantt sheet with the current column headers', async () => {
    const { workbook } = await buildAndLoad();
    const sheet = workbook.getWorksheet('Gantt Chart');
    expect(sheet).toBeDefined();

    const headers = (sheet!.getRow(1).values as unknown[]).slice(1);
    // 固定列（現在の日程 + 基準計画）が先頭に並ぶ
    expect(headers.slice(0, 13)).toEqual([
      'WBS番号',
      '項目名',
      '説明',
      '担当者',
      '成果物',
      '状態',
      '進捗率',
      '開始日',
      '終了日',
      '期間',
      '基準開始日',
      '基準終了日',
      '基準期間',
    ]);
  });

  it('writes task rows with indentation, progress and baseline dates', async () => {
    const { workbook } = await buildAndLoad();
    const sheet = workbook.getWorksheet('Gantt Chart')!;

    // 列キーは xlsx に保存されないため、読み戻し後は列番号で参照する
    // （1:WBS番号 2:項目名 6:状態 7:進捗率 11:基準開始日 12:基準終了日 13:基準期間）
    const parentRow = sheet.getRow(2);
    expect(parentRow.getCell(1).value).toBe('1');
    expect(parentRow.getCell(2).value).toBe('設計');
    expect(parentRow.getCell(7).value).toBe('50%');
    expect(parentRow.getCell(6).value).toBe('進行中');

    const childRow = sheet.getRow(3);
    expect(childRow.getCell(1).value).toBe('1.1');
    // 階層は行頭スペースで表現する
    expect(childRow.getCell(2).value).toBe('    基本設計');
    expect(childRow.getCell(7).value).toBe('100%');
    expect(childRow.getCell(11).value).toBe('2026-05-12');
    expect(childRow.getCell(12).value).toBe('2026-05-14');
    expect(childRow.getCell(13).value).toBe(3);
  });

  it('adds one column per day in the timeline range', async () => {
    const { workbook } = await buildAndLoad();
    const sheet = workbook.getWorksheet('Gantt Chart')!;
    const columnCount = sheet.columnCount;
    // 固定 13 列 + 日付列（2026-05-11 〜 2026-05-22 = 12 日）
    expect(columnCount).toBe(13 + 12);
    const headers = (sheet.getRow(1).values as unknown[]).slice(14);
    expect(headers).toHaveLength(12);
    expect(headers.every((value) => value !== undefined && value !== null)).toBe(true);
  });
});
