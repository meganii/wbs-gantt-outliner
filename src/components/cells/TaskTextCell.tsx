import React, { memo, useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { handleTextCellPaste } from '../../utils/cellPaste';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskTextCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  field: 'description' | 'assignee' | 'deliverables';
  placeholder: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskTextCell = memo(({
  taskId,
  task,
  columnWidths,
  field,
  placeholder,
  prevId,
  nextId,
  onSelectionChange,
}: TaskTextCellProps) => {
  const value = task[field] || '';

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === field
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する。
  const isActiveColumn = useIsActiveColumn(taskId, field);

  // Local state for performance
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with store updates (adjusting state during render, see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setLocalValue(value);
  }

  // Focus synchronization
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (value !== localValue) {
      useTaskStore.getState().updateTask(taskId, { [field]: localValue });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field,
    prevId,
    nextId,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowNavigation(e, isComposing.current)) {
      return;
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (isComposing.current) {
      return;
    }
    handleTextCellPaste(e, taskId, field);
  };

  const width = columnWidths[field];

  return (
    <div
      className={clsx(
        'px-2 border-l border-gray-100 h-full flex items-center flex-shrink-0',
        isActiveColumn && activeColumnClass
      )}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={inputRef}
        type="text"
        data-task-id={taskId}
        data-field={field}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commitValue}
        onFocus={() => useTaskStore.getState().setFocusedTaskCell(taskId, field)}
        placeholder={placeholder}
        style={{ backgroundColor: 'transparent' }}
        className="w-full bg-transparent border-none outline-none text-xs text-gray-600 placeholder-gray-300 truncate"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
        }}
      />
    </div>
  );
}, cellPropsEqual);

TaskTextCell.displayName = 'TaskTextCell';
