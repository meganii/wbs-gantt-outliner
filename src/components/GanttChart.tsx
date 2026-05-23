import React, { useMemo, useLayoutEffect, useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import clsx from 'clsx';
import { isWorkDay } from '../utils/date';
import { ChevronRight, ChevronDown } from 'lucide-react';

const HEADER_HEIGHT = 40;

interface GanttChartProps {
  showSidebar?: boolean;
  showNames?: boolean;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  showSidebar = false,
  showNames = false,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
  scrollRef,
  onScroll
}) => {
  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);
  const calendar = useTaskStore(state => state.projectConfig.calendar);
  const viewMode = useTaskStore(state => state.projectConfig.viewMode);
  const setViewMode = useTaskStore(state => state.setViewMode);
  
  const selectedTaskIds = useTaskStore(state => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore(state => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore(state => state.focusedTaskId);
  const setFocusedTaskId = useTaskStore(state => state.setFocusedTaskId);
  const setCollapsed = useTaskStore(state => state.setCollapsed);
  const toggleCollapse = useTaskStore(state => state.toggleCollapse);
  const columnWidths = useTaskStore(state => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore(state => state.setColumnWidth);
  const baselineLocked = useTaskStore(state => state.projectConfig.baselineLocked ?? false);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );

  const [dependencyLines, setDependencyLines] = useState<Array<{ key: string; d: string; fromId: string; toId: string }>>([]);
  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const NAME_COLUMN_WIDTH = columnWidths.taskDescription;
  const nameOffset = showNames ? NAME_COLUMN_WIDTH : 0;

  const CELL_WIDTH = useMemo(() => {
    switch (viewMode) {
      case 'Week': return 100;
      case 'Month': return 200;
      case 'Year': return 400;
      case 'Day':
      default: return 40;
    }
  }, [viewMode]);

  const timeRange = useMemo(() => {
    const today = new Date();
    switch (viewMode) {
      case 'Week': {
        const start = startOfWeek(addMonths(today, -6), { weekStartsOn: 1 });
        const end = endOfWeek(addMonths(today, 12), { weekStartsOn: 1 });
        return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      }
      case 'Month': {
        const start = startOfMonth(addYears(today, -1));
        const end = endOfMonth(addYears(today, 2));
        return eachMonthOfInterval({ start, end });
      }
      case 'Year': {
        const start = startOfYear(addYears(today, -5));
        const end = endOfYear(addYears(today, 10));
        return eachYearOfInterval({ start, end });
      }
      case 'Day':
      default: {
        const start = startOfWeek(addMonths(today, -1), { weekStartsOn: 1 });
        const end = endOfWeek(addMonths(today, 3), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
      }
    }
  }, [viewMode]);

  const timelineMetrics = useMemo(() => {
    const timelineStart = timeRange[0];
    if (!timelineStart) return { timelineStart: new Date(), timelineEnd: new Date(), totalDays: 0, totalWidth: 0, pixelsPerDay: 0 };
    let timelineEnd: Date;

    switch (viewMode) {
      case 'Week':
        timelineEnd = endOfWeek(timeRange[timeRange.length - 1], { weekStartsOn: 1 });
        break;
      case 'Month':
        timelineEnd = endOfMonth(timeRange[timeRange.length - 1]);
        break;
      case 'Year':
        timelineEnd = endOfYear(timeRange[timeRange.length - 1]);
        break;
      case 'Day':
      default:
        timelineEnd = timeRange[timeRange.length - 1];
        break;
    }

    const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;
    const totalWidth = timeRange.length * CELL_WIDTH;
    const pixelsPerDay = totalDays > 0 ? totalWidth / totalDays : 0;

    return { timelineStart, timelineEnd, totalDays, totalWidth, pixelsPerDay };
  }, [timeRange, viewMode, CELL_WIDTH]);

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef || internalContainerRef;
  const headerRef = useRef<HTMLDivElement>(null);

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
      containerRef.current.scrollLeft = Math.max(0, scrollPos - containerWidth / 3);
    }
  }, [viewMode, timelineMetrics]);

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

  const updateTask = useTaskStore(state => state.updateTask);
  const addDependency = useTaskStore(state => state.addDependency);
  const removeDependency = useTaskStore(state => state.removeDependency);

  // Drag & Drop State
  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
    startX: number;
    startY: number; // Added for dependency and draw-range
    initialStartDate: Date;
    initialEndDate: Date;
    currentStartDate: Date;
    currentEndDate: Date;
    targetTaskId?: string; // For dependency drop target
  } | null>(null);

  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      if (dragState.mode === 'dependency') {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setMousePos({
            x: e.clientX - rect.left + containerRef.current.scrollLeft - nameOffset,
            y: e.clientY - rect.top + containerRef.current.scrollTop,
          });
        }
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const daysPerPixel = differenceInDays(timeRange[timeRange.length - 1], timeRange[0]) / (timeRange.length * CELL_WIDTH);
      const deltaDays = Math.round(deltaX * daysPerPixel);

      setDragState(prev => {
        if (!prev) return null;
        const newDragState = { ...prev };

        if (prev.mode === 'move') {
          newDragState.currentStartDate = addDays(prev.initialStartDate, deltaDays);
          newDragState.currentEndDate = addDays(prev.initialEndDate, deltaDays);
        } else if (prev.mode === 'resize-left') {
          const newStart = addDays(prev.initialStartDate, deltaDays);
          if (newStart <= prev.initialEndDate) {
            newDragState.currentStartDate = newStart;
          }
        } else if (prev.mode === 'resize-right') {
          const newEnd = addDays(prev.initialEndDate, deltaDays);
          if (newEnd >= prev.initialStartDate) {
            newDragState.currentEndDate = newEnd;
          }
        } else if (prev.mode === 'draw-range') {
          newDragState.currentEndDate = addDays(prev.initialStartDate, deltaDays);
        }
        return newDragState;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState) return;

      if (dragState.mode === 'dependency') {
        let target = e.target as HTMLElement;
        while (target && !target.getAttribute?.('data-task-id')) {
          target = target.parentElement as HTMLElement;
        }
        if (target) {
          const targetId = target.getAttribute('data-task-id');
          if (targetId && targetId !== dragState.taskId) {
            const targetTask = tasks[targetId];
            if (targetTask && targetTask.children.length === 0) {
              addDependency(dragState.taskId, targetId);
            }
          }
        }
      } else if (dragState.mode === 'draw-range') {
        const { taskId, currentStartDate, currentEndDate } = dragState;
        let start = currentStartDate < currentEndDate ? currentStartDate : currentEndDate;
        let end = currentStartDate < currentEndDate ? currentEndDate : currentStartDate;

        switch (viewMode) {
          case 'Week':
            start = startOfWeek(start, { weekStartsOn: 1 });
            end = endOfWeek(end, { weekStartsOn: 1 });
            break;
          case 'Month':
            start = startOfMonth(start);
            end = endOfMonth(end);
            break;
          case 'Year':
            start = startOfYear(start);
            end = endOfYear(end);
            break;
        }

        const newDuration = differenceInDays(end, start) + 1;
        if (baselineLocked) {
          updateTask(taskId, {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd'),
            duration: newDuration,
          });
        } else {
          updateTask(taskId, {
            planStartDate: format(start, 'yyyy-MM-dd'),
            planEndDate: format(end, 'yyyy-MM-dd'),
            planDuration: newDuration,
          });
        }
      } else {
        const { taskId, currentStartDate, currentEndDate, initialStartDate, initialEndDate } = dragState;
        if (currentStartDate.getTime() !== initialStartDate.getTime() || currentEndDate.getTime() !== initialEndDate.getTime()) {
          const newDuration = differenceInDays(currentEndDate, currentStartDate) + 1;
          if (baselineLocked) {
            updateTask(taskId, {
              startDate: format(currentStartDate, 'yyyy-MM-dd'),
              endDate: format(currentEndDate, 'yyyy-MM-dd'),
              duration: newDuration,
            });
          } else {
            updateTask(taskId, {
              planStartDate: format(currentStartDate, 'yyyy-MM-dd'),
              planEndDate: format(currentEndDate, 'yyyy-MM-dd'),
              planDuration: newDuration,
            });
          }
        }
      }

      setDragState(null);
      setMousePos(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, updateTask, addDependency, removeDependency, timeRange, CELL_WIDTH, viewMode]);

  useLayoutEffect(() => {
    const lines = [];
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect || !timelineMetrics.pixelsPerDay) return;

    for (const { id, task } of flattenedItems) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const sourceTask = tasks[depId];
          const targetTask = tasks[id];

          if (sourceTask && targetTask && (sourceTask.planEndDate || sourceTask.endDate) && (targetTask.planStartDate || targetTask.startDate)) {
            const sourceEl = taskBarRefs.current.get(depId);
            const targetEl = taskBarRefs.current.get(id);
            if (!sourceEl || !targetEl) continue;

            const sourceRect = sourceEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            const scrollLeft = containerRef.current?.scrollLeft || 0;
            const scrollTop = containerRef.current?.scrollTop || 0;

            const startX = sourceRect.right - containerRect.left + scrollLeft - nameOffset;
            const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top + scrollTop;
            const endX = targetRect.left - containerRect.left + scrollLeft - nameOffset;
            const endY = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop;

            let path = '';
            const boxPadding = 20;

            if (endX > startX + boxPadding * 2) {
              const midX = startX + (endX - startX) / 2;
              path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
            } else {
              const rowHeight = 32;
              const verticalLaneY = endY > startY ? startY + (rowHeight / 2) : startY - (rowHeight / 2);
              path = `M ${startX} ${startY} L ${startX + boxPadding} ${startY} L ${startX + boxPadding} ${verticalLaneY} L ${endX - boxPadding} ${verticalLaneY} L ${endX - boxPadding} ${endY} L ${endX} ${endY}`;
            }

            lines.push({
              key: `${depId}::${id}`,
              d: path,
              fromId: depId,
              toId: id
            });
          }
        }
      }
    }
    setDependencyLines(lines);
  }, [flattenedItems, tasks, showSidebar, timelineMetrics, baselineLocked, dragState]);

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
            className="flex-shrink-0 border-r border-gray-300 p-2 font-bold text-xs sticky left-0 z-40 bg-gray-100 flex items-center relative group"
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
                  setColumnWidth('taskDescription', Math.max(50, startWidth + delta));
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
        <div className="flex" style={{ width: timeRange.length * CELL_WIDTH }}>
          {timeRange.map(date => {
            const isWknd = !isWorkDay(date, calendar);
            let label;
            let subLabel;
            switch (viewMode) {
              case 'Week':
                label = `W${format(date, 'w')}`;
                subLabel = `${format(date, 'M/d')}`;
                break;
              case 'Month':
                label = format(date, 'MMM');
                subLabel = format(date, 'yyyy');
                break;
              case 'Year':
                label = format(date, 'yyyy');
                subLabel = '';
                break;
              case 'Day':
              default:
                label = format(date, 'd');
                subLabel = format(date, 'EE');
            }
            return (
              <div
                key={date.toISOString()}
                className={clsx(
                  "flex-shrink-0 border-r border-gray-300 text-[10px] flex flex-col items-center justify-center",
                  viewMode === 'Day' && isWknd ? "bg-gray-200/50 text-gray-400" : "text-gray-600"
                )}
                style={{ width: CELL_WIDTH }}
              >
                <span>{label}</span>
                <span className="text-[8px]">{subLabel}</span>
              </div>
            );
          })}
        </div>

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
          // Internal logic for header sync is already handled by the scroll listener in useEffect
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
                  // Prevent starting a draw-range when clicking or dragging from a dependency line
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

        {flattenedItems.map(({ id, task, depth, wbsNumber }) => {
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
                  onClick={(e) => {
                    const isMulti = e.ctrlKey || e.metaKey;
                    const isRange = e.shiftKey;
                    
                    if (isRange) {
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
                    
                    if (isMulti) {
                      if (selectedTaskIds.includes(id)) {
                        setSelectedTaskIds(selectedTaskIds.filter(sid => sid !== id));
                      } else {
                        setSelectedTaskIds([...selectedTaskIds, id]);
                      }
                    } else {
                      setSelectedTaskIds([id]);
                    }
                    setFocusedTaskId(id);
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
                    paddingLeft: `${depth * 20 + 8}px`
                  }}
                >
                  {/* Collapse/Expand Chevron */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(id);
                    }}
                    className={clsx(
                      "p-0.5 rounded hover:bg-gray-200 text-gray-400 mr-1 flex-shrink-0 transition-colors",
                      task.children.length === 0 && "invisible"
                    )}
                  >
                    {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* WBS Number */}
                  <span className="text-xs text-gray-500 font-mono mr-2 min-w-[24px] text-right select-none flex-shrink-0">
                    {wbsNumber}
                  </span>

                  {/* Title */}
                  <span className="truncate font-medium text-gray-800 flex-1">
                    {task.title || <span className="text-gray-400 italic">Untitled Task</span>}
                  </span>
                </div>
              )}
              {/* Bars Area */}
              <div
                className={clsx(
                  "relative flex pointer-events-auto h-full flex-1",
                  task.children.length > 0 ? "cursor-default" : "cursor-crosshair"
                )}
                onMouseDown={(e) => {
                  if (e.button !== 0 || task.children.length > 0) return;

                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left; // relative to row
                  // Calculate date from X
                  const daysOffset = Math.floor((x / (timeRange.length * CELL_WIDTH)) * timelineMetrics.totalDays);
                  const clickedDate = addDays(timelineMetrics.timelineStart, daysOffset);

                  setDragState({
                    taskId: id,
                    mode: 'draw-range',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialStartDate: clickedDate,
                    initialEndDate: clickedDate,
                    currentStartDate: clickedDate,
                    currentEndDate: clickedDate
                  });
                }}
              >
                {/* Grid Background */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {timeRange.map(date => {
                    const isWknd = viewMode === 'Day' && !isWorkDay(date, calendar);
                    return (
                      <div
                        key={date.toISOString()}
                        className={clsx(
                          "flex-shrink-0 border-r border-gray-100 h-full",
                          isWknd && "bg-gray-100/50"
                        )}
                        style={{ width: CELL_WIDTH }}
                      />
                    );
                  })}
                </div>

                {/* Drawing Preview Box */}
                {dragState?.taskId === id && dragState?.mode === 'draw-range' && (
                  (() => {
                    const s = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentStartDate : dragState.currentEndDate;
                    const e = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentEndDate : dragState.currentStartDate;

                    const { timelineStart, pixelsPerDay } = timelineMetrics;
                    const diffDays = differenceInDays(s, timelineStart);
                    const offset = diffDays * pixelsPerDay;
                    const daySpan = differenceInDays(e, s) + 1;
                    const width = daySpan * pixelsPerDay;

                    return (
                      <div
                        className="absolute top-1.5 h-5 border-2 border-dashed border-blue-500 bg-blue-100/30 z-30 pointer-events-none"
                        style={{ left: offset, width: Math.max(0, width - 2) }}
                      />
                    );
                  })()
                )}

                {/* Task Bar - Z-30 */}
                {(() => {
                  const hasPlan = !!(task.planStartDate && task.planEndDate);
                  const hasActual = !!(task.startDate && task.endDate);
                  if (!hasPlan && !hasActual) return null;

                  const isParent = task.children.length > 0;
                  const { timelineStart, pixelsPerDay } = timelineMetrics;

                  // 1. Plan Bar Metrics
                  const isDraggingPlan = dragState?.taskId === id && !baselineLocked && dragState?.mode !== 'dependency' && dragState?.mode !== 'draw-range';
                  const planStart = isDraggingPlan ? dragState.currentStartDate : (task.planStartDate ? new Date(task.planStartDate) : null);
                  const planEnd = isDraggingPlan ? (dragState.currentEndDate === null ? null : dragState.currentEndDate) : (task.planEndDate ? new Date(task.planEndDate) : null);
                  const planDiffDays = planStart ? differenceInDays(planStart, timelineStart) : 0;
                  const planOffset = planDiffDays * pixelsPerDay;
                  const planDaySpan = (planStart && planEnd) ? differenceInDays(planEnd, planStart) + 1 : 0;
                  const planWidth = planDaySpan * pixelsPerDay;

                  // 2. Actual Bar Metrics
                  const isDraggingActual = dragState?.taskId === id && baselineLocked && dragState?.mode !== 'dependency' && dragState?.mode !== 'draw-range';
                  const taskStart = isDraggingActual ? dragState.currentStartDate : (task.startDate ? new Date(task.startDate) : null);
                  const taskEnd = isDraggingActual ? dragState.currentEndDate : (task.endDate ? new Date(task.endDate) : null);
                  const diffDays = taskStart ? differenceInDays(taskStart, timelineMetrics.timelineStart) : 0;
                  const offset = diffDays * pixelsPerDay;
                  const daySpan = (taskStart && taskEnd) ? differenceInDays(taskEnd, taskStart) + 1 : 0;
                  const width = daySpan * pixelsPerDay;

                  return (
                    <>
                      {/* Plan Bar (Baseline) */}
                      {hasPlan && planWidth > 0 && (
                        <div
                          ref={el => {
                            if (el) {
                              taskBarRefs.current.set(id, el);
                            } else {
                              taskBarRefs.current.delete(id);
                            }
                          }}
                          data-task-id={id}
                          className={clsx(
                            "absolute text-[9px] flex items-center shadow-sm group z-20 transition-all",
                            isParent
                              ? "top-[3px] h-2.5 bg-slate-700/40 cursor-default rounded-sm"
                              : [
                                  "top-[3px] h-3 rounded text-[8px] px-1 text-blue-700/80 bg-blue-100 border border-blue-300 font-medium select-none",
                                  baselineLocked ? "cursor-default" : [
                                    "cursor-pointer hover:bg-blue-600 hover:text-white hover:h-[14px]",
                                    isDraggingPlan && "bg-blue-600 text-white cursor-grabbing h-[14px]"
                                  ]
                                ]
                          )}
                          style={{ left: planOffset, width: Math.max(0, planWidth - 2) }}
                          title={`Plan: ${task.title} (${format(planStart!, 'yyyy-MM-dd')} - ${format(planEnd!, 'yyyy-MM-dd')})`}
                          onMouseDown={(e) => {
                            if (baselineLocked || e.button !== 0 || isParent) return;
                            e.stopPropagation();
                            const planStartStr = task.planStartDate || task.startDate || format(new Date(), 'yyyy-MM-dd');
                            const planEndStr = task.planEndDate || task.endDate || format(new Date(), 'yyyy-MM-dd');
                            setDragState({
                              taskId: id,
                              mode: 'move',
                              startX: e.clientX,
                              startY: e.clientY,
                              initialStartDate: new Date(planStartStr),
                              initialEndDate: new Date(planEndStr),
                              currentStartDate: new Date(planStartStr),
                              currentEndDate: new Date(planEndStr),
                            });
                          }}
                        >
                          {/* Downward hanging bracket triangles for parent tasks */}
                          {isParent && (
                            <>
                              <div className="absolute left-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-700/40 border-r-[4px] border-r-transparent border-l-[4px] border-l-transparent" />
                              <div className="absolute right-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-700/40 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent" />
                            </>
                          )}

                          {/* Left Resize Handle */}
                          {!isParent && !baselineLocked && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const planStartStr = task.planStartDate || task.startDate || format(new Date(), 'yyyy-MM-dd');
                                const planEndStr = task.planEndDate || task.endDate || format(new Date(), 'yyyy-MM-dd');
                                setDragState({
                                  taskId: id,
                                  mode: 'resize-left',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: new Date(planStartStr),
                                  initialEndDate: new Date(planEndStr),
                                  currentStartDate: new Date(planStartStr),
                                  currentEndDate: new Date(planEndStr),
                                });
                              }}
                            />
                          )}

                          {/* Right Resize Handle */}
                          {!isParent && !baselineLocked && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const planStartStr = task.planStartDate || task.startDate || format(new Date(), 'yyyy-MM-dd');
                                const planEndStr = task.planEndDate || task.endDate || format(new Date(), 'yyyy-MM-dd');
                                setDragState({
                                  taskId: id,
                                  mode: 'resize-right',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: new Date(planStartStr),
                                  initialEndDate: new Date(planEndStr),
                                  currentStartDate: new Date(planStartStr),
                                  currentEndDate: new Date(planEndStr),
                                });
                              }}
                            />
                          )}

                          {/* Dependency Handle */}
                          {!isParent && !baselineLocked && (
                            <div
                              className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-crosshair opacity-0 hover:scale-125 transition-all z-50 shadow-sm flex items-center justify-center group-hover:opacity-100"
                              title="Drag to create dependency"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const planStartStr = task.planStartDate || task.startDate || format(new Date(), 'yyyy-MM-dd');
                                const planEndStr = task.planEndDate || task.endDate || format(new Date(), 'yyyy-MM-dd');
                                setDragState({
                                  taskId: id,
                                  mode: 'dependency',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: new Date(planStartStr),
                                  initialEndDate: new Date(planEndStr),
                                  currentStartDate: new Date(planStartStr),
                                  currentEndDate: new Date(planEndStr),
                                });
                              }}
                            >
                              <span className="text-blue-500 text-[10px] font-bold">+</span>
                            </div>
                          )}

                          {!isParent && !baselineLocked && (
                            <span className="px-1 truncate pointer-events-none text-blue-800">
                              {task.title}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Actual Bar (Forecast - only displayed when baselineLocked is true and dates are not null) */}
                      {baselineLocked && taskStart && taskEnd && width > 0 && (
                        <div
                          data-task-id={id}
                          className={clsx(
                            "absolute text-[9px] flex items-center shadow-sm group z-30 transition-all",
                            isParent
                              ? "top-[18px] h-2 bg-slate-500 cursor-default rounded-sm"
                              : [
                                  "top-[17px] h-2.5 rounded text-white bg-amber-500 hover:bg-amber-600 cursor-pointer",
                                  isDraggingActual && "bg-amber-600 cursor-grabbing"
                                ]
                          )}
                          style={{ left: offset, width: Math.max(0, width - 2) }}
                          title={`Actual: ${task.title} (${format(taskStart, 'yyyy-MM-dd')} - ${format(taskEnd, 'yyyy-MM-dd')})`}
                          onMouseDown={(e) => {
                            if (e.button !== 0 || isParent) return;
                            e.stopPropagation();
                            setDragState({
                              taskId: id,
                              mode: 'move',
                              startX: e.clientX,
                              startY: e.clientY,
                              initialStartDate: taskStart,
                              initialEndDate: taskEnd,
                              currentStartDate: taskStart,
                              currentEndDate: taskEnd,
                            });
                          }}
                        >
                          {/* Downward hanging bracket triangles for parent tasks */}
                          {isParent && (
                            <>
                              <div className="absolute left-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-500 border-r-[4px] border-r-transparent border-l-[4px] border-l-transparent" />
                              <div className="absolute right-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-500 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent" />
                            </>
                          )}

                          {/* Left Resize Handle */}
                          {!isParent && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDragState({
                                  taskId: id,
                                  mode: 'resize-left',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: taskStart,
                                  initialEndDate: taskEnd,
                                  currentStartDate: taskStart,
                                  currentEndDate: taskEnd,
                                });
                              }}
                            />
                          )}

                          {/* Right Resize Handle */}
                          {!isParent && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDragState({
                                  taskId: id,
                                  mode: 'resize-right',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: taskStart,
                                  initialEndDate: taskEnd,
                                  currentStartDate: taskStart,
                                  currentEndDate: taskEnd,
                                });
                              }}
                            />
                          )}

                          <span className={clsx("px-1 truncate pointer-events-none text-white", isParent && "font-semibold")}>
                            {task.title}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
