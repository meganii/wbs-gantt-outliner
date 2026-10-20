import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

export function HoverTooltipPortal({
  anchorRef,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    top: 0,
    left: 0,
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
        Math.max(VIEWPORT_MARGIN, maxLeft)
      )
    );

    let top = anchorRect.top - tooltipRect.height - ANCHOR_GAP;
    if (top < VIEWPORT_MARGIN) {
      // 上に余白がなければ下へ出す。
      top = anchorRect.bottom + ANCHOR_GAP;
    }
    top = Math.min(
      Math.max(VIEWPORT_MARGIN, top),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN)
    );

    setStyle({ top, left, visibility: 'visible' });
  }, [anchorRef, children]);

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-max max-w-[320px] rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-[11px] leading-5 text-slate-50 shadow-lg"
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}
