import { useState, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { getWorkDaysCount } from '../utils/date';
import type { TimelineMetrics } from './useGanttTimeline';

export interface GanttDragState {
  taskId: string;
  mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
  startX: number;
  startY: number;
  initialStartDate: Date;
  initialEndDate: Date;
  currentStartDate: Date;
  currentEndDate: Date;
  targetTaskId?: string;
}

export const useGanttDrag = (
  leftOffset: number,
  containerRef: React.RefObject<HTMLDivElement | null>,
  cellWidth: number,
  timeRange: Date[],
  timelineMetrics: TimelineMetrics
) => {
  const tasks = useTaskStore((state) => state.tasks);
  const calendar = useTaskStore((state) => state.projectConfig.calendar);
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);
  const updateTask = useTaskStore((state) => state.updateTask);
  const addDependency = useTaskStore((state) => state.addDependency);

  const [dragState, setDragState] = useState<GanttDragState | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;

      if (dragState.mode === 'dependency') {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setMousePos({
            x: e.clientX - rect.left + containerRef.current.scrollLeft - leftOffset,
            y: e.clientY - rect.top + containerRef.current.scrollTop,
          });
        }
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const pixelsPerDay = timelineMetrics.pixelsPerDay;
      const deltaDays = pixelsPerDay > 0 ? Math.round(deltaX / pixelsPerDay) : 0;

      setDragState((prev) => {
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
          case 'Month':
            start = startOfMonth(start);
            end = endOfMonth(end);
            break;
          case 'Year':
            start = startOfYear(start);
            end = endOfYear(end);
            break;
        }

        const newDuration = getWorkDaysCount(start, end, calendar);
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
        const {
          taskId,
          currentStartDate,
          currentEndDate,
          initialStartDate,
          initialEndDate,
        } = dragState;
        if (
          currentStartDate.getTime() !== initialStartDate.getTime() ||
          currentEndDate.getTime() !== initialEndDate.getTime()
        ) {
          const newDuration = getWorkDaysCount(currentStartDate, currentEndDate, calendar);
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
  }, [
    dragState,
    updateTask,
    addDependency,
    timeRange,
    cellWidth,
    viewMode,
    calendar,
    baselineLocked,
    leftOffset,
    containerRef,
    tasks,
  ]);

  return {
    dragState,
    mousePos,
    setDragState,
    setMousePos,
  };
};
