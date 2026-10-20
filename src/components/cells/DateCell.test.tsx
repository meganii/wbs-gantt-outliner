import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Outliner } from '../Outliner';
import { getTemporalState, useTaskStore } from '../../store/useTaskStore';
import { TOOLTIP_DELAY_MS } from '../HoverTooltip';

const initialState = useTaskStore.getState();

const reset = () => {
  act(() => {
    useTaskStore.setState(initialState, true);
    getTemporalState().clear();
  });
};

const fieldInput = (container: HTMLElement, id: string, field: string) =>
  container.querySelector<HTMLInputElement>(
    `input[data-task-id="${id}"][data-field="${field}"]`
  )!;

const pickerInput = (container: HTMLElement, id: string, field: string) =>
  container.querySelector<HTMLInputElement>(
    `input[data-task-id="${id}"][data-date-picker="${field}"]`
  )!;

const pasteText = (input: HTMLInputElement, text: string) => {
  fireEvent.paste(input, {
    clipboardData: {
      getData: () => text,
    },
  });
};

describe('TaskDateCell', () => {
  beforeEach(() => {
    reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;
  });

  it('shows MM/DD both when idle and while editing', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'startDate');
    expect(input.value).toBe('10/05');

    fireEvent.focus(input);
    expect(input.value).toBe('10/05');
    expect(input.value).not.toContain('2026');
  });

  it(`ホバーから ${TOOLTIP_DELAY_MS}ms 後にフル日付のツールチップを表示する`, () => {
    vi.useFakeTimers();
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'startDate');
    const wrapper = container.querySelector<HTMLElement>(
      `[data-date-cell="${id}"] [data-date-field-wrapper="startDate"]`
    )!;

    // 標準 title は併用しない（約 500ms のネイティブツールチップを避ける）。
    expect(input).not.toHaveAttribute('title');

    fireEvent.pointerOver(wrapper, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('開始日: 2026/10/05');
    expect(tooltip).toHaveTextContent('クリックで入力 / カレンダーから選択');

    fireEvent.pointerOut(wrapper, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('commits MM/DD using the year of the existing value', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'startDate');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10/20' } });
    fireEvent.blur(input);

    expect(useTaskStore.getState().tasks[id].startDate).toBe('2026-10-20');
  });

  it('uses the current year when the field is empty', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00'));

    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(rootId, 'after');
    });
    const id = useTaskStore.getState().rootIds[1];

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'startDate');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10/20' } });
    fireEvent.blur(input);

    expect(useTaskStore.getState().tasks[id].startDate).toBe('2026-10-20');
  });

  it('rolls the end date to the next year when MM/DD is before the start date', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-12-30',
        endDate: '2026-12-31',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'endDate');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '01/05' } });
    fireEvent.blur(input);

    expect(useTaskStore.getState().tasks[id].endDate).toBe('2027-01-05');
    expect(fieldInput(container, id, 'endDate').value).toBe('01/05');
  });

  it('normalizes a pasted full date immediately', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, id, 'startDate');
    fireEvent.focus(input);
    pasteText(input, '2027/03/04');

    expect(useTaskStore.getState().tasks[id].startDate).toBe('2027-03-04');
    expect(input.value).toBe('03/04');
  });

  it('pastes multiple dates across the selected rows', () => {
    const rootId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(rootId, 'after');
      useTaskStore.getState().addTask(rootId, 'after');
    });

    const [, firstId, secondId] = useTaskStore.getState().rootIds;
    act(() => {
      useTaskStore.getState().setSelectedTaskIds([firstId, secondId]);
    });

    const { container } = render(<Outliner showDetails />);
    const input = fieldInput(container, firstId, 'startDate');
    fireEvent.focus(input);
    pasteText(input, '2027/05/01\n2027/05/02');

    const { tasks } = useTaskStore.getState();
    expect(tasks[firstId].startDate).toBe('2027-05-01');
    expect(tasks[secondId].startDate).toBe('2027-05-02');
    expect(input.value).toBe('05/01');
  });

  it('opens the native date picker and commits the selected date', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const showPicker = vi.fn();
    (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker = showPicker;

    const { container } = render(<Outliner showDetails />);
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="開始日のカレンダーを開く"]'
    )!;
    fireEvent.click(button);

    const picker = pickerInput(container, id, 'startDate');
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(picker.value).toBe('2026-10-05');

    fireEvent.change(picker, { target: { value: '2026-11-04' } });
    expect(useTaskStore.getState().tasks[id].startDate).toBe('2026-11-04');
    expect(fieldInput(container, id, 'startDate').value).toBe('11/04');
  });

  it('sets min on the end date picker from the start date', () => {
    const id = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().updateTask(id, {
        startDate: '2026-10-05',
        endDate: '2026-10-09',
      });
    });

    const { container } = render(<Outliner showDetails />);
    expect(pickerInput(container, id, 'endDate').min).toBe('2026-10-05');
  });

  it('keeps parent dates read-only and hides their calendar buttons', () => {
    const parentId = useTaskStore.getState().rootIds[0];
    act(() => {
      useTaskStore.getState().addTask(parentId, 'inside');
    });

    const { container } = render(<Outliner showDetails />);
    const parentStart = fieldInput(container, parentId, 'startDate');
    expect(parentStart).toHaveAttribute('readonly');
    expect(container.querySelector(`input[data-task-id="${parentId}"][data-date-picker]`)).toBeNull();
    expect(container.querySelectorAll('button[aria-label$="のカレンダーを開く"]')).toHaveLength(2);
  });
});
