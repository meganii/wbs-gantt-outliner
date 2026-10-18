import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppHeader } from './AppHeader';
import { useTaskStore } from '../store/useTaskStore';

const initialState = useTaskStore.getState();

/**
 * ヘッダーは `overflow-hidden`（狭い幅で内容がメイン領域へはみ出さないように）を
 * 持つため、ドロップダウンを `absolute` で置くとヘッダーの高さで切り取られ、
 * メイン領域（統合表示/ガントチャート）に隠れてしまう。
 * `fixed` でヘッダーの外へ描画し、メイン領域のレイヤー（行 z-40 /
 * リサイズハンドル z-50）より前面（z-[60]）に置いていることを固定する。
 */
describe('AppHeader の設定メニュー', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  const renderHeader = (onOpenProjectSettings = vi.fn()) => {
    render(
      <AppHeader view="integrated" setView={() => {}} onOpenProjectSettings={onOpenProjectSettings} />
    );
    return onOpenProjectSettings;
  };

  it('ヘッダーの外に fixed レイヤーとしてドロップダウンを描画する', () => {
    renderHeader();
    expect(screen.queryByText('祝日設定')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const menu = screen.getByText('祝日設定').closest('div');
    expect(menu).not.toBeNull();
    // ヘッダーの overflow-hidden に切り取られない
    expect(menu!.classList.contains('fixed')).toBe(true);
    // メイン領域の行 z-40 / リサイズハンドル z-50 より前面
    expect(menu!.classList.contains('z-[60]')).toBe(true);
    // Electron のウィンドウドラッグ領域にクリックを吸われない
    expect(menu!.classList.contains('no-drag')).toBe(true);
    // ボタンの直下に位置を計算する
    expect(menu!.style.top).toBe('4px');
  });

  it('祝日設定を選ぶとプロジェクト設定を開いてメニューを閉じる', () => {
    const onOpenProjectSettings = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.click(screen.getByText('祝日設定'));

    expect(onOpenProjectSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('祝日設定')).toBeNull();
  });

  it('外側をクリックすると閉じる', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.queryByText('祝日設定')).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('祝日設定')).toBeNull();
  });

  it('歯車アイコンは閉じているときはグレー、開いているときは brand 色', () => {
    renderHeader();

    const button = screen.getByRole('button', { name: '設定' });
    const icon = () => button.querySelector('svg');
    expect(icon()!.classList.contains('text-slate-500')).toBe(true);

    fireEvent.click(button);
    expect(icon()!.classList.contains('text-slate-500')).toBe(false);
    expect(icon()!.classList.contains('text-brand-600')).toBe(true);
  });

  it('メニュー項目の祝日設定アイコンはグレー', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));

    const item = screen.getByText('祝日設定').closest('button');
    const icon = item!.querySelector('svg');
    expect(icon!.classList.contains('text-slate-500')).toBe(true);
  });
});

describe('AppHeader のファイル操作ラベル', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState(initialState, true);
    });
  });

  it('保存 / 読込 / 出力 の 2 文字ラベルで揃っている', () => {
    render(
      <AppHeader view="integrated" setView={() => {}} onOpenProjectSettings={() => {}} />
    );

    expect(screen.getByText('保存')).not.toBeNull();
    expect(screen.getByText('読込')).not.toBeNull();
    expect(screen.getByText('出力')).not.toBeNull();
    // 幅の狭いときの読み上げ・既存の自動操作向けに説明つきの aria-label を残す
    expect(screen.getByRole('button', { name: '読み込み' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Excel 出力' })).not.toBeNull();
  });
});
