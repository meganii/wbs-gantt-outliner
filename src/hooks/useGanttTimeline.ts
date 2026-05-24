import { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  addMonths,
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

export interface TimelineMetrics {
  timelineStart: Date;
  timelineEnd: Date;
  totalDays: number;
  totalWidth: number;
  pixelsPerDay: number;
}

export const useGanttTimeline = () => {
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const calendar = useTaskStore((state) => state.projectConfig.calendar);

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
    switch (viewMode) {
      case 'Week': {
        const start = startOfWeek(addMonths(today, -6), { weekStartsOn: 1 });
        const end = endOfWeek(addMonths(today, 12), { weekStartsOn: 1 });
        return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      }
      case 'Month': {
        const start = startOfMonth(addYears(today, -1));
        const end = endOfMonth(addYears(today, 2));
        return eachMonthOfInterval({ start, end });
      }
      case 'Year': {
        const start = startOfYear(addYears(today, -5));
        const end = endOfYear(addYears(today, 10));
        return eachYearOfInterval({ start, end });
      }
      case 'Day':
      default: {
        const start = startOfWeek(addMonths(today, -1), { weekStartsOn: 1 });
        const end = endOfWeek(addMonths(today, 3), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
      }
    }
  }, [viewMode]);

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
