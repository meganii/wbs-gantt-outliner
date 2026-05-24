import React, { useMemo, useLayoutEffect, useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  differenceInDays,
} from 'date-fns';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import clsx from 'clsx';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskRow } from './TaskRow';
import { TaskTableHeader } from './TaskTableHeader';
import type { ColumnId } from '../types';

// Import custom hooks
import { useGanttTimeline } from '../hooks/useGanttTimeline';
import { useGanttDrag } from '../hooks/useGanttDrag';
import { useGanttDependencies } from '../hooks/useGanttDependencies';
import { GanttTimelineRow } from './GanttTimelineRow';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGridBackground } from './TimelineGridBackground';

interface IntegratedViewProps {
  outlinerWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
}

const ROW_HEIGHT = 32;

export const IntegratedView = ({
  outlinerWidth,
  onResizeStart,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
}: IntegratedViewProps) => {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const setViewMode = useTaskStore((state) => state.setViewMode);
  const reorderTask = useTaskStore((state) => state.reorderTask);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const removeDependency = useTaskStore((state) => state.removeDependency);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );
  const flattenedIds = useMemo(() => flattenedItems.map((item) => item.id), [flattenedItems]);

  const [anchorId, setAnchorId] = useState<string | null>(null);

  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);

  // Use custom timeline hook
  const {
    cellWidth,
    timeRange,
    timelineMetrics,
    viewMode,
    calendar,
  } = useGanttTimeline();

  const visibleColumns = useMemo((): ColumnId[] => {
    const cols: ColumnId[] = ['taskName', 'status', 'progress'];
    if (!baselineLocked) {
      cols.push('planDuration', 'planDate');
    }
    cols.push('duration', 'date');
    return cols;
  }, [baselineLocked]);

  // Use custom drag interaction hook
  const {
    dragState,
    mousePos,
    setDragState,
  } = useGanttDrag(outlinerWidth, containerRef, cellWidth, timeRange, timelineMetrics);

  // Use custom dependency line hook
  const dependencyLines = useGanttDependencies(
    flattenedItems,
    taskBarRefs,
    containerRef,
    outlinerWidth,
    timelineMetrics,
    dragState
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = container.scrollLeft;
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useLayoutEffect(() => {
    if (containerRef.current && timelineMetrics.pixelsPerDay) {
      const today = new Date();
      const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
      const timelineScrollLeft = diffDays * timelineMetrics.pixelsPerDay;
      const timelineViewportWidth = Math.max(0, containerRef.current.clientWidth - outlinerWidth);
      containerRef.current.scrollLeft = Math.max(0, timelineScrollLeft - timelineViewportWidth / 3);
    }
  }, [viewMode, timelineMetrics]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      reorderTask(active.id as string, over?.id as string);
    }
  };

  const handleSelectionChange = (id: string, multi: boolean, range: boolean) => {
    if (range) {
      const targetAnchor =
        anchorId ||
        focusedTaskId ||
        (selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : id);

      const startIdx = flattenedIds.indexOf(targetAnchor);
      const endIdx = flattenedIds.indexOf(id);

      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        setSelectedTaskIds(flattenedIds.slice(min, max + 1));
        return;
      }
    }

    setAnchorId(id);

    if (multi) {
      if (selectedTaskIds.includes(id)) {
        setSelectedTaskIds(selectedTaskIds.filter((selectedId) => selectedId !== id));
      } else {
        setSelectedTaskIds([...selectedTaskIds, id]);
      }
    } else {
      setSelectedTaskIds([id]);
    }
  };

  const timelineWidth = timeRange.length * cellWidth;

  return (
    <div className="flex-1 bg-white text-gray-900 flex flex-col h-full min-h-0 min-w-0 select-none overflow-hidden relative">
      <div className="flex min-w-0">
        <div
          className="border-r border-gray-300 overflow-hidden flex-shrink-0 bg-gray-100"
          style={{ width: outlinerWidth }}
        >
          <TaskTableHeader visibleColumns={visibleColumns} />
        </div>
        <div className="flex-1 relative overflow-hidden bg-gray-100 border-b border-gray-300">
          <div ref={headerRef} className="h-[56px] overflow-hidden">
            <TimelineHeader
              timeRange={timeRange}
              cellWidth={cellWidth}
              viewMode={viewMode}
              calendar={calendar}
            />
          </div>
          <div className="absolute right-0 top-0 h-full bg-gray-100/90 backdrop-blur-sm border-l border-gray-300 px-3 flex items-center z-40 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'Day' | 'Week' | 'Month' | 'Year')}
              className="text-xs p-1.5 border border-gray-300 rounded bg-white font-medium text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-all"
            >
              <option value="Day">Day</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
              <option value="Year">Year</option>
            </select>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-auto min-h-0 min-w-0">
        {/* Shared Background Grid Layer */}
        <TimelineGridBackground
          timeRange={timeRange}
          cellWidth={cellWidth}
          calendar={calendar}
          viewMode={viewMode}
          totalHeight={flattenedItems.length * ROW_HEIGHT}
          timelineWidth={timelineWidth}
          leftOffset={outlinerWidth}
        />

        <svg
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            minHeight: flattenedItems.length * ROW_HEIGHT,
            width: timelineWidth,
            left: outlinerWidth,
          }}
        >
          <defs>
            <marker id="integrated-arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="currentColor" className="text-gray-400" />
            </marker>
          </defs>
          {dependencyLines.map(({ key, d, fromId, toId }) => (
            <path
              key={key}
              d={d}
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#integrated-arrowhead)"
              className="text-gray-400 hover:text-red-500 hover:stroke-[3] transition-all cursor-pointer pointer-events-auto"
              style={{ pointerEvents: 'stroke' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this dependency?')) {
                  removeDependency(fromId, toId);
                }
              }}
            />
          ))}
          {dragState?.mode === 'dependency' && mousePos && (() => {
            const startIdx = flattenedItems.findIndex((item) => item.id === dragState.taskId);
            if (startIdx === -1) {
              return null;
            }
            const task = tasks[dragState.taskId];
            const endDateStr = task.planEndDate || task.endDate;
            if (!endDateStr) {
              return null;
            }
            const taskEnd = new Date(endDateStr);
            const diffDays = differenceInDays(taskEnd, timelineMetrics.timelineStart);
            const startX = (diffDays + 1) * timelineMetrics.pixelsPerDay;
            const startY = startIdx * ROW_HEIGHT + 5;

            return (
              <line
                x1={startX}
                y1={startY}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="4"
              />
            );
          })()}
        </svg>

        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={flattenedIds} strategy={verticalListSortingStrategy}>
            {flattenedItems.map(({ id, task, depth, wbsNumber }, index) => {
              const isHovered = hoveredTaskId === id;
              const isSelected = selectedTaskIds.includes(id);
              const currentBgClass = clsx(
                isSelected && isHovered && 'bg-blue-100',
                isSelected && !isHovered && 'bg-blue-50',
                !isSelected && isHovered && 'bg-gray-50',
                !isSelected && !isHovered && 'bg-white'
              );

              return (
                <TaskRow
                  key={id}
                  taskId={id}
                  depth={depth}
                  wbsNumber={wbsNumber}
                  prevId={flattenedItems[index - 1]?.id}
                  nextId={flattenedItems[index + 1]?.id}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  onHoverChange={onHoverTaskChange}
                  onSelectionChange={handleSelectionChange}
                  visibleColumns={visibleColumns}
                  disableHoverHandlers
                  suppressBorder
                  renderContainer={({ content, setContainerRef, containerStyle }) => (
                    <div
                      ref={setContainerRef}
                      style={{ ...containerStyle, width: outlinerWidth + timelineWidth }}
                      className={clsx(
                        'flex h-8 relative z-auto border-b border-gray-100 select-none transition-colors duration-150',
                        currentBgClass,
                        !isSelected && !isHovered && 'hover:bg-gray-50'
                      )}
                      onMouseEnter={() => onHoverTaskChange?.(id)}
                      onMouseLeave={() => onHoverTaskChange?.(null)}
                    >
                      <div
                        className={clsx('sticky left-0 z-40 overflow-hidden border-r border-gray-300', currentBgClass)}
                        style={{ width: outlinerWidth }}
                      >
                        {content}
                      </div>

                      <GanttTimelineRow
                        taskId={id}
                        task={task}
                        cellWidth={cellWidth}
                        timelineMetrics={timelineMetrics}
                        dragState={dragState}
                        setDragState={setDragState}
                        baselineLocked={baselineLocked}
                        taskBarRefs={taskBarRefs}
                        timelineWidth={timelineWidth}
                      />
                    </div>
                  )}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      <div
        className="absolute top-0 bottom-0 w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors z-50"
        style={{ left: outlinerWidth }}
        onMouseDown={onResizeStart}
      />
    </div>
  );
};
