import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { IntegratedView } from './IntegratedView';
import { GanttChart } from './GanttChart';
import { useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/**
 * 依存線（SVG, z-10）は行（`.gantt-row-optimized` = content-visibility:auto による
 * paint containment）より前面に描画される。行内のタスク名カラムは z-40 だが
 * 行自身がスタッキングコンテキストになるため SVG より前面にできず、横スクロール時に
 * 名前カラムの上へ依存線が重なってしまう。スクロール量ぶんを clip-path で
 * 切り落とすことで、名前カラム領域には依存線を描画しない。
 */
describe('dependency layer stays out of the name column', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T15:00:00Z'));
  });

  /** jsdom では scrollLeft を代入できない場合があるため明示的に定義する */
  const setScrollLeft = (el: HTMLElement, value: number) => {
    Object.defineProperty(el, 'scrollLeft', {
      value,
      writable: true,
      configurable: true,
    });
  };

  it('IntegratedView clips the dependency SVG by the horizontal scroll offset', () => {
    const { container } = render(
      <IntegratedView outlinerWidth={600} onResizeStart={() => {}} />
    );
    const scroller = container.querySelector('div.overflow-auto') as HTMLDivElement;
    const svg = container.querySelector('svg.z-10') as SVGSVGElement;
    expect(scroller).not.toBeNull();
    expect(svg).not.toBeNull();

    // スクロールしていないときはクリップしない
    expect(svg.style.clipPath).toBe('');

    act(() => {
      setScrollLeft(scroller, 300);
      fireEvent.scroll(scroller);
    });
    expect(svg.style.clipPath).toBe('inset(0 0 0 300px)');

    act(() => {
      setScrollLeft(scroller, 0);
      fireEvent.scroll(scroller);
    });
    expect(svg.style.clipPath).toBe('');
  });

  it('GanttChart clips the dependency SVG by the horizontal scroll offset', () => {
    const { container } = render(<GanttChart showNames />);
    const scroller = container.querySelector('div.overflow-auto') as HTMLDivElement;
    const svg = container.querySelector('svg.z-10') as SVGSVGElement;
    expect(scroller).not.toBeNull();
    expect(svg).not.toBeNull();

    expect(svg.style.clipPath).toBe('');

    act(() => {
      setScrollLeft(scroller, 480);
      fireEvent.scroll(scroller);
    });
    expect(svg.style.clipPath).toBe('inset(0 0 0 480px)');
  });
});

/**
 * 日付グリッド背景（z-0）は行より下まで（min-height:100%）描画されるため、
 * 横スクロールすると左ペイン（タスク名列）の「行より下の余白」に罫線や
 * 週末の塗りが覗いてしまう。依存線と同じくスクロール量ぶんを clip-path で
 * 切り落とし、左ペインの領域には描画しないようにする。
 */
describe('timeline grid background stays out of the left pane', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  const setScrollLeft = (el: HTMLElement, value: number) => {
    Object.defineProperty(el, 'scrollLeft', {
      value,
      writable: true,
      configurable: true,
    });
  };

  const gridSelector = 'div.absolute.top-0.pointer-events-none.z-0';

  it('IntegratedView clips the grid background by the horizontal scroll offset', () => {
    const { container } = render(
      <IntegratedView outlinerWidth={600} onResizeStart={() => {}} />
    );
    const scroller = container.querySelector('div.overflow-auto') as HTMLDivElement;
    const grid = container.querySelector(gridSelector) as HTMLDivElement;
    expect(scroller).not.toBeNull();
    expect(grid).not.toBeNull();

    expect(grid.style.clipPath).toBe('');

    act(() => {
      setScrollLeft(scroller, 250);
      fireEvent.scroll(scroller);
    });
    expect(grid.style.clipPath).toBe('inset(0 0 0 250px)');

    act(() => {
      setScrollLeft(scroller, 0);
      fireEvent.scroll(scroller);
    });
    expect(grid.style.clipPath).toBe('');
  });

  it('GanttChart clips the grid background by the horizontal scroll offset', () => {
    const { container } = render(<GanttChart showNames />);
    const scroller = container.querySelector('div.overflow-auto') as HTMLDivElement;
    const grid = container.querySelector(gridSelector) as HTMLDivElement;
    expect(scroller).not.toBeNull();
    expect(grid).not.toBeNull();

    expect(grid.style.clipPath).toBe('');

    act(() => {
      setScrollLeft(scroller, 320);
      fireEvent.scroll(scroller);
    });
    expect(grid.style.clipPath).toBe('inset(0 0 0 320px)');
  });
});
