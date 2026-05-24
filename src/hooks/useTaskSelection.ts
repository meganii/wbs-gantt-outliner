import { useState } from 'react';
import { useTaskStore } from '../store/useTaskStore';

/**
 * Outliner の行選択ロジックを管理するカスタムフック。
 * - 単一選択 / Ctrl(Cmd) マルチ選択 / Shift 範囲選択に対応
 * - アンカー ID を内部 state で保持
 *
 * @param flattenedIds - 表示中のタスク ID リスト（フラット順）
 */
export function useTaskSelection(flattenedIds: string[]) {
  const selectedTaskIds = useTaskStore((state) => state.selectedTaskIds);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);
  const focusedTaskId = useTaskStore((state) => state.focusedTaskId);

  const [anchorId, setAnchorId] = useState<string | null>(null);

  const handleSelectionChange = (id: string, multi: boolean, range: boolean) => {
    if (range) {
      // Range select from anchor (or focused) to id
      const targetAnchor =
        anchorId ||
        focusedTaskId ||
        (selectedTaskIds.length > 0 ? selectedTaskIds[selectedTaskIds.length - 1] : id);

      const startIdx = flattenedIds.indexOf(targetAnchor);
      const endIdx = flattenedIds.indexOf(id);

      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        setSelectedTaskIds(flattenedIds.slice(min, max + 1));
        return;
      }
    }

    // Non-range selection updates the anchor
    setAnchorId(id);

    if (multi) {
      // Toggle
      if (selectedTaskIds.includes(id)) {
        setSelectedTaskIds(selectedTaskIds.filter((sid) => sid !== id));
      } else {
        setSelectedTaskIds([...selectedTaskIds, id]);
      }
    } else {
      setSelectedTaskIds([id]);
    }
  };

  return { selectedTaskIds, handleSelectionChange };
}
