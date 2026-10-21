import { useLayoutEffect, useRef } from 'react';
import { loadProjectState } from '../store/useTaskStore';
import { useSessionStore } from '../store/useSessionStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { clearAutosave, readAutosave } from '../utils/autosave';

/**
 * 前回のセッションの自動保存を復元する。
 *
 * `useLayoutEffect` で描画前に適用するため、既定の初期プロジェクトが一瞬見える
 * ことはない。StrictMode の二重実行は ref で抑止する。
 *
 * 復元したデータは「保存済みファイル」ではないので、`dirty` は自動保存時の値を
 * 引き継ぐ（未保存ならリロード時に再び警告が出る）。
 */
export function useAutosaveRestore(): void {
  const attempted = useRef(false);
  const notify = useNotificationStore((state) => state.notify);

  useLayoutEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const envelope = readAutosave();
    if (!envelope) return;

    const result = loadProjectState(envelope.project);
    if (!result.ok) {
      // スキーマ変更などで読めない自動保存は破棄する（毎回の起動で失敗しないように）。
      console.warn('自動保存を復元できませんでした', result.error);
      clearAutosave();
      return;
    }

    useSessionStore.getState().setDirty(envelope.dirty);
    notify({
      level: 'info',
      message: '前回の編集内容を復元しました',
      details: envelope.dirty ? ['保存していない変更が含まれます。必要なら「保存」してください。'] : undefined,
    });
  }, [notify]);
}
