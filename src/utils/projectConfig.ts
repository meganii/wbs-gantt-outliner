import { format, isValid, parseISO } from 'date-fns';
import type { ProjectConfig, ColumnId } from '../types';
import { parseIsoDateStrict } from './date';

type ProjectConfigInput = Partial<Omit<ProjectConfig, 'calendar' | 'columnWidths'>> & {
  calendar?: Partial<ProjectConfig['calendar']>;
  columnWidths?: Partial<ProjectConfig['columnWidths']>;
};

const VIEW_MODES: ProjectConfig['viewMode'][] = ['Day', 'Week', 'Month', 'Year'];

const COLUMN_IDS: ColumnId[] = [
  'taskName',
  'description',
  'assignee',
  'deliverables',
  'status',
  'progress',
  'planDuration',
  'planDate',
  'duration',
  'date',
];

const COLUMN_WIDTH_KEYS = Object.keys(
  {
    taskName: 0,
    description: 0,
    assignee: 0,
    deliverables: 0,
    status: 0,
    progress: 0,
    planDuration: 0,
    planDate: 0,
    duration: 0,
    date: 0,
  } satisfies Record<keyof ProjectConfig['columnWidths'], number>
) as (keyof ProjectConfig['columnWidths'])[];


export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  calendar: {
    workDays: [1, 2, 3, 4, 5],
    holidays: [],
  },
  viewMode: 'Day',
  columnWidths: {
    taskName: 200,
    description: 256,
    assignee: 128,
    deliverables: 192,
    status: 100,
    progress: 80,
    planDuration: 64,
    planDate: 224,
    duration: 64,
    date: 224,
  },
  baselineLocked: false,
  visibleColumns: [
    'taskName',
    'description',
    'assignee',
    'deliverables',
    'status',
    'progress',
    'planDuration',
    'planDate',
    'duration',
    'date',
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function normalizeHolidayList(holidays: unknown[]): string[] {
  const normalized = holidays
    .map((holiday) => {
      if (typeof holiday !== 'string') {
        return null;
      }

      const parsed = parseISO(holiday);
      if (!isValid(parsed)) {
        return null;
      }

      return format(parsed, 'yyyy-MM-dd');
    })
    .filter((holiday): holiday is string => holiday !== null);

  return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
}

function normalizeWorkDays(workDays?: unknown[]): number[] {
  const normalized = Array.from(
    new Set(
      (workDays ?? DEFAULT_PROJECT_CONFIG.calendar.workDays).filter(
        (day): day is number =>
          typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6
      )
    )
  ).sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : DEFAULT_PROJECT_CONFIG.calendar.workDays;
}

export function mergeProjectConfig(projectConfig?: unknown, warnings?: string[]): ProjectConfig {
  const config = asRecord(projectConfig) as ProjectConfigInput | null;
  const calendar = asRecord(config?.calendar) as ProjectConfigInput['calendar'] | null;
  const columnWidths = asRecord(config?.columnWidths) as ProjectConfigInput['columnWidths'] | null;

  const nextViewMode = config?.viewMode && VIEW_MODES.includes(config.viewMode)
    ? config.viewMode
    : DEFAULT_PROJECT_CONFIG.viewMode;

  const inputVisibleCols = config?.visibleColumns;
  let nextVisibleColumns = DEFAULT_PROJECT_CONFIG.visibleColumns!;

  if (Array.isArray(inputVisibleCols)) {
    const validCols = inputVisibleCols.filter((col): col is ColumnId =>
      typeof col === 'string' && COLUMN_IDS.includes(col as ColumnId)
    );
    if (!validCols.includes('taskName')) {
      validCols.unshift('taskName');
    }
    nextVisibleColumns = validCols;
  } else if (inputVisibleCols !== undefined) {
    warnings?.push('表示カラム設定(visibleColumns)が不正なため既定値に戻しました');
  }

  // 列幅: 正の有限数のみ受け付け、それ以外は既定値へ戻す
  const nextColumnWidths = { ...DEFAULT_PROJECT_CONFIG.columnWidths };
  let invalidWidthCount = 0;
  COLUMN_WIDTH_KEYS.forEach((key) => {
    const value = columnWidths?.[key];
    if (value === undefined) return;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      nextColumnWidths[key] = value;
    } else {
      invalidWidthCount += 1;
    }
  });
  if (invalidWidthCount > 0) {
    warnings?.push(`列幅設定(columnWidths)の不正な値 ${invalidWidthCount} 件を既定値に戻しました`);
  }

  // タイムライン表示範囲: 両端が有効な日付で start <= end のときだけ採用
  const rawTimelineRange = asRecord(config?.timelineRange);
  let nextTimelineRange: ProjectConfig['timelineRange'];
  if (rawTimelineRange) {
    const start = parseIsoDateStrict(rawTimelineRange.start);
    const end = parseIsoDateStrict(rawTimelineRange.end);
    if (start && end && start <= end) {
      nextTimelineRange = { start, end };
    } else {
      warnings?.push('タイムライン表示範囲(timelineRange)が不正なため無効化しました');
    }
  }

  const nextBaselineLocked = typeof config?.baselineLocked === 'boolean'
    ? config.baselineLocked
    : DEFAULT_PROJECT_CONFIG.baselineLocked;

  return {
    calendar: {
      workDays: normalizeWorkDays(Array.isArray(calendar?.workDays) ? calendar?.workDays : undefined),
      holidays: normalizeHolidayList(Array.isArray(calendar?.holidays) ? calendar?.holidays : []),
    },
    viewMode: nextViewMode,
    columnWidths: nextColumnWidths,
    baselineLocked: nextBaselineLocked,
    visibleColumns: nextVisibleColumns,
    ...(nextTimelineRange ? { timelineRange: nextTimelineRange } : {}),
  };
}
