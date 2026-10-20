/* eslint-disable react-hooks/refs -- テスト用ハーネスでフックが返す ref を button に接続する */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TOOLTIP_DELAY_MS, useHoverTooltip } from './HoverTooltip';

function Harness({
  content = 'ツールチップの内容',
  enabled = true,
}: {
  content?: string;
  enabled?: boolean;
}) {
  const tooltip = useHoverTooltip<HTMLButtonElement>({ content, enabled });
  return (
    <>
      <button ref={tooltip.anchorRef} {...tooltip.triggerProps} type="button">
        trigger
      </button>
      {tooltip.tooltip}
    </>
  );
}

describe('useHoverTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`マウスオーバーから ${TOOLTIP_DELAY_MS}ms 後に表示する`, () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'trigger' });

    fireEvent.pointerOver(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1));
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('ツールチップの内容');

    fireEvent.pointerOut(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('スクロールすると即座に閉じる', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'trigger' });

    fireEvent.pointerOver(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('pointerdown で即座に閉じる', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'trigger' });

    fireEvent.pointerOver(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('enabled=false の間は表示しない', () => {
    render(<Harness enabled={false} />);
    const trigger = screen.getByRole('button', { name: 'trigger' });

    fireEvent.pointerOver(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('タッチ操作では表示しない', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'trigger' });

    fireEvent.pointerOver(trigger, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
