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

export interface ExcelExportFile {
  buffer: Uint8Array;
  fileName: string;
}

export async function buildExcelExportFile({
  tasks,
  rootIds,
  projectConfig,
}: ExcelExportPayload): Promise<ExcelExportFile> {
  const flattened = flattenTreeAll(tasks, rootIds);

  // Bar & font colors
  const PLAN_COLOR = 'FF3B82F6';    // Blue-500  (予定)
  const ACTUAL_COLOR = 'FFF59E0B';  // Amber-500 (実績・見込)
  const PLAN_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FF2563EB' } };        // Blue-600
  const PLAN_FONT_BOLD: Partial<ExcelJS.Font> = { color: { argb: 'FF2563EB' }, bold: true };
  const ACTUAL_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFD97706' } };      // Amber-600
  const ACTUAL_FONT_BOLD: Partial<ExcelJS.Font> = { color: { argb: 'FFD97706' }, bold: true };

  // 1. Calculate Date Range (consider both plan AND actual dates)
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
    expandRange(task.planStartDate);
    expandRange(task.planEndDate);
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

  // 3. Define Columns — show both Plan and Actual date groups
  const fixedColumns = [
    { header: 'WBS No.', key: 'wbsNumber', width: 10 },
    { header: 'Task Name', key: 'wbs', width: 40 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Assignee', key: 'assignee', width: 15 },
    { header: 'Deliverables', key: 'deliverables', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Progress', key: 'progress', width: 10 },
    // Plan date columns (予定)
    { header: 'Plan Start', key: 'planStartDate', width: 12 },
    { header: 'Plan End', key: 'planEndDate', width: 12 },
    { header: 'Plan Dur.', key: 'planDuration', width: 10 },
    // Actual date columns (実績・見込)
    { header: 'Act. Start', key: 'actStartDate', width: 12 },
    { header: 'Act. End', key: 'actEndDate', width: 12 },
    { header: 'Act. Dur.', key: 'actDuration', width: 10 },
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

  // Color Plan header columns in blue
  const planHeaderKeys = ['planStartDate', 'planEndDate', 'planDuration'];
  planHeaderKeys.forEach(key => {
    const col = fixedColumns.findIndex(c => c.key === key);
    if (col >= 0) headerRow.getCell(col + 1).font = PLAN_FONT_BOLD;
  });

  // Color Actual header columns in orange
  const actHeaderKeys = ['actStartDate', 'actEndDate', 'actDuration'];
  actHeaderKeys.forEach(key => {
    const col = fixedColumns.findIndex(c => c.key === key);
    if (col >= 0) headerRow.getCell(col + 1).font = ACTUAL_FONT_BOLD;
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

    // --- Plan dates (blue) ---
    row.getCell('planStartDate').value = task.planStartDate || '';
    row.getCell('planEndDate').value = task.planEndDate || '';
    row.getCell('planDuration').value = task.planDuration ?? '';
    row.getCell('planStartDate').font = PLAN_FONT;
    row.getCell('planEndDate').font = PLAN_FONT;
    row.getCell('planDuration').font = PLAN_FONT;

    // --- Actual dates (orange) ---
    row.getCell('actStartDate').value = task.startDate || '';
    row.getCell('actEndDate').value = task.endDate || '';
    row.getCell('actDuration').value = task.duration ?? '';
    row.getCell('actStartDate').font = ACTUAL_FONT;
    row.getCell('actEndDate').font = ACTUAL_FONT;
    row.getCell('actDuration').font = ACTUAL_FONT;

    // --- Gantt Chart Bars ---
    // Draw plan bar (blue) first, then actual bar (orange) on top
    // This means if both overlap, actual (orange) takes visual priority

    const hasPlan = !!(task.planStartDate && task.planEndDate);
    const hasActual = !!(task.startDate && task.endDate);

    if (hasPlan) {
      const planStart = parseISO(task.planStartDate!);
      const planEnd = parseISO(task.planEndDate!);
      if (isValid(planStart) && isValid(planEnd)) {
        for (let i = 0; i < totalDays; i++) {
          const current = addDays(rangeStart, i);
          if (isInRange(current, planStart, planEnd)) {
            const colIndex = fixedColumns.length + 1 + i;
            const cell = row.getCell(colIndex);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: PLAN_COLOR }
            };
          }
        }
      }
    }

    if (hasActual) {
      const actStart = parseISO(task.startDate!);
      const actEnd = parseISO(task.endDate!);
      if (isValid(actStart) && isValid(actEnd)) {
        for (let i = 0; i < totalDays; i++) {
          const current = addDays(rangeStart, i);
          if (isInRange(current, actStart, actEnd)) {
            const colIndex = fixedColumns.length + 1 + i;
            const cell = row.getCell(colIndex);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: ACTUAL_COLOR }
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

  // 6. Generate and Download
  const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());

  return {
    buffer,
    fileName: `project_gantt_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`,
  };
}
