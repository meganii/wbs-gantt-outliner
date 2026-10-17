import React, { memo, useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import clsx from 'clsx';
import { formatToShow, formatToEdit, parseInputDate } from '../../utils/date';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

/** 予定日付列のフォーカス対象フィールド（開始/終了のどちらでも列として強調する）。 */
const PLAN_DATE_FIELDS = ['planStartDate', 'planEndDate'] as const;

interface TaskPlanDateCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  baselineLocked: boolean;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskPlanDateCell = memo(({
  taskId,
  task,
  columnWidths,
  baselineLocked,
  prevId,
  nextId,
  onSelectionChange,
}: TaskPlanDateCellProps) => {
  const planStart = task.planStartDate || task.startDate || '';
  const planEnd = task.planEndDate || task.endDate || '';
  const isParent = task.children.length > 0;
  const isReadOnly = baselineLocked || isParent;

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // 初期値はストア値の表示形式で初期化する（TaskDateCell と同じ理由）。
  const [localStart, setLocalStart] = useState(() => formatToShow(planStart));
  const [localEnd, setLocalEnd] = useState(() => formatToShow(planEnd));

  const localStartRef = useRef(formatToShow(planStart));
  const localEndRef = useRef(formatToShow(planEnd));

  const escapedStartRef = useRef(false);
  const escapedEndRef = useRef(false);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocusedStart = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'planStartDate'
  );
  const isFocusedEnd = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'planEndDate'
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する
  // （開始/終了どちらのフィールドでも同じ列として扱う）。
  const isActiveColumn = useIsActiveColumn(taskId, PLAN_DATE_FIELDS);

  // Sync state when focus changes or stored dates change
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [syncedStart, setSyncedStart] = useState({ focused: isFocusedStart, value: planStart });
  if (syncedStart.focused !== isFocusedStart || syncedStart.value !== planStart) {
    setSyncedStart({ focused: isFocusedStart, value: planStart });
    if (!isFocusedStart) {
      setLocalStart(formatToShow(planStart));
    }
  }

  const [syncedEnd, setSyncedEnd] = useState({ focused: isFocusedEnd, value: planEnd });
  if (syncedEnd.focused !== isFocusedEnd || syncedEnd.value !== planEnd) {
    setSyncedEnd({ focused: isFocusedEnd, value: planEnd });
    if (!isFocusedEnd) {
      setLocalEnd(formatToShow(planEnd));
    }
  }

  // commit ハンドラが参照するミラー用 ref を最新化する
  useEffect(() => {
    if (!isFocusedStart) localStartRef.current = formatToShow(planStart);
  }, [isFocusedStart, planStart]);

  useEffect(() => {
    if (!isFocusedEnd) localEndRef.current = formatToShow(planEnd);
  }, [isFocusedEnd, planEnd]);

  // Focus synchronization
  useEffect(() => {
    if (isFocusedStart && startDateRef.current && startDateRef.current !== document.activeElement) {
      startDateRef.current.focus();
    }
  }, [isFocusedStart]);

  useEffect(() => {
    if (isFocusedEnd && endDateRef.current && endDateRef.current !== document.activeElement) {
      endDateRef.current.focus();
    }
  }, [isFocusedEnd]);

  const commitStartValue = () => {
    if (isReadOnly) return;
    const { updateTask, setFocusedTaskCell } = useTaskStore.getState();
    if (escapedStartRef.current) {
      escapedStartRef.current = false;
      const showVal = formatToShow(planStart);
      setLocalStart(showVal);
      localStartRef.current = showVal;
      if (isFocusedStart) {
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
    if (isFocusedStart) {
      setFocusedTaskCell(null, null);
    }
  };

  const commitEndValue = () => {
    if (isReadOnly) return;
    const { updateTask, setFocusedTaskCell } = useTaskStore.getState();
    if (escapedEndRef.current) {
      escapedEndRef.current = false;
      const showVal = formatToShow(planEnd);
      setLocalEnd(showVal);
      localEndRef.current = showVal;
      if (isFocusedEnd) {
        setFocusedTaskCell(null, null);
      }
      return;
    }
    const valToCommit = localEndRef.current;
    const parsed = parseInputDate(valToCommit, planEnd);
    if (parsed !== null) {
      if (parsed !== planEnd) {
        // Enforce planEndDate >= planStartDate
        const currentStart = task.planStartDate || task.startDate;
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
    if (isFocusedEnd) {
      setFocusedTaskCell(null, null);
    }
  };

  const { handleArrowNavigation: handleStartKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planStartDate',
    prevId,
    nextId,
    commitFieldLocalState: commitStartValue,
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'planEndDate',
    prevId,
    nextId,
    commitFieldLocalState: commitEndValue,
    onSelectionChange,
  });

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
      className={clsx(
        'flex items-center justify-center space-x-1 text-xs text-blue-600 px-2 border-l border-gray-100 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-blue-50/10',
        isActiveColumn && activeColumnClass
      )}
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
          placeholder=""
          readOnly={isReadOnly}
          tabIndex={isReadOnly ? -1 : undefined}
          onFocus={() => {
            if (isReadOnly) return;
            const editVal = formatToEdit(planStart);
            setLocalStart(editVal);
            localStartRef.current = editVal;
            useTaskStore.getState().setFocusedTaskCell(taskId, 'planStartDate');
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
          placeholder=""
          readOnly={isReadOnly}
          tabIndex={isReadOnly ? -1 : undefined}
          onFocus={() => {
            if (isReadOnly) return;
            const editVal = formatToEdit(planEnd);
            setLocalEnd(editVal);
            localEndRef.current = editVal;
            useTaskStore.getState().setFocusedTaskCell(taskId, 'planEndDate');
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
}, cellPropsEqual);

TaskPlanDateCell.displayName = 'TaskPlanDateCell';
