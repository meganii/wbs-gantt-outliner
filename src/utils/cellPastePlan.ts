/**
 * セルへの貼り付けを「どの行にどの値を入れるか」へ変換する純粋関数。
 *
 * Excel ライクな挙動:
 * - 複数行を選択中: 値が 1 個なら選択行すべてに同一値、複数なら選択行へ順に割り当て
 * - 1 行のみ選択中 + 複数行の貼り付け: その行から下へ順に充填（既存行のみ）
 * - それ以外（1 行選択 + 単一値）は null を返し、既定の貼り付けに任せる
 */
import { parseTaskPaste } from './parseTaskPaste';

export interface CellPastePlan {
  /** 値をセットする対象タスク（表示順）。 */
  targetIds: string[];
  /** targetIds と同じ長さの値。 */
  values: string[];
}

export interface PlanCellPasteParams {
  /** 貼り付け先セルを持つタスク。 */
  taskId: string;
  /** クリップボードのテキスト。 */
  text: string;
  /** 現在選択されているタスク ID。 */
  selectedTaskIds: string[];
  /** 表示中のタスク ID を視覚順に並べたもの。 */
  visualOrder: string[];
}

export interface PlanValuePasteParams {
  /** 貼り付け先セルを持つタスク。 */
  taskId: string;
  /** 貼り付ける値（1 行分ずつ）。 */
  values: string[];
  /** クリップボードのテキストが複数行か。 */
  isMultiLine: boolean;
  /** 現在選択されているタスク ID。 */
  selectedTaskIds: string[];
  /** 表示中のタスク ID を視覚順に並べたもの。 */
  visualOrder: string[];
}

/**
 * 値の配列を「どの行にどの値を入れるか」へ変換する。
 * テキスト列と日付列で共通利用する。
 */
export function planValuePaste({
  taskId,
  values,
  isMultiLine,
  selectedTaskIds,
  visualOrder,
}: PlanValuePasteParams): CellPastePlan | null {
  if (values.length === 0) {
    return null;
  }

  const multiSelected = selectedTaskIds.length > 1 && selectedTaskIds.includes(taskId);

  if (multiSelected) {
    // 選択行を視覚順に並べる（表示されていない選択行は対象外）。
    const targets = visualOrder.filter((id) => selectedTaskIds.includes(id));
    if (targets.length === 0) {
      return null;
    }

    if (values.length === 1) {
      // 単一の値 → 選択行すべてに同一値
      return { targetIds: targets, values: targets.map(() => values[0]) };
    }

    // 複数の値 → 選択行へ順に割り当て（余った行は変更しない）
    const count = Math.min(targets.length, values.length);
    return {
      targetIds: targets.slice(0, count),
      values: values.slice(0, count),
    };
  }

  // 1 行のみ選択 + 単一値は通常の貼り付けに任せる。
  if (!isMultiLine) {
    return null;
  }

  // 1 行のみ選択 + 複数行 → その行から下へ順に充填（既存行のみ）。
  const start = visualOrder.indexOf(taskId);
  if (start === -1) {
    return null;
  }

  const targets = visualOrder.slice(start, start + values.length);
  return {
    targetIds: targets,
    values: values.slice(0, targets.length),
  };
}

export function planCellPaste({
  taskId,
  text,
  selectedTaskIds,
  visualOrder,
}: PlanCellPasteParams): CellPastePlan | null {
  const parsed = parseTaskPaste(text);
  if (parsed.length === 0) {
    return null;
  }

  return planValuePaste({
    taskId,
    values: parsed.map((line) => line.title),
    isMultiLine: /[\r\n]/.test(text),
    selectedTaskIds,
    visualOrder,
  });
}
