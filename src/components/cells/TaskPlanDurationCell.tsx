import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskPlanDurationCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskPlanDurationCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskPlanDurationCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

  const durationValue = task?.planDuration !== undefined ? task.planDuration : (task?.duration ?? 0);
  const isParent = (task?.children.length ?? 0) > 0;
  const isReadOnly = baselineLocked || isParent;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === 'planDuration';
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    // Input natively saves during onChange for smooth experience. 
    // No blur logic is strictly required, but focus control matches.
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'planDuration',
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

  const width = columnWidths.planDuration;

  return (
    <div
      className="flex items-center justify-center text-xs text-blue-600 px-2 border-l border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-blue-50/10"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={inputRef}
        type="number"
        value={durationValue}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : undefined}
        onFocus={() => {
          if (isReadOnly) return;
          setFocusedTaskCell(taskId, 'planDuration');
        }}
        onChange={(e) => {
          if (isReadOnly) return;
          const newDuration = parseInt(e.target.value) || 0;
          updateTask(taskId, { planDuration: newDuration });
        }}
        onKeyDown={handleKeyDown}
        data-task-id={taskId}
        data-field="planDuration"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent w-full text-center outline-none border-b border-transparent text-blue-700",
          isReadOnly
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "focus:border-blue-300 focus:text-blue-900"
        )}
        title={isParent ? "Duration is automatically calculated from children" : "Plan Duration (days)"}
      />
    </div>
  );
};
