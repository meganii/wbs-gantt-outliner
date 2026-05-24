import { useEffect } from 'react';

type View = 'wbs' | 'integrated' | 'gantt';

/**
 * Electron の IPC チャンネル `switch-view` を購読し、
 * 受信した viewName に応じて setView を呼び出す。
 * 非 Electron 環境（テスト等）では何もしない。
 */
export function useIpcSwitchView(setView: (view: View) => void): void {
  useEffect(() => {
    if (!window.ipcRenderer) return;

    const unsubscribe = window.ipcRenderer.on(
      'switch-view',
      (_event: unknown, viewName: unknown) => {
        if (viewName === 'wbs' || viewName === 'integrated' || viewName === 'gantt') {
          setView(viewName);
        }
      }
    );
    return unsubscribe;
  }, [setView]);
}
