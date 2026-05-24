import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskDateCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskDateCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskDateCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const startValue = task?.startDate || '';
  const endValue = task?.endDate || '';
  const isParent = (task?.children.length ?? 0) > 0;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Focus synchronization
  useEffect(() => {
    if (focusedTaskId !== taskId) return;

    if (focusedTaskField === 'startDate' && startDateRef.current && startDateRef.current !== document.activeElement) {
      startDateRef.current.focus();
    } else if (focusedTaskField === 'endDate' && endDateRef.current && endDateRef.current !== document.activeElement) {
      endDateRef.current.focus();
    }
  }, [focusedTaskId, focusedTaskField, taskId]);

  const { handleArrowNavigation: handleStartKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'startDate',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: () => {},
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'endDate',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: () => {},
    onSelectionChange,
  });

  if (!task) return null;

  const handleStartKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleStartKeyDown(e, false)) return;
    if (e.key === 'Enter') e.stopPropagation();
  };

  const handleEndKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleEndKeyDown(e, false)) return;
    if (e.key === 'Enter') e.stopPropagation();
  };

  const width = columnWidths.date;

  return (
    <div
      className="flex items-center justify-center space-x-1 text-xs text-gray-500 px-2 border-l border-gray-100 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={startDateRef}
        type="date"
        value={startValue}
        readOnly={isParent}
        tabIndex={isParent ? -1 : undefined}
        onFocus={() => {
          if (isParent) return;
          setFocusedTaskCell(taskId, 'startDate');
        }}
        onChange={(e) => {
          if (isParent) return;
          updateTask(taskId, { startDate: e.target.value });
        }}
        onKeyDown={handleStartKey}
        data-task-id={taskId}
        data-field="startDate"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent outline-none w-20 text-center text-[10px]",
          isParent
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "cursor-pointer hover:text-gray-900 text-gray-600"
        )}
        title={isParent ? "Start date is automatically calculated from children" : undefined}
      />

      <span className="text-gray-400">-</span>

      <input
        ref={endDateRef}
        type="date"
        value={endValue}
        readOnly={isParent}
        tabIndex={isParent ? -1 : undefined}
        onFocus={() => {
          if (isParent) return;
          setFocusedTaskCell(taskId, 'endDate');
        }}
        onChange={(e) => {
          if (isParent) return;
          const newEndDate = e.target.value;
          if (!newEndDate || !task.startDate) return;
          const start = new Date(task.startDate);
          const end = new Date(newEndDate);
          if (end < start) return;
          updateTask(taskId, { endDate: newEndDate });
        }}
        onKeyDown={handleEndKey}
        data-task-id={taskId}
        data-field="endDate"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent outline-none w-20 text-center text-[10px]",
          isParent
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "cursor-pointer hover:text-gray-900 text-gray-600"
        )}
        title={isParent ? "End date is automatically calculated from children" : undefined}
      />
    </div>
  );
};
