import { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { Task } from '../types';

export interface TimelineMetrics {
  timelineStart: Date;
  timelineEnd: Date;
  totalDays: number;
  totalWidth: number;
  pixelsPerDay: number;
}

/** タスク群から最小開始日・最大終了日を取得する */
function getTaskDateRange(tasks: Record<string, Task>): { minDate: Date | null; maxDate: Date | null } {
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const task of Object.values(tasks)) {
    const dates = [task.startDate, task.endDate, task.planStartDate, task.planEndDate];
    for (const d of dates) {
      if (!d) continue;
      const date = new Date(d);
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
  }
  return { minDate, maxDate };
}

export const useGanttTimeline = () => {
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const calendar = useTaskStore((state) => state.projectConfig.calendar);
  const tasks = useTaskStore((state) => state.tasks);
  const timelineRangeConfig = useTaskStore((state) => state.projectConfig.timelineRange);

  const cellWidth = useMemo(() => {
    switch (viewMode) {
      case 'Week':
        return 100;
      case 'Month':
        return 200;
      case 'Year':
        return 400;
      case 'Day':
      default:
        return 40;
    }
  }, [viewMode]);

  const timeRange = useMemo(() => {
    const today = new Date();

    // 手動指定がある場合は最優先
    if (timelineRangeConfig?.start && timelineRangeConfig?.end) {
      const start = new Date(timelineRangeConfig.start);
      const end = new Date(timelineRangeConfig.end);
      switch (viewMode) {
        case 'Week':
          return eachWeekOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end: endOfWeek(end, { weekStartsOn: 1 }) }, { weekStartsOn: 1 });
        case 'Month':
          return eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) });
        case 'Year':
          return eachYearOfInterval({ start: startOfYear(start), end: endOfYear(end) });
        case 'Day':
        default:
          return eachDayOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end: endOfWeek(end, { weekStartsOn: 1 }) });
      }
    }

    // タスクデータから日付範囲を計算
    const { minDate, maxDate } = getTaskDateRange(tasks);

    switch (viewMode) {
      case 'Week': {
        const base = minDate && maxDate ? { min: minDate, max: maxDate } : null;
        const start = startOfWeek(base ? addMonths(base.min, -1) : addMonths(today, -6), { weekStartsOn: 1 });
        const end = endOfWeek(base ? addMonths(base.max, 1) : addMonths(today, 12), { weekStartsOn: 1 });
        return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      }
      case 'Month': {
        const base = minDate && maxDate ? { min: minDate, max: maxDate } : null;
        const start = startOfMonth(base ? addMonths(base.min, -3) : addYears(today, -1));
        const end = endOfMonth(base ? addMonths(base.max, 3) : addYears(today, 2));
        return eachMonthOfInterval({ start, end });
      }
      case 'Year': {
        const base = minDate && maxDate ? { min: minDate, max: maxDate } : null;
        const start = startOfYear(base ? addYears(base.min, -1) : addYears(today, -5));
        const end = endOfYear(base ? addYears(base.max, 1) : addYears(today, 10));
        return eachYearOfInterval({ start, end });
      }
      case 'Day':
      default: {
        const base = minDate && maxDate ? { min: minDate, max: maxDate } : null;
        const start = startOfWeek(base ? addWeeks(base.min, -2) : addMonths(today, -1), { weekStartsOn: 1 });
        const end = endOfWeek(base ? addWeeks(base.max, 2) : addMonths(today, 3), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
      }
    }
  }, [viewMode, tasks, timelineRangeConfig]);

  const timelineMetrics = useMemo((): TimelineMetrics => {
    const timelineStart = timeRange[0];
    if (!timelineStart) {
      return {
        timelineStart: new Date(),
        timelineEnd: new Date(),
        totalDays: 0,
        totalWidth: 0,
        pixelsPerDay: 0,
      };
    }

    let timelineEnd: Date;
    switch (viewMode) {
      case 'Week':
        timelineEnd = endOfWeek(timeRange[timeRange.length - 1], { weekStartsOn: 1 });
        break;
      case 'Month':
        timelineEnd = endOfMonth(timeRange[timeRange.length - 1]);
        break;
      case 'Year':
        timelineEnd = endOfYear(timeRange[timeRange.length - 1]);
        break;
      case 'Day':
      default:
        timelineEnd = timeRange[timeRange.length - 1];
        break;
    }

    const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
    const totalWidth = timeRange.length * cellWidth;
    const pixelsPerDay = totalDays > 0 ? totalWidth / totalDays : 0;

    return { timelineStart, timelineEnd, totalDays, totalWidth, pixelsPerDay };
  }, [timeRange, viewMode, cellWidth]);

  return {
    cellWidth,
    timeRange,
    timelineMetrics,
    viewMode,
    calendar,
  };
};
