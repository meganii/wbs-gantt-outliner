import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
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

interface TaskRowProps {
  taskId: string;
  depth?: number;
  prevId?: string;
  nextId?: string;
  wbsNumber?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  onHoverChange?: (taskId: string | null) => void;
  onSelectionChange?: (id: string, multi: boolean, range: boolean) => void;
  showDetails?: boolean;
  hideDescriptionColumns?: boolean;
  suppressBorder?: boolean;
  disableHoverHandlers?: boolean;
  renderContainer?: (args: {
    content: React.ReactNode;
    setContainerRef: (node: HTMLDivElement | null) => void;
    containerStyle: React.CSSProperties;
    isDragging: boolean;
  }) => React.ReactNode;
}

export const TaskRow = ({
  taskId,
  depth = 0,
  prevId,
  nextId,
  wbsNumber,
  isSelected,
  isHovered = false,
  onHoverChange,
  onSelectionChange,
  showDetails = false,
  hideDescriptionColumns = false,
  suppressBorder = false,
  disableHoverHandlers = false,
  renderContainer,
}: TaskRowProps) => {
  const task = useTaskStore((state) => state.tasks[taskId]);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

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
      {/* 1. Outline Cell (Chevron, Drag handle, WBS No, Title) */}
      <TaskOutlineCell
        taskId={taskId}
        depth={depth}
        wbsNumber={wbsNumber}
        prevId={prevId}
        nextId={nextId}
        onSelectionChange={onSelectionChange}
        attributes={attributes}
        listeners={listeners}
      />

      {/* 2. Details Columns */}
      {showDetails && (
        <>
          {!hideDescriptionColumns && (
            <>
              <TaskTextCell
                taskId={taskId}
                field="description"
                placeholder="Description"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
              <TaskTextCell
                taskId={taskId}
                field="assignee"
                placeholder="Assignee"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
              <TaskTextCell
                taskId={taskId}
                field="deliverables"
                placeholder="Deliverables"
                prevId={prevId}
                nextId={nextId}
                onSelectionChange={onSelectionChange}
              />
            </>
          )}
          <TaskStatusCell
            taskId={taskId}
            prevId={prevId}
            nextId={nextId}
            onSelectionChange={onSelectionChange}
          />
          <TaskProgressCell
            taskId={taskId}
            prevId={prevId}
            nextId={nextId}
            onSelectionChange={onSelectionChange}
          />
        </>
      )}

      {/* 3. Plan / Baseline Columns */}
      {!baselineLocked && (
        <>
          <TaskPlanDurationCell
            taskId={taskId}
            prevId={prevId}
            nextId={nextId}
            onSelectionChange={onSelectionChange}
          />
          <TaskPlanDateCell
            taskId={taskId}
            prevId={prevId}
            nextId={nextId}
            onSelectionChange={onSelectionChange}
          />
        </>
      )}

      {/* 4. Actual / Forecast Columns */}
      <TaskDurationCell
        taskId={taskId}
        prevId={prevId}
        nextId={nextId}
        onSelectionChange={onSelectionChange}
      />
      <TaskDateCell
        taskId={taskId}
        prevId={prevId}
        nextId={nextId}
        onSelectionChange={onSelectionChange}
      />
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
    <div ref={setNodeRef} style={style} className="flex flex-col select-none">
      {content}
    </div>
  );
};
