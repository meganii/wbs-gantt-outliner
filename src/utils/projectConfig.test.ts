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
    expect(result.columnWidths.date).toBe(128);
    expect(result.calendar.workDays).toEqual([0, 1, 2, 3, 4]);
  });

  it('repairs invalid column widths to defaults and records a warning', () => {
    const warnings: string[] = [];
    const result = mergeProjectConfig({ columnWidths: { taskName: 'wide', date: -5 } }, warnings);
    expect(result.columnWidths.taskName).toBe(200);
    expect(result.columnWidths.date).toBe(128);
    expect(warnings.join('\n')).toContain('列幅');
  });

  it('migrates only the legacy date column width to the compact default', () => {
    expect(
      mergeProjectConfig({ columnWidths: { date: 224 } }).columnWidths.date
    ).toBe(128);
    expect(
      mergeProjectConfig({ columnWidths: { date: 300 } }).columnWidths.date
    ).toBe(300);
  });

  it('clamps column widths to their per-column minimum', () => {
    const result = mergeProjectConfig({
      columnWidths: { date: 50, duration: 20, taskName: 40 },
    });
    expect(result.columnWidths.date).toBe(112);
    expect(result.columnWidths.duration).toBe(50);
    expect(result.columnWidths.taskName).toBe(50);
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

  it('drops the legacy baselineLocked key and keeps defaults for baseline config', () => {
    const warnings: string[] = [];
    const result = mergeProjectConfig({ baselineLocked: 'yes', visibleColumns: 'all' }, warnings);
    expect('baselineLocked' in result).toBe(false);
    expect(result.showBaseline).toBe(true);
    expect(result.baselineSetAt).toBeNull();
    expect(warnings.join('\n')).toContain('visibleColumns');
    expect(result.visibleColumns).toEqual(DEFAULT_PROJECT_CONFIG.visibleColumns);
  });

  it('keeps a valid baselineSetAt string and rejects empty/non-string values', () => {
    const result = mergeProjectConfig({ baselineSetAt: '2026-10-18T00:00:00.000Z' });
    expect(result.baselineSetAt).toBe('2026-10-18T00:00:00.000Z');

    expect(mergeProjectConfig({ baselineSetAt: '' }).baselineSetAt).toBeNull();
    expect(mergeProjectConfig({ baselineSetAt: 123 as unknown as string }).baselineSetAt).toBeNull();
  });

  it('honors an explicit showBaseline flag', () => {
    expect(mergeProjectConfig({ showBaseline: false }).showBaseline).toBe(false);
    expect(mergeProjectConfig({ showBaseline: true }).showBaseline).toBe(true);
  });

  it('defaults integratedColumns to the compact set and repairs invalid values', () => {
    expect(mergeProjectConfig(undefined).integratedColumns).toEqual(
      DEFAULT_PROJECT_CONFIG.integratedColumns
    );

    const warnings: string[] = [];
    const repaired = mergeProjectConfig({ integratedColumns: ['description', 'unknown'] }, warnings);
    // taskName は必須として先頭に補われる
    expect(repaired.integratedColumns).toEqual(['taskName', 'description']);

    const invalid = mergeProjectConfig({ integratedColumns: 'all' }, warnings);
    expect(invalid.integratedColumns).toEqual(DEFAULT_PROJECT_CONFIG.integratedColumns);
    expect(warnings.join('\n')).toContain('integratedColumns');
  });
});
