import React, { useMemo } from 'react';
import { format, getMonth, getYear, getISOWeek } from 'date-fns';
import clsx from 'clsx';
import { isWorkDay } from '../utils/date';
import type { WorkCalendar } from '../types';

interface TimelineHeaderProps {
  timeRange: Date[];
  cellWidth: number;
  viewMode: 'Day' | 'Week' | 'Month' | 'Year';
  calendar: WorkCalendar;
}

/** グループラベルのセグメント */
interface GroupSegment {
  label: string;
  colSpan: number;
  /** このセグメントの先頭のインデックス */
  startIndex: number;
}

/** timeRange をグループ単位（月や年）に分割する */
function buildGroupSegments(timeRange: Date[], viewMode: 'Day' | 'Week' | 'Month' | 'Year'): GroupSegment[] {
  if (viewMode === 'Year') return []; // Year は 1 段のみ

  const segments: GroupSegment[] = [];
  let currentKey = '';
  let currentLabel = '';
  let colSpan = 0;
  let startIndex = 0;

  timeRange.forEach((date, i) => {
    let key: string;
    let label: string;

    if (viewMode === 'Month') {
      // Month モード: 年でグループ化
      key = String(getYear(date));
      label = format(date, 'yyyy');
    } else {
      // Day / Week モード: 年月でグループ化
      key = `${getYear(date)}-${getMonth(date)}`;
      label = format(date, 'yyyy年M月');
    }

    if (key !== currentKey) {
      if (currentKey !== '') {
        segments.push({ label: currentLabel, colSpan, startIndex });
      }
      currentKey = key;
      currentLabel = label;
      colSpan = 1;
      startIndex = i;
    } else {
      colSpan++;
    }
  });

  if (currentKey !== '') {
    segments.push({ label: currentLabel, colSpan, startIndex });
  }

  return segments;
}

/**
 * タイムラインの2段ヘッダーコンポーネント。
 * - 上段 (グループ行): Day/Week → 年月、Month → 年、Year → なし
 * - 下段 (詳細行): Day → 日+曜日、Week → 週番号+開始日、Month → 月名、Year → 年
 * 月の境目（グループ切り替え）に太い区切り線を入れる。
 */
export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  timeRange,
  cellWidth,
  viewMode,
  calendar,
}) => {
  const totalWidth = timeRange.length * cellWidth;
  const showGroupRow = viewMode !== 'Year';

  const groupSegments = useMemo(
    () => buildGroupSegments(timeRange, viewMode),
    [timeRange, viewMode]
  );


  return (
    <div className="flex flex-col select-none" style={{ width: totalWidth }}>
      {/* ── 上段: グループ行 ── */}
      {showGroupRow && (
        <div className="flex border-b border-gray-200" style={{ height: 20 }}>
          {groupSegments.map((seg, i) => (
            <div
              key={`${seg.label}-${seg.startIndex}`}
              className={clsx(
                'flex-shrink-0 flex items-center px-2 border-r border-gray-300',
                'text-[10px] font-semibold text-gray-500 tracking-wide',
              )}
              style={{ width: seg.colSpan * cellWidth }}
            >
              {seg.label}
            </div>
          ))}
        </div>
      )}

      {/* ── 下段: 詳細行 ── */}
      <div
        className="flex"
        style={{ height: showGroupRow ? 36 : 56 }}
      >
        {timeRange.map((date, i) => {
          const isWknd = !isWorkDay(date, calendar);

          let label = '';
          let subLabel = '';

          switch (viewMode) {
            case 'Week':
              label = `W${getISOWeek(date)}`;
              subLabel = format(date, 'M/d');
              break;
            case 'Month':
              label = format(date, 'MMM');
              subLabel = format(date, 'yyyy');
              break;
            case 'Year':
              label = format(date, 'yyyy');
              subLabel = '';
              break;
            case 'Day':
            default:
              label = format(date, 'd');
              subLabel = format(date, 'EE');
              break;
          }

          return (
            <div
              key={date.toISOString()}
              className={clsx(
                'flex-shrink-0 border-r border-gray-300 text-[10px] flex flex-col items-center justify-center transition-colors',
                // Day モード: 週末の背景
                viewMode === 'Day' && isWknd
                  ? 'bg-gray-100/80 text-gray-400'
                  : 'text-gray-600'
              )}
              style={{ width: cellWidth }}
            >
              <span className="font-medium leading-none">{label}</span>
              {subLabel && (
                <span className="text-[8px] text-gray-400 mt-0.5 leading-none">{subLabel}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
