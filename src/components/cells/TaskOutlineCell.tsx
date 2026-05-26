import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { useTaskCellKeyboard } from '../../hooks/useTaskCellKeyboard';

interface TaskOutlineCellProps {
  taskId: string;
  depth?: number;
  wbsNumber?: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
  attributes?: any;
  listeners?: any;
}

export const TaskOutlineCell = ({
  taskId,
  depth = 0,
  wbsNumber,
  prevId,
  nextId,
  onSelectionChange,
  attributes,
  listeners,
}: TaskOutlineCellProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const toggleCollapse = useTaskStore((state) => state.toggleCollapse);
  const updateTask = useTaskStore((state) => state.updateTask);
  const addTask = useTaskStore((state) => state.addTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const setFocusedTaskCell = useTaskStore((state) => state.setFocusedTaskCell);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const focusedTaskField = useTaskStore((state) => state.focusedTaskField);

  const effectiveIds = selectedTaskIds.includes(taskId) ? selectedTaskIds : [taskId];

  // Local state for performant typing and IME
  const [localTitle, setLocalTitle] = useState(task?.title || '');
  const isComposing = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync with store updates (e.g. undo/redo)
  useEffect(() => {
    setLocalTitle(task?.title || '');
  }, [task?.title]);

  // Focus synchronization
  const isFocused = focusedTaskId === taskId && focusedTaskField === 'title';
  useEffect(() => {
    if (isFocused && titleInputRef.current && titleInputRef.current !== document.activeElement) {
      titleInputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (task && task.title !== localTitle) {
      updateTask(taskId, { title: localTitle });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'title',
    prevId,
    nextId,
    effectiveIds,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  if (!task) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowNavigation(e, isComposing.current)) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      commitValue();
      addTask(taskId, 'after');
    }

    if (e.key === 'Backspace' && localTitle === '') {
      e.preventDefault();
      if (e.repeat) return;
      if (effectiveIds.length <= 1) {
        const targetPrev = prevId;
        deleteTask(taskId);
        if (targetPrev) {
          setFocusedTaskCell(targetPrev, 'title');
        }
      }
    }

    if (e.key === 'Delete' || (e.metaKey && e.key === 'Backspace')) {
      e.preventDefault();
      if (e.repeat) return;
      const targetFocus = prevId || nextId;
      deleteTask(effectiveIds);
      if (targetFocus && !effectiveIds.includes(targetFocus)) {
        setFocusedTaskCell(targetFocus, 'title');
      }
    }
  };

  return (
    <div
      className="flex items-center flex-1 h-full"
      style={{
        paddingLeft: `${depth * 20 + 8}px`,
        width: columnWidths.taskName,
        minWidth: columnWidths.taskName,
        maxWidth: columnWidths.taskName,
      }}
    >
      {/* Drag Handle */}
      {listeners && (
        <button
          className="opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab mr-1 text-gray-400 focus:outline-none flex-shrink-0"
          {...attributes}
          {...listeners}
          onPointerDown={(e) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              onSelectionChange?.(taskId, e.metaKey || e.ctrlKey, e.shiftKey);
              return;
            }
            listeners.onPointerDown(e);
          }}
        >
          <GripVertical size={14} />
        </button>
      )}
      {!listeners && (
        <div className="w-[18px] flex-shrink-0" />
      )}

      {/* Collapse/Expand */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleCollapse(taskId);
        }}
        className={clsx(
          "p-0.5 rounded hover:bg-gray-100 text-gray-400 mr-1 flex-shrink-0",
          task.children.length === 0 && "invisible"
        )}
      >
        {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* WBS Number */}
      <span className="text-xs text-gray-500 font-mono mr-2 min-w-[36px] text-right select-none flex-shrink-0">
        {wbsNumber}
      </span>

      {/* Title Input */}
      <input
        ref={titleInputRef}
        type="text"
        data-task-id={taskId}
        data-field="title"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={commitValue}
        onFocus={() => setFocusedTaskCell(taskId, 'title')}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
        }}
        placeholder="New Task"
        style={{ backgroundColor: 'transparent' }}
        className="bg-transparent border-none outline-none text-sm text-gray-800 flex-1 min-w-0 placeholder-gray-400 focus:placeholder-gray-300 truncate"
      />
    </div>
  );
};
