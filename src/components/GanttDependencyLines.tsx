import { memo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useGanttDependencies } from '../hooks/useGanttDependencies';
import type { FlattenedItem } from '../utils/tree';
import type { TimelineMetrics } from '../hooks/useGanttTimeline';

interface GanttDependencyLinesProps {
  flattenedItems: FlattenedItem[];
  timelineMetrics: TimelineMetrics;
  markerId: string;
}

/**
 * 静的な依存線レイヤー。
 * `memo` 化しているため、親（IntegratedView / GanttChart）がホバー等で再レンダーしても、
 * props（flattenedItems / timelineMetrics）が同一参照なら再レンダーされない。
 */
export const GanttDependencyLines = memo(({
  flattenedItems,
  timelineMetrics,
  markerId,
}: GanttDependencyLinesProps) => {
  const removeDependency = useTaskStore((state) => state.removeDependency);
  const dependencyLines = useGanttDependencies(flattenedItems, timelineMetrics);

  return (
    <>
      {dependencyLines.map(({ key, d, fromId, toId }) => {
        return (
          <path
            key={key}
            d={d}
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            markerEnd={`url(#${markerId})`}
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
    </>
  );
});

GanttDependencyLines.displayName = 'GanttDependencyLines';
