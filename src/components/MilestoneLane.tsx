import React, { useMemo } from 'react';
import { addDays, differenceInDays, format, isValid, parseISO } from 'date-fns';
import { Diamond } from 'lucide-react';
import type { Milestone } from '../types';
import type { TimelineMetrics } from '../hooks/useGanttTimeline';
import { formatFullDate, formatToShow } from '../utils/date';

export const MILESTONE_LANE_HEIGHT = 28;

export interface MilestoneLaneProps {
  timeRange: Date[];
  cellWidth: number;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  timelineMetrics: TimelineMetrics;
  milestones: Milestone[];
  /** 左ペイン（項目名など）の幅。0 ならラベルを出さない。 */
  leftOffset: number;
  /** 横スクロールをヘッダーと同期するためのビューポート ref。 */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onEdit: (milestone: Milestone) => void;
  onAdd: (date: string) => void;
}

interface MilestoneGroup {
  date: string;
  items: Milestone[];
  center: number;
  showLabel: boolean;
}

/**
 * ガント／統合表示のヘッダー直下に置くマイルストーンバンド。
 *
 * 行のスクロールコンテナの外に置くことで、縦スクロールしても常に表示する。
 * 横スクロールだけは `viewportRef` 経由でヘッダーと同期する。
 * ダイヤをクリックすると編集、バンド上のダブルクリックでその日付に追加する。
 */
export const MilestoneLane = ({
  timeRange,
  cellWidth,
  viewMode,
  timelineMetrics,
  milestones,
  leftOffset,
  viewportRef,
  onEdit,
  onAdd,
}: MilestoneLaneProps) => {
  const totalWidth = timeRange.length * cellWidth;
  const timelineStart = timelineMetrics.timelineStart;
  const pixelsPerDay = timelineMetrics.pixelsPerDay;

  const groups = useMemo<MilestoneGroup[]>(() => {
    if (pixelsPerDay <= 0) {
      return [];
    }

    const byDate = new Map<string, Milestone[]>();
    milestones.forEach((milestone) => {
      const date = parseISO(milestone.date);
      if (!isValid(date)) return;
      const items = byDate.get(milestone.date) ?? [];
      items.push(milestone);
      byDate.set(milestone.date, items);
    });

    // Day 表示ではラベルを出すが、隣のラベルと重なる場合はダイヤだけにする。
    let labelRight = -Infinity;

    return Array.from(byDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, items]) => {
        const parsed = parseISO(date);
        const center =
          differenceInDays(parsed, timelineStart) * pixelsPerDay + pixelsPerDay / 2;
        const estimatedLabelWidth =
          24 + Math.min(160, items[0].title.length * 11) + 42;
        const showLabel = viewMode === 'Day' && center > labelRight + 8;
        if (showLabel) {
          labelRight = center + estimatedLabelWidth;
        }
        return { date, items, center, showLabel };
      });
  }, [milestones, pixelsPerDay, timelineStart, viewMode]);

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest?.('[data-milestone]')) {
      return;
    }
    if (pixelsPerDay <= 0 || timeRange.length === 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const dayIndex = Math.max(
      0,
      Math.min(timeRange.length - 1, Math.floor(x / pixelsPerDay))
    );
    onAdd(format(addDays(timelineStart, dayIndex), 'yyyy-MM-dd'));
  };

  if (milestones.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="milestone-lane"
      className="flex shrink-0 border-b border-line bg-slate-50"
      style={{ height: MILESTONE_LANE_HEIGHT }}
    >
      {leftOffset > 0 && (
        <div
          className="flex shrink-0 items-center gap-1.5 border-r border-line bg-slate-50 px-3 text-[11px] font-medium text-slate-500"
          style={{ width: leftOffset }}
        >
          <Diamond size={11} className="shrink-0 text-violet-500" />
          <span className="truncate">マイルストーン</span>
        </div>
      )}

      <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
        <div
          data-testid="milestone-lane-timeline"
          className="relative h-full"
          style={{ width: totalWidth }}
          onDoubleClick={handleDoubleClick}
        >
          {groups.map((group) => {
            if (group.center < -40 || group.center > totalWidth + 40) {
              return null;
            }

            const first = group.items[0];
            const extra = group.items.length - 1;
            const tooltipLines = group.items.map(
              (item) => `${item.title} (${formatFullDate(item.date)})`
            );

            return (
              <button
                key={group.date}
                type="button"
                data-milestone={first.id}
                data-milestone-date={group.date}
                className="absolute top-0 flex h-full items-center gap-1.5 rounded px-1 text-left transition-colors hover:bg-violet-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                style={{ left: group.center - 5 }}
                onClick={() => onEdit(first)}
                onDoubleClick={(event) => event.stopPropagation()}
                title={tooltipLines.join('\n')}
                aria-label={`マイルストーン: ${first.title} (${formatFullDate(group.date)})`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rotate-45 border border-violet-700 bg-violet-500 shadow-sm"
                />
                {group.showLabel && (
                  <>
                    <span className="max-w-[160px] truncate text-[11px] font-medium text-slate-700">
                      {first.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatToShow(group.date)}
                    </span>
                  </>
                )}
                {extra > 0 && (
                  <span className="shrink-0 rounded-full bg-violet-100 px-1 text-[10px] font-semibold text-violet-700">
                    +{extra}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
