import React from 'react';
import clsx from 'clsx';
import { differenceInDays, isSameDay, isValid, parseISO, startOfDay } from 'date-fns';
import type { Milestone, WorkCalendar } from '../types';
import { isHoliday } from '../utils/date';

export interface TimelineGridBackgroundProps {
  timeRange: Date[];
  cellWidth: number;
  calendar: WorkCalendar;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  totalHeight: number;
  timelineWidth: number;
  /** 1 日あたりのピクセル幅（今日ラインの位置計算に使う）。 */
  pixelsPerDay: number;
  leftOffset?: number;
  /** マイルストーンの縦ガイド線を描くためのデータ。 */
  milestones?: Milestone[];
}

/**
 * タイムラインの背面レイヤー。日付の縦グリッドに加えて、
 * 週末（薄グレー）・祝日（薄アンバー）の区別と「今日」のアクセントラインを描く。
 *
 * 横スクロール時は左ペイン（タスク名列）の下へ潜り込むため、呼び出し側で
 * `clip-path` を当ててタスク名列の領域には描かないようにする（ref を公開）。
 */
export const TimelineGridBackground = React.forwardRef<HTMLDivElement, TimelineGridBackgroundProps>(({
  timeRange,
  cellWidth,
  calendar,
  viewMode,
  totalHeight,
  timelineWidth,
  pixelsPerDay,
  leftOffset = 0,
  milestones = [],
}, ref) => {
  const timelineStart = timeRange[0];
  const today = startOfDay(new Date());
  const todayOffset = timelineStart
    ? differenceInDays(today, startOfDay(timelineStart)) * pixelsPerDay
    : 0;
  const showTodayLine =
    viewMode === 'Day' && pixelsPerDay > 0 && todayOffset >= 0 && todayOffset <= timelineWidth;

  // マイルストーンの縦ガイド。日付セルの中央に合わせてダイヤと位置を揃える。
  const milestoneLines = timelineStart && pixelsPerDay > 0
    ? milestones.flatMap((milestone) => {
        const date = parseISO(milestone.date);
        if (!isValid(date)) {
          return [];
        }
        const offset =
          differenceInDays(date, startOfDay(timelineStart)) * pixelsPerDay +
          pixelsPerDay / 2;
        if (offset < 0 || offset > timelineWidth) {
          return [];
        }
        return [{ id: milestone.id, offset }];
      })
    : [];

  return (
    <div
      ref={ref}
      className="absolute top-0 pointer-events-none z-0"
      style={{ width: timelineWidth, height: totalHeight, minHeight: '100%', left: leftOffset }}
    >
      <div className="absolute inset-0 flex">
        {timeRange.map((date) => {
          const isDayView = viewMode === 'Day';
          const holiday = isDayView && isHoliday(date, calendar);
          const weekend = isDayView && !holiday && !calendar.workDays.includes(date.getDay());
          const isToday = isDayView && isSameDay(date, today);

          return (
            <div
              key={date.toISOString()}
              className={clsx(
                'flex-shrink-0 border-r border-slate-100 h-full',
                holiday
                  ? 'bg-amber-100/60'
                  : weekend
                    ? 'bg-slate-100/70'
                    : isToday
                      ? 'bg-brand-50'
                      : ''
              )}
              style={{ width: cellWidth }}
            />
          );
        })}
      </div>

      {/* マイルストーンの縦ガイド（今日ラインより細い破線） */}
      {milestoneLines.map((line) => (
        <div
          key={line.id}
          className="absolute top-0 bottom-0 w-px border-l border-dashed border-violet-400/70"
          style={{ left: line.offset }}
          data-milestone-guide={line.id}
          aria-hidden="true"
        />
      ))}

      {/* 今日ライン */}
      {showTodayLine && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-brand-500/70"
          style={{ left: todayOffset }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

TimelineGridBackground.displayName = 'TimelineGridBackground';
