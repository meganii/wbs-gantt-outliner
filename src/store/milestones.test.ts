import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { getTemporalState, useTaskStore } from './useTaskStore';

const initialState = useTaskStore.getState();

describe('milestone actions', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
      getTemporalState().clear();
    });
  });

  it('adds a milestone, trims strings, and returns the generated id', () => {
    let id = '';

    act(() => {
      id = useTaskStore.getState().addMilestone({
        title: '  設計凍結  ',
        date: '2026-10-20',
        note: '  レビュー完了  ',
      });
    });

    const milestones = useTaskStore.getState().milestones;
    expect(id).not.toBe('');
    expect(milestones).toEqual([
      { id, title: '設計凍結', date: '2026-10-20', note: 'レビュー完了' },
    ]);
  });

  it('does not add a milestone with an invalid date', () => {
    let id: string | undefined;

    act(() => {
      id = useTaskStore.getState().addMilestone({
        title: '不正',
        date: '2026-02-30',
      });
    });

    expect(id).toBe('');
    expect(useTaskStore.getState().milestones).toEqual([]);
  });

  it('keeps milestones sorted by date when adding out of order', () => {
    act(() => {
      useTaskStore.getState().addMilestone({ title: 'B', date: '2026-10-20' });
      useTaskStore.getState().addMilestone({ title: 'A', date: '2026-10-18' });
    });

    expect(useTaskStore.getState().milestones.map((m) => m.title)).toEqual(['A', 'B']);
  });

  it('updates a milestone and re-sorts it', () => {
    let id = '';
    act(() => {
      id = useTaskStore.getState().addMilestone({ title: 'A', date: '2026-10-18' });
      useTaskStore.getState().addMilestone({ title: 'B', date: '2026-10-20' });
    });

    act(() => {
      useTaskStore.getState().updateMilestone(id, {
        title: 'A (変更)',
        date: '2026-10-25',
        note: 'メモ',
      });
    });

    const milestones = useTaskStore.getState().milestones;
    expect(milestones.map((m) => m.title)).toEqual(['B', 'A (変更)']);
    expect(milestones[1]).toMatchObject({
      id,
      date: '2026-10-25',
      note: 'メモ',
    });
  });

  it('does not update a milestone when the new date is invalid', () => {
    let id = '';
    act(() => {
      id = useTaskStore.getState().addMilestone({ title: 'A', date: '2026-10-18' });
    });

    act(() => {
      useTaskStore.getState().updateMilestone(id, { date: '2026-02-30' });
    });

    expect(useTaskStore.getState().milestones[0].date).toBe('2026-10-18');
  });

  it('deletes a milestone', () => {
    let id = '';
    act(() => {
      id = useTaskStore.getState().addMilestone({ title: 'A', date: '2026-10-18' });
    });

    act(() => {
      useTaskStore.getState().deleteMilestone(id);
    });

    expect(useTaskStore.getState().milestones).toEqual([]);
  });

  it('can undo and redo milestone edits', () => {
    act(() => {
      useTaskStore.getState().addMilestone({ title: 'A', date: '2026-10-18' });
    });

    expect(useTaskStore.getState().milestones).toHaveLength(1);
    expect(getTemporalState().pastStates.length).toBe(1);

    act(() => {
      getTemporalState().undo();
    });
    expect(useTaskStore.getState().milestones).toEqual([]);

    act(() => {
      getTemporalState().redo();
    });
    expect(useTaskStore.getState().milestones).toHaveLength(1);
  });

  it('toggles the milestone lane visibility without touching other config', () => {
    act(() => {
      useTaskStore.getState().setShowMilestones(false);
    });

    expect(useTaskStore.getState().projectConfig.showMilestones).toBe(false);
    expect(useTaskStore.getState().projectConfig.viewMode).toBe(
      initialState.projectConfig.viewMode
    );
  });
});
