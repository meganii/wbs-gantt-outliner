import { useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';

/**
 * 未保存の変更があるとき、リロード・タブ終了時に確認ダイアログを出す。
 *
 * ブラウザ標準の `beforeunload` を使う。表示文言はブラウザが固定するため
 * カスタマイズできない（Chrome / Edge は「変更内容が保存されていない可能性があります」）。
 * キー入力（Cmd/Ctrl+R）の抑止はブラウザ側の制約が強く、確実ではないため行わない。
 *
 * 自動保存（`useAutosave`）と併用しているので、ダイアログを閉じてリロードしても
 * 直近の編集内容は復元される。
 */
export function useBeforeUnloadWarning(): void {
  const dirty = useSessionStore((state) => state.dirty);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 旧ブラウザ向け。Chrome では空文字以外を設定するとダイアログが出る。
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
