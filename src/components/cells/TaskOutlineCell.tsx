import React, { memo, useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { useTaskCellKeyboard, getEffectiveTaskIds } from '../../hooks/useTaskCellKeyboard';
import { cellPropsEqual } from './cellPropsEqual';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { ProjectConfig, Task } from '../../types';

type ColumnWidths = ProjectConfig['columnWidths'];

interface TaskOutlineCellProps {
  taskId: string;
  task: Task;
  columnWidths: ColumnWidths;
  depth?: number;
  wbsNumber?: string;
  prevId?: string;
  nextId?: string;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
}

export const TaskOutlineCell = memo(({
  taskId,
  task,
  columnWidths,
  depth = 0,
  wbsNumber,
  prevId,
  nextId,
  onSelectionChange,
  attributes,
  listeners,
}: TaskOutlineCellProps) => {
  // Local state for performant typing and IME
  const [localTitle, setLocalTitle] = useState(task.title || '');
  const isComposing = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // フォーカス状態だけを boolean で購読する（行/選択の変更で全行を再描画させない）
  const isFocused = useTaskStore(
    (state) => state.focusedTaskId === taskId && state.focusedTaskField === 'title'
  );

  // Sync with store updates (e.g. undo/redo)
  // (effect 内での setState を避け、レンダー中に state を調整する)
  const storeTitle = task.title ?? '';
  const [syncedTitle, setSyncedTitle] = useState(storeTitle);
  if (syncedTitle !== storeTitle) {
    setSyncedTitle(storeTitle);
    setLocalTitle(storeTitle);
  }

  // Focus synchronization
  useEffect(() => {
    if (isFocused && titleInputRef.current && titleInputRef.current !== document.activeElement) {
      titleInputRef.current.focus();
    }
  }, [isFocused]);

  const commitValue = () => {
    if (task.title !== localTitle) {
      useTaskStore.getState().updateTask(taskId, { title: localTitle });
    }
  };

  const { handleArrowNavigation } = useTaskCellKeyboard({
    taskId,
    field: 'title',
    prevId,
    nextId,
    commitFieldLocalState: commitValue,
    onSelectionChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleArrowNavigation(e, isComposing.current)) {
      return;
    }

    // 選択状態（操作対象 ID 群）はイベント発生時に最新値を読む。
    // 購読すると選択変更のたびに全行のセルが再描画されるため。
    const { addTask, deleteTask, setFocusedTaskCell } = useTaskStore.getState();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      commitValue();
      addTask(taskId, 'after');
    }

    if (e.key === 'Backspace' && localTitle === '') {
      e.preventDefault();
      if (e.repeat) return;
      const effectiveIds = getEffectiveTaskIds(taskId);
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
      const effectiveIds = getEffectiveTaskIds(taskId);
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
          {...(attributes ?? {})}
          {...listeners}
          onPointerDown={(e) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              onSelectionChange?.(taskId, e.metaKey || e.ctrlKey, e.shiftKey);
              return;
            }
            listeners?.onPointerDown?.(e);
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
          useTaskStore.getState().toggleCollapse(taskId);
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
        onFocus={() => useTaskStore.getState().setFocusedTaskCell(taskId, 'title')}
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
}, cellPropsEqual);

TaskOutlineCell.displayName = 'TaskOutlineCell';
