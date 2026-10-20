import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { getWorkDaysCount } from '../utils/date';
import type { TimelineMetrics } from './useGanttTimeline';

export const useGanttDrag = (
  leftOffset: number,
  containerRef: React.RefObject<HTMLDivElement | null>,
  _cellWidth: number,
  _timeRange: Date[],
  timelineMetrics: TimelineMetrics
) => {
  const calendar = useTaskStore((state) => state.projectConfig.calendar);
  const viewMode = useTaskStore((state) => state.projectConfig.viewMode);
  const setDragState = useTaskStore((state) => state.setDragState);
  const setMousePos = useTaskStore((state) => state.setMousePos);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = useTaskStore.getState();
      const currentDragState = state.dragState;
      if (!currentDragState) return;

      if (currentDragState.mode === 'dependency') {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          state.setMousePos({
            x: e.clientX - rect.left + containerRef.current.scrollLeft - leftOffset,
            y: e.clientY - rect.top + containerRef.current.scrollTop,
          });
        }
        return;
      }

      const deltaX = e.clientX - currentDragState.startX;
      const pixelsPerDay = timelineMetrics.pixelsPerDay;
      const deltaDays = pixelsPerDay > 0 ? Math.round(deltaX / pixelsPerDay) : 0;

      const newDragState = { ...currentDragState };

      if (currentDragState.mode === 'move') {
        newDragState.currentStartDate = addDays(currentDragState.initialStartDate, deltaDays);
        newDragState.currentEndDate = addDays(currentDragState.initialEndDate, deltaDays);
        newDragState.deltaDays = deltaDays;
      } else if (currentDragState.mode === 'resize-left') {
        const newStart = addDays(currentDragState.initialStartDate, deltaDays);
        if (newStart <= currentDragState.initialEndDate) {
          newDragState.currentStartDate = newStart;
        }
      } else if (currentDragState.mode === 'resize-right') {
        const newEnd = addDays(currentDragState.initialEndDate, deltaDays);
        if (newEnd >= currentDragState.initialStartDate) {
          newDragState.currentEndDate = newEnd;
        }
      } else if (currentDragState.mode === 'draw-range') {
        // 終点も「カーソル下の日セル」で決める（起点と同じ基準）。
        // これにより、ドラッグ中のハイライトと確定結果が一致する。
        const { timelineLeft } = currentDragState;
        if (pixelsPerDay > 0 && typeof timelineLeft === 'number') {
          const daysOffset = Math.floor((e.clientX - timelineLeft) / pixelsPerDay);
          newDragState.currentEndDate = addDays(timelineMetrics.timelineStart, daysOffset);
        } else {
          newDragState.currentEndDate = addDays(currentDragState.initialStartDate, deltaDays);
        }
      }

      state.setDragState(newDragState);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = useTaskStore.getState();
      const currentDragState = state.dragState;
      if (!currentDragState) return;

      if (currentDragState.mode === 'dependency') {
        let target = e.target as HTMLElement;
        while (target && !target.getAttribute?.('data-task-id')) {
          target = target.parentElement as HTMLElement;
        }
        if (target) {
          const targetId = target.getAttribute('data-task-id');
          if (targetId && targetId !== currentDragState.taskId) {
            const targetTask = state.tasks[targetId];
            if (targetTask && targetTask.children.length === 0) {
              state.addDependency(currentDragState.taskId, targetId);
            }
          }
        }
        state.setDragState(null);
        state.setMousePos(null);
      } else if (currentDragState.mode === 'draw-range') {
        const { taskId, currentStartDate, currentEndDate } = currentDragState;

        // 移動のない単クリックでも確定する（クリックした日 1 日分の予定を設定）。
        // 開始・終了はどちらもクリックした日で初期化されているため、
        // 単クリックでは 1 日予定、ドラッグでは範囲予定になる。
        // 予定バー上のクリックは行の draw-range に伝播しないよう
        // GanttTimelineRow 側で stopPropagation している。
        let start = currentStartDate < currentEndDate ? currentStartDate : currentEndDate;
        let end = currentStartDate < currentEndDate ? currentEndDate : currentStartDate;

        switch (viewMode) {
          case 'Month':
            start = startOfMonth(start);
            end = endOfMonth(end);
            break;
          case 'Year':
            start = startOfYear(start);
            end = endOfYear(end);
            break;
        }

        const newDuration = getWorkDaysCount(start, end, calendar);
        state.endDragUpdate(taskId, {
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
          duration: newDuration,
        });
      } else if (currentDragState.mode === 'move' && currentDragState.affectedTaskIds?.length) {
        const { taskId, affectedTaskIds, deltaDays = 0 } = currentDragState;
        if (deltaDays !== 0) {
          // 複数タスクを 1 回の set でまとめて移動する（Undo 1 エントリ）。
          state.moveTasksByDays(affectedTaskIds, deltaDays);
        } else if (
          state.selectedTaskIds.length > 1 &&
          state.selectedTaskIds.includes(taskId)
        ) {
          // 複数選択中に選択済みバーを動かさずクリックしたら、その 1 件を選択解除する
          // （ドラッグした場合は選択を維持したまま一括移動する）。
          state.setSelectedTaskIds(state.selectedTaskIds.filter((id) => id !== taskId));
        }
        state.setDragState(null);
        state.setMousePos(null);
      } else {
        const {
          taskId,
          currentStartDate,
          currentEndDate,
          initialStartDate,
          initialEndDate,
        } = currentDragState;
        if (
          currentStartDate.getTime() !== initialStartDate.getTime() ||
          currentEndDate.getTime() !== initialEndDate.getTime()
        ) {
          const newDuration = getWorkDaysCount(currentStartDate, currentEndDate, calendar);
          state.endDragUpdate(taskId, {
            startDate: format(currentStartDate, 'yyyy-MM-dd'),
            endDate: format(currentEndDate, 'yyyy-MM-dd'),
            duration: newDuration,
          });
        } else {
          state.setDragState(null);
          state.setMousePos(null);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    calendar,
    viewMode,
    leftOffset,
    containerRef,
    timelineMetrics,
  ]);

  return {
    setDragState,
    setMousePos,
  };
};
