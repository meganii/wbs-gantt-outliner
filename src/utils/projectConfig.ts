import { format, isValid, parseISO } from 'date-fns';
import type { ProjectConfig } from '../types';

type ProjectConfigInput = Partial<Omit<ProjectConfig, 'calendar' | 'columnWidths'>> & {
  calendar?: Partial<ProjectConfig['calendar']>;
  columnWidths?: Partial<ProjectConfig['columnWidths']>;
};

const VIEW_MODES: ProjectConfig['viewMode'][] = ['Day', 'Week', 'Month', 'Year'];

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  calendar: {
    workDays: [1, 2, 3, 4, 5],
    holidays: [],
  },
  viewMode: 'Day',
  columnWidths: {
    taskDescription: 200,
    description: 256,
    assignee: 128,
    deliverables: 192,
    duration: 64,
    date: 224,
  },
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

export function mergeProjectConfig(projectConfig?: unknown): ProjectConfig {
  const config = asRecord(projectConfig) as ProjectConfigInput | null;
  const calendar = asRecord(config?.calendar) as ProjectConfigInput['calendar'] | null;
  const columnWidths = asRecord(config?.columnWidths) as ProjectConfigInput['columnWidths'] | null;

  const nextViewMode = config?.viewMode && VIEW_MODES.includes(config.viewMode)
    ? config.viewMode
    : DEFAULT_PROJECT_CONFIG.viewMode;

  return {
    ...DEFAULT_PROJECT_CONFIG,
    ...(config ?? {}),
    viewMode: nextViewMode,
    calendar: {
      workDays: normalizeWorkDays(Array.isArray(calendar?.workDays) ? calendar?.workDays : undefined),
      holidays: normalizeHolidayList(Array.isArray(calendar?.holidays) ? calendar?.holidays : []),
    },
    columnWidths: {
      ...DEFAULT_PROJECT_CONFIG.columnWidths,
      ...(columnWidths ?? {}),
    },
  };
}
