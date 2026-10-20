import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { HoverTooltipPortal } from './HoverTooltipPortal';

/** ホバーからツールチップ表示までの既定待ち時間(ms)。 */
export const TOOLTIP_DELAY_MS = 150;

export interface HoverTooltipTriggerProps<T extends HTMLElement> {
  onPointerEnter: (event: ReactPointerEvent<T>) => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
}

export interface UseHoverTooltipResult<T extends HTMLElement> {
  anchorRef: RefObject<T | null>;
  triggerProps: HoverTooltipTriggerProps<T>;
  tooltip: ReactNode;
}

interface UseHoverTooltipOptions {
  content: ReactNode;
  /** 表示までの待ち時間(ms)。既定は 150ms。 */
  delayMs?: number;
  /** false の間はホバーしても表示しない（ドラッグ中など）。 */
  enabled?: boolean;
}

/**
 * ブラウザ標準の `title` ツールチップ（Chromium 既定は約 500ms）の代わりに、
 * 任意の待ち時間で表示する軽量ツールチップ。
 *
 * - 表示位置は `position: fixed` + Portal で計算するため、`overflow-hidden` に切れない。
 * - ツールチップ自体は `pointer-events: none` なので、下の要素の操作を邪魔しない。
 * - スクロール・リサイズ・画面外クリック・Esc で即座に閉じる。
 */
export function useHoverTooltip<T extends HTMLElement = HTMLElement>({
  content,
  delayMs = TOOLTIP_DELAY_MS,
  enabled = true,
}: UseHoverTooltipOptions): UseHoverTooltipResult<T> {
  const anchorRef = useRef<T>(null);
  const timerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  if (!enabled && isOpen) {
    // ドラッグ開始などで表示が不要になったら、次の描画前に閉じる。
    setIsOpen(false);
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setIsOpen(false);
  }, [clearTimer]);

  const scheduleShow = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!enabled) return;
      // タッチ操作では入力欄のタップ直後にツールチップが出ないようにする。
      if (event.pointerType && event.pointerType !== 'mouse') return;

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setIsOpen(true);
      }, delayMs);
    },
    [clearTimer, delayMs, enabled]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };

    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hide, isOpen]);

  return {
    anchorRef,
    triggerProps: {
      onPointerEnter: scheduleShow,
      onPointerLeave: hide,
      onPointerDown: hide,
    },
    tooltip: isOpen ? (
      <HoverTooltipPortal anchorRef={anchorRef}>{content}</HoverTooltipPortal>
    ) : null,
  };
}
