import { memo } from 'react';
import { useDraggedDependencyLines } from '../hooks/useGanttDependencies';
import type { FlattenedItem } from '../utils/tree';
import type { TimelineMetrics } from '../hooks/useGanttTimeline';

interface DraggedDependencyLinesProps {
  flattenedItems: FlattenedItem[];
  timelineMetrics: TimelineMetrics;
  markerId: string;
}

/**
 * ドラッグ中に移動しているタスクへ接続する依存線だけを描画するレイヤー。
 * 静的レイヤー（`GanttDependencyLines`）はドラッグ中に該当線を描画しないため、
 * ここでドラッグ位置に追従する線を補う。
 *
 * 生成される線は高々数本なので、毎 mousemove の再計算・再レンダーでもコストは小さい。
 * ドラッグ中に誤クリックで依存が消えないよう、この層の線は非インタラクティブにしている。
 */
export const DraggedDependencyLines = memo(({
  flattenedItems,
  timelineMetrics,
  markerId,
}: DraggedDependencyLinesProps) => {
  const dependencyLines = useDraggedDependencyLines(flattenedItems, timelineMetrics);

  return (
    <>
      {dependencyLines.map(({ key, d }) => (
        <path
          key={key}
          d={d}
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          markerEnd={`url(#${markerId})`}
          className="text-gray-400"
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </>
  );
});

DraggedDependencyLines.displayName = 'DraggedDependencyLines';
