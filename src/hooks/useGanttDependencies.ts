import { useState, useLayoutEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { FlattenedItem } from '../utils/tree';
import type { TimelineMetrics } from './useGanttTimeline';
import { differenceInDays } from 'date-fns';

export interface DependencyLine {
  key: string;
  d: string;
  fromId: string;
  toId: string;
}

export const useGanttDependencies = (
  flattenedItems: FlattenedItem[],
  _taskBarRefs: React.RefObject<Map<string, HTMLDivElement>>, // kept for signature compatibility
  _containerRef: React.RefObject<HTMLDivElement | null>,     // kept for signature compatibility
  _leftOffset: number,                                       // kept for signature compatibility
  timelineMetrics: TimelineMetrics,
  dragState: any
) => {
  const tasks = useTaskStore((state) => state.tasks);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);

  useLayoutEffect(() => {
    const lines: DependencyLine[] = [];
    const pixelsPerDay = timelineMetrics.pixelsPerDay;
    const timelineStart = timelineMetrics.timelineStart;

    if (!pixelsPerDay || !timelineStart) {
      return;
    }

    const rowHeight = 32;

    // Helper to get active dates for a task, considering dragging
    const getTaskDates = (id: string, task: any) => {
      const isDraggingTask =
        dragState &&
        dragState.taskId === id &&
        dragState.mode !== 'dependency' &&
        dragState.mode !== 'draw-range';

      if (baselineLocked) {
        const start = isDraggingTask
          ? dragState.currentStartDate
          : (task.startDate ? new Date(task.startDate) : null);
        const end = isDraggingTask
          ? dragState.currentEndDate
          : (task.endDate ? new Date(task.endDate) : null);
        return { start, end };
      } else {
        const start = isDraggingTask
          ? dragState.currentStartDate
          : (task.planStartDate
              ? new Date(task.planStartDate)
              : (task.startDate ? new Date(task.startDate) : null));
        const end = isDraggingTask
          ? dragState.currentEndDate
          : (task.planEndDate
              ? new Date(task.planEndDate)
              : (task.endDate ? new Date(task.endDate) : null));
        return { start, end };
      }
    };

    // Pre-create index maps for fast O(1) lookup of vertical positions
    const indexMap = new Map<string, number>();
    flattenedItems.forEach((item, index) => {
      indexMap.set(item.id, index);
    });

    for (const { id, task } of flattenedItems) {
      if (task.dependencies && task.dependencies.length > 0) {
        const targetIndex = indexMap.get(id);
        if (targetIndex === undefined) continue;

        const targetDates = getTaskDates(id, task);
        if (!targetDates.start) continue;

        for (const depId of task.dependencies) {
          const sourceTask = tasks[depId];
          if (!sourceTask) continue;

          const sourceIndex = indexMap.get(depId);
          if (sourceIndex === undefined) continue; // Source is collapsed / folded, don't draw

          const sourceDates = getTaskDates(depId, sourceTask);
          if (!sourceDates.end) continue;

          const diffDaysStart = differenceInDays(sourceDates.end, timelineStart) + 1;
          const startX = diffDaysStart * pixelsPerDay;
          const startY = sourceIndex * rowHeight + rowHeight / 2;

          const diffDaysEnd = differenceInDays(targetDates.start, timelineStart);
          const endX = diffDaysEnd * pixelsPerDay;
          const endY = targetIndex * rowHeight + rowHeight / 2;

          let path = '';
          const boxPadding = 20;

          if (endX > startX + boxPadding * 2) {
            const midX = startX + (endX - startX) / 2;
            path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
          } else {
            const verticalLaneY =
              endY > startY ? startY + rowHeight / 2 : startY - rowHeight / 2;
            path = `M ${startX} ${startY} L ${startX + boxPadding} ${startY} L ${
              startX + boxPadding
            } ${verticalLaneY} L ${endX - boxPadding} ${verticalLaneY} L ${
              endX - boxPadding
            } ${endY} L ${endX} ${endY}`;
          }

          lines.push({
            key: `${depId}::${id}`,
            d: path,
            fromId: depId,
            toId: id,
          });
        }
      }
    }
    setDependencyLines(lines);
  }, [flattenedItems, tasks, timelineMetrics, baselineLocked, dragState]);

  return dependencyLines;
};

