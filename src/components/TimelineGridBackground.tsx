import clsx from 'clsx';
import type { WorkCalendar } from '../types';
import { isWorkDay } from '../utils/date';

export interface TimelineGridBackgroundProps {
  timeRange: Date[];
  cellWidth: number;
  calendar: WorkCalendar;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  totalHeight: number;
  timelineWidth: number;
  leftOffset?: number;
}

export const TimelineGridBackground = ({
  timeRange,
  cellWidth,
  calendar,
  viewMode,
  totalHeight,
  timelineWidth,
  leftOffset = 0,
}: TimelineGridBackgroundProps) => {
  return (
    <div
      className="absolute inset-y-0 flex pointer-events-none z-0"
      style={{ width: timelineWidth, height: totalHeight, left: leftOffset }}
    >
      {timeRange.map((date) => {
        const isWeekend = viewMode === 'Day' && !isWorkDay(date, calendar);
        return (
          <div
            key={date.toISOString()}
            className={clsx(
              'flex-shrink-0 border-r border-gray-100 h-full',
              isWeekend && 'bg-gray-100/50'
            )}
            style={{ width: cellWidth }}
          />
        );
      })}
    </div>
  );
};
