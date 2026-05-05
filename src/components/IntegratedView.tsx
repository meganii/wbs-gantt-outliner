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
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskRow } from './TaskRow';
import { TaskTableHeader } from './TaskTableHeader';

interface IntegratedViewProps {
  outlinerWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
}

const ROW_HEIGHT = 32;

export const IntegratedView: React.FC<IntegratedViewProps> = ({
  outlinerWidth,
  onResizeStart,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
}) => {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const calendar = useTaskStore((state) => state.projectConfig.calendar);
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const setViewMode = useTaskStore((state) => state.setViewMode);
  const reorderTask = useTaskStore((state) => state.reorderTask);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);
  const removeDependency = useTaskStore((state) => state.removeDependency);
  const updateTask = useTaskStore((state) => state.updateTask);
  const addDependency = useTaskStore((state) => state.addDependency);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );
  const flattenedIds = useMemo(() => flattenedItems.map((item) => item.id), [flattenedItems]);

  const [dependencyLines, setDependencyLines] = useState<Array<{ key: string; d: string; fromId: string; toId: string }>>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
    startX: number;
    startY: number;
    initialStartDate: Date;
    initialEndDate: Date;
    currentStartDate: Date;
    currentEndDate: Date;
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const cellWidth = useMemo(() => {
    switch (viewMode) {
      case 'Week':
        return 100;
      case 'Month':
        return 200;
      case 'Year':
        return 400;
      case 'Day':
      default:
        return 40;
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
    if (!timelineStart) {
      return {
        timelineStart: new Date(),
        timelineEnd: new Date(),
        totalDays: 0,
        totalWidth: 0,
        pixelsPerDay: 0,
      };
    }

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
    const totalWidth = timeRange.length * cellWidth;
    const pixelsPerDay = totalDays > 0 ? totalWidth / totalDays : 0;

    return { timelineStart, timelineEnd, totalDays, totalWidth, pixelsPerDay };
  }, [timeRange, viewMode, cellWidth]);

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) {
        return;
      }

      if (dragState.mode === 'dependency') {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setMousePos({
            x: e.clientX - rect.left + containerRef.current.scrollLeft - outlinerWidth,
            y: e.clientY - rect.top + containerRef.current.scrollTop,
          });
        }
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const daysPerPixel = differenceInDays(timeRange[timeRange.length - 1], timeRange[0]) / (timeRange.length * cellWidth);
      const deltaDays = Math.round(deltaX * daysPerPixel);

      setDragState((prev) => {
        if (!prev) {
          return null;
        }

        const next = { ...prev };
        if (prev.mode === 'move') {
          next.currentStartDate = addDays(prev.initialStartDate, deltaDays);
          next.currentEndDate = addDays(prev.initialEndDate, deltaDays);
        } else if (prev.mode === 'resize-left') {
          const newStart = addDays(prev.initialStartDate, deltaDays);
          if (newStart <= prev.initialEndDate) {
            next.currentStartDate = newStart;
          }
        } else if (prev.mode === 'resize-right') {
          const newEnd = addDays(prev.initialEndDate, deltaDays);
          if (newEnd >= prev.initialStartDate) {
            next.currentEndDate = newEnd;
          }
        } else if (prev.mode === 'draw-range') {
          next.currentEndDate = addDays(prev.initialStartDate, deltaDays);
        }
        return next;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState) {
        return;
      }

      if (dragState.mode === 'dependency') {
        let target = e.target as HTMLElement;
        while (target && !target.getAttribute?.('data-task-id')) {
          target = target.parentElement as HTMLElement;
        }
        if (target) {
          const targetId = target.getAttribute('data-task-id');
          if (targetId && targetId !== dragState.taskId) {
            addDependency(dragState.taskId, targetId);
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
        updateTask(taskId, {
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
          duration: newDuration,
        });
      } else {
        const { taskId, currentStartDate, currentEndDate, initialStartDate, initialEndDate } = dragState;
        if (
          currentStartDate.getTime() !== initialStartDate.getTime() ||
          currentEndDate.getTime() !== initialEndDate.getTime()
        ) {
          const newDuration = differenceInDays(currentEndDate, currentStartDate) + 1;
          updateTask(taskId, {
            startDate: format(currentStartDate, 'yyyy-MM-dd'),
            endDate: format(currentEndDate, 'yyyy-MM-dd'),
            duration: newDuration,
          });
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
  }, [addDependency, cellWidth, dragState, outlinerWidth, removeDependency, timeRange, updateTask, viewMode]);

  useLayoutEffect(() => {
    const lines = [];
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect || !timelineMetrics.pixelsPerDay) {
      return;
    }

    for (const { id, task } of flattenedItems) {
      if (!task.dependencies) {
        continue;
      }

      for (const depId of task.dependencies) {
        const sourceTask = tasks[depId];
        const targetTask = tasks[id];
        if (!sourceTask || !targetTask || !sourceTask.endDate || !targetTask.startDate) {
          continue;
        }

        const sourceEl = taskBarRefs.current.get(depId);
        const targetEl = taskBarRefs.current.get(id);
        if (!sourceEl || !targetEl) {
          continue;
        }

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const scrollLeft = containerRef.current?.scrollLeft || 0;
        const scrollTop = containerRef.current?.scrollTop || 0;

        const startX = sourceRect.right - containerRect.left + scrollLeft - outlinerWidth;
        const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top + scrollTop;
        const endX = targetRect.left - containerRect.left + scrollLeft - outlinerWidth;
        const endY = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop;

        const boxPadding = 20;
        let path = '';
        if (endX > startX + boxPadding * 2) {
          const midX = startX + (endX - startX) / 2;
          path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        } else {
          const verticalLaneY = endY > startY ? startY + ROW_HEIGHT / 2 : startY - ROW_HEIGHT / 2;
          path = `M ${startX} ${startY} L ${startX + boxPadding} ${startY} L ${startX + boxPadding} ${verticalLaneY} L ${endX - boxPadding} ${verticalLaneY} L ${endX - boxPadding} ${endY} L ${endX} ${endY}`;
        }

        lines.push({
          key: `${depId}::${id}`,
          d: path,
          fromId: depId,
          toId: id,
        });
      }
    }

    setDependencyLines(lines);
  }, [flattenedItems, outlinerWidth, tasks, timelineMetrics]);

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
          <TaskTableHeader showDetails={false} />
        </div>
        <div className="flex-1 relative overflow-hidden bg-gray-100 border-b border-gray-300">
          <div ref={headerRef} className="h-[40px] overflow-hidden">
            <div className="flex" style={{ width: timelineWidth }}>
              {timeRange.map((date) => {
                const isWeekend = !isWorkDay(date, calendar);
                let label;
                let subLabel;
                switch (viewMode) {
                  case 'Week':
                    label = `W${format(date, 'w')}`;
                    subLabel = format(date, 'M/d');
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
                    break;
                }

                return (
                  <div
                    key={date.toISOString()}
                    className={clsx(
                      'flex-shrink-0 border-r border-gray-300 text-[10px] flex flex-col items-center justify-center',
                      viewMode === 'Day' && isWeekend ? 'bg-gray-200/50 text-gray-400' : 'text-gray-600'
                    )}
                    style={{ width: cellWidth, height: 40 }}
                  >
                    <span>{label}</span>
                    <span className="text-[8px]">{subLabel}</span>
                  </div>
                );
              })}
            </div>
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
            if (!task.endDate) {
              return null;
            }
            const taskEnd = new Date(task.endDate);
            const diffDays = differenceInDays(taskEnd, timelineMetrics.timelineStart);
            const startX = (diffDays + 1) * timelineMetrics.pixelsPerDay;
            const startY = startIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

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
                  showDetails={false}
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

                      <div
                        className="relative flex pointer-events-auto cursor-crosshair h-full"
                        style={{ width: timelineWidth }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) {
                            return;
                          }

                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const daysOffset = Math.floor((x / timelineWidth) * timelineMetrics.totalDays);
                          const clickedDate = addDays(timelineMetrics.timelineStart, daysOffset);

                          setDragState({
                            taskId: id,
                            mode: 'draw-range',
                            startX: e.clientX,
                            startY: e.clientY,
                            initialStartDate: clickedDate,
                            initialEndDate: clickedDate,
                            currentStartDate: clickedDate,
                            currentEndDate: clickedDate,
                          });
                        }}
                      >
                        <div className="absolute inset-0 flex pointer-events-none">
                          {timeRange.map((date) => {
                            const isWeekend = viewMode === 'Day' && !isWorkDay(date, calendar);
                            return (
                              <div
                                key={date.toISOString()}
                                className={clsx('flex-shrink-0 border-r border-gray-100 h-full', isWeekend && 'bg-gray-100/50')}
                                style={{ width: cellWidth }}
                              />
                            );
                          })}
                        </div>

                        {dragState?.taskId === id && dragState.mode === 'draw-range' && (() => {
                          const start = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentStartDate : dragState.currentEndDate;
                          const end = dragState.currentStartDate < dragState.currentEndDate ? dragState.currentEndDate : dragState.currentStartDate;
                          const diffDays = differenceInDays(start, timelineMetrics.timelineStart);
                          const offset = diffDays * timelineMetrics.pixelsPerDay;
                          const daySpan = differenceInDays(end, start) + 1;
                          const width = daySpan * timelineMetrics.pixelsPerDay;

                          return (
                            <div
                              className="absolute top-1.5 h-5 border-2 border-dashed border-blue-500 bg-blue-100/30 z-30 pointer-events-none"
                              style={{ left: offset, width: Math.max(0, width - 2) }}
                            />
                          );
                        })()}

                        {(() => {
                          if (!task.startDate || !task.endDate) {
                            return null;
                          }

                          const isDragging = dragState?.taskId === id && dragState.mode !== 'dependency' && dragState.mode !== 'draw-range';
                          const taskStart = isDragging ? dragState.currentStartDate : new Date(task.startDate);
                          const taskEnd = isDragging ? dragState.currentEndDate : new Date(task.endDate);
                          const diffDays = differenceInDays(taskStart, timelineMetrics.timelineStart);
                          const offset = diffDays * timelineMetrics.pixelsPerDay;
                          const daySpan = differenceInDays(taskEnd, taskStart) + 1;
                          const width = daySpan * timelineMetrics.pixelsPerDay;

                          if (width <= 0) {
                            return null;
                          }

                          return (
                            <div
                              ref={(el) => {
                                if (el) {
                                  taskBarRefs.current.set(id, el);
                                } else {
                                  taskBarRefs.current.delete(id);
                                }
                              }}
                              data-task-id={id}
                              className={clsx(
                                'absolute top-1.5 h-5 rounded text-[9px] flex items-center shadow-sm group z-30',
                                isDragging && 'bg-blue-600 cursor-grabbing',
                                !isDragging && isHovered && 'bg-blue-600 ring-1 ring-blue-300 cursor-pointer',
                                !isDragging && !isHovered && 'bg-blue-500 hover:bg-blue-400 cursor-pointer'
                              )}
                              style={{ left: offset, width: width - 2 }}
                              title={`${task.title}: ${format(taskStart, 'yyyy-MM-dd')} - ${format(taskEnd, 'yyyy-MM-dd')}`}
                              onMouseDown={(e) => {
                                if (e.button !== 0 || !task.startDate || !task.endDate) {
                                  return;
                                }
                                e.stopPropagation();
                                setDragState({
                                  taskId: id,
                                  mode: 'move',
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  initialStartDate: new Date(task.startDate),
                                  initialEndDate: new Date(task.endDate),
                                  currentStartDate: new Date(task.startDate),
                                  currentEndDate: new Date(task.endDate),
                                });
                              }}
                            >
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                                onMouseDown={(e) => {
                                  if (!task.startDate || !task.endDate) {
                                    return;
                                  }
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDragState({
                                    taskId: id,
                                    mode: 'resize-left',
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    initialStartDate: new Date(task.startDate),
                                    initialEndDate: new Date(task.endDate),
                                    currentStartDate: new Date(task.startDate),
                                    currentEndDate: new Date(task.endDate),
                                  });
                                }}
                              />
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10"
                                onMouseDown={(e) => {
                                  if (!task.startDate || !task.endDate) {
                                    return;
                                  }
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDragState({
                                    taskId: id,
                                    mode: 'resize-right',
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    initialStartDate: new Date(task.startDate),
                                    initialEndDate: new Date(task.endDate),
                                    currentStartDate: new Date(task.startDate),
                                    currentEndDate: new Date(task.endDate),
                                  });
                                }}
                              />
                              <div
                                className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-crosshair opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-50 shadow-sm flex items-center justify-center"
                                title="Drag to create dependency"
                                onMouseDown={(e) => {
                                  if (!task.startDate || !task.endDate) {
                                    return;
                                  }
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDragState({
                                    taskId: id,
                                    mode: 'dependency',
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    initialStartDate: new Date(task.startDate),
                                    initialEndDate: new Date(task.endDate),
                                    currentStartDate: new Date(task.startDate),
                                    currentEndDate: new Date(task.endDate),
                                  });
                                }}
                              >
                                <span className="text-blue-500 text-[10px] font-bold">+</span>
                              </div>
                              <span className="px-1 truncate pointer-events-none text-white">{task.title}</span>
                            </div>
                          );
                        })()}
                      </div>
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
