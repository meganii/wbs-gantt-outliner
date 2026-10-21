/**
 * タスク行（WBS / ガント / 統合表示）の高さ（px）。
 *
 * `TaskRow` / `GanttChart` / `IntegratedView` の行要素は Tailwind の `h-8`
 * （= 32px）で描画している。依存線の座標やスクロール位置の計算で数値が
 * 必要な箇所はこの定数を参照し、`h-8` とずれないようにする。
 */
export const TASK_ROW_HEIGHT = 32;
