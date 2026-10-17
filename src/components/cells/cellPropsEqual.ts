/**
 * セルコンポーネント用の `React.memo` 比較関数。
 *
 * 親（TaskRow）はストア更新のたびに再描画されうるため、コールバック
 * （onSelectionChange 等）は毎回新しい参照になる。それらを比較対象から外し、
 * 見た目に影響するデータ（task / columnWidths / 各種 ID / boolean 等）だけで
 * 比較する。データが同じならセル本体の再描画（hooks 実行と DOM 差分）をスキップできる。
 */
export function cellPropsEqual<T extends object>(prevProps: T, nextProps: T): boolean {
  const keys = Object.keys(prevProps) as Array<keyof T>;
  for (const key of keys) {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];
    if (typeof prevValue === 'function' || typeof nextValue === 'function') {
      continue;
    }
    if (prevValue !== nextValue) {
      return false;
    }
  }
  return true;
}
