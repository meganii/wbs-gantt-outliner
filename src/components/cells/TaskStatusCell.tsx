import React, { memo, useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import clsx from 'clsx';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskStatusCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskStatusCell = memo(({
  taskId,
  task,
  columnWidths,
  prevId,
  nextId,
  onSelectionChange,
}: TaskStatusCellProps) => {
  const status = task.status || '';
  const isParent = task.children.length > 0;

  // Local state
  const [localStatus, setLocalStatus] = useState(status);
  const selectRef = useRef<HTMLSelectElement>(null);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'status'
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する。
  const isActiveColumn = useIsActiveColumn(taskId, 'status');

  // Sync with store (effect 内での setState を避け、レンダー中に state を調整する)
  const [syncedStatus, setSyncedStatus] = useState(status);
  if (syncedStatus !== status) {
    setSyncedStatus(status);
    setLocalStatus(status);
  }

  // Focus synchronization
  useEffect(() => {
    if (isFocused && selectRef.current && selectRef.current !== document.activeElement) {
      selectRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = (value: string) => {
    if (status !== value) {
      useTaskStore.getState().updateTask(taskId, { status: value });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'status',
    prevId,
    nextId,
    commitFieldLocalState: () => {}, // select box saves directly onChange, no blur commit needed
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (handleArrowNavigation(e, false)) {
      return;
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  const width = columnWidths.status;

  return (
    <div
      className={clsx(
        'px-2 border-l border-gray-100 h-full flex items-center flex-shrink-0 justify-center',
        isActiveColumn && activeColumnClass
      )}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <select
        ref={selectRef}
        value={localStatus}
        disabled={isParent}
        onChange={(e) => {
          const val = e.target.value;
          setLocalStatus(val);
          commitValue(val);
        }}
        onFocus={() => useTaskStore.getState().setFocusedTaskCell(taskId, 'status')}
        data-task-id={taskId}
        data-field="status"
        style={{ backgroundColor: 'transparent' }}
        className={clsx(
          "w-full bg-transparent border border-gray-200 rounded px-1 py-0.5 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-all",
          isParent ? "text-gray-400 cursor-not-allowed select-none font-semibold border-transparent" : "text-gray-700 cursor-pointer",
          localStatus === '完了' && "bg-green-50 text-green-700 border-green-200",
          localStatus === '進行中' && "bg-blue-50 text-blue-700 border-blue-200",
          localStatus === '未着手' && "bg-gray-50 text-gray-700 border-gray-200",
          localStatus === '保留' && "bg-yellow-50 text-yellow-700 border-yellow-200"
        )}
        onKeyDown={handleKeyDown}
      >
        <option value="">-</option>
        <option value="未着手">未着手</option>
        <option value="進行中">進行中</option>
        <option value="完了">完了</option>
        <option value="保留">保留</option>
      </select>
    </div>
  );
}, cellPropsEqual);

TaskStatusCell.displayName = 'TaskStatusCell';
