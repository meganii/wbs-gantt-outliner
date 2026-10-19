import { useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { FlattenedItem } from '../utils/tree';
import type { Task } from '../types';
import type { TimelineMetrics } from './useGanttTimeline';
import { differenceInDays } from 'date-fns';

export interface DependencyLine {
  key: string;
  d: string;
  fromId: string;
  toId: string;
}

const ROW_HEIGHT = 32;
const BOX_PADDING = 20;
const EMPTY_OVERRIDES: ReadonlyMap<string, TaskDates> = new Map();

interface TaskDates {
  start: Date | null;
  end: Date | null;
}

interface GeometryContext {
  tasks: Record<string, Task>;
  indexMap: Map<string, number>;
  timelineStart: Date;
  pixelsPerDay: number;
  overrides: ReadonlyMap<string, TaskDates>;
}

/**
 * タスクの描画用日付を返す（現在の日程 = 開始日 / 終了日）。
 * ドラッグ中のタスクは overrides の日付で上書きされる。
 */
function resolveTaskDates(
  id: string,
  task: Task,
  overrides: ReadonlyMap<string, TaskDates>
): TaskDates {
  const override = overrides.get(id);
  if (override) return override;

  return {
    start: task.startDate ? new Date(task.startDate) : null,
    end: task.endDate ? new Date(task.endDate) : null,
  };
}

function createGeometryContext(
  flattenedItems: FlattenedItem[],
  tasks: Record<string, Task>,
  timelineMetrics: TimelineMetrics,
  overrides: ReadonlyMap<string, TaskDates>
): GeometryContext | null {
  const { pixelsPerDay, timelineStart } = timelineMetrics;
  if (!pixelsPerDay || !timelineStart) return null;

  const indexMap = new Map<string, number>();
  flattenedItems.forEach((item, index) => {
    indexMap.set(item.id, index);
  });

  return { tasks, indexMap, timelineStart, pixelsPerDay, overrides };
}

/** 1 本の依存線（先行 fromId → 後続 toId）のパスを組み立てる。 */
function buildDependencyLine(fromId: string, toId: string, ctx: GeometryContext): DependencyLine | null {
  const sourceIndex = ctx.indexMap.get(fromId);
  const targetIndex = ctx.indexMap.get(toId);
  if (sourceIndex === undefined || targetIndex === undefined) return null;

  const sourceTask = ctx.tasks[fromId];
  const targetTask = ctx.tasks[toId];
  if (!sourceTask || !targetTask) return null;

  const sourceDates = resolveTaskDates(fromId, sourceTask, ctx.overrides);
  const targetDates = resolveTaskDates(toId, targetTask, ctx.overrides);
  if (!sourceDates.end || !targetDates.start) return null;

  const startX = (differenceInDays(sourceDates.end, ctx.timelineStart) + 1) * ctx.pixelsPerDay;
  const startY = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  const endX = differenceInDays(targetDates.start, ctx.timelineStart) * ctx.pixelsPerDay;
  const endY = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  let path: string;
  if (endX > startX + BOX_PADDING * 2) {
    const midX = startX + (endX - startX) / 2;
    path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
  } else {
    const verticalLaneY = endY > startY ? startY + ROW_HEIGHT / 2 : startY - ROW_HEIGHT / 2;
    path =
      `M ${startX} ${startY} L ${startX + BOX_PADDING} ${startY} L ${startX + BOX_PADDING} ${verticalLaneY} ` +
      `L ${endX - BOX_PADDING} ${verticalLaneY} L ${endX - BOX_PADDING} ${endY} L ${endX} ${endY}`;
  }

  return { key: `${fromId}::${toId}`, d: path, fromId, toId };
}

/** ドラッグ中にタスクのバーが移動するモードか（依存線の座標が変わるモード）。 */
function isMovingDragMode(mode: string | undefined): boolean {
  return mode === 'move' || mode === 'resize-left' || mode === 'resize-right';
}

/**
 * 静的な依存線。`dragState` の日付変化（mousemove）では再計算されず、
 * ドラッグの開始/終了（taskId の変化）でのみ再計算される。
 * ドラッグ中に移動するタスクに接続する線は `useDraggedDependencyLines` 側が描画する。
 */
export const useGanttDependencies = (
  flattenedItems: FlattenedItem[],
  timelineMetrics: TimelineMetrics
) => {
  const tasks = useTaskStore((state) => state.tasks);
  // 日付ではなく「どのタスクを動かしているか」だけを購読する（primitive）。
  const draggedTaskId = useTaskStore((state) => {
    const drag = state.dragState;
    if (!drag || !isMovingDragMode(drag.mode)) return null;
    return drag.taskId;
  });

  return useMemo(() => {
    const ctx = createGeometryContext(flattenedItems, tasks, timelineMetrics, EMPTY_OVERRIDES);
    if (!ctx) return [] as DependencyLine[];

    const lines: DependencyLine[] = [];
    for (const { id, task } of flattenedItems) {
      if (!task.dependencies || task.dependencies.length === 0) continue;
      if (id === draggedTaskId) continue;

      for (const depId of task.dependencies) {
        if (depId === draggedTaskId) continue;
        const line = buildDependencyLine(depId, id, ctx);
        if (line) lines.push(line);
      }
    }
    return lines;
  }, [flattenedItems, tasks, timelineMetrics, draggedTaskId]);
};

/**
 * ドラッグ中に移動しているタスクに接続する依存線のみを描画する。
 * 対象は「そのタスク自身の依存線」と「そのタスクに依存しているタスクの依存線」だけで、
 * 全依存線（1,000 行で数百本）を毎 mousemove 再計算・再レンダーしない。
 */
export const useDraggedDependencyLines = (
  flattenedItems: FlattenedItem[],
  timelineMetrics: TimelineMetrics
) => {
  const tasks = useTaskStore((state) => state.tasks);
  const dragState = useTaskStore((state) => state.dragState);

  return useMemo(() => {
    if (!dragState || !isMovingDragMode(dragState.mode)) return [] as DependencyLine[];

    const draggedId = dragState.taskId;
    const overrides = new Map<string, TaskDates>([
      [draggedId, { start: dragState.currentStartDate, end: dragState.currentEndDate }],
    ]);
    const ctx = createGeometryContext(flattenedItems, tasks, timelineMetrics, overrides);
    if (!ctx) return [] as DependencyLine[];

    const lines: DependencyLine[] = [];

    // dragged が後続（target）の線: 自身の dependencies から
    const draggedTask = tasks[draggedId];
    if (draggedTask) {
      for (const depId of draggedTask.dependencies) {
        const line = buildDependencyLine(depId, draggedId, ctx);
        if (line) lines.push(line);
      }
    }

    // dragged が先行（source）の線: 自身に依存しているタスクから
    for (const { id, task } of flattenedItems) {
      if (id === draggedId) continue;
      if (task.dependencies.includes(draggedId)) {
        const line = buildDependencyLine(draggedId, id, ctx);
        if (line) lines.push(line);
      }
    }

    return lines;
  }, [flattenedItems, tasks, timelineMetrics, dragState]);
};
