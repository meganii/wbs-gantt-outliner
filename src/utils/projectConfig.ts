import { format, isValid, parseISO } from 'date-fns';
import type { ProjectConfig, ColumnId } from '../types';
import { COLUMN_MIN_WIDTHS } from './columns';
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
    duration: 0,
    date: 0,
  } satisfies Record<keyof ProjectConfig['columnWidths'], number>
) as (keyof ProjectConfig['columnWidths'])[];

/**
 * 統合表示ビューの既定列。
 * 日付は右のタイムラインで分かるため、左ペインはコンパクトに保つ
 * （全列を出すと左ペインが画面幅を占有し、列が隠れて操作できなくなる）。
 */
export const COMPACT_COLUMNS: ColumnId[] = [
  'taskName',
  'status',
  'progress',
  'duration',
];

/**
 * 日付列の旧既定幅。日付セルを MM/DD + カレンダーボタンのコンパクトな
 * レイアウトへ変更したため、保存値がこの幅のときだけ新しい既定へ移行する
 * （意図的に広げた幅は維持する）。
 */
export const LEGACY_DATE_COLUMN_WIDTH = 224;

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
    status: 60,
    progress: 80,
    duration: 64,
    date: 128,
  },
  showBaseline: true,
  showMilestones: true,
  baselineSetAt: null,
  visibleColumns: [
    'taskName',
    'description',
    'assignee',
    'deliverables',
    'status',
    'progress',
    'duration',
    'date',
  ],
  integratedColumns: COMPACT_COLUMNS,
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

  // 統合表示の列: 未設定は既定のコンパクト列。不正な値は既定へ戻す。
  const inputIntegratedCols = config?.integratedColumns;
  let nextIntegratedColumns: ColumnId[] = COMPACT_COLUMNS;
  if (Array.isArray(inputIntegratedCols)) {
    const validCols = inputIntegratedCols.filter((col): col is ColumnId =>
      typeof col === 'string' && COLUMN_IDS.includes(col as ColumnId)
    );
    if (!validCols.includes('taskName')) {
      validCols.unshift('taskName');
    }
    nextIntegratedColumns = validCols;
  } else if (inputIntegratedCols !== undefined) {
    warnings?.push('統合表示の表示カラム設定(integratedColumns)が不正なため既定値に戻しました');
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

  // 旧既定値の日付列だけ新しい既定へ移行する（ユーザーが広げた幅は維持）。
  if (nextColumnWidths.date === LEGACY_DATE_COLUMN_WIDTH) {
    nextColumnWidths.date = DEFAULT_PROJECT_CONFIG.columnWidths.date;
  }

  // 狭すぎる列は下限へクランプする（読み込んだ古い設定も含む）。
  COLUMN_WIDTH_KEYS.forEach((key) => {
    nextColumnWidths[key] = Math.max(COLUMN_MIN_WIDTHS[key], nextColumnWidths[key]);
  });

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

  const nextShowBaseline = typeof config?.showBaseline === 'boolean'
    ? config.showBaseline
    : DEFAULT_PROJECT_CONFIG.showBaseline;

  const nextShowMilestones = typeof config?.showMilestones === 'boolean'
    ? config.showMilestones
    : DEFAULT_PROJECT_CONFIG.showMilestones;

  const rawBaselineSetAt = config?.baselineSetAt;
  const nextBaselineSetAt = typeof rawBaselineSetAt === 'string' && rawBaselineSetAt.trim() !== ''
    ? rawBaselineSetAt
    : null;

  return {
    calendar: {
      workDays: normalizeWorkDays(Array.isArray(calendar?.workDays) ? calendar?.workDays : undefined),
      holidays: normalizeHolidayList(Array.isArray(calendar?.holidays) ? calendar?.holidays : []),
    },
    viewMode: nextViewMode,
    columnWidths: nextColumnWidths,
    showBaseline: nextShowBaseline,
    showMilestones: nextShowMilestones,
    baselineSetAt: nextBaselineSetAt,
    visibleColumns: nextVisibleColumns,
    integratedColumns: nextIntegratedColumns,
    ...(nextTimelineRange ? { timelineRange: nextTimelineRange } : {}),
  };
}
