import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { Outliner } from './Outliner';
import { IntegratedView } from './IntegratedView';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';
import { COMPACT_COLUMNS } from '../utils/projectConfig';

const initialState = useTaskStore.getState();

const reset = () => {
  act(() => {
    useTaskStore.setState(initialState, true);
    getTemporalState().clear();
  });
};

/**
 * Phase 0（壊れている表示の修正）の回帰テスト。
 * - 日付セル: 非フォーカス時に input の value がストア値を表示形式で持ち、
 *   placeholder が空であること（透明 input の placeholder が Overlay Span と
 *   重なって「文字が重なる」不具合の再発防止）。
 * - 統合表示: 既定の左ペイン列がコンパクト（COMPACT_COLUMNS）であること。
 */
describe('date cell display', () => {
  beforeEach(reset);

  it('shows the stored date without an overlapping placeholder', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const startInput = container.querySelector<HTMLInputElement>(
      `input[data-task-id="${id}"][data-field="startDate"]`
    )!;

    expect(startInput).not.toBeNull();
    expect(startInput.value).toBe('10/05');
    expect(startInput.placeholder).toBe('');

    const overlay = startInput.parentElement!.querySelector('span')!;
    expect(overlay.textContent).toBe('10/05');
  });
});

describe('integrated view columns', () => {
  beforeEach(reset);

  it('uses the compact default columns when integratedColumns is not customized', () => {
    const { container } = render(
      <IntegratedView outlinerWidth={600} onResizeStart={() => {}} />
    );

    expect(container.querySelector('[data-field="status"]')).not.toBeNull();
    expect(container.querySelector('[data-field="progress"]')).not.toBeNull();
    // 既定では説明・日付列は出さない（左ペインが画面幅を占有しないように）
    expect(container.querySelector('[data-field="description"]')).toBeNull();
    expect(container.querySelector('[data-field="startDate"]')).toBeNull();
  });

  it('honors an explicit integratedColumns selection', () => {
    act(() => {
      useTaskStore.getState().setIntegratedColumns(['taskName', 'description']);
    });

    const { container } = render(
      <IntegratedView outlinerWidth={600} onResizeStart={() => {}} />
    );

    expect(container.querySelector('[data-field="description"]')).not.toBeNull();
    expect(container.querySelector('[data-field="status"]')).toBeNull();
  });

  it('keeps COMPACT_COLUMNS as a taskName-first list', () => {
    expect(COMPACT_COLUMNS[0]).toBe('taskName');
  });
});
