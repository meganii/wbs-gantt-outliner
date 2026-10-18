import React, { useMemo, useLayoutEffect, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  differenceInDays,
} from 'date-fns';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import clsx from 'clsx';
import { TaskRow } from './TaskRow';
import type { ColumnId } from '../types';
import { GanttTimelineRow } from './GanttTimelineRow';
import { TimelineHeader, TIMELINE_HEADER_HEIGHT } from './TimelineHeader';
import { TimelineGridBackground } from './TimelineGridBackground';
import { GanttDependencyLines } from './GanttDependencyLines';
import { DraggedDependencyLines } from './DraggedDependencyLines';
import { DraggingDependencyLine } from './DraggingDependencyLine';
import { leftPaneDividerStyle } from '../utils/leftPaneDivider';

// Import custom hooks
import { useGanttTimeline, TimelineContext } from '../hooks/useGanttTimeline';
import { useGanttDrag } from '../hooks/useGanttDrag';

interface GanttChartProps {
  showNames?: boolean;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

export const GanttChart = ({
  showNames = false,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
  scrollRef,
  onScroll
}: GanttChartProps) => {
  const selectedTaskIds = useTaskStore(state => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore(state => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore(state => state.focusedTaskId);
  const setFocusedTaskId = useTaskStore(state => state.setFocusedTaskId);
  const setCollapsed = useTaskStore(state => state.setCollapsed);
  const columnWidths = useTaskStore(state => state.projectConfig.columnWidths);
  const setColumnWidth = useTaskStore(state => state.setColumnWidth);
  // flattenedItems を prop で受け取らない場合（テストや単体利用）に追随できるよう
  // tasks / rootIds を購読する（Outliner / IntegratedView と同様）。
  const tasks = useTaskStore(state => state.tasks);
  const rootIds = useTaskStore(state => state.rootIds);

  const visibleColumns = useMemo((): ColumnId[] => ['taskName', 'status', 'progress'], []);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );
  // セルは関数 props を無視してメモ化されるため、古い handleSelectionChange が
  // セルに残っても正しく動くよう、最新の表示順を ref で参照する。
  const flattenedItemsRef = useRef(flattenedItems);
  useEffect(() => {
    flattenedItemsRef.current = flattenedItems;
  }, [flattenedItems]);

  // 範囲選択の起点。Outliner / IntegratedView と同様に ref で保持し、
  // Shift+矢印を繰り返しても範囲が伸び縮みせず起点から広がるようにする
  // （直前の選択の末尾を起点にすると、2 回目以降で範囲が後ろにずれる）。
  const anchorIdRef = useRef<string | null>(null);

  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // ガント表示の左列はタスク名に加えてステータス・進捗も表示する
  // （統合表示と情報量を揃え、スケジュールと状態を同時に把握できるようにする）。
  const NAME_COLUMN_WIDTH =
    columnWidths.taskName + columnWidths.status + columnWidths.progress;
  const nameOffset = showNames ? NAME_COLUMN_WIDTH : 0;

  // Use custom timeline hook
  const {
    cellWidth: CELL_WIDTH,
    timeRange,
    timelineMetrics,
    viewMode,
    calendar,
  } = useGanttTimeline(flattenedItems);

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef || internalContainerRef;
  const headerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Use custom drag interaction hook
  useGanttDrag(nameOffset, containerRef, CELL_WIDTH, timeRange, timelineMetrics);

  const handleSelectionChange = (id: string, multi: boolean, range: boolean) => {
    const flattenedIds = flattenedItemsRef.current.map(item => item.id);
    const {
      focusedTaskId,
      selectedTaskIds: currentSelected,
      setSelectedTaskIds,
      setFocusedTaskId,
    } = useTaskStore.getState();

    if (range) {
      // 起点（無ければ現在フォーカス中の行 / 直近の選択末尾）から id まで
      const targetAnchor =
        anchorIdRef.current ||
        focusedTaskId ||
        (currentSelected.length > 0 ? currentSelected[currentSelected.length - 1] : id);
      const startIdx = flattenedIds.indexOf(targetAnchor);
      const endIdx = flattenedIds.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        setSelectedTaskIds(flattenedIds.slice(min, max + 1));
        setFocusedTaskId(id);
        return;
      }
    }

    // 範囲選択以外は起点を更新する
    anchorIdRef.current = id;

    if (multi) {
      if (currentSelected.includes(id)) {
        setSelectedTaskIds(currentSelected.filter(sid => sid !== id));
      } else {
        setSelectedTaskIds([...currentSelected, id]);
      }
    } else {
      setSelectedTaskIds([id]);
    }
    setFocusedTaskId(id);
  };

  // Sync header horizontal scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.scrollLeft = container.scrollLeft;
      }
      // 左のタスク名カラム（sticky で画面左端に固定）は、行が
      // `content-visibility: auto`（paint containment）でスタッキング
      // コンテキストになるため z-index では依存線より前面にできない。
      // 横スクロールで名前カラムの下に潜り込んだ分だけ依存線を切り落とす。
      if (svgRef.current) {
        svgRef.current.style.clipPath =
          container.scrollLeft > 0 ? `inset(0 0 0 ${container.scrollLeft}px)` : '';
      }
      // 日付グリッド背景も同じ量だけ切り落とす。切らないと、行より下の
      // 左列（タスク名/ステータス/進捗）の余白にタイムラインの罫線が覗く。
      if (gridRef.current) {
        gridRef.current.style.clipPath =
          container.scrollLeft > 0 ? `inset(0 0 0 ${container.scrollLeft}px)` : '';
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);

  // Scroll to today on mount or viewMode change
  const lastViewModeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (containerRef.current && timelineMetrics.pixelsPerDay) {
      if (lastViewModeRef.current !== viewMode) {
        const today = new Date();
        const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
        const scrollPos = diffDays * timelineMetrics.pixelsPerDay;
        const containerWidth = containerRef.current.clientWidth;
        const timelineViewportWidth = Math.max(0, containerWidth - nameOffset);
        containerRef.current.scrollLeft = Math.max(0, scrollPos - timelineViewportWidth / 3);
        lastViewModeRef.current = viewMode;
      }
    }
  }, [containerRef, viewMode, timelineMetrics.pixelsPerDay, timelineMetrics.timelineStart, nameOffset]);

  // サブツールバーの「今日」ボタン押下で今日の位置へスクロールする
  const todayFocusRequestId = useTaskStore((state) => state.todayFocusRequestId);
  const lastTodayFocusRef = useRef(todayFocusRequestId);
  useLayoutEffect(() => {
    if (lastTodayFocusRef.current === todayFocusRequestId) return;
    lastTodayFocusRef.current = todayFocusRequestId;

    const container = containerRef.current;
    if (!container || !timelineMetrics.pixelsPerDay) return;
    const today = new Date();
    const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
    const scrollPos = diffDays * timelineMetrics.pixelsPerDay;
    const timelineViewportWidth = Math.max(0, container.clientWidth - nameOffset);
    container.scrollLeft = Math.max(0, scrollPos - timelineViewportWidth / 2);
  }, [containerRef, todayFocusRequestId, timelineMetrics.pixelsPerDay, timelineMetrics.timelineStart, nameOffset]);

  // Scroll Anchoring: カレンダー自動拡張・縮小時に表示日付位置を維持する
  const lastTimelineStartRef = useRef<Date | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !timelineMetrics.pixelsPerDay) return;

    const oldStart = lastTimelineStartRef.current;
    const newStart = timelineMetrics.timelineStart;

    if (oldStart && oldStart.getTime() !== newStart.getTime()) {
      const diffDays = differenceInDays(newStart, oldStart);
      if (diffDays !== 0) {
        const shiftPixels = -diffDays * timelineMetrics.pixelsPerDay;
        container.scrollLeft += shiftPixels;
      }
    }
    lastTimelineStartRef.current = newStart;
  }, [containerRef, timelineMetrics.timelineStart, timelineMetrics.pixelsPerDay]);

  // Keyboard Shortcut: Alt + ArrowUp / ArrowDown to Collapse/Expand, and Up/Down to Navigate Rows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      const isAltUp = !e.shiftKey && e.altKey && !e.metaKey && e.key === 'ArrowUp';
      const isAltDown = !e.shiftKey && e.altKey && !e.metaKey && e.key === 'ArrowDown';

      if (isAltUp || isAltDown) {
        const targetIds = selectedTaskIds.length > 0 
          ? selectedTaskIds 
          : (hoveredTaskId ? [hoveredTaskId] : []);
        
        if (targetIds.length > 0) {
          e.preventDefault();
          setCollapsed(targetIds, isAltUp);
        }
        return;
      }

      const isUp = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp';
      const isDown = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown';
      const isShiftUp = e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp';
      const isShiftDown = e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown';

      if (isUp || isDown || isShiftUp || isShiftDown) {
        const activeId = focusedTaskId || (selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : null);
        if (!activeId) return;

        const currentIndex = flattenedItems.findIndex(item => item.id === activeId);
        if (currentIndex === -1) return;

        let targetIndex = -1;
        if (isUp || isShiftUp) {
          if (currentIndex > 0) {
            targetIndex = currentIndex - 1;
          }
        } else if (isDown || isShiftDown) {
          if (currentIndex < flattenedItems.length - 1) {
            targetIndex = currentIndex + 1;
          }
        }

        if (targetIndex !== -1) {
          e.preventDefault();
          const targetId = flattenedItems[targetIndex].id;

          if (isShiftUp || isShiftDown) {
            const anchorId = selectedTaskIds.length > 0 ? selectedTaskIds[0] : activeId;
            const startIdx = flattenedItems.findIndex(item => item.id === anchorId);
            const endIdx = targetIndex;
            if (startIdx !== -1 && endIdx !== -1) {
              const min = Math.min(startIdx, endIdx);
              const max = Math.max(startIdx, endIdx);
              setSelectedTaskIds(flattenedItems.slice(min, max + 1).map(item => item.id));
            }
          } else {
            setSelectedTaskIds([targetId]);
          }
          setFocusedTaskId(targetId);

          const container = containerRef.current;
          if (container) {
            const rowHeight = 32;
            const targetTop = targetIndex * rowHeight;
            const containerHeight = container.clientHeight;
            const currentScrollTop = container.scrollTop;

            if (targetTop < currentScrollTop) {
              container.scrollTop = targetTop;
            } else if (targetTop + rowHeight > currentScrollTop + containerHeight) {
              container.scrollTop = targetTop + rowHeight - containerHeight;
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, selectedTaskIds, hoveredTaskId, focusedTaskId, flattenedItems, setCollapsed, setSelectedTaskIds, setFocusedTaskId]);

  // D6: context value を useMemo 化しないと、ホバー等で GanttChart が再レンダーするたびに
  // 参照が変わり、context 経由で全行が再レンダーされる（memo では止まらない）。
  const timelineContextValue = useMemo(
    () => ({ timelineMetrics, timelineWidth: timeRange.length * CELL_WIDTH }),
    [timelineMetrics, timeRange.length, CELL_WIDTH]
  );

  return (
    <div className="flex-1 bg-white text-gray-900 flex flex-col h-full min-h-0 min-w-0 select-none overflow-hidden relative">
      {/* Timeline Header */}
      <div
        className="flex sticky top-0 bg-gray-100 z-10 border-b border-gray-300 overflow-hidden"
        style={{ height: TIMELINE_HEADER_HEIGHT }}
        ref={headerRef}
      >
        {showNames && (
          <div
            className="flex-shrink-0 sticky left-0 z-40 bg-slate-50 border-r border-line-strong flex items-stretch text-[11px] font-semibold text-slate-500 relative group"
            style={{ width: NAME_COLUMN_WIDTH }}
          >
            <div
              className="flex items-center pl-4 pr-2"
              style={{ width: columnWidths.taskName }}
            >
              タスク名
            </div>
            <div
              className="flex items-center justify-center border-l border-line"
              style={{ width: columnWidths.status }}
            >
              ステータス
            </div>
            <div
              className="flex items-center justify-center border-l border-line"
              style={{ width: columnWidths.progress }}
            >
              進捗率
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-brand-400 opacity-0 hover:opacity-100 z-50 group-hover:opacity-50"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = columnWidths.taskName;

                const onMouseMove = (moveEvent: MouseEvent) => {
                  const delta = moveEvent.clientX - startX;
                  setColumnWidth('taskName', Math.max(50, startWidth + delta));
                };

                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  document.body.style.cursor = 'default';
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                document.body.style.cursor = 'col-resize';
              }}
            />
          </div>
        )}
        <TimelineHeader
          timeRange={timeRange}
          cellWidth={CELL_WIDTH}
          viewMode={viewMode}
          calendar={calendar}
        />
      </div>

      {/* Gantt Rows */}
      <div
        className="flex-1 relative overflow-auto min-h-0 min-w-0"
        ref={containerRef}
        style={leftPaneDividerStyle(nameOffset)}
        onScroll={(e) => {
          if (onScroll) onScroll(e);
        }}
      >
        {/* Shared Background Grid Layer */}
        <TimelineGridBackground
          ref={gridRef}
          timeRange={timeRange}
          cellWidth={CELL_WIDTH}
          calendar={calendar}
          viewMode={viewMode}
          totalHeight={flattenedItems.length * 32}
          timelineWidth={timeRange.length * CELL_WIDTH}
          pixelsPerDay={timelineMetrics.pixelsPerDay}
          leftOffset={nameOffset}
        />

        {/* SVG Layer for Dependencies - Z-10 */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            minHeight: flattenedItems.length * 32,
            width: timeRange.length * CELL_WIDTH,
            left: nameOffset
          }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="currentColor" className="text-slate-400" />
            </marker>
          </defs>
          {/* Existing Dependencies */}
          <GanttDependencyLines
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
            markerId="arrowhead"
          />

          {/* Existing Dependencies of the Task Being Dragged (moves with the bar) */}
          <DraggedDependencyLines
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
            markerId="arrowhead"
          />

          {/* Dragging Line */}
          <DraggingDependencyLine
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
          />
        </svg>

        <TimelineContext.Provider value={timelineContextValue}>
          {flattenedItems.map(({ id, task, depth, wbsNumber }, index) => {
            const isHovered = hoveredTaskId === id;
          const isSelected = selectedTaskIds.includes(id);

          return (
            <div
              key={id}
              className="flex border-b border-gray-100 h-8 relative z-auto transition-colors duration-150 bg-transparent gantt-row-optimized"
              style={{ width: nameOffset + timeRange.length * CELL_WIDTH }}
              onMouseEnter={() => onHoverTaskChange?.(id)}
              onMouseLeave={() => onHoverTaskChange?.(null)}
            >
              {showNames && (
                <div
                  onMouseDown={(e) => {
                    if (e.button !== 0) return; // Only left click

                    const target = e.target as HTMLElement;
                    if (target.closest('button')) {
                      return;
                    }

                    const isMulti = e.ctrlKey || e.metaKey;
                    const isRange = e.shiftKey;

                    if (target.tagName === 'INPUT') {
                      const isReadOnly = target.hasAttribute('readonly');
                      if (isMulti || isRange || isReadOnly) {
                        e.preventDefault();
                      }
                    }

                    handleSelectionChange(id, isMulti, isRange);
                  }}
                  className={clsx(
                    "flex-shrink-0 border-r border-gray-300 h-full sticky left-0 z-40 flex items-center text-xs truncate transition-colors duration-150 select-none cursor-pointer",
                    isSelected && isHovered && "bg-blue-100",
                    isSelected && !isHovered && "bg-blue-50",
                    !isSelected && isHovered && "bg-gray-100",
                    !isSelected && !isHovered && "bg-white"
                  )}
                  style={{ 
                    width: NAME_COLUMN_WIDTH,
                  }}
                >
                  <TaskRow
                    taskId={id}
                    task={task}
                    depth={depth}
                    wbsNumber={wbsNumber}
                    prevId={flattenedItems[index - 1]?.id}
                    nextId={flattenedItems[index + 1]?.id}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onSelectionChange={handleSelectionChange}
                    visibleColumns={visibleColumns}
                    disableHoverHandlers
                    suppressBorder
                  />
                </div>
              )}
                {/* Bars Area */}
                <GanttTimelineRow
                  taskId={id}
                  task={task}
                  timelineMetrics={timelineMetrics}
                  taskBarRefs={taskBarRefs}
                  timelineWidth={timeRange.length * CELL_WIDTH}
                  isSelected={isSelected}
                  isHovered={isHovered}
                />
              </div>
            );
          })}
        </TimelineContext.Provider>
      </div>
    </div>
  );
};
