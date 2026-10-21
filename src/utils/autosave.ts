import type { Milestone, ProjectConfig, Task } from '../types';
import { CURRENT_SCHEMA_VERSION } from './planActualMigration';

/**
 * 自動保存（localStorage）のためのプロジェクトスナップショット。
 *
 * 保存ファイル（JSON）と同じ形にして、`loadProjectState` にそのまま渡せるようにする。
 * 自動保存はブラウザ内の退避データであり、ユーザーが明示的に保存したファイルとは
 * 別物として扱う（保存に成功したら `dirty: false` で上書きする）。
 */
export interface ProjectSnapshot {
  schemaVersion: number;
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  milestones: Milestone[];
}

export interface AutosaveEnvelope {
  version: 1;
  /** 自動保存した日時（ISO 8601）。デバッグ・将来の UI 表示用。 */
  savedAt: string;
  /** 明示保存（JSON 保存 / 読込）以降に変更があるか。 */
  dirty: boolean;
  project: ProjectSnapshot;
}

export const AUTOSAVE_STORAGE_KEY = 'wbs-gantt-outliner:autosave:v1';

const AUTOSAVE_VERSION = 1;

/** ストアの状態から保存用スナップショットを作る（JSON 保存と自動保存で共通）。 */
export function serializeProject(state: {
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  milestones: Milestone[];
}): ProjectSnapshot {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tasks: state.tasks,
    rootIds: state.rootIds,
    projectConfig: state.projectConfig,
    milestones: state.milestones,
  };
}

/** localStorage が使えない環境（SSR・プライベートモード等）では null。 */
function defaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is AutosaveEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AutosaveEnvelope>;
  return (
    candidate.version === AUTOSAVE_VERSION &&
    typeof candidate.dirty === 'boolean' &&
    typeof candidate.savedAt === 'string' &&
    typeof candidate.project === 'object' &&
    candidate.project !== null
  );
}

/**
 * 自動保存を書き込む。成功したら true。
 *
 * 容量不足（QuotaExceededError）などは例外を投げず false を返す。呼び出し側は
 * 一度だけ警告を出す、といった扱いができる。
 */
export function writeAutosave(
  project: ProjectSnapshot,
  dirty: boolean,
  storage: Storage | null = defaultStorage()
): boolean {
  if (!storage) return false;

  const envelope: AutosaveEnvelope = {
    version: AUTOSAVE_VERSION,
    savedAt: new Date().toISOString(),
    dirty,
    project,
  };

  try {
    storage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (error) {
    console.warn('自動保存に失敗しました', error);
    return false;
  }
}

/**
 * 自動保存を読む。壊れたデータ・未知のバージョンは削除して null を返す
 * （壊れたデータで起動のたびに失敗し続けないようにする）。
 */
export function readAutosave(
  storage: Storage | null = defaultStorage()
): AutosaveEnvelope | null {
  if (!storage) return null;

  const raw = storage.getItem(AUTOSAVE_STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isEnvelope(parsed)) {
      storage.removeItem(AUTOSAVE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('自動保存データを読めなかったため破棄します', error);
    storage.removeItem(AUTOSAVE_STORAGE_KEY);
    return null;
  }
}

export function clearAutosave(storage: Storage | null = defaultStorage()): void {
  storage?.removeItem(AUTOSAVE_STORAGE_KEY);
}
