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
    if (content) {
      try {
        const data = JSON.parse(content);
        loadProjectState(data);
      } catch (e) {
        console.error('Failed to parse project file', e);
      }
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
