import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskPlanDateCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskPlanDateCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskPlanDateCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

  const planStart = task?.planStartDate || task?.startDate || '';
  const planEnd = task?.planEndDate || task?.endDate || '';
  const isParent = (task?.children.length ?? 0) > 0;
  const isReadOnly = baselineLocked || isParent;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Focus synchronization
  useEffect(() => {
    if (focusedTaskId !== taskId) return;

    if (focusedTaskField === 'planStartDate' && startDateRef.current && startDateRef.current !== document.activeElement) {
      startDateRef.current.focus();
    } else if (focusedTaskField === 'planEndDate' && endDateRef.current && endDateRef.current !== document.activeElement) {
      endDateRef.current.focus();
    }
  }, [focusedTaskId, focusedTaskField, taskId]);

  const { handleArrowNavigation: handleStartKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planStartDate',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: () => {},
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planEndDate',
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

  const width = columnWidths.planDate;

  return (
    <div
      className="flex items-center justify-center space-x-1 text-xs text-blue-600 px-2 border-l border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-blue-50/10"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={startDateRef}
        type="date"
        value={planStart}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : undefined}
        onFocus={() => {
          if (isReadOnly) return;
          setFocusedTaskCell(taskId, 'planStartDate');
        }}
        onChange={(e) => {
          if (isReadOnly) return;
          updateTask(taskId, { planStartDate: e.target.value });
        }}
        onKeyDown={handleStartKey}
        data-task-id={taskId}
        data-field="planStartDate"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent outline-none w-20 text-center text-[10px] text-blue-700",
          isReadOnly
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "cursor-pointer hover:text-blue-900 text-blue-600"
        )}
        title={isParent ? "Start date is automatically calculated from children" : undefined}
      />

      <span className="text-blue-300">-</span>

      <input
        ref={endDateRef}
        type="date"
        value={planEnd}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : undefined}
        onFocus={() => {
          if (isReadOnly) return;
          setFocusedTaskCell(taskId, 'planEndDate');
        }}
        onChange={(e) => {
          if (isReadOnly) return;
          const newEndDate = e.target.value;
          const currentStart = task.planStartDate || task.startDate;
          if (!newEndDate || !currentStart) return;
          const start = new Date(currentStart);
          const end = new Date(newEndDate);
          if (end < start) return;
          updateTask(taskId, { planEndDate: newEndDate });
        }}
        onKeyDown={handleEndKey}
        data-task-id={taskId}
        data-field="planEndDate"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "bg-transparent outline-none w-20 text-center text-[10px] text-blue-700",
          isReadOnly
            ? "text-gray-400 cursor-not-allowed select-none font-semibold"
            : "cursor-pointer hover:text-blue-900 text-blue-600"
        )}
        title={isParent ? "End date is automatically calculated from children" : undefined}
      />
    </div>
  );
};
