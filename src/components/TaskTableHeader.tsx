import React from 'react';
import { useTaskStore } from '../store/useTaskStore';

interface TaskTableHeaderProps {
  showDetails?: boolean;
  hideDescriptionColumns?: boolean;
}

export const TaskTableHeader = ({ showDetails = false, hideDescriptionColumns = false }: TaskTableHeaderProps) => {
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore((state) => state.setColumnWidth);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

  const handleResize = (columnId: keyof typeof columnWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[columnId] || 100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setColumnWidth(columnId, Math.max(50, startWidth + delta));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const Resizer = ({ columnId }: { columnId: keyof typeof columnWidths }) => (
    <div
      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 opacity-0 hover:opacity-100 z-20 group-hover:opacity-50"
      onMouseDown={handleResize(columnId)}
    />
  );

  return (
    <div className="h-[40px] sticky top-0 bg-gray-100 border-b border-gray-300 flex items-center font-bold text-xs z-10 w-max">
      <div
        className="flex-1 flex items-center px-4 relative group"
        style={{
          width: columnWidths.taskDescription,
          minWidth: columnWidths.taskDescription,
          maxWidth: columnWidths.taskDescription,
        }}
      >
        Task Description
        <Resizer columnId="taskDescription" />
      </div>
      {showDetails && (
        <>
          {!hideDescriptionColumns && (
            <>
              <div
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.description,
                  minWidth: columnWidths.description,
                  maxWidth: columnWidths.description,
                }}
              >
                Description
                <Resizer columnId="description" />
              </div>
              <div
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.assignee,
                  minWidth: columnWidths.assignee,
                  maxWidth: columnWidths.assignee,
                }}
              >
                Assignee
                <Resizer columnId="assignee" />
              </div>
              <div
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.deliverables,
                  minWidth: columnWidths.deliverables,
                  maxWidth: columnWidths.deliverables,
                }}
              >
                Deliverables
                <Resizer columnId="deliverables" />
              </div>
            </>
          )}
          <div
            className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-gray-700 bg-gray-50/10"
            style={{
              width: columnWidths.status,
              minWidth: columnWidths.status,
              maxWidth: columnWidths.status,
            }}
          >
            Status
            <Resizer columnId="status" />
          </div>
          <div
            className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-gray-700 bg-gray-50/10"
            style={{
              width: columnWidths.progress,
              minWidth: columnWidths.progress,
              maxWidth: columnWidths.progress,
            }}
          >
            Progress
            <Resizer columnId="progress" />
          </div>
        </>
      )}
      {/* Plan Duration & Date */}
      {!baselineLocked && (
        <>
          <div
            className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-blue-700 bg-blue-50/30"
            style={{
              width: columnWidths.planDuration,
              minWidth: columnWidths.planDuration,
              maxWidth: columnWidths.planDuration,
            }}
          >
            Plan Dur.
            <Resizer columnId="planDuration" />
          </div>
          <div
            className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-blue-700 bg-blue-50/30"
            style={{
              width: columnWidths.planDate,
              minWidth: columnWidths.planDate,
              maxWidth: columnWidths.planDate,
            }}
          >
            Plan Date
            <Resizer columnId="planDate" />
          </div>
        </>
      )}

      {/* Actual Duration & Date */}
      <div
        className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-amber-700 bg-amber-50/30"
        style={{
          width: columnWidths.duration,
          minWidth: columnWidths.duration,
          maxWidth: columnWidths.duration,
        }}
      >
        Act. Dur.
        <Resizer columnId="duration" />
      </div>
      <div
        className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-amber-700 bg-amber-50/30"
        style={{
          width: columnWidths.date,
          minWidth: columnWidths.date,
          maxWidth: columnWidths.date,
        }}
      >
        Act. Date
        <Resizer columnId="date" />
      </div>
    </div>
  );
};
