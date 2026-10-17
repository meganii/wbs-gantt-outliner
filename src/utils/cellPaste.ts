/**
 * テキストセルへの貼り付けを実行するヘルパー。
 *
 * ストアを購読せず、イベント発生時に `getState()` から最新値を読む
 * （セルは memo 化されており、購読を増やすと全行再描画の原因になるため）。
 */
import type { ClipboardEvent } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { flattenTree } from './tree';
import { planCellPaste } from './cellPastePlan';
import type { PasteTextField } from '../types';

/** 表示中のタスク ID を視覚順（折りたたみを尊重）に返す。 */
export function getVisualTaskOrder(): string[] {
  const { tasks, rootIds } = useTaskStore.getState();
  return flattenTree(tasks, rootIds).map((item) => item.id);
}

/** 複数行が選択されていて、そのセルが選択に含まれているか。 */
export function isMultiRowSelection(taskId: string): boolean {
  const { selectedTaskIds } = useTaskStore.getState();
  return selectedTaskIds.length > 1 && selectedTaskIds.includes(taskId);
}

/**
 * 複数行ペースト / 複数行選択の一括入力を処理する。
 * 既定の貼り付けに任せる場合は何もしない。
 */
export function handleTextCellPaste(
  e: ClipboardEvent<HTMLInputElement>,
  taskId: string,
  field: PasteTextField
): void {
  const text = e.clipboardData.getData('text/plain');
  if (!text) {
    return;
  }

  const { selectedTaskIds } = useTaskStore.getState();
  const plan = planCellPaste({
    taskId,
    text,
    selectedTaskIds,
    visualOrder: getVisualTaskOrder(),
  });

  if (!plan) {
    return;
  }

  e.preventDefault();
  useTaskStore.getState().setTaskFieldValues(plan.targetIds, field, plan.values);
}
