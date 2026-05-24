import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskProgressCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskProgressCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskProgressCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const progress = task?.progress !== undefined ? String(task.progress) : '0';
  const isParent = (task?.children.length ?? 0) > 0;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  // Local state
  const [localProgress, setLocalProgress] = useState(progress);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with store
  useEffect(() => {
    setLocalProgress(progress);
  }, [progress]);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === 'progress';
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (isParent) return;
    const val = Math.min(100, Math.max(0, parseInt(localProgress) || 0));
    setLocalProgress(String(val));
    if (task && task.progress !== val) {
      updateTask(taskId, { progress: val });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'progress',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  if (!task) return null;

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
          setFocusedTaskCell(taskId, 'progress');
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
};
