import type { Task } from '../types';

/** 保存形式のスキーマバージョン。v1 はバージョンなし（Plan/Actual 双方向同期 + 基準計画固定トグル）。 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * v1 のタスクを v2 の 3 層モデル（基準計画 / 予定 / 実績）へ移行する。
 *
 * v1 は `plan*` と `startDate`/`endDate` が双方向にミラーされており、
 * 「基準計画固定」トグルでどちらを編集するか（= どちらが基準計画か）を
 * 切り替えていた。これを次のように読み替える:
 *
 * - 固定 ON（`legacyBaselineLocked === true`）:
 *   - 旧 `plan*`（凍結していた当初計画）→ 基準計画
 *   - 旧 `start*`（更新してきた見込み）→ 予定
 *   - 進捗から実績を復元（progress>0 → 実績開始、progress===100 → 実績終了）
 * - 固定 OFF:
 *   - 予定は `plan*`（無ければ `start*` で補完）
 *   - 実績は進捗から復元（進捗が無ければ空）
 */
export function migrateLegacyTask(task: Task, legacyBaselineLocked: boolean): Task {
  const legacyStart = task.startDate ?? null;
  const legacyEnd = task.endDate ?? null;
  const legacyDuration = task.duration ?? 0;
  const progress = task.progress ?? 0;

  const actualStart = progress > 0 ? legacyStart : null;
  const actualEnd = progress >= 100 ? legacyEnd : null;
  // 実績期間（duration）は v1 で入力されていた値を引き継ぐ。未着工は 0。
  const nextDuration = progress > 0 ? legacyDuration : 0;

  if (legacyBaselineLocked) {
    return {
      ...task,
      baselineStartDate: task.planStartDate ?? null,
      baselineEndDate: task.planEndDate ?? null,
      baselineDuration: task.planDuration ?? null,
      planStartDate: legacyStart,
      planEndDate: legacyEnd,
      planDuration: legacyDuration,
      startDate: actualStart,
      endDate: actualEnd,
      duration: nextDuration,
    };
  }

  return {
    ...task,
    planStartDate: task.planStartDate ?? legacyStart,
    planEndDate: task.planEndDate ?? legacyEnd,
    planDuration: task.planDuration ?? legacyDuration,
    startDate: actualStart,
    endDate: actualEnd,
    duration: nextDuration,
  };
}
