import { useMemo } from 'react';
import type { FlattenedItem } from '../utils/tree';

/** タスク ID に現れない区切り（ID は `leaf-0001` 等）。 */
const SEP = '\u0000';

/**
 * 表示順のタスク ID 配列を「内容ベース」で安定化する。
 *
 * `dnd-kit` の `SortableContext items` は配列を参照比較で context に配るため、
 * 配列の参照が変わるだけで全行（`useSortable` の消費側）が再レンダーされる。
 * ID 列の内容が同じなら同じ配列参照を返し、タスクを 1 つ編集しただけの
 * 全行再レンダーを防ぐ。
 *
 * 実装は文字列キーに対する `useMemo`。レンダー中の setState を使わないため
 * 余分なレンダーが発生しない（キー生成は O(N) の文字列連結のみ）。
 */
export function useStableFlattenedIds(flattenedItems: FlattenedItem[]): string[] {
  // キー生成は flattenedItems の参照が変わったとき（＝編集のあったコミット）だけ行う。
  // ホバー等の再レンダーでは再生成せず、無駄な文字列確保（GC 圧）を避ける。
  const key = useMemo(
    () => flattenedItems.map((item) => item.id).join(SEP),
    [flattenedItems]
  );
  return useMemo(() => (key === '' ? [] : key.split(SEP)), [key]);
}
