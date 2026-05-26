import { useTaskStore } from '../store/useTaskStore';
import { differenceInDays } from 'date-fns';
import type { FlattenedItem } from '../utils/tree';
import type { TimelineMetrics } from '../hooks/useGanttTimeline';

interface DraggingDependencyLineProps {
  flattenedItems: FlattenedItem[];
  timelineMetrics: TimelineMetrics;
}

export const DraggingDependencyLine = ({
  flattenedItems,
  timelineMetrics,
}: DraggingDependencyLineProps) => {
  const dragState = useTaskStore((state) => state.dragState);
  const mousePos = useTaskStore((state) => state.mousePos);
  const tasks = useTaskStore((state) => state.tasks);

  if (dragState?.mode !== 'dependency' || !mousePos) {
    return null;
  }

  const startIdx = flattenedItems.findIndex((i) => i.id === dragState.taskId);
  if (startIdx === -1) {
    return null;
  }

  const task = tasks[dragState.taskId];
  if (!task) {
    return null;
  }

  const endDateStr = task.planEndDate || task.endDate;
  if (!endDateStr) {
    return null;
  }

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
};
