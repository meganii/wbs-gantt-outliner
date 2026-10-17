import { useCallback, useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';

/**
 * Outliner の行選択ロジックを管理するカスタムフック。
 * - 単一選択 / Ctrl(Cmd) マルチ選択 / Shift 範囲選択に対応
 * - アンカー ID を ref で保持
 *
 * セルは `React.memo` + 関数 props を無視する比較関数でメモ化されているため、
 * ここで生成した `handleSelectionChange` の古いクロージャがセルに残り続ける。
 * そのため、選択状態（`selectedTaskIds` / `focusedTaskId`）はクロージャ変数ではなく
 * 呼び出し時に `useTaskStore.getState()` から読み、アンカーや表示順も ref 経由で
 * 最新値を参照する。これにより古い関数参照が渡っていても正しく範囲選択できる。
 *
 * @param flattenedIds - 表示中のタスク ID リスト（フラット順）
 */
export function useTaskSelection(flattenedIds: string[]) {
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);

  const anchorIdRef = useRef<string | null>(null);
  const flattenedIdsRef = useRef(flattenedIds);
  useEffect(() => {
    flattenedIdsRef.current = flattenedIds;
  }, [flattenedIds]);

  const handleSelectionChange = useCallback(
    (id: string, multi: boolean, range: boolean) => {
      const ids = flattenedIdsRef.current;
      const {
        focusedTaskId,
        selectedTaskIds: currentSelected,
        setSelectedTaskIds,
      } = useTaskStore.getState();

      if (range) {
        // 範囲選択はアンカー（無ければ現在フォーカス中の行）から id まで
        const targetAnchor =
          anchorIdRef.current ||
          focusedTaskId ||
          (currentSelected.length > 0 ? currentSelected[currentSelected.length - 1] : id);

        const startIdx = ids.indexOf(targetAnchor);
        const endIdx = ids.indexOf(id);

        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          setSelectedTaskIds(ids.slice(min, max + 1));
          return;
        }
      }

      // 範囲選択以外はアンカーを更新する
      anchorIdRef.current = id;

      if (multi) {
        // Toggle
        if (currentSelected.includes(id)) {
          setSelectedTaskIds(currentSelected.filter((sid) => sid !== id));
        } else {
          setSelectedTaskIds([...currentSelected, id]);
        }
      } else {
        setSelectedTaskIds([id]);
      }
    },
    []
  );

  return { selectedTaskIds, handleSelectionChange };
}
