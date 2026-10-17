import type { CSSProperties } from 'react';

/**
 * 左ペイン（タスク名列）とタイムラインの境界線。
 *
 * 行（左ペインのセル）はそれぞれ `border-r` で境界線を描いているが、行が無い
 * 「行より下の余白」では線が途切れる。スクロールコンテナ自身の背景は横スクロール
 * しても固定（コンテンツだけが動く）ため、境界線をコンテナの背景として描くと
 * 左右どちらのペインにもスクロールでずれず、途切れない 1 本の線になる。
 *
 * @param offset 左ペインの幅（px）。境界線はその 1px 手前に描く。
 */
export const leftPaneDividerStyle = (offset: number): CSSProperties => ({
  backgroundImage: `linear-gradient(to right, transparent ${offset - 1}px, #d1d5db ${
    offset - 1
  }px, #d1d5db ${offset}px, transparent ${offset}px)`,
});
