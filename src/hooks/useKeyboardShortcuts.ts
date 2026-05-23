import { useEffect } from 'react';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

interface UseKeyboardShortcutsProps {
  setView: (view: 'wbs' | 'integrated' | 'gantt') => void;
}

export function useKeyboardShortcuts({ setView }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
      const isRedo = (e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y');
      const isCollapseAll = (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key === 'ArrowUp';
      const isExpandAll = (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.key === 'ArrowDown';
      const isWbsView = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === '1';
      const isIntegratedView = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === '2';
      const isGanttView = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === '3';

      if (e.isComposing || e.keyCode === 229) {
        return;
      }

      if (isUndo) {
        const temporalApi = getTemporalState();
        if (temporalApi.pastStates.length > 0) {
          e.preventDefault();
          temporalApi.undo();
        }
      }

      if (isRedo) {
        const temporalApi = getTemporalState();
        if (temporalApi.futureStates.length > 0) {
          e.preventDefault();
          temporalApi.redo();
        }
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
      }

      if (isWbsView) {
        e.preventDefault();
        setView('wbs');
      }

      if (isIntegratedView) {
        e.preventDefault();
        setView('integrated');
      }

      if (isGanttView) {
        e.preventDefault();
        setView('gantt');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView]);
}
