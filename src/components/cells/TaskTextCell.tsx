import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';

interface TaskTextCellProps {
  taskId: string;
  field: 'description' | 'assignee' | 'deliverables';
  placeholder: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
}

export const TaskTextCell = ({
  taskId,
  field,
  placeholder,
  prevId,
  nextId,
  onSelectionChange,
}: TaskTextCellProps) => {
  const value = useTaskStore((state) => state.tasks[taskId]?.[field] || '');
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const updateTask = useTaskStore((state) => state.updateTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  // Local state for performance
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with store updates
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === field;
  useEffect(() => {
    if (isFocused && inputRef.current && inputRef.current !== document.activeElement) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (value !== localValue) {
      updateTask(taskId, { [field]: localValue });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field,
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowNavigation(e, isComposing.current)) {
      return;
    }

    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  const width = columnWidths[field];

  return (
    <div
      className="px-2 border-l border-gray-100 h-full flex items-center flex-shrink-0"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <input
        ref={inputRef}
        type="text"
        data-task-id={taskId}
        data-field={field}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commitValue}
        onFocus={() => setFocusedTaskCell(taskId, field)}
        placeholder={placeholder}
        style={{ backgroundColor: 'transparent' }}
        className="w-full bg-transparent border-none outline-none text-xs text-gray-600 placeholder-gray-300 truncate"
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
        }}
      />
    </div>
  );
};
