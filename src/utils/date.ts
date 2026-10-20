import { addDays, format, isValid, parseISO } from 'date-fns';
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

/**
 * 実績期間（稼働日数）を導出する。
 * 実績開始日が無ければ 0。実績終了日が無い（進行中）場合は開始日の 1 日分。
 * 終了日が開始日より前の場合は 0。
 */
export function getActualDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  calendar: WorkCalendar
): number {
  if (!start) return 0;
  const startDate = parseISO(start);
  if (!isValid(startDate)) return 0;

  const endDate = end ? parseISO(end) : startDate;
  if (!isValid(endDate) || endDate < startDate) return 0;

  return getWorkDaysCount(startDate, endDate, calendar);
}

/** 予定期間（稼働日数）を予定開始日・予定終了日から導出する。開始が無ければ 0。 */
export function getPlanDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  calendar: WorkCalendar
): number {
  return getActualDuration(start, end, calendar);
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

export interface ParseInputDateOptions {
  /**
   * MM/DD 入力の結果がこの日付より前なら翌年として解釈する（終了日向け）。
   * 明示的に年を入力した場合は適用しない。
   */
  notBefore?: string | null;
  /**
   * MM/DD 入力の結果がこの日付より後なら前年として解釈する
   * （開始日が空のとき、終了日を追い越さないようにするため）。
   * 明示的に年を入力した場合は適用しない。
   */
  notAfter?: string | null;
}

function getIsoYear(dateString: string): number | null {
  const match = dateString.match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 年を補った MM/DD を、notBefore / notAfter の範囲に収まる年で解決する。
 * 2/29 など、年を動かすと存在しない日付になる場合は null を返す。
 */
function resolveMonthDay(
  month: number,
  day: number,
  referenceYear: number,
  options: ParseInputDateOptions
): string | null {
  const build = (year: number) =>
    isValidDate(year, month, day) ? formatDateString(year, month, day) : null;

  let resolved = build(referenceYear);
  if (!resolved) return null;

  if (options.notBefore) {
    if (resolved < options.notBefore) {
      const boundaryYear = getIsoYear(options.notBefore);
      if (boundaryYear === null) return null;
      resolved =
        build(boundaryYear) ??
        build(boundaryYear + 1);
      if (!resolved) return null;
      if (resolved < options.notBefore) {
        resolved = build(boundaryYear + 1);
      }
    }
  } else if (options.notAfter) {
    if (resolved > options.notAfter) {
      const boundaryYear = getIsoYear(options.notAfter);
      if (boundaryYear === null) return null;
      resolved =
        build(boundaryYear) ??
        build(boundaryYear - 1);
      if (!resolved) return null;
      if (resolved > options.notAfter) {
        resolved = build(boundaryYear - 1);
      }
    }
  }

  return resolved;
}

export function parseInputDate(
  text: string,
  referenceDateString?: string | null,
  options: ParseInputDateOptions = {}
): string | null {
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
    const refYearFromReference = getIsoYear(referenceDateString);
    if (refYearFromReference !== null) {
      refYear = refYearFromReference;
    }
  }

  // 3. Check MM/DD or MM-DD
  match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    return resolveMonthDay(month, day, refYear, options);
  }

  // 4. Check MMDD
  match = trimmed.match(/^(\d{2})(\d{2})$/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    return resolveMonthDay(month, day, refYear, options);
  }

  return null;
}

/**
 * 厳密な `YYYY-MM-DD` 文字列だけを受け付け、正規化した文字列を返す。
 * それ以外（型違い・別フォーマット・実在しない日付）は null を返す。
 * 曜日判定はここで個別実装せず、`isValidDate` に委譲する。
 */
export function parseIsoDateStrict(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  return isValidDate(year, month, day) ? formatDateString(year, month, day) : null;
}

export function formatToShow(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  // Return MM/DD
  return `${match[2]}/${match[3]}`;
}

/**
 * インライン編集時の表示形式。表示と同じ MM/DD に揃え、
 * 入力欄の幅を 5 文字分に収める（年はツールチップ / カレンダーで補う）。
 */
export function formatToEdit(dateStr: string | null | undefined): string {
  return formatToShow(dateStr);
}

/** ツールチップや aria-label 用のフル日付（YYYY/MM/DD）。 */
export function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[1]}/${match[2]}/${match[3]}`;
}

