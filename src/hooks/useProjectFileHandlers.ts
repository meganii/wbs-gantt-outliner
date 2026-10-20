import { loadProjectState, useTaskStore } from '../store/useTaskStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { CURRENT_SCHEMA_VERSION } from '../utils/planActualMigration';

/**
 * ipcRenderer 経由のファイル操作（保存・読込・Excel エクスポート）を提供するフック。
 * Zustand ストアから tasks / rootIds / projectConfig を直接取得するため、
 * 呼び出し元がこれらを props として渡す必要はない。
 */
export function useProjectFileHandlers() {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const milestones = useTaskStore((state) => state.milestones);
  const notify = useNotificationStore((state) => state.notify);

  const handleSave = async () => {
    // schemaVersion を書き忘れると、次回読込時に旧形式（v1）として
    // 移行処理が走ってしまうため、保存時に現行バージョンを明示する。
    const data = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tasks,
      rootIds,
      projectConfig,
      milestones,
    }, null, 2);
    await window.ipcRenderer.invoke('save-file', data);
  };

  const handleLoad = async () => {
    const content = await window.ipcRenderer.invoke('load-file');
    if (typeof content !== 'string' || !content) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse project file', e);
      notify({
        level: 'error',
        message: '読み込みに失敗しました: JSON を解析できませんでした',
      });
      return;
    }

    const result = loadProjectState(parsed);
    if (!result.ok) {
      console.error('Failed to load project file', result.error);
      notify({
        level: 'error',
        message: `読み込みに失敗しました: ${result.error}`,
      });
      return;
    }

    if (result.warnings.length > 0) {
      console.warn('Project file loaded with repairs', result.warnings);
      notify({
        level: 'warning',
        message: `読み込みました（警告 ${result.warnings.length} 件）`,
        details: result.warnings,
      });
    } else {
      notify({ level: 'info', message: 'プロジェクトを読み込みました' });
    }
  };

  const handleExport = async () => {
    await window.ipcRenderer.invoke('export-excel', {
      tasks,
      rootIds,
      projectConfig,
    });
  };

  return { handleSave, handleLoad, handleExport };
}
