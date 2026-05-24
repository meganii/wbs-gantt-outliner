import React, { useMemo, useLayoutEffect, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  differenceInDays,
} from 'date-fns';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import clsx from 'clsx';
import { TaskRow } from './TaskRow';
import type { ColumnId } from '../types';
import { GanttTimelineRow } from './GanttTimelineRow';
import { TimelineHeader } from './TimelineHeader';

// Import custom hooks
import { useGanttTimeline } from '../hooks/useGanttTimeline';
import { useGanttDrag } from '../hooks/useGanttDrag';
import { useGanttDependencies } from '../hooks/useGanttDependencies';

const HEADER_HEIGHT = 56;

interface GanttChartProps {
  showSidebar?: boolean;
  showNames?: boolean;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

export const GanttChart = ({
  showSidebar = false,
  showNames = false,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
  scrollRef,
  onScroll
}: GanttChartProps) => {
  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const setViewMode = useTaskStore(state => state.setViewMode);
  
  const selectedTaskIds = useTaskStore(state => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore(state => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore(state => state.focusedTaskId);
  const setFocusedTaskId = useTaskStore(state => state.setFocusedTaskId);
  const setCollapsed = useTaskStore(state => state.setCollapsed);
  const columnWidths = useTaskStore(state => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore(state => state.setColumnWidth);
  const removeDependency = useTaskStore(state => state.removeDependency);

  const visibleColumns = useMemo((): ColumnId[] => ['taskName'], []);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );

  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const NAME_COLUMN_WIDTH = columnWidths.taskName;
  const nameOffset = showNames ? NAME_COLUMN_WIDTH : 0;

  // Use custom timeline hook
  const {
    cellWidth: CELL_WIDTH,
    timeRange,
    timelineMetrics,
    viewMode,
    calendar,
  } = useGanttTimeline();

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef || internalContainerRef;
  const headerRef = useRef<HTMLDivElement>(null);

  // Use custom drag interaction hook
  const {
    dragState,
    mousePos,
    setDragState,
  } = useGanttDrag(nameOffset, containerRef, CELL_WIDTH, timeRange);

  // Use custom dependency line layout hook
  const dependencyLines = useGanttDependencies(
    flattenedItems,
    taskBarRefs,
    containerRef,
    nameOffset,
    timelineMetrics,
    dragState
  );

  const baselineLocked = useTaskStore(state => state.projectConfig.baselineLocked ?? false);

  const handleSelectionChange = (id: string, multi: boolean, range: boolean) => {
    if (range) {
      const targetAnchor = selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : id;
      const flattenedIds = flattenedItems.map(item => item.id);
      const startIdx = flattenedIds.indexOf(targetAnchor);
      const endIdx = flattenedIds.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        setSelectedTaskIds(flattenedIds.slice(min, max + 1));
        setFocusedTaskId(id);
        return;
      }
    }

    if (multi) {
      if (selectedTaskIds.includes(id)) {
        setSelectedTaskIds(selectedTaskIds.filter(sid => sid !== id));
      } else {
        setSelectedTaskIds([...selectedTaskIds, id]);
      }
    } else {
      setSelectedTaskIds([id]);
    }
    setFocusedTaskId(id);
  };

  // Sync header horizontal scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = container.scrollLeft;
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to today on mount or viewMode change
  useLayoutEffect(() => {
    if (containerRef.current && timelineMetrics.pixelsPerDay) {
      const today = new Date();
      const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
      const scrollPos = diffDays * timelineMetrics.pixelsPerDay;
      const containerWidth = containerRef.current.clientWidth;
      const timelineViewportWidth = Math.max(0, containerWidth - nameOffset);
      containerRef.current.scrollLeft = Math.max(0, scrollPos - timelineViewportWidth / 3);
    }
  }, [viewMode, timelineMetrics, nameOffset]);

  // Keyboard Shortcut: Alt + ArrowUp / ArrowDown to Collapse/Expand, and Up/Down to Navigate Rows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      const isAltUp = !e.shiftKey && e.altKey && !e.metaKey && e.key === 'ArrowUp';
      const isAltDown = !e.shiftKey && e.altKey && !e.metaKey && e.key === 'ArrowDown';

      if (isAltUp || isAltDown) {
        const targetIds = selectedTaskIds.length > 0 
          ? selectedTaskIds 
          : (hoveredTaskId ? [hoveredTaskId] : []);
        
        if (targetIds.length > 0) {
          e.preventDefault();
          setCollapsed(targetIds, isAltUp);
        }
        return;
      }

      const isUp = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp';
      const isDown = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown';
      const isShiftUp = e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp';
      const isShiftDown = e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown';

      if (isUp || isDown || isShiftUp || isShiftDown) {
        const activeId = focusedTaskId || (selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : null);
        if (!activeId) return;

        const currentIndex = flattenedItems.findIndex(item => item.id === activeId);
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (isUp || isShiftUp) {
          if (currentIndex > 0) {
            targetIndex = currentIndex - 1;
          }
        } else if (isDown || isShiftDown) {
          if (currentIndex < flattenedItems.length - 1) {
            targetIndex = currentIndex + 1;
          }
        }

        if (targetIndex !== -1) {
          e.preventDefault();
          const targetId = flattenedItems[targetIndex].id;

          if (isShiftUp || isShiftDown) {
            const anchorId = selectedTaskIds.length > 0 ? selectedTaskIds[0] : activeId;
            const startIdx = flattenedItems.findIndex(item => item.id === anchorId);
            const endIdx = targetIndex;
            if (startIdx !== -1 && endIdx !== -1) {
              const min = Math.min(startIdx, endIdx);
              const max = Math.max(startIdx, endIdx);
              setSelectedTaskIds(flattenedItems.slice(min, max + 1).map(item => item.id));
            }
          } else {
            setSelectedTaskIds([targetId]);
          }
          setFocusedTaskId(targetId);

          const container = containerRef.current;
          if (container) {
            const rowHeight = 32;
            const targetTop = targetIndex * rowHeight;
            const containerHeight = container.clientHeight;
            const currentScrollTop = container.scrollTop;

            if (targetTop < currentScrollTop) {
              container.scrollTop = targetTop;
            } else if (targetTop + rowHeight > currentScrollTop + containerHeight) {
              container.scrollTop = targetTop + rowHeight - containerHeight;
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, hoveredTaskId, focusedTaskId, flattenedItems, setCollapsed, setSelectedTaskIds, setFocusedTaskId]);

  return (
    <div className="flex-1 bg-white text-gray-900 flex flex-col h-full min-h-0 min-w-0 select-none overflow-hidden relative">
      {/* Timeline Header */}
      <div
        className="flex sticky top-0 bg-gray-100 z-10 border-b border-gray-300 overflow-hidden"
        style={{ height: HEADER_HEIGHT }}
        ref={headerRef}
      >
        {showNames && (
          <div
            className="flex-shrink-0 border-r border-gray-300 p-2 pl-4 font-bold text-xs sticky left-0 z-40 bg-gray-100 flex items-center relative group"
            style={{ width: NAME_COLUMN_WIDTH }}
          >
            Task Name
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 opacity-0 hover:opacity-100 z-50 group-hover:opacity-50"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = NAME_COLUMN_WIDTH;

                const onMouseMove = (moveEvent: MouseEvent) => {
                  const delta = moveEvent.clientX - startX;
                  setColumnWidth('taskName', Math.max(50, startWidth + delta));
                };

                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = 'default';
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                document.body.style.cursor = 'col-resize';
              }}
            />
          </div>
        )}
        <TimelineHeader
          timeRange={timeRange}
          cellWidth={CELL_WIDTH}
          viewMode={viewMode}
          calendar={calendar}
        />

        {/* Toggle Selector on the right */}
        {showSidebar && (
          <div className="sticky right-0 top-0 h-full bg-gray-100/90 backdrop-blur-sm border-l border-gray-300 px-3 flex items-center z-40 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
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
        )}
      </div>

      {/* Gantt Rows */}
      <div
        className="flex-1 relative overflow-auto min-h-0 min-w-0"
        ref={containerRef}
        onScroll={(e) => {
          if (onScroll) onScroll(e);
        }}
      >
        {/* SVG Layer for Dependencies - Z-10 */}
        <svg
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            minHeight: flattenedItems.length * 32,
            width: timeRange.length * CELL_WIDTH,
            left: nameOffset
          }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="currentColor" className="text-gray-400" />
            </marker>
          </defs>
          {/* Existing Dependencies */}
          {dependencyLines.map(({ key, d, fromId, toId }) => {
            return (
              <path
                key={key}
                d={d}
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                markerEnd="url(#arrowhead)"
                className="text-gray-400 hover:text-red-500 hover:stroke-[3] transition-all cursor-pointer pointer-events-auto"
                style={{ pointerEvents: 'stroke' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Delete this dependency?')) {
                    removeDependency(fromId, toId);
                  }
                }}
              />
            );
          })}

          {/* Dragging Line */}
          {dragState?.mode === 'dependency' && mousePos && (
            (() => {
              const startIdx = flattenedItems.findIndex(i => i.id === dragState.taskId);
              if (startIdx === -1) return null;

              const task = tasks[dragState.taskId];
              const endDateStr = task.planEndDate || task.endDate;
              if (!endDateStr) return null;
              const taskEnd = new Date(endDateStr);
              const { timelineStart, pixelsPerDay } = timelineMetrics;

              const diffDays = differenceInDays(taskEnd, timelineStart);
              const startX = (diffDays + 1) * pixelsPerDay;
              const startY = startIdx * 32 + 5;

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
            })()
          )}
        </svg>

        {flattenedItems.map(({ id, task, depth, wbsNumber }, index) => {
          const isHovered = hoveredTaskId === id;
          const isSelected = selectedTaskIds.includes(id);

          return (
            <div
              key={id}
              className={clsx(
                "flex border-b border-gray-100 h-8 relative z-auto transition-colors duration-150",
                isSelected && isHovered && "bg-blue-100",
                isSelected && !isHovered && "bg-blue-50",
                !isSelected && isHovered && "bg-gray-50",
                !isSelected && !isHovered && "hover:bg-gray-50"
              )}
              style={{ width: nameOffset + timeRange.length * CELL_WIDTH }}
              onMouseEnter={() => onHoverTaskChange?.(id)}
              onMouseLeave={() => onHoverTaskChange?.(null)}
            >
              {showNames && (
                <div
                  onMouseDown={(e) => {
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

                    handleSelectionChange(id, isMulti, isRange);
                  }}
                  className={clsx(
                    "flex-shrink-0 border-r border-gray-300 h-full sticky left-0 z-40 flex items-center text-xs truncate transition-colors duration-150 select-none cursor-pointer",
                    isSelected && isHovered && "bg-blue-100",
                    isSelected && !isHovered && "bg-blue-50",
                    !isSelected && isHovered && "bg-gray-50",
                    !isSelected && !isHovered && "bg-white"
                  )}
                  style={{ 
                    width: NAME_COLUMN_WIDTH,
                  }}
                >
                  <TaskRow
                    taskId={id}
                    depth={depth}
                    wbsNumber={wbsNumber}
                    prevId={flattenedItems[index - 1]?.id}
                    nextId={flattenedItems[index + 1]?.id}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onSelectionChange={handleSelectionChange}
                    visibleColumns={visibleColumns}
                    disableHoverHandlers
                    suppressBorder
                  />
                </div>
              )}
              {/* Bars Area */}
              <GanttTimelineRow
                taskId={id}
                task={task}
                timeRange={timeRange}
                calendar={calendar}
                cellWidth={CELL_WIDTH}
                viewMode={viewMode}
                timelineMetrics={timelineMetrics}
                dragState={dragState}
                setDragState={setDragState}
                baselineLocked={baselineLocked}
                taskBarRefs={taskBarRefs}
                timelineWidth={timeRange.length * CELL_WIDTH}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
