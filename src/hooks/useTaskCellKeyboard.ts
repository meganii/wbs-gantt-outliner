import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { TaskFocusableField } from '../types';

interface UseTaskCellKeyboardProps {
  taskId: string;
  field: TaskFocusableField;
  prevId?: string;
  nextId?: string;
  commitFieldLocalState: () => void;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

/**
 * セルの矢印キーナビゲーション（フォーカス移動 / インデント / 並べ替え 等）。
 *
 * ストアの購読は行わず、イベント発生時に `getState()` から操作と選択状態を読む。
 * セルごとに action を購読すると 1 行あたりの購読数が増え、ストア更新のたびに
 * selector が全行分実行される（購読ファンアウト）ため、ここでは購読しない。
 * 選択状態（effectiveIds）も、選択変更のたびに全セルを再描画させないよう
 * ハンドラ実行時に最新値を読む。
 */
export function useTaskCellKeyboard({
  taskId,
  field,
  prevId,
  nextId,
  commitFieldLocalState,
  onSelectionChange,
}: UseTaskCellKeyboardProps) {
  const handleArrowNavigation = (
    e: React.KeyboardEvent<HTMLElement>,
    isComposing: boolean
  ) => {
    // Ignore key events during IME composition
    if (isComposing || e.nativeEvent.isComposing) {
      return true;
    }

    const store = useTaskStore.getState();
    const { selectedTaskIds } = store;
    const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

    if (e.key === 'Escape') {
      store.setSelectedTaskIds([]);
      return true;
    }

    // Row Reordering (Move Task): Shift + Cmd (Mac) or Shift + Alt (Windows) + Arrow Keys
    if (e.shiftKey && (e.metaKey || e.altKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      commitFieldLocalState();
      store.moveTask(effectiveIds, e.key === 'ArrowUp' ? 'up' : 'down');
      return true;
    }

    // Indent/Outdent Task: Shift + Cmd (Mac) or Shift + Alt (Windows) + Arrow Keys (Left/Right)
    if (e.shiftKey && (e.metaKey || e.altKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      commitFieldLocalState();
      if (e.key === 'ArrowLeft') {
        store.outdentTask(effectiveIds);
      } else {
        store.indentTask(effectiveIds);
      }
      return true;
    }

    // Collapse/Expand: Option + Arrow Keys
    if (!e.shiftKey && e.altKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      store.setCollapsed(effectiveIds, e.key === 'ArrowUp');
      return true;
    }

    // Selection Range Extension with Shift + Arrow Keys (No Cmd)
    if (e.shiftKey && !e.metaKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const targetId = e.key === 'ArrowUp' ? prevId : nextId;
      if (targetId) {
        store.setFocusedTaskCell(targetId, field);
        if (onSelectionChange) {
          onSelectionChange(targetId, false, true);
        }
      }
      return true;
    }

    if (e.key === 'ArrowUp') {
      if (prevId && !e.metaKey) {
        e.preventDefault();
        store.setFocusedTaskCell(prevId, field);
        if (onSelectionChange) onSelectionChange(prevId, false, false);
        return true;
      }
    }

    if (e.key === 'ArrowDown') {
      if (nextId && !e.metaKey) {
        e.preventDefault();
        store.setFocusedTaskCell(nextId, field);
        if (onSelectionChange) onSelectionChange(nextId, false, false);
        return true;
      }
    }

    return false;
  };

  return {
    handleArrowNavigation,
  };
}

/**
 * ハンドラ実行時点の「操作対象 ID 群」を返す。
 * 選択に含まれていれば選択全体（一括操作）、そうでなければ自身 1 件。
 */
export function getEffectiveTaskIds(taskId: string): string[] {
  const { selectedTaskIds } = useTaskStore.getState();
  return selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];
}
