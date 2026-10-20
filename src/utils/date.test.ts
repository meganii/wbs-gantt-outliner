import { describe, it, expect } from 'vitest';
import { isHoliday, isWorkDay, addWorkDays, calculateEndDate, getWorkDaysCount, formatToShow, formatToEdit, formatFullDate, parseInputDate, parseIsoDateStrict } from './date';


describe('date utils', () => {
  const calendar = {
    workDays: [1, 2, 3, 4, 5],
    holidays: ['2024-01-01', '2024-05-05'],
  };

  describe('isHoliday', () => {
    it('should return true for a holiday', () => {
      expect(isHoliday(new Date('2024-01-01'), calendar)).toBe(true);
    });

    it('should return false for a non-holiday', () => {
      expect(isHoliday(new Date('2024-01-02'), calendar)).toBe(false);
    });
  });

  describe('isWorkDay', () => {
    it('should return true for a weekday that is not a holiday', () => {
      // 2024-01-02 is a Tuesday
      expect(isWorkDay(new Date('2024-01-02'), calendar)).toBe(true);
    });

    it('should return false for a weekend day', () => {
      // 2024-01-06 is a Saturday
      expect(isWorkDay(new Date('2024-01-06'), calendar)).toBe(false);
    });

    it('should return false for a weekday that is a holiday', () => {
      // 2024-01-01 is a Monday and a holiday
      expect(isWorkDay(new Date('2024-01-01'), calendar)).toBe(false);
    });

    it('should respect custom work day settings', () => {
      const sundayCalendar = {
        workDays: [0, 1, 2, 3, 4],
        holidays: [],
      };
      expect(isWorkDay(new Date('2024-01-07'), sundayCalendar)).toBe(true);
      expect(isWorkDay(new Date('2024-01-05'), sundayCalendar)).toBe(false);
    });
  });

  describe('addWorkDays', () => {
    it('should add work days correctly without crossing weekends or holidays', () => {
      const startDate = new Date('2024-01-02'); // Tuesday
      const result = addWorkDays(startDate, 2, calendar);
      expect(result).toEqual(new Date('2024-01-04')); // Thursday
    });

    it('should skip weekends', () => {
      const startDate = new Date('2024-01-05'); // Friday
      const result = addWorkDays(startDate, 1, calendar);
      expect(result).toEqual(new Date('2024-01-08')); // Monday
    });

    it('should skip holidays', () => {
        const startDate = new Date('2023-12-29'); // Friday
        const result = addWorkDays(startDate, 2, calendar); // 2024-01-01 is holiday
        expect(result).toEqual(new Date('2024-01-03')); // Wednesday
    });

    it('should return the same date if 0 days are added', () => {
      const startDate = new Date('2024-01-02');
      const result = addWorkDays(startDate, 0, calendar);
      expect(result).toEqual(startDate);
    });
  });

  describe('calculateEndDate', () => {
    it('should return the start date if duration is 1', () => {
      const startDate = new Date('2024-01-02');
      const result = calculateEndDate(startDate, 1, calendar);
      expect(result).toEqual(startDate);
    });

    it('should calculate the correct end date skipping weekends', () => {
      const startDate = new Date('2024-01-05'); // Friday
      const result = calculateEndDate(startDate, 3, calendar); // Fri, Mon, Tue
      expect(result).toEqual(new Date('2024-01-09')); // Tuesday
    });

    it('should calculate the correct end date skipping holidays', () => {
        const startDate = new Date('2023-12-29'); // Friday
        const result = calculateEndDate(startDate, 3, calendar); // Fri, Tue, Wed
        expect(result).toEqual(new Date('2024-01-03')); // Wednesday
    });
  });

  describe('getWorkDaysCount', () => {
    it('should return the correct count for a period with only weekdays', () => {
        const start = new Date('2024-01-02'); // Tue
        const end = new Date('2024-01-04'); // Thu
        expect(getWorkDaysCount(start, end, calendar)).toBe(3);
    });

    it('should return the correct count for a period including weekends', () => {
        const start = new Date('2024-01-05'); // Fri
        const end = new Date('2024-01-08'); // Mon
        expect(getWorkDaysCount(start, end, calendar)).toBe(2); // Fri, Mon
    });

    it('should return the correct count for a period including holidays', () => {
        const start = new Date('2023-12-29'); // Fri
        const end = new Date('2024-01-02'); // Tue
        expect(getWorkDaysCount(start, end, calendar)).toBe(2); // Fri, Tue (Mon is holiday)
    });
  });

  describe('formatting and parsing', () => {
    describe('formatToShow', () => {
      it('should format YYYY-MM-DD to MM/DD', () => {
        expect(formatToShow('2026-06-10')).toBe('06/10');
        expect(formatToShow('')).toBe('');
        expect(formatToShow(null)).toBe('');
        expect(formatToShow(undefined)).toBe('');
      });
    });

    describe('formatToEdit', () => {
      it('should format YYYY-MM-DD to MM/DD (same as the display format)', () => {
        expect(formatToEdit('2026-06-10')).toBe('06/10');
        expect(formatToEdit('')).toBe('');
      });
    });

    describe('formatFullDate', () => {
      it('should format YYYY-MM-DD to YYYY/MM/DD', () => {
        expect(formatFullDate('2026-06-10')).toBe('2026/06/10');
        expect(formatFullDate('')).toBe('');
      });
    });

    describe('parseInputDate', () => {
      it('should parse YYYY/MM/DD and YYYY-MM-DD correctly', () => {
        expect(parseInputDate('2026/06/10')).toBe('2026-06-10');
        expect(parseInputDate('2026-06-10')).toBe('2026-06-10');
        expect(parseInputDate('2026/6/5')).toBe('2026-06-05');
      });

      it('should parse YYYYMMDD correctly', () => {
        expect(parseInputDate('20260610')).toBe('2026-06-10');
      });

      it('should parse MM/DD and MM-DD using reference year', () => {
        expect(parseInputDate('06/10', '2026-05-15')).toBe('2026-06-10');
        expect(parseInputDate('06-10', '2025-01-01')).toBe('2025-06-10');
        expect(parseInputDate('6/5', '2026-05-15')).toBe('2026-06-05');
      });

      it('should parse MMDD using reference year', () => {
        expect(parseInputDate('0610', '2026-05-15')).toBe('2026-06-10');
      });

      it('should use current year if no reference year is provided', () => {
        const currentYear = new Date().getFullYear();
        expect(parseInputDate('06/10')).toBe(`${currentYear}-06-10`);
      });

      it('should return null for invalid dates', () => {
        expect(parseInputDate('2026/02/30')).toBeNull();
        expect(parseInputDate('02/30', '2026-01-01')).toBeNull();
        expect(parseInputDate('13/10')).toBeNull();
        expect(parseInputDate('invalid')).toBeNull();
        expect(parseInputDate('')).toBeNull();
      });

      it('should roll a month/day to the next year when it is before notBefore', () => {
        expect(
          parseInputDate('01/05', '2026-12-30', { notBefore: '2026-12-30' })
        ).toBe('2027-01-05');
        expect(
          parseInputDate('12/31', '2026-01-01', { notBefore: '2026-12-30' })
        ).toBe('2026-12-31');
      });

      it('should roll a month/day to the previous year when it is after notAfter', () => {
        expect(
          parseInputDate('12/31', '2027-01-05', { notAfter: '2027-01-05' })
        ).toBe('2026-12-31');
        expect(
          parseInputDate('01/10', '2027-01-05', { notAfter: '2027-01-05' })
        ).toBe('2026-01-10');
      });

      it('should not roll an explicitly-year-specified date', () => {
        expect(
          parseInputDate('2026/01/05', '2026-12-30', { notBefore: '2026-12-30' })
        ).toBe('2026-01-05');
      });
    });

    describe('parseIsoDateStrict', () => {
      it('should accept strict YYYY-MM-DD dates', () => {
        expect(parseIsoDateStrict('2026-06-10')).toBe('2026-06-10');
        expect(parseIsoDateStrict('2024-02-29')).toBe('2024-02-29'); // leap year
      });

      it('should reject non-strings and other formats', () => {
        expect(parseIsoDateStrict(20260610)).toBeNull();
        expect(parseIsoDateStrict('2026/06/10')).toBeNull();
        expect(parseIsoDateStrict('2026-6-5')).toBeNull();
        expect(parseIsoDateStrict('abc')).toBeNull();
        expect(parseIsoDateStrict('')).toBeNull();
        expect(parseIsoDateStrict(null)).toBeNull();
        expect(parseIsoDateStrict(undefined)).toBeNull();
      });

      it('should reject non-existent dates', () => {
        expect(parseIsoDateStrict('2026-13-45')).toBeNull();
        expect(parseIsoDateStrict('2026-02-30')).toBeNull();
        expect(parseIsoDateStrict('2025-02-29')).toBeNull(); // not a leap year
      });
    });
  });
});
