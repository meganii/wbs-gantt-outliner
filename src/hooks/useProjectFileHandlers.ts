import { loadProjectState, useTaskStore } from '../store/useTaskStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { useSessionStore } from '../store/useSessionStore';
import { excelExportFileName, projectJsonFileName } from '../utils/fileNames';
import { serializeProject, writeAutosave } from '../utils/autosave';
import {
  browserFileIO,
  EXCEL_KIND,
  PROJECT_JSON_KIND,
  type FileIO,
} from '../platform/fileIO';

/**
 * 現在のストア内容を「保存済み」として自動保存へ書き戻す。
 *
 * 明示保存の直後にリロードしても未保存扱いにならないよう、`dirty` も更新する。
 */
function persistAutosave(dirty: boolean): void {
  const { tasks, rootIds, projectConfig, milestones } = useTaskStore.getState();
  writeAutosave(serializeProject({ tasks, rootIds, projectConfig, milestones }), dirty);
}

/**
 * ファイル操作（保存・読込・Excel エクスポート）を提供するフック。
 *
 * 実際の I/O は `FileIO` に委譲する。既定はブラウザ実装
 * （File System Access API / ダウンロード）。テストでは差し替える。
 *
 * Zustand ストアから tasks / rootIds / projectConfig を直接取得するため、
 * 呼び出し元がこれらを props として渡す必要はない。
 */
export function useProjectFileHandlers(io: FileIO = browserFileIO) {
  const tasks = useTaskStore((state) => state.tasks);
  const rootIds = useTaskStore((state) => state.rootIds);
  const projectConfig = useTaskStore((state) => state.projectConfig);
  const milestones = useTaskStore((state) => state.milestones);
  const notify = useNotificationStore((state) => state.notify);

  const handleSave = async () => {
    // schemaVersion を書き忘れると、次回読込時に旧形式（v1）として
    // 移行処理が走ってしまうため、保存時に現行バージョンを明示する。
    const data = JSON.stringify(
      serializeProject({ tasks, rootIds, projectConfig, milestones }),
      null,
      2
    );

    try {
      const outcome = await io.saveText(projectJsonFileName(), data, PROJECT_JSON_KIND);
      if (outcome !== 'saved') {
        // キャンセル時は未保存のまま（beforeunload の警告も維持する）。
        return;
      }
      useSessionStore.getState().setDirty(false);
      persistAutosave(false);
    } catch (error) {
      console.error('Failed to save project file', error);
      notify({
        level: 'error',
        message: '保存に失敗しました',
        details: [error instanceof Error ? error.message : String(error)],
      });
    }
  };

  const handleLoad = async () => {
    const content = await io.openText(PROJECT_JSON_KIND);
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

    // 読み込んだ内容はファイルと一致しているので未保存扱いにしない。
    useSessionStore.getState().setDirty(false);
    persistAutosave(false);

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
    const payload = { tasks, rootIds, projectConfig };
    // ExcelJS は大きい（約 1.4MB）ため、出力を押したときだけ読み込む。
    const build = async () => {
      const { buildExcelExportBuffer } = await import('../utils/export');
      return buildExcelExportBuffer(payload);
    };

    try {
      // ファイル名はピッカーに渡すため、重い生成より先に決めておく。
      await io.saveBinary(excelExportFileName(), EXCEL_KIND, build);
    } catch (error) {
      console.error('Failed to export Excel', error);
      notify({
        level: 'error',
        message: 'Excel 出力に失敗しました',
        details: [error instanceof Error ? error.message : String(error)],
      });
    }
  };

  return { handleSave, handleLoad, handleExport };
}
