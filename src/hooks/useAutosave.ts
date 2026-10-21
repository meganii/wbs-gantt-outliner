import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useSessionStore } from '../store/useSessionStore';
import { serializeProject, writeAutosave } from '../utils/autosave';

/** 編集が止まってから自動保存するまでの待ち時間。 */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * プロジェクトの変更を localStorage に自動保存する。
 *
 * 明示保存（ファイル）とは別の退避データで、リロード時の復元に使う。
 * 入力中に毎キーストローク書かないようデバウンスし、`pagehide` /
 * タブ非表示時には即時フラッシュして取りこぼしを防ぐ。
 *
 * 変更の検知は「保存対象スライス（tasks / rootIds / projectConfig / milestones）の
 * 参照が変わったか」で行う。各アクションは変更時に新しい参照を作るため、
 * フォーカスや選択状態の変化（保存対象外）では発火しない。
 */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;

    const flush = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      // 未保存の変更が無ければ書かない（起動直後の初期プロジェクトを
      // 毎回自動保存してしまい、次回「復元しました」と出るのを防ぐ）。
      // 保存・読込の直後は、それぞれの処理が dirty=false で書き直している。
      if (!useSessionStore.getState().dirty) return;

      const { tasks, rootIds, projectConfig, milestones } = useTaskStore.getState();
      const ok = writeAutosave(
        serializeProject({ tasks, rootIds, projectConfig, milestones }),
        useSessionStore.getState().dirty
      );
      if (!ok && !warned) {
        warned = true;
        console.warn('自動保存を書き込めませんでした（localStorage の容量不足など）');
      }
    };

    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    };

    const unsubscribe = useTaskStore.subscribe((state, previous) => {
      if (
        state.tasks === previous.tasks &&
        state.rootIds === previous.rootIds &&
        state.projectConfig === previous.projectConfig &&
        state.milestones === previous.milestones
      ) {
        return;
      }
      useSessionStore.getState().setDirty(true);
      schedule();
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);
}
