import { describe, it, expect } from 'vitest';
import { mergeProjectConfig, DEFAULT_PROJECT_CONFIG } from './projectConfig';

describe('mergeProjectConfig', () => {
  it('falls back to defaults when nothing is provided', () => {
    expect(mergeProjectConfig(undefined)).toEqual(DEFAULT_PROJECT_CONFIG);
    expect(mergeProjectConfig(null)).toEqual(DEFAULT_PROJECT_CONFIG);
    expect(mergeProjectConfig('nonsense')).toEqual(DEFAULT_PROJECT_CONFIG);
  });

  it('merges partial config over the defaults', () => {
    const result = mergeProjectConfig({
      viewMode: 'Month',
      columnWidths: { taskName: 320 },
      calendar: { workDays: [0, 1, 2, 3, 4] },
    });
    expect(result.viewMode).toBe('Month');
    expect(result.columnWidths.taskName).toBe(320);
    expect(result.columnWidths.date).toBe(224);
    expect(result.calendar.workDays).toEqual([0, 1, 2, 3, 4]);
  });

  it('repairs invalid column widths to defaults and records a warning', () => {
    const warnings: string[] = [];
    const result = mergeProjectConfig({ columnWidths: { taskName: 'wide', date: -5 } }, warnings);
    expect(result.columnWidths.taskName).toBe(200);
    expect(result.columnWidths.date).toBe(224);
    expect(warnings.join('\n')).toContain('列幅');
  });

  it('drops an invalid timelineRange and records a warning', () => {
    const warnings: string[] = [];
    const result = mergeProjectConfig({ timelineRange: { start: 'abc', end: '2026-01-01' } }, warnings);
    expect(result.timelineRange).toBeUndefined();
    expect(warnings.join('\n')).toContain('timelineRange');
  });

  it('rejects a reversed timelineRange', () => {
    const result = mergeProjectConfig({ timelineRange: { start: '2026-12-31', end: '2026-01-01' } });
    expect(result.timelineRange).toBeUndefined();
  });

  it('keeps a valid timelineRange', () => {
    const result = mergeProjectConfig({ timelineRange: { start: '2026-01-01', end: '2026-06-30' } });
    expect(result.timelineRange).toEqual({ start: '2026-01-01', end: '2026-06-30' });
  });

  it('coerces a non-boolean baselineLocked to the default and warns on visibleColumns', () => {
    const warnings: string[] = [];
    const result = mergeProjectConfig({ baselineLocked: 'yes', visibleColumns: 'all' }, warnings);
    expect(result.baselineLocked).toBe(false);
    expect(warnings.join('\n')).toContain('visibleColumns');
    expect(result.visibleColumns).toEqual(DEFAULT_PROJECT_CONFIG.visibleColumns);
  });
});
