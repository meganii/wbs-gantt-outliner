import { addDays, isWeekend, format } from 'date-fns';

export function isHoliday(date: Date, holidays: string[]): boolean {
  const dateString = format(date, 'yyyy-MM-dd');
  return holidays.includes(dateString);
}

export function isWorkDay(date: Date, holidays: string[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

export function addWorkDays(startDate: Date, days: number, holidays: string[]): Date {
  let count = 0;
  let currentDate = startDate;
  
  // If days is 0 or negative, we might simple return start date or handle backwards.
  // Assuming duration >= 1 usually. If duration is 1, it means START date is the only work day.
  // So adding 0 work days = same day.
  // Adding N work days = finding the Nth workday after start (exclusive? or inclusive of duration?)
  // Task duration usually includes start date. duration 1 = start date only.
  // So we often need to find the End Date given Start Date + Duration.
  // EndDate = StartDate + (Duration - 1) work days.
  
  // Let's implement `calculateEndDate` instead of generic `addWorkDays` to be precise.
  // But keeping generic is good. 
  // Let's say `days` is "number of ADDITIONAL work days to add".
  
  while (count < days) {
    currentDate = addDays(currentDate, 1);
    if (isWorkDay(currentDate, holidays)) {
      count++;
    }
  }
  return currentDate;
}

export function calculateEndDate(startDate: Date, duration: number, holidays: string[]): Date {
  if (duration <= 1) return startDate;
  return addWorkDays(startDate, duration - 1, holidays);
}

export function getWorkDaysCount(start: Date, end: Date, holidays: string[]): number {
  let count = 0;
  let current = start;
  // Naive loop is fine for project durations (usually < 1000 days).
  while (current <= end) {
    if (isWorkDay(current, holidays)) {
      count++;
    }
    current = addDays(current, 1);
  }
  return count;
}
