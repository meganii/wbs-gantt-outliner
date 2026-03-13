import ExcelJS from 'exceljs';
import { addDays, differenceInDays, format, isValid, parseISO, isBefore, isAfter } from 'date-fns';
import type { Task, ProjectConfig } from '../types';
import { flattenTree } from './tree';
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
  const flattened = flattenTree(tasks, rootIds);
  
  // 1. Calculate Date Range
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  flattened.forEach(({ task }) => {
    if (task.startDate) {
      const d = parseISO(task.startDate);
      if (isValid(d)) {
        if (!minDate || isBefore(d, minDate)) minDate = d;
        if (!maxDate || isAfter(d, maxDate)) maxDate = d;
      }
    }
    if (task.endDate) {
      const d = parseISO(task.endDate);
      if (isValid(d)) {
         if (!minDate || isBefore(d, minDate)) minDate = d;
         if (!maxDate || isAfter(d, maxDate)) maxDate = d;
      }
    }
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

  // 3. Define Columns
  // Fixed columns
  const fixedColumns = [
    { header: 'WBS', key: 'wbs', width: 40 },
    { header: 'Start Date', key: 'startDate', width: 12 },
    { header: 'End Date', key: 'endDate', width: 12 },
    { header: 'Duration', key: 'duration', width: 10 },
    { header: 'Progress', key: 'progress', width: 10 },
  ];

  // Date columns
  const dateColumns: Partial<ExcelJS.Column>[] = [];
  for (let i = 0; i < totalDays; i++) {
    const current = addDays(rangeStart, i);
    // Use format to keep keys simple, e.g., '2023-10-01'
    const key = format(current, 'yyyy-MM-dd');
    dateColumns.push({
      header: format(current, 'd'), // Show day number in header
      key: key,
      width: 3 // Narrow columns for chart
    });
  }

  worksheet.columns = [...fixedColumns, ...dateColumns];

  // 4. Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  // Style Date Column Headers (colors for weekends/holidays)
  for (let i = 0; i < totalDays; i++) {
    const current = addDays(rangeStart, i);
    const colIndex = fixedColumns.length + 1 + i;
    const cell = headerRow.getCell(colIndex);

    // Add Month/Year info to tooltip or maybe a row above?
    // For now, let's just color the header cell if it's a holiday/weekend
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

  // 5. Populate Data
  flattened.forEach(({ task, depth }, rowIndex) => {
    // Row index in excel is 1-based, header is 1, so data starts at 2 + rowIndex
    const actualRowIndex = rowIndex + 2;
    const row = worksheet.getRow(actualRowIndex);

    // Indentation for WBS
    const indent = '    '.repeat(depth);
    row.getCell('wbs').value = indent + task.title;
    row.getCell('wbs').alignment = { horizontal: 'left' }; // explicit left

    row.getCell('startDate').value = task.startDate;
    row.getCell('endDate').value = task.endDate;
    row.getCell('duration').value = task.duration;
    row.getCell('progress').value = task.progress + '%';

    // Gantt Chart Bars
    if (task.startDate && task.endDate) {
      const taskStart = parseISO(task.startDate);
      const taskEnd = parseISO(task.endDate);

      if (isValid(taskStart) && isValid(taskEnd)) {
        // Iterate through date columns
        for (let i = 0; i < totalDays; i++) {
          const current = addDays(rangeStart, i);

          // Check if current day is within task range (inclusive)
          // Using strict comparison for days
          if (
            (isAfter(current, taskStart) || current.getTime() === taskStart.getTime()) &&
            (isBefore(current, taskEnd) || current.getTime() === taskEnd.getTime())
          ) {
            const colIndex = fixedColumns.length + 1 + i;
            const cell = row.getCell(colIndex);

            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF3B82F6' } // Blue-500 equivalent
            };
          }
        }
      }
    }

    // Apply weekend/holiday background for empty cells in this row too
    for (let i = 0; i < totalDays; i++) {
        const current = addDays(rangeStart, i);
        const colIndex = fixedColumns.length + 1 + i;
        const cell = row.getCell(colIndex);

        const isWeekendDay = current.getDay() === 0 || current.getDay() === 6;
        const isHolidayDay = isHoliday(current, projectConfig.calendar);

        // Only color if not already colored by task bar
        // Note: ExcelJS fill object is null/undefined if no fill
        if ((isWeekendDay || isHolidayDay) && !cell.fill) {
             cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF5F5F5' } // Very Light Gray for body
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
