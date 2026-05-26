import React, { memo } from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Import newly refactored discrete cell components
import { TaskOutlineCell } from './cells/TaskOutlineCell';
import { TaskTextCell } from './cells/TaskTextCell';
import { TaskStatusCell } from './cells/TaskStatusCell';
import { TaskProgressCell } from './cells/TaskProgressCell';
import { TaskPlanDurationCell } from './cells/TaskPlanDurationCell';
import { TaskPlanDateCell } from './cells/TaskPlanDateCell';
import { TaskDurationCell } from './cells/TaskDurationCell';
import { TaskDateCell } from './cells/TaskDateCell';

import type { ColumnId, Task } from '../types';

interface TaskRowProps {
  taskId: string;
  task: Task;
  depth?: number;
  prevId?: string;
  nextId?: string;
  wbsNumber?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  onHoverChange?: (taskId: string | null) => void;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
  visibleColumns: ColumnId[];
  suppressBorder?: boolean;
  disableHoverHandlers?: boolean;
  renderContainer?: (args: {
    content: React.ReactNode;
    setContainerRef: (node: HTMLDivElement | null) => void;
    containerStyle: React.CSSProperties;
    isDragging: boolean;
  }) => React.ReactNode;
}

export const TaskRow = memo(({
  taskId,
  task,
  depth = 0,
  prevId,
  nextId,
  wbsNumber,
  isSelected,
  isHovered = false,
  onHoverChange,
  onSelectionChange,
  visibleColumns,
  suppressBorder = false,
  disableHoverHandlers = false,
  renderContainer,
}: TaskRowProps) => {

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRowMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click

    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    const isMulti = e.ctrlKey || e.metaKey;
    const isRange = e.shiftKey;

    if (target.tagName === 'INPUT') {
      const isReadOnly = target.hasAttribute('readonly');
      if (isMulti || isRange || isReadOnly) {
        e.preventDefault();
      }
    }

    if (onSelectionChange) {
      onSelectionChange(taskId, isMulti, isRange);
    }
  };

  if (!task) return null;

  const rowStyle = clsx(
    "flex items-center group h-8 transition-colors duration-150",
    !suppressBorder && "border-b border-gray-100",
    isSelected && isHovered && "bg-blue-100",
    isSelected && !isHovered && "bg-blue-50",
    !isSelected && isHovered && "bg-gray-50",
    !isSelected && !isHovered && "hover:bg-gray-50"
  );

  const content = (
    <div
      className={rowStyle}
      onMouseEnter={disableHoverHandlers ? undefined : () => onHoverChange?.(taskId)}
      onMouseLeave={disableHoverHandlers ? undefined : () => onHoverChange?.(null)}
      onMouseDown={handleRowMouseDown}
    >
      {visibleColumns.map((colId) => {
        switch (colId) {
          case 'taskName':
            return (
              <TaskOutlineCell
                key="taskName"
                taskId={taskId}
                depth={depth}
                wbsNumber={wbsNumber}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
                attributes={attributes}
                listeners={listeners}
              />
            );
          case 'description':
            return (
              <TaskTextCell
                key="description"
                taskId={taskId}
                field="description"
                placeholder="Description"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'assignee':
            return (
              <TaskTextCell
                key="assignee"
                taskId={taskId}
                field="assignee"
                placeholder="Assignee"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'deliverables':
            return (
              <TaskTextCell
                key="deliverables"
                taskId={taskId}
                field="deliverables"
                placeholder="Deliverables"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'status':
            return (
              <TaskStatusCell
                key="status"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'progress':
            return (
              <TaskProgressCell
                key="progress"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'planDuration':
            return (
              <TaskPlanDurationCell
                key="planDuration"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'planDate':
            return (
              <TaskPlanDateCell
                key="planDate"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'duration':
            return (
              <TaskDurationCell
                key="duration"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          case 'date':
            return (
              <TaskDateCell
                key="date"
                taskId={taskId}
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );

  if (renderContainer) {
    return renderContainer({
      content,
      setContainerRef: setNodeRef,
      containerStyle: style,
      isDragging,
    });
  }

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col select-none gantt-row-optimized">
      {content}
    </div>
  );
}, (prevProps, nextProps) => {
  const keys = Object.keys(prevProps) as Array<keyof TaskRowProps>;
  for (const key of keys) {
    if (typeof prevProps[key] === 'function') {
      continue;
    }
    if (key === 'visibleColumns') {
      const prevCols = prevProps.visibleColumns;
      const nextCols = nextProps.visibleColumns;
      if (prevCols.length !== nextCols.length) return false;
      if (!prevCols.every((col, i) => col === nextCols[i])) return false;
      continue;
    }
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }
  return true;
});

TaskRow.displayName = 'TaskRow';
