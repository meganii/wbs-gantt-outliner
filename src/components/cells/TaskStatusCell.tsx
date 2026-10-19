import React, { memo, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import { activeColumnClass, useIsActiveColumn } from './cellHighlight';
import { deriveStatus } from '../../store/taskStoreUtils';
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

/**
 * ステータス列。2 層モデルではステータスは進捗率から導出される（規則 7）ため、
 * このセルは表示のみで入力は受け付けない（進捗率セルで変更する）。
 */
export const TaskStatusCell = memo(({
  taskId,
  task,
  columnWidths,
  prevId,
  nextId,
  onSelectionChange,
}: TaskStatusCellProps) => {
  const status = task.status || deriveStatus(task.progress || 0);
  const isParent = task.children.length > 0;

  const cellRef = useRef<HTMLDivElement>(null);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'status'
  );

  // 複数行選択中は、フォーカス中の列を選択行にまたがる帯として強調する。
  const isActiveColumn = useIsActiveColumn(taskId, 'status');

  // Focus synchronization
  useEffect(() => {
    if (isFocused && cellRef.current && cellRef.current !== document.activeElement) {
      cellRef.current.focus();
    }
  }, [isFocused]);

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'status',
    prevId,
    nextId,
    commitFieldLocalState: () => {},
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
    handleArrowNavigation(e, false);
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
      <div
        ref={cellRef}
        tabIndex={0}
        data-task-id={taskId}
        data-field="status"
        title="状態は進捗率から自動計算されます"
        onFocus={() => useTaskStore.getState().setFocusedTaskCell(taskId, 'status')}
        onKeyDown={handleKeyDown}
        className={clsx(
          'w-full rounded border px-1 py-0.5 text-center text-[10px] font-medium outline-none transition-all focus:ring-1 focus:ring-blue-400',
          isParent
            ? 'cursor-not-allowed border-transparent font-semibold text-gray-400 select-none'
            : 'cursor-default',
          status === '完了' && 'border-green-200 bg-green-50 text-green-700',
          status === '進行中' && 'border-blue-200 bg-blue-50 text-blue-700',
          (status === '未着手' || !status) && 'border-gray-200 bg-gray-50 text-gray-700'
        )}
      >
        {status || '-'}
      </div>
    </div>
  );
}, cellPropsEqual);

TaskStatusCell.displayName = 'TaskStatusCell';
