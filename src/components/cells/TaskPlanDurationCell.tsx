import React, { memo, useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import clsx from 'clsx';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskPlanDurationCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  baselineLocked: boolean;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskPlanDurationCell = memo(({
  taskId,
  task,
  columnWidths,
  baselineLocked,
  prevId,
  nextId,
  onSelectionChange,
}: TaskPlanDurationCellProps) => {
  const planDurationValue = task.planDuration !== undefined ? task.planDuration : (task.duration ?? 0);
  const storeValue = String(planDurationValue);
  const isParent = task.children.length > 0;
  const isReadOnly = baselineLocked || isParent;

  const inputRef = useRef<HTMLInputElement>(null);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'planDuration'
  );

  // Local state for performant typing (1 文字ごとに updateTask を呼ばない)
  const [localValue, setLocalValue] = useState(storeValue);
  const localValueRef = useRef(storeValue);
  const escapedRef = useRef(false);

  // Sync with store updates (e.g. undo/redo). 編集中(フォーカス中)は上書きしない。
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const [synced, setSynced] = useState({ focused: isFocused, value: storeValue });
  if (synced.focused !== isFocused || synced.value !== storeValue) {
    setSynced({ focused: isFocused, value: storeValue });
    if (!isFocused) {
      setLocalValue(storeValue);
    }
  }

  // commit ハンドラが参照するミラー用 ref を最新化する
  useEffect(() => {
    if (!isFocused) localValueRef.current = storeValue;
  }, [isFocused, storeValue]);

  // Focus synchronization
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (isReadOnly) return;

    const { updateTask, setFocusedTaskCell } = useTaskStore.getState();

    if (escapedRef.current) {
      escapedRef.current = false;
      setLocalValue(storeValue);
      localValueRef.current = storeValue;
      if (isFocused) setFocusedTaskCell(null, null);
      return;
    }

    const parsed = parseInt(localValueRef.current, 10);
    if (Number.isNaN(parsed)) {
      // 数値として解釈できない入力は元の値へ戻す
      setLocalValue(storeValue);
      localValueRef.current = storeValue;
    } else {
      const nextValue = Math.max(0, parsed);
      setLocalValue(String(nextValue));
      localValueRef.current = String(nextValue);
      if (nextValue !== planDurationValue) {
        updateTask(taskId, { planDuration: nextValue });
      }
    }

    if (isFocused) setFocusedTaskCell(null, null);
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'planDuration',
    prevId,
    nextId,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      escapedRef.current = true;
      e.stopPropagation();
      e.currentTarget.blur();
      return;
    }

    if (handleArrowNavigation(e, false)) {
      return;
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
      e.currentTarget.blur();
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
        min="0"
        value={localValue}
        readOnly={isReadOnly}
        tabIndex={isReadOnly ? -1 : undefined}
        onFocus={() => {
          if (isReadOnly) return;
          useTaskStore.getState().setFocusedTaskCell(taskId, 'planDuration');
        }}
        onChange={(e) => {
          if (isReadOnly) return;
          setLocalValue(e.target.value);
          localValueRef.current = e.target.value;
        }}
        onBlur={commitValue}
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
        title={isParent ? "期間は子タスクから自動計算されます" : "予定期間（日）"}
      />
    </div>
  );
}, cellPropsEqual);

TaskPlanDurationCell.displayName = 'TaskPlanDurationCell';
