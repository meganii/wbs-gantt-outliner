import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import { TOOLTIP_DELAY_MS } from './HoverTooltip';

const initialState = useTaskStore.getState();

describe('ガントバーのツールチップ', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`ホバーから ${TOOLTIP_DELAY_MS}ms 後に日程・期間・進捗・基準を表示する`, () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'Tooltip Task',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
        progress: 40,
        baselineStartDate: '2026-05-24',
        baselineEndDate: '2026-05-26',
      });
    });

    const { container } = render(<GanttChart showNames />);
    const bar = container.querySelector<HTMLElement>(
      `[data-task-id="${id}"][data-gantt-bar="schedule"]`
    )!;
    expect(bar).not.toHaveAttribute('title');

    fireEvent.pointerOver(bar, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Tooltip Task');
    expect(tooltip).toHaveTextContent('開始日: 2026-05-25');
    expect(tooltip).toHaveTextContent('終了日: 2026-05-27');
    expect(tooltip).toHaveTextContent('期間: 3日');
    expect(tooltip).toHaveTextContent('進捗 40%');
    expect(tooltip).toHaveTextContent('基準: 2026-05-24 - 2026-05-26');

    fireEvent.pointerOut(bar, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('完了タスクはツールチップに「（完了）」を表示する', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'Done Task',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
        progress: 100,
      });
    });

    const { container } = render(<GanttChart showNames />);
    const bar = container.querySelector<HTMLElement>(
      `[data-task-id="${id}"][data-gantt-bar="schedule"]`
    )!;

    fireEvent.pointerOver(bar, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    expect(screen.getByRole('tooltip')).toHaveTextContent('進捗 100%（完了）');
  });

  it('バーを押したら即座に閉じる', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        title: 'Tooltip Task',
        startDate: '2026-05-25',
        endDate: '2026-05-27',
        duration: 3,
      });
    });

    const { container } = render(<GanttChart showNames />);
    const bar = container.querySelector<HTMLElement>(
      `[data-task-id="${id}"][data-gantt-bar="schedule"]`
    )!;

    fireEvent.pointerOver(bar, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(bar);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
