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

export function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function formatDateString(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseInputDate(text: string, referenceDateString?: string | null): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Check YYYY/MM/DD or YYYY-MM-DD
  let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    return isValidDate(year, month, day) ? formatDateString(year, month, day) : null;
  }

  // 2. Check YYYYMMDD
  match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    return isValidDate(year, month, day) ? formatDateString(year, month, day) : null;
  }

  // Determine reference year
  let refYear = new Date().getFullYear();
  if (referenceDateString) {
    const refMatch = referenceDateString.match(/^(\d{4})-\d{2}-\d{2}$/);
    if (refMatch) {
      refYear = parseInt(refMatch[1], 10);
    }
  }

  // 3. Check MM/DD or MM-DD
  match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    return isValidDate(refYear, month, day) ? formatDateString(refYear, month, day) : null;
  }

  // 4. Check MMDD
  match = trimmed.match(/^(\d{2})(\d{2})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    return isValidDate(refYear, month, day) ? formatDateString(refYear, month, day) : null;
  }

  return null;
}

export function formatToShow(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  // Return MM/DD
  return `${match[2]}/${match[3]}`;
}

export function formatToEdit(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  // Return YYYY/MM/DD
  return `${match[1]}/${match[2]}/${match[3]}`;
}

