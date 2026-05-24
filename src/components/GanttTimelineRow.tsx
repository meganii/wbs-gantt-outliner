import React, { memo } from 'react';
import { addDays, differenceInDays, format } from 'date-fns';
import clsx from 'clsx';
import type { Task } from '../types';

export interface GanttTimelineRowProps {
  taskId: string;
  task: Task;
  cellWidth: number;
  timelineMetrics: {
    timelineStart: Date;
    pixelsPerDay: number;
    totalDays: number;
  };
  dragState: any;
  setDragState: (state: any) => void;
  baselineLocked: boolean;
  taskBarRefs: React.RefObject<Map<string, HTMLDivElement>>;
  timelineWidth: number;
}

export const GanttTimelineRow = memo(({
  taskId,
  task,
  cellWidth,
  timelineMetrics,
  dragState,
  setDragState,
  baselineLocked,
  taskBarRefs,
  timelineWidth,
}: GanttTimelineRowProps) => {
  const isParent = task.children.length > 0;

  return (
    <div
      className={clsx(
        "relative flex pointer-events-auto h-full",
        isParent ? "cursor-default" : "cursor-crosshair"
      )}
      style={{
        width: timelineWidth,
        backgroundImage: 'linear-gradient(to right, #f3f4f6 1px, transparent 1px)',
        backgroundSize: `${cellWidth}px 100%`,
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || isParent) {
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const daysOffset = Math.floor(x / timelineMetrics.pixelsPerDay);
        const clickedDate = addDays(timelineMetrics.timelineStart, daysOffset);

        setDragState({
          taskId,
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
      {/* Task Bar */}
      {dragState?.taskId === taskId && dragState.mode === 'draw-range' && (() => {
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

      {/* Task Bar */}
      {(() => {
        const hasPlan = !!(task.planStartDate && task.planEndDate);
        const hasActual = !!(task.startDate && task.endDate);
        if (!hasPlan && !hasActual) return null;

        const { timelineStart, pixelsPerDay } = timelineMetrics;
        
        // 1. Plan Bar Metrics
        const isDraggingPlan = dragState?.taskId === taskId && !baselineLocked && dragState?.mode !== 'dependency' && dragState?.mode !== 'draw-range';
        const planStart = isDraggingPlan ? dragState.currentStartDate : (task.planStartDate ? new Date(task.planStartDate) : null);
        const planEnd = isDraggingPlan ? (dragState.currentEndDate === null ? null : dragState.currentEndDate) : (task.planEndDate ? new Date(task.planEndDate) : null);
        const planDiffDays = planStart ? differenceInDays(planStart, timelineStart) : 0;
        const planOffset = planDiffDays * pixelsPerDay;
        const planDaySpan = (planStart && planEnd) ? differenceInDays(planEnd, planStart) + 1 : 0;
        const planWidth = planDaySpan * pixelsPerDay;

        // 2. Actual Bar Metrics
        const isDraggingActual = dragState?.taskId === taskId && baselineLocked && dragState?.mode !== 'dependency' && dragState?.mode !== 'draw-range';
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
                ref={(el) => {
                  if (el) {
                    taskBarRefs.current?.set(taskId, el);
                  } else {
                    taskBarRefs.current?.delete(taskId);
                  }
                }}
                data-task-id={taskId}
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
                    taskId,
                    mode: 'move',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialStartDate: new Date(planStartStr),
                    initialEndDate: new Date(planEndStr),
                    currentStartDate: new Date(planStartStr),
                    currentEndDate: new Date(planStartStr),
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
                        taskId,
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
                        taskId,
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
                        taskId,
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

            {/* Actual Bar */}
            {baselineLocked && taskStart && taskEnd && width > 0 && (
              <div
                ref={(el) => {
                  // If baseline is locked, actual bar should act as dependency anchor reference!
                  if (el) {
                    taskBarRefs.current?.set(taskId, el);
                  } else {
                    taskBarRefs.current?.delete(taskId);
                  }
                }}
                data-task-id={taskId}
                className={clsx(
                  "absolute text-[8px] flex items-center shadow-sm group z-30 transition-all",
                  isParent
                    ? "top-[18px] h-2 cursor-default rounded-sm"
                    : [
                        "top-[17px] h-2.5 rounded text-amber-950 cursor-pointer hover:shadow-sm",
                        isDraggingActual && "cursor-grabbing border-amber-600 shadow-md animate-pulse"
                      ]
                )}
                style={{
                  left: offset,
                  width: Math.max(0, width - 2),
                  background: isParent
                    ? `linear-gradient(to right, #475569 ${task.progress}%, #ffffff ${task.progress}%)`
                    : `linear-gradient(to right, #f59e0b ${task.progress}%, #ffffff ${task.progress}%)`,
                  border: isParent
                    ? '1px solid #475569'
                    : '1px solid #d97706',
                }}
                title={`Actual: ${task.title} (${task.progress}%) (${format(taskStart, 'yyyy-MM-dd')} - ${format(taskEnd, 'yyyy-MM-dd')})`}
                onMouseDown={(e) => {
                  if (e.button !== 0 || isParent) return;
                  e.stopPropagation();
                  setDragState({
                    taskId,
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
                        taskId,
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
                        taskId,
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

                <span className={clsx("px-1 truncate pointer-events-none text-[8px] leading-none", isParent ? "text-slate-800 font-semibold" : "text-amber-950 font-semibold")}>
                  {task.title}
                </span>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
});

GanttTimelineRow.displayName = 'GanttTimelineRow';
