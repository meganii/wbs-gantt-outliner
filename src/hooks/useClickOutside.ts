import { useEffect, type RefObject } from 'react';

/**
 * ref が指す要素の外側でマウスダウンが発生したときに `callback` を呼ぶ汎用 Hook。
 * ドロップダウンメニューや Popover の外クリック閉じに使う。
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: () => void
): void {
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        callback();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [ref, callback]);
}
