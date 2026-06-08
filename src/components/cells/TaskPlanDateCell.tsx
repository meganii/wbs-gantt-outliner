import React, { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';
import { formatToShow, formatToEdit, parseInputDate } from '../../utils/date';

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

  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');

  const localStartRef = useRef('');
  const localEndRef = useRef('');

  const escapedStartRef = useRef(false);
  const escapedEndRef = useRef(false);

  const isFocusedStart = focusedTaskId === taskId && focusedTaskField === 'planStartDate';
  const isFocusedEnd = focusedTaskId === taskId && focusedTaskField === 'planEndDate';

  // Sync state when focus changes or stored dates change
  useEffect(() => {
    if (!isFocusedStart) {
      const showVal = formatToShow(planStart);
      setLocalStart(showVal);
      localStartRef.current = showVal;
    }
  }, [isFocusedStart, planStart]);

  useEffect(() => {
    if (!isFocusedEnd) {
      const showVal = formatToShow(planEnd);
      setLocalEnd(showVal);
      localEndRef.current = showVal;
    }
  }, [isFocusedEnd, planEnd]);

  // Focus synchronization
  useEffect(() => {
    if (focusedTaskId !== taskId) return;

    if (focusedTaskField === 'planStartDate' && startDateRef.current && startDateRef.current !== document.activeElement) {
      startDateRef.current.focus();
    } else if (focusedTaskField === 'planEndDate' && endDateRef.current && endDateRef.current !== document.activeElement) {
      endDateRef.current.focus();
    }
  }, [focusedTaskId, focusedTaskField, taskId]);

  const commitStartValue = () => {
    if (isReadOnly) return;
    if (escapedStartRef.current) {
      escapedStartRef.current = false;
      const showVal = formatToShow(planStart);
      setLocalStart(showVal);
      localStartRef.current = showVal;
      if (focusedTaskId === taskId && focusedTaskField === 'planStartDate') {
        setFocusedTaskCell(null, null);
      }
      return;
    }
    const valToCommit = localStartRef.current;
    const parsed = parseInputDate(valToCommit, planStart);
    if (parsed !== null) {
      if (parsed !== planStart) {
        updateTask(taskId, { planStartDate: parsed });
      }
    } else {
      if (valToCommit.trim() === '') {
        updateTask(taskId, { planStartDate: '' });
      } else {
        const showVal = formatToShow(planStart);
        setLocalStart(showVal);
        localStartRef.current = showVal;
      }
    }
    if (focusedTaskId === taskId && focusedTaskField === 'planStartDate') {
      setFocusedTaskCell(null, null);
    }
  };

  const commitEndValue = () => {
    if (isReadOnly) return;
    if (escapedEndRef.current) {
      escapedEndRef.current = false;
      const showVal = formatToShow(planEnd);
      setLocalEnd(showVal);
      localEndRef.current = showVal;
      if (focusedTaskId === taskId && focusedTaskField === 'planEndDate') {
        setFocusedTaskCell(null, null);
      }
      return;
    }
    const valToCommit = localEndRef.current;
    const parsed = parseInputDate(valToCommit, planEnd);
    if (parsed !== null) {
      if (parsed !== planEnd) {
        // Enforce planEndDate >= planStartDate
        const currentStart = task?.planStartDate || task?.startDate;
        if (currentStart) {
          const start = new Date(currentStart);
          const end = new Date(parsed);
          if (end < start) {
            const showVal = formatToShow(planEnd);
            setLocalEnd(showVal);
            localEndRef.current = showVal;
            return;
          }
        }
        updateTask(taskId, { planEndDate: parsed });
      }
    } else {
      if (valToCommit.trim() === '') {
        updateTask(taskId, { planEndDate: '' });
      } else {
        const showVal = formatToShow(planEnd);
        setLocalEnd(showVal);
        localEndRef.current = showVal;
      }
    }
    if (focusedTaskId === taskId && focusedTaskField === 'planEndDate') {
      setFocusedTaskCell(null, null);
    }
  };

  const { handleArrowNavigation: handleStartKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planStartDate',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: commitStartValue,
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planEndDate',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: commitEndValue,
    onSelectionChange,
  });

  if (!task) return null;

  const handleStartKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapedStartRef.current = true;
      e.stopPropagation();
      e.currentTarget.blur();
      return;
    }
    if (handleStartKeyDown(e, false)) return;
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.currentTarget.blur();
    }
  };

  const handleEndKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapedEndRef.current = true;
      e.stopPropagation();
      e.currentTarget.blur();
      return;
    }
    if (handleEndKeyDown(e, false)) return;
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.currentTarget.blur();
    }
  };

  const width = columnWidths.planDate;

  return (
    <div
      className="flex items-center justify-center space-x-1 text-xs text-blue-600 px-2 border-l border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-blue-50/10"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <div className="relative w-20 h-full flex items-center justify-center">
        {!isFocusedStart && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] text-blue-700 font-medium select-none">
            {formatToShow(planStart) || (isReadOnly ? "" : "yyyy/mm/dd")}
          </span>
        )}
        <input
          ref={startDateRef}
          type="text"
          value={localStart}
          placeholder={isReadOnly ? "" : "yyyy/mm/dd"}
          readOnly={isReadOnly}
          tabIndex={isReadOnly ? -1 : undefined}
          onFocus={() => {
            if (isReadOnly) return;
            const editVal = formatToEdit(planStart);
            setLocalStart(editVal);
            localStartRef.current = editVal;
            setFocusedTaskCell(taskId, 'planStartDate');
          }}
          onChange={(e) => {
            if (isReadOnly) return;
            setLocalStart(e.target.value);
            localStartRef.current = e.target.value;
          }}
          onBlur={commitStartValue}
          onKeyDown={handleStartKey}
          data-task-id={taskId}
          data-field="planStartDate"
          style={{ backgroundColor: 'transparent' }}
          className={clsx(
            "bg-transparent outline-none w-20 text-center text-[10px] text-blue-700 focus:bg-blue-50 cursor-pointer",
            isReadOnly
              ? "text-gray-400 cursor-not-allowed select-none font-semibold"
              : "hover:text-blue-900 text-blue-600 focus:bg-blue-50",
            !isFocusedStart && "text-transparent caret-transparent"
          )}
          title={isParent ? "予定開始日は子タスクから自動計算されます" : undefined}
        />
      </div>

      <span className="text-blue-300">-</span>

      <div className="relative w-20 h-full flex items-center justify-center">
        {!isFocusedEnd && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] text-blue-700 font-medium select-none">
            {formatToShow(planEnd) || (isReadOnly ? "" : "yyyy/mm/dd")}
          </span>
        )}
        <input
          ref={endDateRef}
          type="text"
          value={localEnd}
          placeholder={isReadOnly ? "" : "yyyy/mm/dd"}
          readOnly={isReadOnly}
          tabIndex={isReadOnly ? -1 : undefined}
          onFocus={() => {
            if (isReadOnly) return;
            const editVal = formatToEdit(planEnd);
            setLocalEnd(editVal);
            localEndRef.current = editVal;
            setFocusedTaskCell(taskId, 'planEndDate');
          }}
          onChange={(e) => {
            if (isReadOnly) return;
            setLocalEnd(e.target.value);
            localEndRef.current = e.target.value;
          }}
          onBlur={commitEndValue}
          onKeyDown={handleEndKey}
          data-task-id={taskId}
          data-field="planEndDate"
          style={{ backgroundColor: 'transparent' }}
          className={clsx(
            "bg-transparent outline-none w-20 text-center text-[10px] text-blue-700 focus:bg-blue-50 cursor-pointer",
            isReadOnly
              ? "text-gray-400 cursor-not-allowed select-none font-semibold"
              : "hover:text-blue-900 text-blue-600 focus:bg-blue-50",
            !isFocusedEnd && "text-transparent caret-transparent"
          )}
          title={isParent ? "予定終了日は子タスクから自動計算されます" : undefined}
        />
      </div>
    </div>
  );
};


