import type { Task } from '../types';

/**
 * 基準計画（baseline*）まわりの純粋関数。
 *
 * 基準計画は「承認済み計画のスナップショット」であり、通常の運用
 * （日程の編集・進捗率の入力・依存伝播・親ロールアップ）では変化しない。
 * 変わるのは以下の明示操作のときだけ:
 *   - setBaseline('register' | 'update') … 現在の日程を基準計画として保存
 *   - restoreBaseline … 1 世代前の基準計画と入れ替える
 *   - clearBaseline … 削除
 */

/** 現在の日程（startDate / endDate / duration）を基準計画（baseline*）へコピーする。 */
export function snapshotScheduleToBaseline(tasks: Record<string, Task>): Record<string, Task> {
  const next: Record<string, Task> = {};
  Object.values(tasks).forEach((task) => {
    next[task.id] = {
      ...task,
      baselineStartDate: task.startDate ?? null,
      baselineEndDate: task.endDate ?? null,
      baselineDuration: task.duration ?? null,
    };
  });
  return next;
}

/** 現在の基準計画（baseline*）を 1 世代前（previousBaseline*）へ退避する。 */
export function backupBaseline(tasks: Record<string, Task>): Record<string, Task> {
  const next: Record<string, Task> = {};
  Object.values(tasks).forEach((task) => {
    next[task.id] = {
      ...task,
      previousBaselineStartDate: task.baselineStartDate ?? null,
      previousBaselineEndDate: task.baselineEndDate ?? null,
      previousBaselineDuration: task.baselineDuration ?? null,
    };
  });
  return next;
}

/** 基準計画（baseline*）と 1 世代前（previousBaseline*）を入れ替える。 */
export function swapBaselineWithPrevious(tasks: Record<string, Task>): Record<string, Task> {
  const next: Record<string, Task> = {};
  Object.values(tasks).forEach((task) => {
    next[task.id] = {
      ...task,
      baselineStartDate: task.previousBaselineStartDate ?? null,
      baselineEndDate: task.previousBaselineEndDate ?? null,
      baselineDuration: task.previousBaselineDuration ?? null,
      previousBaselineStartDate: task.baselineStartDate ?? null,
      previousBaselineEndDate: task.baselineEndDate ?? null,
      previousBaselineDuration: task.baselineDuration ?? null,
    };
  });
  return next;
}

/** 基準計画（現行・1 世代前）をすべて削除する。 */
export function clearBaselineFields(tasks: Record<string, Task>): Record<string, Task> {
  const next: Record<string, Task> = {};
  Object.values(tasks).forEach((task) => {
    next[task.id] = {
      ...task,
      baselineStartDate: null,
      baselineEndDate: null,
      baselineDuration: null,
      previousBaselineStartDate: null,
      previousBaselineEndDate: null,
      previousBaselineDuration: null,
    };
  });
  return next;
}

/** いずれかのタスクに基準計画（現行）が登録されているか。 */
export function hasBaseline(tasks: Record<string, Task>): boolean {
  return Object.values(tasks).some(
    (task) => task.baselineStartDate != null || task.baselineEndDate != null
  );
}

/** いずれかのタスクに 1 世代前の基準計画が残っているか。 */
export function hasPreviousBaseline(tasks: Record<string, Task>): boolean {
  return Object.values(tasks).some(
    (task) => task.previousBaselineStartDate != null || task.previousBaselineEndDate != null
  );
}
