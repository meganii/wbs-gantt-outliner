import type { Task } from '../types';
import { parseInputDate } from './date';
import { planValuePaste } from './cellPastePlan';

export type DateField = 'startDate' | 'endDate';

/**
 * クリップボードの日付テキストを行単位に分解する。
 * Excel のタブ区切りコピーは 1 列目を日付として採用する（複数列は将来対応）。
 * 空行はスキップする。
 */
export function parseDatePaste(text: string): string[] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.split('\t')[0].trim())
    .filter((line) => line !== '');
}

/**
 * 1 つのセルへ入力された日付文字列を、そのタスクの文脈で ISO 日付へ変換する。
 *
 * - 開始日: 既存の開始日（無ければ終了日）の年を優先する。
 *   開始日が空のときは、終了日を追い越さないよう前年へ回す。
 * - 終了日: 既存の終了日（無ければ開始日）の年を優先し、
 *   開始日より前になる MM/DD は翌年として解釈する。
 * - 明示的な年（YYYY/MM/DD 等）はそのまま採用し、開始日 < 終了日の制約だけ検証する。
 */
export function resolveDateInput(
  text: string,
  field: DateField,
  task: Pick<Task, 'startDate' | 'endDate'>
): string | null {
  const reference =
    field === 'startDate'
      ? task.startDate || task.endDate
      : task.endDate || task.startDate;

  const options =
    field === 'endDate'
      ? { notBefore: task.startDate }
      : { notAfter: task.startDate ? null : task.endDate };

  const parsed = parseInputDate(text, reference, options);
  if (!parsed) {
    return null;
  }

  if (field === 'endDate' && task.startDate && parsed < task.startDate) {
    return null;
  }

  return parsed;
}

export interface DatePasteTarget {
  id: string;
  value: string;
}

export interface DatePastePlan {
  targets: DatePasteTarget[];
  /** 日付として解釈できなかった件数。 */
  invalidCount: number;
  /** 親タスクなど、貼り付け対象外にした件数。 */
  skippedCount: number;
  /** 単一セル（1 行 1 値）への貼り付けか。 */
  isSingle: boolean;
  /** フォーカス中の行へ適用される値（対象外なら null）。 */
  focusedValue: string | null;
}

export interface PlanDatePasteParams {
  taskId: string;
  field: DateField;
  text: string;
  selectedTaskIds: string[];
  visualOrder: string[];
  tasks: Record<string, Task>;
}

/**
 * 日付の貼り付けを「どの行にどの ISO 日付を入れるか」へ変換する。
 * 既定の貼り付け（単一セル）に任せる場合は null を返す。
 */
export function planDatePaste({
  taskId,
  field,
  text,
  selectedTaskIds,
  visualOrder,
  tasks,
}: PlanDatePasteParams): DatePastePlan | null {
  const values = parseDatePaste(text);
  if (values.length === 0) {
    return null;
  }

  const isMultiLine = /[\r\n]/.test(text);
  const plan = planValuePaste({
    taskId,
    values,
    isMultiLine,
    selectedTaskIds,
    visualOrder,
  });

  if (!plan) {
    // 1 行 1 値だけは、セル側の通常入力と同じ経路で即時確定する。
    if (values.length === 1 && !isMultiLine) {
      const task = tasks[taskId];
      if (!task || task.children.length > 0) {
        return null;
      }
      const resolved = resolveDateInput(values[0], field, task);
      if (!resolved) {
        return null;
      }
      return {
        targets: [{ id: taskId, value: resolved }],
        invalidCount: 0,
        skippedCount: 0,
        isSingle: true,
        focusedValue: resolved,
      };
    }
    return null;
  }

  const targets: DatePasteTarget[] = [];
  let invalidCount = 0;
  let skippedCount = 0;
  let focusedValue: string | null = null;

  plan.targetIds.forEach((id, index) => {
    const raw = plan.values[index];
    const task = tasks[id];
    if (!task || task.children.length > 0) {
      skippedCount += 1;
      return;
    }

    const resolved = resolveDateInput(raw, field, task);
    if (!resolved) {
      invalidCount += 1;
      return;
    }

    targets.push({ id, value: resolved });
    if (id === taskId) {
      focusedValue = resolved;
    }
  });

  if (targets.length === 0) {
    return {
      targets,
      invalidCount,
      skippedCount,
      isSingle: false,
      focusedValue: null,
    };
  }

  return {
    targets,
    invalidCount,
    skippedCount,
    isSingle: false,
    focusedValue,
  };
}
