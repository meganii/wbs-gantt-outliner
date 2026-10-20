import { useEffect } from 'react';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

interface UseKeyboardShortcutsProps {
  setView: (view: 'wbs' | 'integrated' | 'gantt') => void;
}

export function useKeyboardShortcuts({ setView }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IME変換中のキー入力は無視する
      if (e.isComposing) {
        return;
      }

      // Escape: 選択解除（WBS / 統合表示 / ガントの全ビュー共通）。
      // セル編集中の Escape は各セル側でも処理するが、バー選択など
      // フォーカスが入力欄に無い状態でも解除できるようにここで受ける。
      if (e.key === 'Escape') {
        useTaskStore.getState().setSelectedTaskIds([]);
        return;
      }

      // キーボードショートカットはCtrl/Cmd押しを前提としている
      // そのため、Ctrl/Cmd が押されていないときは無視する
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (!isCmdOrCtrl) {
        return;
      }

      // キーの判定
      const key = e.key;
      const lowerKey = key.toLowerCase();
      const { altKey, shiftKey } = e;

      // Undo / Redo Ctrl + Z / Ctrl + Y
      const isUndo = lowerKey === 'z' && !shiftKey;
      const isRedo = (lowerKey === 'z' && shiftKey) || lowerKey === 'y';

      // タスクの展開・折り畳み Ctrl + Alt + Up/Down
      const isCollapseAll = altKey && !shiftKey && key === 'ArrowUp';
      const isExpandAll = altKey && !shiftKey && key === 'ArrowDown';

      // Viewの切り替え Ctrl + 1 | 2 | 3
      const isWbsView = !altKey && !shiftKey && key === '1';
      const isIntegratedView = !altKey && !shiftKey && key === '2';
      const isGanttView = !altKey && !shiftKey && key === '3';

      if (isUndo) {
        const temporalApi = getTemporalState();
        if (temporalApi.pastStates.length > 0) {
          e.preventDefault();
          temporalApi.undo();
        }
        return;
      }

      if (isRedo) {
        const temporalApi = getTemporalState();
        if (temporalApi.futureStates.length > 0) {
          e.preventDefault();
          temporalApi.redo();
        }
        return;
      }

      if (isCollapseAll || isExpandAll) {
        const nextCollapsed = isCollapseAll;
        const hasChanges = Object.values(useTaskStore.getState().tasks).some(
          (task) => task.children.length > 0 && task.isCollapsed !== nextCollapsed
        );

        if (hasChanges) {
          e.preventDefault();
          useTaskStore.getState().setAllCollapsed(nextCollapsed);
        }
        return;
      }

      if (isWbsView) {
        e.preventDefault();
        setView('wbs');
        return;
      }

      if (isIntegratedView) {
        e.preventDefault();
        setView('integrated');
        return;
      }

      if (isGanttView) {
        e.preventDefault();
        setView('gantt');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView]);
}
