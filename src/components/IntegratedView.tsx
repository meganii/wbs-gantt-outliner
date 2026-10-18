import React, { useMemo, useLayoutEffect, useCallback, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  differenceInDays,
} from 'date-fns';
import { flattenTree, type FlattenedItem } from '../utils/tree';
import clsx from 'clsx';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskRow } from './TaskRow';
import { TaskTableHeader } from './TaskTableHeader';
import type { ColumnId, Task } from '../types';
import { COMPACT_COLUMNS } from '../utils/projectConfig';
import { GanttTimelineRow } from './GanttTimelineRow';
import { TimelineHeader, TIMELINE_HEADER_HEIGHT } from './TimelineHeader';
import { TimelineGridBackground } from './TimelineGridBackground';
import { GanttDependencyLines } from './GanttDependencyLines';
import { DraggedDependencyLines } from './DraggedDependencyLines';
import { DraggingDependencyLine } from './DraggingDependencyLine';
import { leftPaneDividerStyle } from '../utils/leftPaneDivider';

// Import custom hooks
import { useGanttTimeline, TimelineContext, useTimelineContext } from '../hooks/useGanttTimeline';
import { useGanttDrag } from '../hooks/useGanttDrag';
import { useRowSortSensors } from '../hooks/useRowSortSensors';
import { useStableFlattenedIds } from '../hooks/useStableFlattenedIds';

interface RowContainerProps {
  id: string;
  task: Task;
  content: React.ReactNode;
  setContainerRef: (node: HTMLDivElement | null) => void;
  containerStyle: React.CSSProperties;
  outlinerWidth: number;
  currentBgClass: string;
  isSelected: boolean;
  isHovered: boolean;
  taskBarRefs: React.RefObject<Map<string, HTMLDivElement>>;
  onHoverTaskChange: ((taskId: string | null) => void) | undefined;
}

const RowContainer = ({
  id,
  task,
  content,
  setContainerRef,
  containerStyle,
  outlinerWidth,
  currentBgClass,
  isSelected,
  isHovered,
  taskBarRefs,
  onHoverTaskChange,
}: RowContainerProps) => {
  const { timelineWidth, timelineMetrics } = useTimelineContext();

  return (
    <div
      ref={setContainerRef}
      style={{ ...containerStyle, width: outlinerWidth + timelineWidth }}
      className="flex h-8 relative z-auto border-b border-gray-100 select-none transition-colors duration-150 bg-transparent gantt-row-optimized"
      onMouseEnter={() => onHoverTaskChange?.(id)}
      onMouseLeave={() => onHoverTaskChange?.(null)}
    >
      <div
        className={clsx('sticky left-0 z-40 overflow-hidden border-r border-gray-300', currentBgClass)}
        style={{ width: outlinerWidth }}
      >
        {content}
      </div>

      <GanttTimelineRow
        taskId={id}
        task={task}
        timelineMetrics={timelineMetrics}
        taskBarRefs={taskBarRefs}
        timelineWidth={timelineWidth}
        isSelected={isSelected}
        isHovered={isHovered}
      />
    </div>
  );
};

interface IntegratedViewProps {
  outlinerWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  flattenedItems?: FlattenedItem[];
  hoveredTaskId?: string | null;
  onHoverTaskChange?: (taskId: string | null) => void;
}

const ROW_HEIGHT = 32;

export const IntegratedView = ({
  outlinerWidth,
  onResizeStart,
  flattenedItems: flattenedItemsProp,
  hoveredTaskId = null,
  onHoverTaskChange,
}: IntegratedViewProps) => {
  const reorderTask = useTaskStore((state) => state.reorderTask);
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  // flattenedItems を prop で受け取らない場合（テストや単体利用）はここで
  // ツリーを組むため、tasks / rootIds の変化を購読する。prop 利用時は App が
  // 同じ変化で再レンダーするため、二重の再レンダーにはならない。
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);

  const flattenedItems = useMemo(
    () => flattenedItemsProp ?? flattenTree(tasks, rootIds),
    [flattenedItemsProp, tasks, rootIds]
  );
  // SortableContext の items は参照比較で context を配るため、ID 列の内容が同じなら
  // 参照を据え置く（タスクを 1 つ編集しただけで全行が再レンダーされるのを防ぐ）。
  const flattenedIds = useStableFlattenedIds(flattenedItems);

  const anchorIdRef = useRef<string | null>(null);
  // セルは関数 props を無視してメモ化されるため、古い handleSelectionChange が
  // セルに残り続けても正しく動くよう、最新の表示順を ref で参照する。
  const flattenedIdsRef = useRef(flattenedIds);
  useEffect(() => {
    flattenedIdsRef.current = flattenedIds;
  }, [flattenedIds]);

  const taskBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Use custom timeline hook
  const {
    cellWidth,
    timeRange,
    timelineMetrics,
    viewMode,
    calendar,
  } = useGanttTimeline(flattenedItems);

  const storeVisibleColumns = useTaskStore((state) => state.projectConfig.integratedColumns);
  const setIntegratedColumns = useTaskStore((state) => state.setIntegratedColumns);

  const visibleColumns = useMemo((): ColumnId[] => {
    return storeVisibleColumns ?? COMPACT_COLUMNS;
  }, [storeVisibleColumns]);

  // Use custom drag interaction hook
  useGanttDrag(outlinerWidth, containerRef, cellWidth, timeRange, timelineMetrics);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

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
      // 左ペイン（タスク名列）の余白にタイムラインの罫線が覗いてしまう。
      if (gridRef.current) {
        gridRef.current.style.clipPath =
          container.scrollLeft > 0 ? `inset(0 0 0 ${container.scrollLeft}px)` : '';
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to today on mount or viewMode change
  const lastViewModeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (containerRef.current && timelineMetrics.pixelsPerDay) {
      if (lastViewModeRef.current !== viewMode) {
        const today = new Date();
        const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
        const timelineScrollLeft = diffDays * timelineMetrics.pixelsPerDay;
        const timelineViewportWidth = Math.max(0, containerRef.current.clientWidth - outlinerWidth);
        containerRef.current.scrollLeft = Math.max(0, timelineScrollLeft - timelineViewportWidth / 3);
        lastViewModeRef.current = viewMode;
      }
    }
  }, [viewMode, timelineMetrics.pixelsPerDay, timelineMetrics.timelineStart, outlinerWidth]);

  // サブツールバーの「今日」ボタン押下で今日の位置へスクロールする
  // （初回マウント時は viewMode 効果が担当するため、押下時のみ動かす）
  const todayFocusRequestId = useTaskStore((state) => state.todayFocusRequestId);
  const lastTodayFocusRef = useRef(todayFocusRequestId);
  useLayoutEffect(() => {
    if (lastTodayFocusRef.current === todayFocusRequestId) return;
    lastTodayFocusRef.current = todayFocusRequestId;

    const container = containerRef.current;
    if (!container || !timelineMetrics.pixelsPerDay) return;
    const today = new Date();
    const diffDays = differenceInDays(today, timelineMetrics.timelineStart);
    const timelineScrollLeft = diffDays * timelineMetrics.pixelsPerDay;
    const timelineViewportWidth = Math.max(0, container.clientWidth - outlinerWidth);
    container.scrollLeft = Math.max(0, timelineScrollLeft - timelineViewportWidth / 2);
  }, [todayFocusRequestId, timelineMetrics.pixelsPerDay, timelineMetrics.timelineStart, outlinerWidth]);

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
  }, [timelineMetrics.timelineStart, timelineMetrics.pixelsPerDay]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      reorderTask(active.id as string, over?.id as string);
    }
  };

  const sensors = useRowSortSensors();

  const handleSelectionChange = useCallback(
    (id: string, multi: boolean, range: boolean) => {
      const ids = flattenedIdsRef.current;
      const {
        focusedTaskId,
        selectedTaskIds: currentSelected,
        setSelectedTaskIds,
      } = useTaskStore.getState();

      if (range) {
        const targetAnchor =
          anchorIdRef.current ||
          focusedTaskId ||
          (currentSelected.length > 0 ? currentSelected[currentSelected.length - 1] : id);

        const startIdx = ids.indexOf(targetAnchor);
        const endIdx = ids.indexOf(id);

        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          setSelectedTaskIds(ids.slice(min, max + 1));
          return;
        }
      }

      anchorIdRef.current = id;

      if (multi) {
        if (currentSelected.includes(id)) {
          setSelectedTaskIds(currentSelected.filter((selectedId) => selectedId !== id));
        } else {
          setSelectedTaskIds([...currentSelected, id]);
        }
      } else {
        setSelectedTaskIds([id]);
      }
    },
    []
  );

  const timelineWidth = timeRange.length * cellWidth;
  // D6: value を useMemo 化しないと、IntegratedView がホバー等で再レンダーするたびに
  // 参照が変わり、context 経由で全行の RowContainer が再レンダーされる（memo では止まらない）。
  const timelineContextValue = useMemo(
    () => ({ timelineMetrics, timelineWidth }),
    [timelineMetrics, timelineWidth]
  );

  return (
    <div className="flex-1 bg-white text-gray-900 flex flex-col h-full min-h-0 min-w-0 select-none overflow-hidden relative">
      <div className="flex min-w-0">
        <div
          className="border-r border-gray-300 overflow-hidden flex-shrink-0 bg-gray-100"
          style={{ width: outlinerWidth }}
        >
          <TaskTableHeader
            visibleColumns={visibleColumns}
            menuColumns={storeVisibleColumns ?? COMPACT_COLUMNS}
            onColumnsChange={setIntegratedColumns}
            height={TIMELINE_HEADER_HEIGHT}
          />
        </div>
        <div className="flex-1 relative overflow-hidden bg-gray-100 border-b border-gray-300">
          <div ref={headerRef} className="overflow-hidden" style={{ height: TIMELINE_HEADER_HEIGHT }}>
            <TimelineHeader
              timeRange={timeRange}
              cellWidth={cellWidth}
              viewMode={viewMode}
              calendar={calendar}
            />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-auto min-h-0 min-w-0"
        style={leftPaneDividerStyle(outlinerWidth)}
      >
        {/* Shared Background Grid Layer */}
        <TimelineGridBackground
          ref={gridRef}
          timeRange={timeRange}
          cellWidth={cellWidth}
          calendar={calendar}
          viewMode={viewMode}
          totalHeight={flattenedItems.length * ROW_HEIGHT}
          timelineWidth={timelineWidth}
          pixelsPerDay={timelineMetrics.pixelsPerDay}
          leftOffset={outlinerWidth}
        />

        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            minHeight: flattenedItems.length * ROW_HEIGHT,
            width: timelineWidth,
            left: outlinerWidth,
          }}
        >
          <defs>
            <marker id="integrated-arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="currentColor" className="text-slate-400" />
            </marker>
          </defs>
          <GanttDependencyLines
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
            markerId="integrated-arrowhead"
          />
          <DraggedDependencyLines
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
            markerId="integrated-arrowhead"
          />
          <DraggingDependencyLine
            flattenedItems={flattenedItems}
            timelineMetrics={timelineMetrics}
          />
        </svg>

        <TimelineContext.Provider value={timelineContextValue}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={flattenedIds} strategy={verticalListSortingStrategy}>
              {flattenedItems.map(({ id, task, depth, wbsNumber }, index) => {
                const isHovered = hoveredTaskId === id;
                const isSelected = selectedTaskIds.includes(id);
                const currentBgClass = clsx(
                  isSelected && isHovered && 'bg-blue-100',
                  isSelected && !isHovered && 'bg-blue-50',
                  !isSelected && isHovered && 'bg-gray-100',
                  !isSelected && !isHovered && 'bg-white'
                );

                return (
                  <TaskRow
                    key={id}
                    taskId={id}
                    task={task}
                    depth={depth}
                    wbsNumber={wbsNumber}
                    prevId={flattenedItems[index - 1]?.id}
                    nextId={flattenedItems[index + 1]?.id}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    onHoverChange={onHoverTaskChange}
                    onSelectionChange={handleSelectionChange}
                    visibleColumns={visibleColumns}
                    disableHoverHandlers
                    suppressBorder
                    outlinerWidth={outlinerWidth}
                    renderContainer={({ content, setContainerRef, containerStyle }) => (
                      <RowContainer
                        id={id}
                        task={task}
                        content={content}
                        setContainerRef={setContainerRef}
                        containerStyle={containerStyle}
                        outlinerWidth={outlinerWidth}
                        currentBgClass={currentBgClass}
                        isSelected={isSelected}
                        isHovered={isHovered}
                        taskBarRefs={taskBarRefs}
                        onHoverTaskChange={onHoverTaskChange}
                      />
                    )}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </TimelineContext.Provider>
      </div>

      <div
        className="absolute top-0 bottom-0 w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors z-50"
        style={{ left: outlinerWidth }}
        onMouseDown={onResizeStart}
      />
    </div>
  );
};
