import React, { memo } from 'react';
import { addDays, differenceInDays } from 'date-fns';
import clsx from 'clsx';
import type { Task } from '../types';
import { useTaskStore } from '../store/useTaskStore';
import { useHoverTooltip } from './HoverTooltip';

export interface GanttTimelineRowProps {
  taskId: string;
  task: Task;
  timelineMetrics: {
    timelineStart: Date;
    pixelsPerDay: number;
    totalDays: number;
  };
  taskBarRefs: React.RefObject<Map<string, HTMLDivElement>>;
  timelineWidth: number;
  /** 選択中の行かどうか（タイムライン側にもハイライト帯を敷く）。 */
  isSelected?: boolean;
  /** ホバー中の行かどうか。 */
  isHovered?: boolean;
}

/** バーの日付（現在の日程 = 開始日 / 終了日）。 */
function resolveBarDates(task: Task): { start: string | null; end: string | null } {
  return {
    start: task.startDate ?? null,
    end: task.endDate ?? null,
  };
}

/**
 * ガントの 1 行。操作対象のバーは 1 本だけ（現在の日程）とし、
 * 進捗を塗りで表現する。基準計画は現在のバーの下に薄いグレーバー
 * （非操作・`pointer-events: none`）として重ねる。
 */
export const GanttTimelineRow = memo(({
  taskId,
  task,
  timelineMetrics,
  taskBarRefs,
  timelineWidth,
  isSelected = false,
  isHovered = false,
}: GanttTimelineRowProps) => {
  const isParent = task.children.length > 0;

  // Selective, fine-grained Zustand subscriptions
  const isDragging = useTaskStore((state) => state.dragState?.taskId === taskId);
  const dragMode = useTaskStore((state) => state.dragState?.taskId === taskId ? state.dragState.mode : null);
  const dragCurrentStartDate = useTaskStore((state) => state.dragState?.taskId === taskId ? state.dragState.currentStartDate : null);
  const dragCurrentEndDate = useTaskStore((state) => state.dragState?.taskId === taskId ? state.dragState.currentEndDate : null);
  const showBaseline = useTaskStore((state) => state.projectConfig.showBaseline ?? true);
  const setDragState = useTaskStore((state) => state.setDragState);

  const { start: barStartStr, end: barEndStr } = resolveBarDates(task);
  const hasBar = !!(barStartStr && barEndStr);
  const progress = Math.max(0, Math.min(100, task.progress || 0));
  // 完了（塗りが 100% まで到達）は色でも分かるようにする。
  // WBS のステータス列（TaskStatusCell）が「完了 = 緑」なので、色の意味を合わせる。
  const isCompleted = progress >= 100;
  const isDraggingBar = isDragging && dragMode !== 'dependency' && dragMode !== 'draw-range';

  const barTooltip = useHoverTooltip<HTMLDivElement>({
    content:
      barStartStr && barEndStr ? (
        <div className="space-y-0.5">
          <div className="max-w-[300px] break-words font-medium">{task.title}</div>
          <div>開始日: {barStartStr}</div>
          <div>終了日: {barEndStr}</div>
          <div>期間: {task.duration}日</div>
          <div>
            進捗 {progress}%{isCompleted ? '（完了）' : ''}
          </div>
          {showBaseline && task.baselineStartDate && task.baselineEndDate ? (
            <div>
              基準: {task.baselineStartDate} - {task.baselineEndDate}
            </div>
          ) : null}
        </div>
      ) : null,
    enabled: hasBar && !isDraggingBar,
  });

  return (
    <div
      data-task-id={taskId}
      className={clsx(
        "relative flex pointer-events-auto h-full",
        isParent ? "cursor-default" : "cursor-crosshair"
      )}
      style={{ width: timelineWidth }}
      onMouseDown={(e) => {
        if (e.button !== 0 || isParent) {
          return;
        }

        // バーやハンドル上の操作は draw-range の対象外。
        // （バー側でも stopPropagation しているが、取りこぼしに備えて要素でも判定する）
        const target = e.target as Element | null;
        if (target?.closest?.('[data-gantt-bar]')) {
          return;
        }
        if (timelineMetrics.pixelsPerDay <= 0) {
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const daysOffset = Math.floor(x / timelineMetrics.pixelsPerDay);
        const clickedDate = addDays(timelineMetrics.timelineStart, daysOffset);

        setDragState({
          taskId,
          mode: 'draw-range',
          startX: e.clientX,
          startY: e.clientY,
          timelineLeft: rect.left,
          initialStartDate: clickedDate,
          initialEndDate: clickedDate,
          currentStartDate: clickedDate,
          currentEndDate: clickedDate,
        });
      }}
    >
      {/* 選択行 / ホバー行のハイライト帯 */}
      {(isSelected || isHovered) && (
        <div
          aria-hidden="true"
          className={clsx(
            'absolute inset-0 pointer-events-none',
            isSelected ? 'bg-brand-500/[0.08]' : 'bg-slate-500/[0.04]'
          )}
        />
      )}

      {/* 範囲ドラッグ（draw-range）のプレビュー */}
      {isDragging && dragMode === 'draw-range' && (() => {
        const start = dragCurrentStartDate! < dragCurrentEndDate! ? dragCurrentStartDate! : dragCurrentEndDate!;
        const end = dragCurrentStartDate! < dragCurrentEndDate! ? dragCurrentEndDate! : dragCurrentStartDate!;
        const diffDays = differenceInDays(start, timelineMetrics.timelineStart);
        const offset = diffDays * timelineMetrics.pixelsPerDay;
        const daySpan = differenceInDays(end, start) + 1;
        const width = daySpan * timelineMetrics.pixelsPerDay;

        return (
          <div
            className="absolute top-1.5 h-5 border-2 border-dashed border-blue-500 bg-blue-100/30 z-30 pointer-events-none"
            style={{ left: offset, width: Math.max(0, width - 2) }}
          />
        );
      })()}

      {hasBar && (() => {
        const { timelineStart, pixelsPerDay } = timelineMetrics;

        const barStart = isDraggingBar ? dragCurrentStartDate : new Date(barStartStr!);
        const barEnd = isDraggingBar ? dragCurrentEndDate : new Date(barEndStr!);
        const barDiffDays = differenceInDays(barStart!, timelineStart);
        const barOffset = barDiffDays * pixelsPerDay;
        const barDaySpan = differenceInDays(barEnd!, barStart!) + 1;
        const barWidth = barDaySpan * pixelsPerDay;

        // 基準計画バー（非操作のゴースト、予定バーの下）
        const hasBaseline = showBaseline && !!(task.baselineStartDate && task.baselineEndDate);
        let baselineOffset = 0;
        let baselineWidth = 0;
        if (hasBaseline) {
          const bStart = new Date(task.baselineStartDate!);
          const bEnd = new Date(task.baselineEndDate!);
          baselineOffset = differenceInDays(bStart, timelineStart) * pixelsPerDay;
          baselineWidth = (differenceInDays(bEnd, bStart) + 1) * pixelsPerDay;
        }

        const startDrag = (mode: 'move' | 'resize-left' | 'resize-right' | 'dependency') => (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          setDragState({
            taskId,
            mode,
            startX: e.clientX,
            startY: e.clientY,
            initialStartDate: new Date(barStartStr!),
            initialEndDate: new Date(barEndStr!),
            currentStartDate: new Date(barStartStr!),
            currentEndDate: new Date(barEndStr!),
          });
        };

        return (
          <>
            {/* 基準計画バー（現在のバーの下に数 px ずらした薄いグレー） */}
            {hasBaseline && baselineWidth > 0 && (
              <div
                aria-hidden="true"
                className={clsx(
                  'absolute pointer-events-none bg-slate-300/80 border border-slate-400/60 rounded-sm z-10',
                  isParent ? 'top-[20px] h-[4px]' : 'top-[19px] h-[5px]'
                )}
                style={{ left: baselineOffset, width: Math.max(0, baselineWidth - 2) }}
                title={`基準計画: ${task.title} (${task.baselineStartDate} - ${task.baselineEndDate})`}
              />
            )}

            {/* 現在の日程バー（唯一の操作対象。進捗を左端から塗る） */}
            {barWidth > 0 && (
              <div
                ref={(el) => {
                  barTooltip.anchorRef.current = el;
                  if (el) {
                    taskBarRefs.current?.set(taskId, el);
                  } else {
                    taskBarRefs.current?.delete(taskId);
                  }
                }}
                {...barTooltip.triggerProps}
                data-task-id={taskId}
                data-gantt-bar="schedule"
                className={clsx(
                  "absolute flex items-center shadow-sm group z-20 transition-[background-color,color,box-shadow] duration-150",
                  isParent
                    ? clsx(
                        "top-[4px] h-2.5 cursor-default rounded-full border",
                        isCompleted
                          ? "bg-green-200/70 border-green-500/60"
                          : "bg-slate-300/80 border-slate-500/50"
                      )
                    : [
                        "top-[3px] h-3.5 rounded-md border select-none cursor-pointer",
                        isCompleted
                          ? "border-green-400 bg-green-100 hover:border-green-500"
                          : "border-brand-300 bg-brand-100 hover:border-brand-400",
                        isDraggingBar && "cursor-grabbing border-brand-500 shadow-md"
                      ]
                )}
                style={{ left: barOffset, width: Math.max(0, barWidth - 2) }}
                onMouseDown={(e) => {
                  // バー上のクリック/ドラッグを行の draw-range に伝播させない。
                  e.stopPropagation();
                  if (e.button !== 0 || isParent) return;
                  startDrag('move')(e);
                }}
              >
                {/* 進捗の塗り（実績期間 ÷ 予定期間）。完了時は緑で塗り切る */}
                {progress > 0 && (
                  <div
                    aria-hidden="true"
                    className={clsx(
                      'absolute inset-y-0 left-0 pointer-events-none',
                      isCompleted
                        ? (isParent ? 'bg-green-500/80 rounded-full' : 'bg-green-600 rounded-[5px]')
                        : (isParent ? 'bg-slate-500/70 rounded-l-full' : 'bg-brand-600 rounded-l-[5px]')
                    )}
                    style={{ width: `${progress}%` }}
                  />
                )}

                {/* 親タスクの下向きブラケット */}
                {isParent && (
                  <>
                    <div className="absolute left-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-500/70 border-r-[4px] border-r-transparent border-l-[4px] border-l-transparent" />
                    <div className="absolute right-0 bottom-[-4px] w-0 h-0 border-t-[4px] border-t-slate-500/70 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent" />
                  </>
                )}

                {/* 左端リサイズハンドル */}
                {!isParent && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-10"
                    onMouseDown={startDrag('resize-left')}
                  />
                )}

                {/* 右端リサイズハンドル */}
                {!isParent && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-10"
                    onMouseDown={startDrag('resize-right')}
                  />
                )}

                {/* 依存線の作成ハンドル。ハンドル上ではバー情報ではなく操作説明（title）を優先する。 */}
                {!isParent && (
                  <div
                    className="absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-crosshair opacity-0 hover:scale-125 transition-all z-50 shadow-sm flex items-center justify-center group-hover:opacity-100"
                    title="Drag to create dependency"
                    onPointerEnter={barTooltip.triggerProps.onPointerLeave}
                    onMouseDown={startDrag('dependency')}
                  >
                    <span className="text-blue-500 text-[10px] font-bold">+</span>
                  </div>
                )}

                {/* タイトル（塗りの上でも読めるよう白フチを付ける） */}
                {!isParent && (
                  <span
                    className={clsx(
                      'relative z-[5] px-1.5 truncate pointer-events-none text-[9px] font-medium',
                      isCompleted ? 'text-green-900' : 'text-blue-900'
                    )}
                    style={{ textShadow: '0 0 2px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.7)' }}
                  >
                    {task.title}
                  </span>
                )}
              </div>
            )}
          </>
        );
      })()}
      {barTooltip.tooltip}
    </div>
  );
}, (prevProps, nextProps) => {
  const keys = Object.keys(prevProps) as Array<keyof GanttTimelineRowProps>;
  for (const key of keys) {
    if (typeof prevProps[key] === 'function') {
      continue;
    }
    if (key === 'timelineMetrics') {
      const prevMetrics = prevProps.timelineMetrics;
      const nextMetrics = nextProps.timelineMetrics;
      if (
        prevMetrics.timelineStart.getTime() !== nextMetrics.timelineStart.getTime() ||
        prevMetrics.pixelsPerDay !== nextMetrics.pixelsPerDay ||
        prevMetrics.totalDays !== nextMetrics.totalDays
      ) {
        return false;
      }
      continue;
    }
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }
  return true;
});

GanttTimelineRow.displayName = 'GanttTimelineRow';
