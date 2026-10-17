import { loadProjectState, useTaskStore } from '../store/useTaskStore';

/**
 * ipcRenderer 経由のファイル操作（保存・読込・Excel エクスポート）を提供するフック。
 * Zustand ストアから tasks / rootIds / projectConfig を直接取得するため、
 * 呼び出し元がこれらを props として渡す必要はない。
 */
export function useProjectFileHandlers() {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const projectConfig = useTaskStore((state) => state.projectConfig);

  const handleSave = async () => {
    const data = JSON.stringify({ tasks, rootIds, projectConfig }, null, 2);
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
      return;
    }

    const result = loadProjectState(parsed);
    if (!result.ok) {
      console.error('Failed to load project file', result.error);
      return;
    }

    if (result.warnings.length > 0) {
      console.warn('Project file loaded with repairs', result.warnings);
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
