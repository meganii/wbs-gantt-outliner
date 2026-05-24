import { useState, useLayoutEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { FlattenedItem } from '../utils/tree';
import type { TimelineMetrics } from './useGanttTimeline';

export interface DependencyLine {
  key: string;
  d: string;
  fromId: string;
  toId: string;
}

export const useGanttDependencies = (
  flattenedItems: FlattenedItem[],
  taskBarRefs: React.RefObject<Map<string, HTMLDivElement>>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  leftOffset: number,
  timelineMetrics: TimelineMetrics,
  dragState: any
) => {
  const tasks = useTaskStore((state) => state.tasks);
  const baselineLocked = useTaskStore((state) => state.projectConfig.baselineLocked ?? false);
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);

  useLayoutEffect(() => {
    const lines: DependencyLine[] = [];
    const container = containerRef.current;
    if (!container || !timelineMetrics.pixelsPerDay) {
      return;
    }

    const containerRect = container.getBoundingClientRect();

    for (const { id, task } of flattenedItems) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const sourceTask = tasks[depId];
          const targetTask = tasks[id];

          if (
            sourceTask &&
            targetTask &&
            (sourceTask.planEndDate || sourceTask.endDate) &&
            (targetTask.planStartDate || targetTask.startDate)
          ) {
            const sourceEl = taskBarRefs.current.get(depId);
            const targetEl = taskBarRefs.current.get(id);
            if (!sourceEl || !targetEl) continue;

            const sourceRect = sourceEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            const scrollLeft = container.scrollLeft || 0;
            const scrollTop = container.scrollTop || 0;

            const startX = sourceRect.right - containerRect.left + scrollLeft - leftOffset;
            const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top + scrollTop;
            const endX = targetRect.left - containerRect.left + scrollLeft - leftOffset;
            const endY = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop;

            let path = '';
            const boxPadding = 20;

            if (endX > startX + boxPadding * 2) {
              const midX = startX + (endX - startX) / 2;
              path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
            } else {
              const rowHeight = 32;
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
    }
    setDependencyLines(lines);
  }, [flattenedItems, tasks, timelineMetrics, baselineLocked, dragState, leftOffset, containerRef, taskBarRefs]);

  return dependencyLines;
};
