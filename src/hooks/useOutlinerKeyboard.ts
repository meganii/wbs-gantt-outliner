import { useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';

/**
 * Outliner 専用キーボードハンドラ。
 * - Escape: 選択解除
 * - Enter (空リスト時): 最初のタスクを作成
 *
 * rootIds.length は ref で追跡し、リスナーの再登録なしに常に最新値を参照する。
 * addTask / setSelectedTaskIds は Zustand の安定参照のため依存配列不要。
 */
export function useOutlinerKeyboard() {
  const rootIds = useTaskStore((state) => state.rootIds);
  const addTask = useTaskStore((state) => state.addTask);
  const setSelectedTaskIds = useTaskStore((state) => state.setSelectedTaskIds);

  // クロージャを作り直さずに最新の rootIds.length を参照するための ref
  const rootIdsLengthRef = useRef(rootIds.length);
  useEffect(() => {
    rootIdsLengthRef.current = rootIds.length;
  }, [rootIds.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      if (e.key === 'Escape') {
        setSelectedTaskIds([]);
        return;
      }

      // Create first task when empty and Enter is pressed
      if (rootIdsLengthRef.current === 0 && e.key === 'Enter') {
        e.preventDefault();
        addTask(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // リスナーはマウント時に1度だけ登録し、以降は再登録しない
}
