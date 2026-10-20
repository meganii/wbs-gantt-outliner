import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { eachDayOfInterval, parseISO } from 'date-fns';
import { MilestoneLane } from './MilestoneLane';
import type { TimelineMetrics } from '../hooks/useGanttTimeline';
import type { Milestone } from '../types';

const timeRange = eachDayOfInterval({
  start: parseISO('2026-10-01'),
  end: parseISO('2026-10-10'),
});

const timelineMetrics: TimelineMetrics = {
  timelineStart: timeRange[0],
  timelineEnd: timeRange[timeRange.length - 1],
  totalDays: 10,
  totalWidth: 400,
  pixelsPerDay: 40,
};

const viewportRef = { current: null } as React.RefObject<HTMLDivElement | null>;

function renderLane(
  milestones: Milestone[],
  options: {
    viewMode?: 'Day' | 'Week' | 'Month' | 'Year';
    onEdit?: (milestone: Milestone) => void;
    onAdd?: (date: string) => void;
  } = {}
) {
  const onEdit = options.onEdit ?? vi.fn();
  const onAdd = options.onAdd ?? vi.fn();

  render(
    <MilestoneLane
      timeRange={timeRange}
      cellWidth={40}
      viewMode={options.viewMode ?? 'Day'}
      timelineMetrics={timelineMetrics}
      milestones={milestones}
      leftOffset={120}
      viewportRef={viewportRef}
      onEdit={onEdit}
      onAdd={onAdd}
    />
  );

  return { onEdit, onAdd };
}

describe('MilestoneLane', () => {
  it('renders a diamond at the milestone date and opens the editor on click', () => {
    const milestone: Milestone = {
      id: 'm1',
      title: '設計凍結',
      date: '2026-10-03',
    };
    const { onEdit } = renderLane([milestone]);

    expect(screen.getByTestId('milestone-lane')).toBeInTheDocument();
    expect(screen.getByText('マイルストーン')).toBeInTheDocument();

    const button = screen.getByRole('button', {
      name: 'マイルストーン: 設計凍結 (2026/10/03)',
    });
    // 10/1 から 2 日後（2 * 40）+ 日セル中央（20）- ダイヤ半径（5）
    expect(button).toHaveStyle({ left: '95px' });
    expect(screen.getByText('設計凍結')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledWith(milestone);
  });

  it('shows the first title and a +N badge for milestones on the same date', () => {
    renderLane([
      { id: 'a', title: 'A', date: '2026-10-03' },
      { id: 'b', title: 'B', date: '2026-10-03' },
      { id: 'c', title: 'C', date: '2026-10-03' },
    ]);

    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('hides the text label outside Day view but keeps the diamond', () => {
    renderLane([{ id: 'm1', title: '設計凍結', date: '2026-10-03' }], {
      viewMode: 'Week',
    });

    expect(screen.queryByText('設計凍結')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'マイルストーン: 設計凍結 (2026/10/03)',
      })
    ).toBeInTheDocument();
  });

  it('adds a milestone at the double-clicked date', () => {
    const { onAdd } = renderLane([
      { id: 'm1', title: '設計凍結', date: '2026-10-03' },
    ]);
    const timeline = screen.getByTestId('milestone-lane-timeline');

    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 28,
      width: 400,
      height: 28,
      toJSON: () => ({}),
    });

    // x=170px は 10/1 から 4 日後（10/5）のセル
    fireEvent.doubleClick(timeline, { clientX: 170 });

    expect(onAdd).toHaveBeenCalledWith('2026-10-05');
  });

  it('does not bubble the double-click from a milestone button', () => {
    const { onAdd } = renderLane([
      { id: 'm1', title: '設計凍結', date: '2026-10-03' },
    ]);
    const button = screen.getByRole('button', {
      name: 'マイルストーン: 設計凍結 (2026/10/03)',
    });

    fireEvent.doubleClick(button);

    expect(onAdd).not.toHaveBeenCalled();
  });
});
