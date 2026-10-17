import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

/**
 * 行の並べ替え(dnd-kit)で使うセンサー設定。
 *
 * - KeyboardSensor を有効にしない: ドラッグハンドルは「ホバー時のみ表示される
 *   opacity-0 の `<button>`」でフォーカス可能なため、フォーカスが残った状態で
 *   Enter/Space を押すと「キーボードドラッグ開始」と「タスク確定/追加」が衝突する。
 *   このアプリでは Enter を新規タスク追加に割り当てているため、キーボード
 *   ドラッグは無効化する。
 * - PointerSensor に 5px の移動しきい値を設定: ハンドルの微小なクリックで
 *   並べ替えが始まらないようにする。
 */
const POINTER_SENSOR_OPTIONS = {
  activationConstraint: { distance: 5 },
} as const;

export const useRowSortSensors = () => {
  return useSensors(useSensor(PointerSensor, POINTER_SENSOR_OPTIONS));
};
