import React, { memo, useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import clsx from 'clsx';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskProgressCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskProgressCell = memo(({
  taskId,
  task,
  columnWidths,
  prevId,
  nextId,
  onSelectionChange,
}: TaskProgressCellProps) => {
  const progress = task.progress !== undefined ? String(task.progress) : '0';
  const isParent = task.children.length > 0;

  // Local state
  const [localProgress, setLocalProgress] = useState(progress);
  const inputRef = useRef<HTMLInputElement>(null);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'progress'
  );

  // Sync with store (effect 内での setState を避け、レンダー中に state を調整する)
  const [syncedProgress, setSyncedProgress] = useState(progress);
  if (syncedProgress !== progress) {
    setSyncedProgress(progress);
    setLocalProgress(progress);
  }

  // Focus synchronization
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (isParent) return;
    const val = Math.min(100, Math.max(0, parseInt(localProgress) || 0));
    setLocalProgress(String(val));
    if (task.progress !== val) {
      useTaskStore.getState().updateTask(taskId, { progress: val });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'progress',
    prevId,
    nextId,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowNavigation(e, false)) {
      return;
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  const width = columnWidths.progress;

  return (
    <div
      className="px-2 border-l border-gray-100 h-full flex items-center flex-shrink-0 justify-center"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={inputRef}
        type="number"
        min="0"
        max="100"
        data-task-id={taskId}
        data-field="progress"
        value={localProgress}
        readOnly={isParent}
        onChange={(e) => setLocalProgress(e.target.value)}
        onBlur={commitValue}
        onFocus={() => {
          if (isParent) return;
          useTaskStore.getState().setFocusedTaskCell(taskId, 'progress');
        }}
        placeholder="0"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "w-full bg-transparent border-none outline-none text-xs text-center font-mono placeholder-gray-300",
          isParent ? "text-gray-400 cursor-not-allowed select-none font-semibold" : "text-gray-600 focus:text-gray-900"
        )}
        onKeyDown={handleKeyDown}
      />
      <span className="text-[10px] text-gray-400 select-none mr-1">%</span>
    </div>
  );
}, cellPropsEqual);

TaskProgressCell.displayName = 'TaskProgressCell';
