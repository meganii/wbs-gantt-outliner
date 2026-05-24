import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { TaskFocusableField } from '../types';

interface UseTaskCellKeyboardProps {
  taskId: string;
  field: TaskFocusableField;
  prevId?: string;
  nextId?: string;
  effectiveIds: string[];
  commitFieldLocalState: () => void;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export function useTaskCellKeyboard({
  taskId: _taskId,
  field,
  prevId,
  nextId,
  effectiveIds,
  commitFieldLocalState,
  onSelectionChange,
}: UseTaskCellKeyboardProps) {
  const indentTask = useTaskStore((state) => state.indentTask);
  const outdentTask = useTaskStore((state) => state.outdentTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const moveTask = useTaskStore((state) => state.moveTask);
  const setCollapsed = useTaskStore((state) => state.setCollapsed);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);

  const handleArrowNavigation = (
    e: React.KeyboardEvent<HTMLElement>,
    isComposing: boolean
  ) => {
    // Ignore key events during IME composition
    if (isComposing || e.nativeEvent.isComposing) {
      return true;
    }

    if (e.key === 'Escape') {
      setSelectedTaskIds([]);
      return true;
    }

    // Row Reordering (Move Task): Shift + Cmd (Mac) or Shift + Alt (Windows) + Arrow Keys
    if (e.shiftKey && (e.metaKey || e.altKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      commitFieldLocalState();
      moveTask(effectiveIds, e.key === 'ArrowUp' ? 'up' : 'down');
      return true;
    }

    // Indent/Outdent Task: Shift + Cmd (Mac) or Shift + Alt (Windows) + Arrow Keys (Left/Right)
    if (e.shiftKey && (e.metaKey || e.altKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      commitFieldLocalState();
      if (e.key === 'ArrowLeft') {
        outdentTask(effectiveIds);
      } else {
        indentTask(effectiveIds);
      }
      return true;
    }

    // Collapse/Expand: Option + Arrow Keys
    if (!e.shiftKey && e.altKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setCollapsed(effectiveIds, e.key === 'ArrowUp');
      return true;
    }

    // Selection Range Extension with Shift + Arrow Keys (No Cmd)
    if (e.shiftKey && !e.metaKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const targetId = e.key === 'ArrowUp' ? prevId : nextId;
      if (targetId) {
        setFocusedTaskCell(targetId, field);
        if (onSelectionChange) {
          onSelectionChange(targetId, false, true);
        }
      }
      return true;
    }

    if (e.key === 'ArrowUp') {
      if (prevId && !e.metaKey) {
        e.preventDefault();
        setFocusedTaskCell(prevId, field);
        if (onSelectionChange) onSelectionChange(prevId, false, false);
        return true;
      }
    }

    if (e.key === 'ArrowDown') {
      if (nextId && !e.metaKey) {
        e.preventDefault();
        setFocusedTaskCell(nextId, field);
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
