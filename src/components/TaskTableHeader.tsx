import React, { useState, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { ColumnId } from '../types';

interface TaskTableHeaderProps {
  visibleColumns: ColumnId[];
}

const ALL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'taskName', label: 'タスク名' },
  { id: 'description', label: '説明' },
  { id: 'assignee', label: '担当者' },
  { id: 'deliverables', label: '成果物' },
  { id: 'status', label: 'ステータス' },
  { id: 'progress', label: '進捗率' },
  { id: 'planDuration', label: '予定期間' },
  { id: 'planDate', label: '予定日付' },
  { id: 'duration', label: '実績期間' },
  { id: 'date', label: '実績日付' },
];

const COLUMN_ORDER: ColumnId[] = [
  'taskName',
  'description',
  'assignee',
  'deliverables',
  'status',
  'progress',
  'planDuration',
  'planDate',
  'duration',
  'date',
];

export const TaskTableHeader = ({ visibleColumns }: TaskTableHeaderProps) => {
  const columnWidths = useTaskStore((state) => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore((state) => state.setColumnWidth);
  const storeVisibleColumns = useTaskStore((state) => state.projectConfig.visibleColumns || COLUMN_ORDER);
  const setVisibleColumns = useTaskStore((state) => state.setVisibleColumns);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const toggleColumn = (columnId: ColumnId) => {
    if (columnId === 'taskName') return;
    let nextCols: ColumnId[];
    if (storeVisibleColumns.includes(columnId)) {
      nextCols = storeVisibleColumns.filter((col) => col !== columnId);
    } else {
      nextCols = COLUMN_ORDER.filter((col) => col === columnId || storeVisibleColumns.includes(col));
    }
    setVisibleColumns(nextCols);
  };

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
    <div 
      className="h-[40px] sticky top-0 bg-gray-100 border-b border-gray-300 flex items-center font-bold text-xs z-10 w-max"
      onContextMenu={handleContextMenu}
    >
      {visibleColumns.map((colId) => {
        switch (colId) {
          case 'taskName':
            return (
              <div
                key="taskName"
                className="flex-1 flex items-center px-4 relative group"
                style={{
                  width: columnWidths.taskName,
                  minWidth: columnWidths.taskName,
                  maxWidth: columnWidths.taskName,
                }}
              >
                タスク名
                <Resizer columnId="taskName" />
              </div>
            );
          case 'description':
            return (
              <div
                key="description"
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.description,
                  minWidth: columnWidths.description,
                  maxWidth: columnWidths.description,
                }}
              >
                説明
                <Resizer columnId="description" />
              </div>
            );
          case 'assignee':
            return (
              <div
                key="assignee"
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.assignee,
                  minWidth: columnWidths.assignee,
                  maxWidth: columnWidths.assignee,
                }}
              >
                担当者
                <Resizer columnId="assignee" />
              </div>
            );
          case 'deliverables':
            return (
              <div
                key="deliverables"
                className="px-2 border-l border-gray-300 h-full flex items-center flex-shrink-0 relative group"
                style={{
                  width: columnWidths.deliverables,
                  minWidth: columnWidths.deliverables,
                  maxWidth: columnWidths.deliverables,
                }}
              >
                成果物
                <Resizer columnId="deliverables" />
              </div>
            );
          case 'status':
            return (
              <div
                key="status"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-gray-700 bg-gray-50/10"
                style={{
                  width: columnWidths.status,
                  minWidth: columnWidths.status,
                  maxWidth: columnWidths.status,
                }}
              >
                ステータス
                <Resizer columnId="status" />
              </div>
            );
          case 'progress':
            return (
              <div
                key="progress"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-gray-700 bg-gray-50/10"
                style={{
                  width: columnWidths.progress,
                  minWidth: columnWidths.progress,
                  maxWidth: columnWidths.progress,
                }}
              >
                進捗率
                <Resizer columnId="progress" />
              </div>
            );
          case 'planDuration':
            return (
              <div
                key="planDuration"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-blue-700 bg-blue-50/30"
                style={{
                  width: columnWidths.planDuration,
                  minWidth: columnWidths.planDuration,
                  maxWidth: columnWidths.planDuration,
                }}
              >
                予定期間
                <Resizer columnId="planDuration" />
              </div>
            );
          case 'planDate':
            return (
              <div
                key="planDate"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-blue-700 bg-blue-50/30"
                style={{
                  width: columnWidths.planDate,
                  minWidth: columnWidths.planDate,
                  maxWidth: columnWidths.planDate,
                }}
              >
                予定日付
                <Resizer columnId="planDate" />
              </div>
            );
          case 'duration':
            return (
              <div
                key="duration"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-amber-700 bg-amber-50/30"
                style={{
                  width: columnWidths.duration,
                  minWidth: columnWidths.duration,
                  maxWidth: columnWidths.duration,
                }}
              >
                実績期間
                <Resizer columnId="duration" />
              </div>
            );
          case 'date':
            return (
              <div
                key="date"
                className="px-2 border-l border-gray-300 h-full flex items-center justify-center flex-shrink-0 relative group text-amber-700 bg-amber-50/30"
                style={{
                  width: columnWidths.date,
                  minWidth: columnWidths.date,
                  maxWidth: columnWidths.date,
                }}
              >
                実績日付
                <Resizer columnId="date" />
              </div>
            );
          default:
            return null;
        }
      })}

      {menu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 text-gray-700 min-w-[160px] font-normal"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 select-none">
            表示項目の設定
          </div>
          {ALL_COLUMNS.map(({ id, label }) => {
            const isChecked = storeVisibleColumns.includes(id);
            const isTaskName = id === 'taskName';
            const isPlanColumn = id === 'planDuration' || id === 'planDate';
            const isDisabled = isTaskName || (isPlanColumn && baselineLocked);

            return (
              <label
                key={id}
                className={`flex items-center px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer select-none ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={(e) => {
                  if (isDisabled) {
                    e.preventDefault();
                    return;
                  }
                  toggleColumn(id);
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isDisabled}
                  className="mr-2 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                  onChange={() => {}}
                />
                <span>{label}</span>
                {isPlanColumn && baselineLocked && (
                  <span className="ml-auto text-[10px] text-amber-600 font-normal">
                    (固定中)
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
