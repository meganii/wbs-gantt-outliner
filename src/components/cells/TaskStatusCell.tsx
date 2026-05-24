import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';
import clsx from 'clsx';

interface TaskStatusCellProps {
  taskId: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskStatusCell = ({
  taskId,
  prevId,
  nextId,
  onSelectionChange,
}: TaskStatusCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const status = task?.status || '';
  const isParent = (task?.children.length ?? 0) > 0;
  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  // Local state
  const [localStatus, setLocalStatus] = useState(status);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Sync with store
  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === 'status';
  useEffect(() => {
    if (isFocused && selectRef.current && selectRef.current !== document.activeElement) {
      selectRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = (value: string) => {
    if (status !== value) {
      updateTask(taskId, { status: value });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'status',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: () => {}, // select box saves directly onChange, no blur commit needed
    onSelectionChange,
  });

  if (!task) return null;

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
      className="px-2 border-l border-gray-100 h-full flex items-center flex-shrink-0 justify-center"
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
        onFocus={() => setFocusedTaskCell(taskId, 'status')}
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
};
