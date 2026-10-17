import { useTaskStore } from '../../store/useTaskStore';
import type { TaskFocusableField } from '../../types';

/**
 * 複数行選択中に、フォーカス中の列を「選択された行だけ」帯状に強調するためのクラス。
 *
 * 行の選択（`bg-brand-50`）や行ホバー（`bg-brand-100`）より一段濃い青（`brand-200`）にし、
 * 左右に縦アクセント（`brand-500` の 2px インセット）を敷くことで、
 *   - 全体の行選択（薄い青）
 *   - 行ホバー（やや濃い青 / 未選択行はグレー）
 *   - 特定列の複数行（さらに濃い青 + 左右の縦線）
 * の 3 段階を見分けられるようにする。
 *
 * `!opacity-100` は、日付・期間セルが非ホバー時に掛けている `opacity-50/60` を
 * 打ち消して、帯の背景が薄くならないようにするため。
 */
export const activeColumnClass =
  '!bg-brand-200 !opacity-100 shadow-[inset_2px_0_0_0_#3b82f6,inset_-2px_0_0_0_#3b82f6]';

/**
 * このセルが「複数行選択中のフォーカス列」に含まれるか。
 *
 * - 複数行（2 行以上）が選択されている
 * - この行がその選択に含まれている
 * - フォーカス中の列（フィールド）がこのセルの列と一致する
 *
 * 戻り値は boolean。セルごとに購読するが、値が変わらない限り再描画されない
 * （既存の `isFocused` 購読と同じ方針。選択変更で全行を再描画させない）。
 */
export function useIsActiveColumn(
  taskId: string,
  fields: TaskFocusableField | readonly TaskFocusableField[]
): boolean {
  return useTaskStore((state) => {
    if (state.selectedTaskIds.length < 2) return false;
    if (!state.selectedTaskIds.includes(taskId)) return false;
    const focused = state.focusedTaskField;
    if (focused === null) return false;
    return typeof fields === 'string' ? focused === fields : fields.includes(focused);
  });
}
