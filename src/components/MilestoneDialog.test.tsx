import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MilestoneDialog } from './MilestoneDialog';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import type { Milestone } from '../types';

const initialState = useTaskStore.getState();

function addMilestone(input: { title: string; date: string; note?: string }): Milestone {
  let id = '';
  act(() => {
    id = useTaskStore.getState().addMilestone(input);
  });
  const milestone = useTaskStore.getState().milestones.find((item) => item.id === id);
  if (!milestone) {
    throw new Error('milestone was not added');
  }
  return milestone;
}

describe('MilestoneDialog', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('adds a milestone and closes the dialog', () => {
    const onClose = vi.fn();
    render(<MilestoneDialog isOpen onClose={onClose} initialDate="2026-11-01" />);

    fireEvent.change(screen.getByPlaceholderText('例: 設計凍結'), {
      target: { value: '設計凍結' },
    });
    fireEvent.change(screen.getByLabelText('日付'), {
      target: { value: '2026-11-02' },
    });
    fireEvent.change(screen.getByLabelText('メモ（任意）'), {
      target: { value: 'レビュー完了' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useTaskStore.getState().milestones).toEqual([
      expect.objectContaining({
        title: '設計凍結',
        date: '2026-11-02',
        note: 'レビュー完了',
      }),
    ]);
  });

  it('edits the selected milestone', () => {
    const milestone = addMilestone({ title: '設計凍結', date: '2026-11-02' });
    const onClose = vi.fn();

    render(
      <MilestoneDialog isOpen onClose={onClose} milestone={milestone} />
    );

    fireEvent.change(screen.getByPlaceholderText('例: 設計凍結'), {
      target: { value: '設計凍結（改）' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(useTaskStore.getState().milestones[0]).toMatchObject({
      id: milestone.id,
      title: '設計凍結（改）',
      date: '2026-11-02',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears an existing note when the note field is emptied', () => {
    const milestone = addMilestone({
      title: '設計凍結',
      date: '2026-11-02',
      note: 'レビュー完了',
    });

    render(
      <MilestoneDialog
        isOpen
        onClose={vi.fn()}
        milestone={milestone}
      />
    );

    fireEvent.change(screen.getByLabelText('メモ（任意）'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(useTaskStore.getState().milestones[0].note).toBeUndefined();
  });

  it('deletes the selected milestone', () => {
    const milestone = addMilestone({ title: '設計凍結', date: '2026-11-02' });
    const onClose = vi.fn();

    render(
      <MilestoneDialog isOpen onClose={onClose} milestone={milestone} />
    );

    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    expect(useTaskStore.getState().milestones).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles the lane visibility', () => {
    render(<MilestoneDialog isOpen onClose={vi.fn()} />);

    const checkbox = screen.getByRole('checkbox', { name: 'ガント上部に表示' });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(useTaskStore.getState().projectConfig.showMilestones).toBe(false);
  });

  it('lists registered milestones and loads one for editing', () => {
    addMilestone({ title: 'A', date: '2026-11-01' });
    addMilestone({ title: 'B', date: '2026-11-02' });

    render(<MilestoneDialog isOpen onClose={vi.fn()} />);

    expect(screen.getByText('2 件')).toBeInTheDocument();
    fireEvent.click(screen.getByText('B'));

    expect(screen.getByPlaceholderText('例: 設計凍結')).toHaveValue('B');
  });
});
