import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskDurationCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskDurationCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskDurationCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const durationValue = task?.duration ?? 0;
  const isParent = (task?.children.length ?? 0) > 0;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === 'duration';
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {};

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'duration',
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

  const width = columnWidths.duration;

  return (
    <div
      className="flex items-center justify-center text-xs text-gray-500 px-2 border-l border-gray-100 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={inputRef}
        type="number"
        value={durationValue}
        readOnly={isParent}
        tabIndex={isParent ? -1 : undefined}
        onFocus={() => {
          if (isParent) return;
          setFocusedTaskCell(taskId, 'duration');
        }}
        onChange={(e) => {
          if (isParent) return;
          const newDuration = parseInt(e.target.value) || 0;
          updateTask(taskId, { duration: newDuration });
        }}
        onKeyDown={handleKeyDown}
        data-task-id={taskId}
        data-field="duration"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent w-full text-center outline-none border-b border-transparent",
          isParent
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "focus:border-gray-300 focus:text-gray-900"
        )}
        title={isParent ? "Duration is automatically calculated from children" : "Duration (days)"}
      />
    </div>
  );
};
