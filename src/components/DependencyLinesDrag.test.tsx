import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/**
 * 依存線レイヤーの回帰テスト。
 *
 * 静的レイヤー（GanttDependencyLines）はドラッグ中のタスクへ接続する線を描画せず、
 * 動的レイヤー（DraggedDependencyLines）だけがそれを描画する。
 * これにより、ドラッグ中でも依存線が消えず、かつ 1 本だけ描画される（二重描画しない）ことを保証する。
 */
describe('Dependency line layers during drag', () => {
  const setupTasks = () => {
    const rootIds = useTaskStore.getState().rootIds;
    const taskAId = rootIds[0];

    let taskBId = '';
    act(() => {
      useTaskStore.getState().addTask(taskAId, 'after');
      taskBId = useTaskStore.getState().rootIds[1];

      useTaskStore.getState().updateTask(taskAId, {
        title: 'Task A',
        planStartDate: '2026-05-25',
        planEndDate: '2026-05-25',
        planDuration: 1,
      });
      useTaskStore.getState().updateTask(taskBId, {
        title: 'Task B',
        planStartDate: '2026-05-27',
        planEndDate: '2026-05-28',
        planDuration: 2,
      });
      // B depends on A
      useTaskStore.getState().addDependency(taskAId, taskBId);
    });

    return { taskAId, taskBId };
  };

  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  const getLines = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('path[marker-end]'));

  it('renders exactly one line and keeps it visible (following the bar) while dragging', () => {
    const { taskBId } = setupTasks();

    const { container } = render(<GanttChart showNames />);

    // 1. 静止時: 静的レイヤーが 1 本だけ描画する
    const initialLines = getLines(container);
    expect(initialLines).toHaveLength(1);
    const dInitial = initialLines[0].getAttribute('d');
    expect(dInitial).toBeTruthy();

    const planBarB = container.querySelector(`[data-task-id="${taskBId}"].bg-blue-100`) as HTMLDivElement;
    expect(planBarB).not.toBeNull();

    // 2. B のバーを +2 日（cellWidth=40px 換算で 80px）ドラッグする（mouseUp しない）
    fireEvent.mouseDown(planBarB, { button: 0, clientX: 200, clientY: 50 });
    fireEvent.mouseMove(window, { clientX: 280, clientY: 50 });

    const duringDragLines = getLines(container);
    // 静的（除外）+ 動的（描画）で、ちょうど 1 本のまま
    expect(duringDragLines).toHaveLength(1);
    const dDuring = duringDragLines[0].getAttribute('d');
    expect(dDuring).not.toBe(dInitial);
    // ドラッグ中の層は非インタラクティブ（誤クリックで依存が消えない）
    expect((duringDragLines[0] as SVGPathElement).style.pointerEvents).toBe('none');

    // 3. drop 後は静的レイヤーに戻り、コミット後の座標になる
    fireEvent.mouseUp(window);

    const afterDropLines = getLines(container);
    expect(afterDropLines).toHaveLength(1);
    const dAfter = afterDropLines[0].getAttribute('d');
    expect(dAfter).toBeTruthy();
    expect(dAfter).not.toBe(dInitial);
    expect((afterDropLines[0] as SVGPathElement).style.pointerEvents).toBe('stroke');

    vi.useRealTimers();
  });

  it('does not change static lines when only an unrelated hover occurs', () => {
    const { taskBId } = setupTasks();

    const { container } = render(<GanttChart showNames />);

    const before = getLines(container).map((p) => p.getAttribute('d'));
    expect(before).toHaveLength(1);

    // B の行にホバーしても依存線の本数・パスは変わらない
    const rowB = container.querySelector(`[data-task-id="${taskBId}"]`)?.closest('div.relative') as HTMLElement | null;
    if (rowB) {
      fireEvent.mouseEnter(rowB);
      fireEvent.mouseLeave(rowB);
    }

    const after = getLines(container).map((p) => p.getAttribute('d'));
    expect(after).toEqual(before);

    vi.useRealTimers();
  });
});
