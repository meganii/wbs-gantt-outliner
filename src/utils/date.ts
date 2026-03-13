import { addDays, format } from 'date-fns';
import type { WorkCalendar } from '../types';

export function isHoliday(date: Date, calendar: WorkCalendar): boolean {
  const dateString = format(date, 'yyyy-MM-dd');
  return calendar.holidays.includes(dateString);
}

export function isWorkDay(date: Date, calendar: WorkCalendar): boolean {
  return calendar.workDays.includes(date.getDay()) && !isHoliday(date, calendar);
}

export function addWorkDays(startDate: Date, days: number, calendar: WorkCalendar): Date {
  let count = 0;
  let currentDate = startDate;

  while (count < days) {
    currentDate = addDays(currentDate, 1);
    if (isWorkDay(currentDate, calendar)) {
      count++;
    }
  }
  return currentDate;
}

export function calculateEndDate(startDate: Date, duration: number, calendar: WorkCalendar): Date {
  if (duration <= 1) return startDate;
  return addWorkDays(startDate, duration - 1, calendar);
}

export function getWorkDaysCount(start: Date, end: Date, calendar: WorkCalendar): number {
  let count = 0;
  let current = start;
  while (current <= end) {
    if (isWorkDay(current, calendar)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
}
