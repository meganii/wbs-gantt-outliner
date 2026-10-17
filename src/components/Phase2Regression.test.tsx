import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import { IntegratedView } from './IntegratedView';
import { TIMELINE_HEADER_HEIGHT, TIMELINE_GROUP_ROW_HEIGHT } from './TimelineHeader';
import { getTemporalState, useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/**
 * Phase 2（ガント表現）の回帰テスト。
 *
 * 今日ライン / 今日バッジ、週末と祝日の区別、ガント左列の情報量、
 * 行選択ハイライト帯といった「見た目の意味を持つ」DOM を固定する。
 * （色そのものは検証せず、意味を表すクラス/属性の存在を確認する）
 */
const reset = () => {
  act(() => {
    useTaskStore.setState(initialState, true);
    getTemporalState().clear();
  });
};

const classHas = (container: HTMLElement, token: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('*')).filter((el) =>
    el.className.toString().includes(token)
  );

/** テスト用に日付つきのタスクを 1 件用意する */
const seedTask = () => {
  const id = useTaskStore.getState().rootIds[0];
  act(() => {
    useTaskStore.getState().updateTask(id, {
      title: 'Seed',
      planStartDate: '2026-05-20',
      planEndDate: '2026-05-22',
      planDuration: 3,
      startDate: '2026-05-20',
      endDate: '2026-05-22',
      duration: 3,
    });
  });
  return id;
};

describe('Phase 2: ガント表現', () => {
  beforeEach(() => {
    reset();
    vi.useFakeTimers();
    // 2026-05-20 (Wed) を「今日」にする
    vi.setSystemTime(new Date('2026-05-20T09:00:00+09:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('統合表示は今日ラインと今日バッジを描画する', () => {
    seedTask();
    const { container } = render(<IntegratedView outlinerWidth={600} onResizeStart={() => {}} />);

    // 今日ライン
    expect(classHas(container, 'bg-brand-500/70').length).toBeGreaterThan(0);
    // 今日バッジ（日付 20 が塗りつぶし円で表示される）
    const badges = classHas(container, 'bg-brand-600').filter(
      (el) => el.tagName === 'SPAN' && el.textContent?.trim() === '20'
    );
    expect(badges.length).toBe(1);
  });

  it('祝日セルは週末とは区別して表示される', () => {
    act(() => {
      useTaskStore.getState().setCalendarHolidays(['2026-05-21']);
    });
    seedTask();
    const { container } = render(<IntegratedView outlinerWidth={600} onResizeStart={() => {}} />);

    // 祝日セル: amber 背景 + title に (祝日)
    const holidayCell = container.querySelector<HTMLElement>('[title="2026-05-21 (祝日)"]');
    expect(holidayCell).not.toBeNull();
    expect(holidayCell!.className).toContain('bg-amber-100');

    // 週末（5/23 Sat）は gray、祝日 title は無い
    const weekendCells = classHas(container, 'bg-slate-100').filter(
      (el) => el.getAttribute('title') === null && el.children.length === 2
    );
    expect(weekendCells.length).toBeGreaterThan(0);
  });

  it('ガント左列にステータスと進捗のヘッダーを表示する', () => {
    seedTask();
    const { container } = render(<GanttChart showNames />);
    const text = container.textContent ?? '';
    expect(text).toContain('タスク名');
    expect(text).toContain('ステータス');
    expect(text).toContain('進捗率');
  });

  it('選択中の行はタイムライン側にもハイライト帯を敷く', () => {
    const id = seedTask();
    act(() => {
      useTaskStore.getState().setSelectedTaskIds([id]);
    });
    const { container } = render(<GanttChart showNames />);
    expect(classHas(container, 'bg-brand-500/[0.08]').length).toBe(1);
  });

  it('「今日へ移動」ボタンは todayFocusRequestId を進める', () => {
    const before = useTaskStore.getState().todayFocusRequestId;
    act(() => {
      useTaskStore.getState().requestScrollToToday();
    });
    expect(useTaskStore.getState().todayFocusRequestId).toBe(before + 1);
  });
});

describe('ヘッダー高さの整合', () => {
  beforeEach(reset);

  // 統合表示は左ペイン（列名）とタイムラインのヘッダーが同じ高さでないと、
  // 切り替え時に列名のベースラインがずれて見える。ガントチャートと揃える。
  it('統合表示の列ヘッダーとタイムラインのヘッダー高さが一致する', () => {
    const { container } = render(
      <IntegratedView outlinerWidth={600} onResizeStart={() => {}} />
    );

    const tableHeader = container.querySelector<HTMLElement>('div.bg-slate-50.w-max');
    expect(tableHeader).not.toBeNull();
    expect(tableHeader!.style.height).toBe(`${TIMELINE_HEADER_HEIGHT}px`);

    const timelineHeader = Array.from(
      container.querySelectorAll<HTMLElement>('.flex.flex-col.select-none')
    ).find((el) => el.style.width !== '');
    const timelineWrapper = timelineHeader!.parentElement as HTMLElement;
    expect(timelineWrapper.style.height).toBe(`${TIMELINE_HEADER_HEIGHT}px`);
  });

  it('ガントチャートのヘッダーも同じ高さを使う', () => {
    const { container } = render(<GanttChart showNames />);
    const header = container.querySelector<HTMLElement>('.sticky.top-0.bg-gray-100');
    expect(header).not.toBeNull();
    expect(header!.style.height).toBe(`${TIMELINE_HEADER_HEIGHT}px`);
  });

  it('タイムラインの2段ヘッダーの合計＝グループ行＋詳細行', () => {
    const { container } = render(<GanttChart />);
    const groupRow = container.querySelector<HTMLElement>('.border-b.border-line.flex');
    expect(groupRow!.style.height).toBe(`${TIMELINE_GROUP_ROW_HEIGHT}px`);
    const detailRow = groupRow!.nextElementSibling as HTMLElement;
    expect(Number.parseInt(groupRow!.style.height) + Number.parseInt(detailRow.style.height)).toBe(
      TIMELINE_HEADER_HEIGHT
    );
  });
});
