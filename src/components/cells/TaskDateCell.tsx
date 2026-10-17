import React, { memo, useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import clsx from 'clsx';
import { formatToShow, formatToEdit, parseInputDate } from '../../utils/date';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

/** 実績日付列のフォーカス対象フィールド（開始/終了のどちらでも列として強調する）。 */
const DATE_FIELDS = ['startDate', 'endDate'] as const;

interface TaskDateCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskDateCell = memo(({
  taskId,
  task,
  columnWidths,
  prevId,
  nextId,
  onSelectionChange,
}: TaskDateCellProps) => {
  const startValue = task.startDate || '';
  const endValue = task.endDate || '';
  const isParent = task.children.length > 0;

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // 初期値はストア値の表示形式で初期化する。空文字で開始すると、透明化した input の
  // placeholder（yyyy/mm/dd）が Overlay Span と重なって見える（文字重なりの原因）。
  const [localStart, setLocalStart] = useState(() => formatToShow(startValue));
  const [localEnd, setLocalEnd] = useState(() => formatToShow(endValue));

  const localStartRef = useRef(formatToShow(startValue));
  const localEndRef = useRef(formatToShow(endValue));

  const escapedStartRef = useRef(false);
  const escapedEndRef = useRef(false);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocusedStart = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'startDate'
  );
  const isFocusedEnd = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'endDate'
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する
  // （開始/終了どちらのフィールドでも同じ列として扱う）。
  const isActiveColumn = useIsActiveColumn(taskId, DATE_FIELDS);

  const isReadOnly = isParent;

  // Sync state when focus changes or stored dates change
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [syncedStart, setSyncedStart] = useState({ focused: isFocusedStart, value: startValue });
  if (syncedStart.focused !== isFocusedStart || syncedStart.value !== startValue) {
    setSyncedStart({ focused: isFocusedStart, value: startValue });
    if (!isFocusedStart) {
      setLocalStart(formatToShow(startValue));
    }
  }

  const [syncedEnd, setSyncedEnd] = useState({ focused: isFocusedEnd, value: endValue });
  if (syncedEnd.focused !== isFocusedEnd || syncedEnd.value !== endValue) {
    setSyncedEnd({ focused: isFocusedEnd, value: endValue });
    if (!isFocusedEnd) {
      setLocalEnd(formatToShow(endValue));
    }
  }

  // commit ハンドラが参照するミラー用 ref を最新化する
  useEffect(() => {
    if (!isFocusedStart) localStartRef.current = formatToShow(startValue);
  }, [isFocusedStart, startValue]);

  useEffect(() => {
    if (!isFocusedEnd) localEndRef.current = formatToShow(endValue);
  }, [isFocusedEnd, endValue]);

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
      const showVal = formatToShow(startValue);
      setLocalStart(showVal);
      localStartRef.current = showVal;
      if (isFocusedStart) {
        setFocusedTaskCell(null, null);
      }
      return;
    }
    const valToCommit = localStartRef.current;
    const parsed = parseInputDate(valToCommit, startValue);
    if (parsed !== null) {
      if (parsed !== startValue) {
        updateTask(taskId, { startDate: parsed });
      }
    } else {
      if (valToCommit.trim() === '') {
        updateTask(taskId, { startDate: '' });
      } else {
        const showVal = formatToShow(startValue);
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
      const showVal = formatToShow(endValue);
      setLocalEnd(showVal);
      localEndRef.current = showVal;
      if (isFocusedEnd) {
        setFocusedTaskCell(null, null);
      }
      return;
    }
    const valToCommit = localEndRef.current;
    const parsed = parseInputDate(valToCommit, endValue);
    if (parsed !== null) {
      if (parsed !== endValue) {
        // Enforce endDate >= startDate
        const currentStart = task.startDate;
        if (currentStart) {
          const start = new Date(currentStart);
          const end = new Date(parsed);
          if (end < start) {
            const showVal = formatToShow(endValue);
            setLocalEnd(showVal);
            localEndRef.current = showVal;
            return;
          }
        }
        updateTask(taskId, { endDate: parsed });
      }
    } else {
      if (valToCommit.trim() === '') {
        updateTask(taskId, { endDate: '' });
      } else {
        const showVal = formatToShow(endValue);
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
    field: 'startDate',
    prevId,
    nextId,
    commitFieldLocalState: commitStartValue,
    onSelectionChange,
  });

  const { handleArrowNavigation: handleEndKeyDown } = useTaskCellKeyboard({
    taskId,
    field: 'endDate',
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

  const width = columnWidths.date;

  return (
    <div
      className={clsx(
        'flex items-center justify-center space-x-1 text-xs text-gray-500 px-2 border-l border-gray-100 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0',
        isActiveColumn && activeColumnClass
      )}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <div className="relative w-20 h-full flex items-center justify-center">
        {!isFocusedStart && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] text-gray-600 font-medium select-none">
            {formatToShow(startValue) || (isReadOnly ? "" : "yyyy/mm/dd")}
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
            const editVal = formatToEdit(startValue);
            setLocalStart(editVal);
            localStartRef.current = editVal;
            useTaskStore.getState().setFocusedTaskCell(taskId, 'startDate');
          }}
          onChange={(e) => {
            if (isReadOnly) return;
            setLocalStart(e.target.value);
            localStartRef.current = e.target.value;
          }}
          onBlur={commitStartValue}
          onKeyDown={handleStartKey}
          data-task-id={taskId}
          data-field="startDate"
          style={{ backgroundColor: 'transparent' }}
          className={clsx(
            "bg-transparent outline-none w-20 text-center text-[10px] text-gray-700 focus:bg-gray-50 cursor-pointer",
            isReadOnly
              ? "text-gray-400 cursor-not-allowed select-none font-semibold"
              : "hover:text-gray-900 text-gray-600 focus:bg-gray-50",
            !isFocusedStart && "text-transparent caret-transparent"
          )}
          title={isParent ? "開始日は子タスクから自動計算されます" : undefined}
        />
      </div>

      <span className="text-gray-400">-</span>

      <div className="relative w-20 h-full flex items-center justify-center">
        {!isFocusedEnd && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] text-gray-600 font-medium select-none">
            {formatToShow(endValue) || (isReadOnly ? "" : "yyyy/mm/dd")}
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
            const editVal = formatToEdit(endValue);
            setLocalEnd(editVal);
            localEndRef.current = editVal;
            useTaskStore.getState().setFocusedTaskCell(taskId, 'endDate');
          }}
          onChange={(e) => {
            if (isReadOnly) return;
            setLocalEnd(e.target.value);
            localEndRef.current = e.target.value;
          }}
          onBlur={commitEndValue}
          onKeyDown={handleEndKey}
          data-task-id={taskId}
          data-field="endDate"
          style={{ backgroundColor: 'transparent' }}
          className={clsx(
            "bg-transparent outline-none w-20 text-center text-[10px] text-gray-700 focus:bg-gray-50 cursor-pointer",
            isReadOnly
              ? "text-gray-400 cursor-not-allowed select-none font-semibold"
              : "hover:text-gray-900 text-gray-600 focus:bg-gray-50",
            !isFocusedEnd && "text-transparent caret-transparent"
          )}
          title={isParent ? "終了日は子タスクから自動計算されます" : undefined}
        />
      </div>
    </div>
  );
}, cellPropsEqual);

TaskDateCell.displayName = 'TaskDateCell';
