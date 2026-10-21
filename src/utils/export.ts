import ExcelJS from 'exceljs';
import { addDays, differenceInDays, format, isValid, parseISO, isBefore, isAfter } from 'date-fns';
import type { Task, ProjectConfig } from '../types';
import { flattenTreeAll } from './tree';
import { isHoliday } from './date';

export interface ExcelExportPayload {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
}

/**
 * Excel ブックを生成して `Uint8Array` で返す。
 *
 * ファイル名の生成（`excelExportFileName`）と分離しているのは、保存先ピッカーを
 * 生成より先に開く必要があるため。呼び出し側は `src/utils/fileNames.ts` を使う。
 */
export async function buildExcelExportBuffer({
  tasks,
  rootIds,
  projectConfig,
}: ExcelExportPayload): Promise<Uint8Array> {
  const flattened = flattenTreeAll(tasks, rootIds);

  // Bar & font colors
  const SCHEDULE_COLOR = 'FF3B82F6';  // Blue-500  (現在の日程)
  const BASELINE_COLOR = 'FFF59E0B';  // Amber-500 (基準計画)
  const SCHEDULE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF2563EB' } };        // Blue-600
  const BASELINE_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFD97706' } };        // Amber-600
  const BASELINE_FONT_BOLD: Partial<ExcelJS.Font> = { color: { argb: 'FFD97706' }, bold: true };

  // 1. Calculate Date Range (current schedule + baseline)
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  const expandRange = (dateStr: string | null | undefined) => {
    if (!dateStr) return;
    const d = parseISO(dateStr);
    if (!isValid(d)) return;
    if (!minDate || isBefore(d, minDate)) minDate = d;
    if (!maxDate || isAfter(d, maxDate)) maxDate = d;
  };

  flattened.forEach(({ task }) => {
    expandRange(task.startDate);
    expandRange(task.endDate);
    expandRange(task.baselineStartDate);
    expandRange(task.baselineEndDate);
  });

  // Default range if no dates found
  if (!minDate) minDate = new Date();
  if (!maxDate) maxDate = addDays(minDate, 30);

  // Add some buffer
  const rangeStart = minDate;
  const rangeEnd = addDays(maxDate, 7); // +7 days buffer

  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;

  // 2. Create Workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Gantt Chart');

  // 3. Define Columns — 現在の日程 1 組 + 基準計画 1 組 + 進捗率
  const fixedColumns = [
    { header: 'WBS番号', key: 'wbsNumber', width: 10 },
    { header: '項目名', key: 'wbs', width: 40 },
    { header: '説明', key: 'description', width: 40 },
    { header: '担当者', key: 'assignee', width: 15 },
    { header: '成果物', key: 'deliverables', width: 25 },
    { header: '状態', key: 'status', width: 15 },
    { header: '進捗率', key: 'progress', width: 10 },
    // Current schedule (現在の日程)
    { header: '開始日', key: 'startDate', width: 12 },
    { header: '終了日', key: 'endDate', width: 12 },
    { header: '期間', key: 'duration', width: 10 },
    // Baseline plan (基準計画)
    { header: '基準開始日', key: 'baselineStartDate', width: 12 },
    { header: '基準終了日', key: 'baselineEndDate', width: 12 },
    { header: '基準期間', key: 'baselineDuration', width: 10 },
  ];

  // Date columns for Gantt area
  const dateColumns: Partial<ExcelJS.Column>[] = [];
  for (let i = 0; i < totalDays; i++) {
    const current = addDays(rangeStart, i);
    const key = format(current, 'yyyy-MM-dd');
    dateColumns.push({
      header: format(current, 'd'),
      key: key,
      width: 3
    });
  }

  worksheet.columns = [...fixedColumns, ...dateColumns];

  // 4. Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  // Color Baseline header columns in amber
  const baselineHeaderKeys = ['baselineStartDate', 'baselineEndDate', 'baselineDuration'];
  baselineHeaderKeys.forEach(key => {
    const col = fixedColumns.findIndex(c => c.key === key);
    if (col >= 0) headerRow.getCell(col + 1).font = BASELINE_FONT_BOLD;
  });

  // Style Date Column Headers (colors for weekends/holidays)
  for (let i = 0; i < totalDays; i++) {
    const current = addDays(rangeStart, i);
    const colIndex = fixedColumns.length + 1 + i;
    const cell = headerRow.getCell(colIndex);

    const isWeekendDay = current.getDay() === 0 || current.getDay() === 6;
    const isHolidayDay = isHoliday(current, projectConfig.calendar);

    if (isWeekendDay || isHolidayDay) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' } // Light Gray
      };
    }
  }

  // Helper: check if a day falls within a date range (inclusive)
  const isInRange = (day: Date, start: Date, end: Date) =>
    (isAfter(day, start) || day.getTime() === start.getTime()) &&
    (isBefore(day, end) || day.getTime() === end.getTime());

  // 5. Populate Data
  flattened.forEach(({ task, depth, wbsNumber }, rowIndex) => {
    const actualRowIndex = rowIndex + 2;
    const row = worksheet.getRow(actualRowIndex);

    // WBS Number
    row.getCell('wbsNumber').value = wbsNumber;
    row.getCell('wbsNumber').alignment = { horizontal: 'left' };

    // Indentation for Task Name
    const indent = '    '.repeat(depth);
    row.getCell('wbs').value = indent + task.title;
    row.getCell('wbs').alignment = { horizontal: 'left' };

    row.getCell('description').value = task.description || '';
    row.getCell('assignee').value = task.assignee || '';
    row.getCell('deliverables').value = task.deliverables || '';
    row.getCell('status').value = task.status || '';
    row.getCell('progress').value = task.progress + '%';

    // --- Current schedule (blue) ---
    row.getCell('startDate').value = task.startDate || '';
    row.getCell('endDate').value = task.endDate || '';
    row.getCell('duration').value = task.duration ?? '';
    row.getCell('startDate').font = SCHEDULE_FONT;
    row.getCell('endDate').font = SCHEDULE_FONT;
    row.getCell('duration').font = SCHEDULE_FONT;

    // --- Baseline plan (amber) ---
    row.getCell('baselineStartDate').value = task.baselineStartDate || '';
    row.getCell('baselineEndDate').value = task.baselineEndDate || '';
    row.getCell('baselineDuration').value = task.baselineDuration ?? '';
    row.getCell('baselineStartDate').font = BASELINE_FONT;
    row.getCell('baselineEndDate').font = BASELINE_FONT;
    row.getCell('baselineDuration').font = BASELINE_FONT;

    // --- Gantt Chart Bars ---
    // 基準（アンバー）を先に描き、現在の日程（青）を上に重ねる。
    // 両方が重なる場合は現在の日程（青）が視覚的に優先される。

    const hasSchedule = !!(task.startDate && task.endDate);
    const hasBaselineDates = !!(task.baselineStartDate && task.baselineEndDate);

    if (hasBaselineDates) {
      const bStart = parseISO(task.baselineStartDate!);
      const bEnd = parseISO(task.baselineEndDate!);
      if (isValid(bStart) && isValid(bEnd)) {
        for (let i = 0; i < totalDays; i++) {
          const current = addDays(rangeStart, i);
          if (isInRange(current, bStart, bEnd)) {
            const colIndex = fixedColumns.length + 1 + i;
            const cell = row.getCell(colIndex);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: BASELINE_COLOR }
            };
          }
        }
      }
    }

    if (hasSchedule) {
      const sStart = parseISO(task.startDate!);
      const sEnd = parseISO(task.endDate!);
      if (isValid(sStart) && isValid(sEnd)) {
        for (let i = 0; i < totalDays; i++) {
          const current = addDays(rangeStart, i);
          if (isInRange(current, sStart, sEnd)) {
            const colIndex = fixedColumns.length + 1 + i;
            const cell = row.getCell(colIndex);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: SCHEDULE_COLOR }
            };
          }
        }
      }
    }

    // Apply weekend/holiday background for empty cells in this row
    for (let i = 0; i < totalDays; i++) {
      const current = addDays(rangeStart, i);
      const colIndex = fixedColumns.length + 1 + i;
      const cell = row.getCell(colIndex);

      const isWeekendDay = current.getDay() === 0 || current.getDay() === 6;
      const isHolidayDay = isHoliday(current, projectConfig.calendar);

      if ((isWeekendDay || isHolidayDay) && !cell.fill) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' }
        };
      }
    }
  });

  // 6. Generate
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
