import { isValid, parseISO } from 'date-fns';
import type { Task, WorkCalendar } from '../types';
import { getWorkDaysCount } from './date';
import { deriveStatus } from '../store/taskStoreUtils';

/**
 * 保存形式のスキーマバージョン。
 * - v1: バージョンなし（`plan*` ⇄ `startDate`/`endDate` の双方向同期 + 基準計画固定トグル）
 * - v2: 3 層モデル（基準計画 / 予定 `plan*` / 実績 `startDate`/`endDate`）
 * - v3: 2 層モデル（基準計画 + 現在の日程 `startDate`/`endDate` + 進捗率）
 * - v4: プロジェクト直下のマイルストーン（`milestones`）を追加（タスク形式は v3 のまま）
 */
export const CURRENT_SCHEMA_VERSION = 4;

/** 現在の日程（startDate / endDate）を進捗率で畳むための入力。 */
interface FoldDatesInput {
  progress: number;
  /** 旧実績（`startDate` / `endDate`）。v1 では更新してきた見込み。 */
  actualStart: string | null;
  actualEnd: string | null;
  /** 旧予定（`planStartDate` / `planEndDate`）。v1 の基準計画固定 ON では凍結した当初計画。 */
  planStart: string | null;
  planEnd: string | null;
}

/**
 * 進捗率で日付の対を 1 組に畳む（§8）。
 * - 0%      : 予定（見込み）を採用
 * - 1〜99%  : 開始は実績、終了は予定（見込み）
 * - 100%    : 開始・終了とも実績
 */
export function foldLegacyDates({
  progress,
  actualStart,
  actualEnd,
  planStart,
  planEnd,
}: FoldDatesInput): { start: string | null; end: string | null } {
  if (progress >= 100) {
    return { start: actualStart ?? planStart, end: actualEnd ?? planEnd };
  }
  if (progress > 0) {
    return { start: actualStart ?? planStart, end: planEnd ?? actualEnd };
  }
  return { start: planStart ?? actualStart, end: planEnd ?? actualEnd };
}

export interface MigrationContext {
  /** 読み込んだファイルのスキーマバージョン（1 または 2）。 */
  schemaVersion: number;
  /** v1 の「基準計画固定」トグル。true のとき旧 plan が凍結した当初計画。 */
  baselineLocked: boolean;
  /** v1 / v2 の予定開始日（`planStartDate`）。 */
  planStartDate: string | null;
  /** v1 / v2 の予定終了日（`planEndDate`）。 */
  planEndDate: string | null;
  calendar: WorkCalendar;
}

/** 開始日〜終了日の稼働日数を返す（どちらか欠けていれば 0）。 */
function durationBetween(
  start: string | null,
  end: string | null,
  calendar: WorkCalendar
): number {
  if (!start || !end) return 0;
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (!isValid(startDate) || !isValid(endDate) || endDate < startDate) return 0;
  return getWorkDaysCount(startDate, endDate, calendar);
}

/**
 * v1（2 層以前）/ v2（3 層）のタスクを v3（2 層 + 進捗率）へ移行する。
 *
 * - v2: 予定（`plan*`）と実績（`startDate`/`endDate`）を進捗率で 1 組に畳む。
 *   `baseline*` / `previousBaseline*` はそのまま引き継ぐ。
 * - v1 の `baselineLocked === true`: 旧 `plan*` が凍結した当初計画なので、
 *   基準計画として引き継ぎ、現在の日程は旧 `startDate`/`endDate`（実績）にする。
 * - v1 のそれ以外: 進捗率で旧予定・旧実績を畳み、基準計画は持たない。
 */
export function migrateTaskToV3(task: Task, context: MigrationContext): Task {
  const { schemaVersion, baselineLocked, calendar } = context;
  const progress = task.progress ?? 0;
  // v1 の固定 ON は「旧 plan = 基準計画」「旧 start/end = 現在の日程」として読む。
  const isLockedV1 = schemaVersion < 2 && baselineLocked;

  const folded = isLockedV1
    ? { start: task.startDate ?? null, end: task.endDate ?? null }
    : foldLegacyDates({
        progress,
        actualStart: task.startDate ?? null,
        actualEnd: task.endDate ?? null,
        planStart: context.planStartDate,
        planEnd: context.planEndDate,
      });

  const duration = folded.start && folded.end
    ? durationBetween(folded.start, folded.end, calendar)
    : (folded.start ? Math.max(0, task.duration ?? 0) : 0);

  return {
    ...task,
    startDate: folded.start,
    endDate: folded.end,
    duration,
    status: deriveStatus(progress),
    // v1 の固定 ON では旧予定を基準計画として引き継ぐ（未固定は基準計画なし）。
    ...(isLockedV1
      ? {
          baselineStartDate: context.planStartDate,
          baselineEndDate: context.planEndDate,
          baselineDuration: durationBetween(context.planStartDate, context.planEndDate, calendar),
        }
      : {}),
  };
}
