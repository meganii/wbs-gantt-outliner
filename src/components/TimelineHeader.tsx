import React, { useMemo } from 'react';
import { format, getMonth, getYear, getISOWeek, isSameDay, startOfDay } from 'date-fns';
import clsx from 'clsx';
import { isHoliday, isWorkDay } from '../utils/date';
import type { WorkCalendar } from '../types';

/**
 * タイムライン 2 段ヘッダーの各行の高さと合計。
 * ガント / 統合表示の左ペイン（列ヘッダー）が同じ高さになるよう、
 * 各ビューからも参照する（値の二重管理を避ける唯一の定義元）。
 */
export const TIMELINE_GROUP_ROW_HEIGHT = 20;
export const TIMELINE_DETAIL_ROW_HEIGHT = 36;
export const TIMELINE_HEADER_HEIGHT = TIMELINE_GROUP_ROW_HEIGHT + TIMELINE_DETAIL_ROW_HEIGHT;

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
 * 月の境目に太い区切り線を入れる。グループラベルは横スクロール中も
 * 見えるよう sticky（左端固定）で表示する。
 */
export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  timeRange,
  cellWidth,
  viewMode,
  calendar,
}) => {
  const totalWidth = timeRange.length * cellWidth;
  const showGroupRow = viewMode !== 'Year';
  const today = startOfDay(new Date());

  const groupSegments = useMemo(
    () => buildGroupSegments(timeRange, viewMode),
    [timeRange, viewMode]
  );

  return (
    <div className="flex flex-col select-none" style={{ width: totalWidth }}>
      {/* ── 上段: グループ行 ── */}
      {showGroupRow && (
        <div className="flex border-b border-line" style={{ height: TIMELINE_GROUP_ROW_HEIGHT }}>
          {groupSegments.map((seg) => (
            <div
              key={`${seg.label}-${seg.startIndex}`}
              className="flex-shrink-0 flex items-center border-r border-line/80"
              style={{ width: seg.colSpan * cellWidth }}
            >
              <span
                className="bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 tracking-wide whitespace-nowrap"
                style={{ position: 'sticky', left: 0 }}
              >
                {seg.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 下段: 詳細行 ── */}
      <div
        className="flex"
        style={{ height: showGroupRow ? TIMELINE_DETAIL_ROW_HEIGHT : TIMELINE_HEADER_HEIGHT }}
      >
        {timeRange.map((date) => {
          const isWknd = !isWorkDay(date, calendar);
          const holiday = viewMode === 'Day' && isHoliday(date, calendar);
          const isToday = viewMode === 'Day' && isSameDay(date, today);

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
                'flex-shrink-0 border-r border-line text-[10px] flex flex-col items-center justify-center transition-colors',
                holiday
                  ? 'bg-amber-100/70 text-amber-700'
                  : viewMode === 'Day' && isWknd
                    ? 'bg-slate-100 text-slate-400'
                    : 'text-slate-600'
              )}
              style={{ width: cellWidth }}
              title={holiday ? `${format(date, 'yyyy-MM-dd')} (祝日)` : undefined}
            >
              <span
                className={clsx(
                  'leading-none',
                  isToday
                    ? 'flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 font-semibold text-white'
                    : 'font-medium'
                )}
              >
                {label}
              </span>
              {subLabel && (
                <span className="text-[8px] text-slate-400 mt-0.5 leading-none">{subLabel}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
