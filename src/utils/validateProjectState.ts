import type { ProjectConfig, Task } from '../types';
import { parseIsoDateStrict } from './date';
import { mergeProjectConfig } from './projectConfig';
import { hasDependencyPath } from '../store/taskStoreUtils';
import { CURRENT_SCHEMA_VERSION, migrateTaskToV3 } from './planActualMigration';

export interface ProjectStateValidationSuccess {
  ok: true;
  tasks: Record<string, Task>;
  rootIds: string[];
  projectConfig: ProjectConfig;
  /** 修復した内容の要約（日本語）。空なら問題なし。 */
  warnings: string[];
}

export interface ProjectStateValidationFailure {
  ok: false;
  /** どうしても読み込めない理由（日本語）。 */
  error: string;
}

export type ProjectStateValidationResult =
  | ProjectStateValidationSuccess
  | ProjectStateValidationFailure;

const DATE_FIELDS = [
  'startDate',
  'endDate',
  'baselineStartDate',
  'baselineEndDate',
  'previousBaselineStartDate',
  'previousBaselineEndDate',
] as const;

interface RepairCounts {
  droppedTasks: number;
  invalidListFields: number;
  invalidDates: number;
  invalidNumbers: number;
  invalidStrings: number;
  invalidBooleans: number;
  removedMissingRefs: number;
  removedSelfRefs: number;
  removedDuplicateRefs: number;
  multiParent: number;
  childCycles: number;
  dependencyCycles: number;
  inconsistentParent: number;
  invalidRootIds: number;
}

function createCounts(): RepairCounts {
  return {
    droppedTasks: 0,
    invalidListFields: 0,
    invalidDates: 0,
    invalidNumbers: 0,
    invalidStrings: 0,
    invalidBooleans: 0,
    removedMissingRefs: 0,
    removedSelfRefs: 0,
    removedDuplicateRefs: 0,
    multiParent: 0,
    childCycles: 0,
    dependencyCycles: 0,
    inconsistentParent: 0,
    invalidRootIds: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 数値または数値文字列を有限数に変換する。変換できなければ null。 */
function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * 1 タスクを安全な形へ正規化する。修復不能（オブジェクトでない / id が無い）なら null。
 * 参照（children / dependencies）の中身は呼び出し側で検証する。
 */
function sanitizeTask(raw: unknown, counts: RepairCounts): Task | null {
  if (!isRecord(raw)) {
    counts.droppedTasks += 1;
    return null;
  }

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    counts.droppedTasks += 1;
    return null;
  }

  const task: Task = {
    id,
    parentId: null,
    title: '',
    startDate: null,
    endDate: null,
    duration: 1,
    progress: 0,
    isCollapsed: false,
    children: [],
    dependencies: [],
    baselineStartDate: null,
    baselineEndDate: null,
    previousBaselineStartDate: null,
    previousBaselineEndDate: null,
  };

  if (typeof raw.title === 'string') {
    task.title = raw.title;
  } else if (raw.title !== undefined && raw.title !== null) {
    counts.invalidStrings += 1;
  }

  if (typeof raw.description === 'string') task.description = raw.description;
  else if (raw.description != null) counts.invalidStrings += 1;

  if (typeof raw.assignee === 'string') task.assignee = raw.assignee;
  else if (raw.assignee != null) counts.invalidStrings += 1;

  if (typeof raw.deliverables === 'string') task.deliverables = raw.deliverables;
  else if (raw.deliverables != null) counts.invalidStrings += 1;

  if (typeof raw.status === 'string') task.status = raw.status;
  else if (raw.status != null) counts.invalidStrings += 1;

  DATE_FIELDS.forEach((field) => {
    const value = raw[field];
    if (value === undefined || value === null) return;
    const parsed = parseIsoDateStrict(value);
    if (parsed === null) {
      counts.invalidDates += 1;
      return;
    }
    task[field] = parsed;
  });

  if (raw.duration !== undefined && raw.duration !== null) {
    const parsed = coerceFiniteNumber(raw.duration);
    if (parsed === null) counts.invalidNumbers += 1;
    else task.duration = Math.max(0, parsed);
  }

  if (raw.progress !== undefined && raw.progress !== null) {
    const parsed = coerceFiniteNumber(raw.progress);
    if (parsed === null) counts.invalidNumbers += 1;
    else task.progress = clampProgress(parsed);
  }

  (['baselineDuration', 'previousBaselineDuration'] as const).forEach((field) => {
    const value = raw[field];
    if (value === undefined || value === null) return;
    const parsed = coerceFiniteNumber(value);
    if (parsed === null) counts.invalidNumbers += 1;
    else task[field] = Math.max(0, parsed);
  });

  if (typeof raw.isCollapsed === 'boolean') {
    task.isCollapsed = raw.isCollapsed;
  } else if (raw.isCollapsed !== undefined && raw.isCollapsed !== null) {
    counts.invalidBooleans += 1;
  }

  if (Array.isArray(raw.children)) {
    task.children = raw.children.filter((value): value is string => typeof value === 'string');
  } else {
    counts.invalidListFields += 1;
  }

  if (Array.isArray(raw.dependencies)) {
    task.dependencies = raw.dependencies.filter((value): value is string => typeof value === 'string');
  } else {
    counts.invalidListFields += 1;
  }

  return task;
}

/**
 * IPC（ファイル読み込み）から渡された未知の値を検証・正規化する。
 *
 * 方針: 直せる異常値はすべて修復して読み込み、修復内容を warnings に要約する。
 * どうしても読めない場合（オブジェクトでない / tasks が不正 / 有効なタスクが 0 件）
 * だけ ok:false を返し、呼び出し側はストアを変更しない。
 */
export function validateProjectState(input: unknown): ProjectStateValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'ファイルの形式が不正です（オブジェクトではありません）' };
  }

  const rawTasks = input.tasks;
  if (!isRecord(rawTasks)) {
    return { ok: false, error: 'タスクの集合(tasks)が見つかりません' };
  }

  const counts = createCounts();
  const warnings: string[] = [];

  // 1. 各タスクを正規化する（id 基準で引き直す）
  const sanitized: Record<string, Task> = {};
  const rawParentById = new Map<string, string | null>();
  // 旧形式（v1 / v2）の予定（`plan*`）は Task に含まれないため、移行用に別途控える。
  const rawPlanById = new Map<string, { start: string | null; end: string | null }>();
  Object.values(rawTasks).forEach((raw) => {
    const task = sanitizeTask(raw, counts);
    if (!task) return;
    if (sanitized[task.id]) {
      counts.droppedTasks += 1;
      return;
    }
    sanitized[task.id] = task;
    const record = isRecord(raw) ? raw : null;
    rawParentById.set(
      task.id,
      record && typeof record.parentId === 'string' ? record.parentId : null
    );
    rawPlanById.set(task.id, {
      start: parseIsoDateStrict(record?.planStartDate),
      end: parseIsoDateStrict(record?.planEndDate),
    });
  });

  if (Object.keys(rawTasks).length > 0 && Object.keys(sanitized).length === 0) {
    return { ok: false, error: '読み込み可能なタスクが 1 件もありませんでした' };
  }

  // 2. projectConfig（型違いは mergeProjectConfig が既定値へ補正する）
  const projectConfig = mergeProjectConfig(input.projectConfig, warnings);
  const rawProjectConfig = isRecord(input.projectConfig) ? input.projectConfig : null;

  // 3. 旧形式を 2 層モデル（基準計画 + 現在の日程 + 進捗率）へ移行する。
  //    - v1（バージョンなし）: `plan*` ⇄ `startDate`/`endDate` の双方向同期 + 基準計画固定
  //    - v2: 3 層モデル（基準計画 / 予定 `plan*` / 実績 `startDate`/`endDate`）
  const schemaVersion = typeof input.schemaVersion === 'number' ? input.schemaVersion : 1;
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    const legacyBaselineLocked = rawProjectConfig?.baselineLocked === true;
    const ids = Object.keys(sanitized);
    ids.forEach((id) => {
      const plan = rawPlanById.get(id) ?? { start: null, end: null };
      sanitized[id] = migrateTaskToV3(sanitized[id], {
        schemaVersion,
        baselineLocked: legacyBaselineLocked,
        planStartDate: plan.start,
        planEndDate: plan.end,
        calendar: projectConfig.calendar,
      });
    });
    if (ids.length > 0) {
      warnings.push(
        `旧形式のデータ ${ids.length} 件を新しい予定/実績モデル（基準計画 + 現在の日程 + 進捗率）へ移行しました`
      );
    }
    if (legacyBaselineLocked) {
      warnings.push('「基準計画固定」で凍結していた予定を基準計画として引き継ぎました');
    }
  }

  const taskIds = new Set(Object.keys(sanitized));

  // 4. children / dependencies の参照を掃除する（存在しない・自己・重複を除去）
  const cleanRefs = (refs: string[], selfId: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    refs.forEach((refId) => {
      if (!taskIds.has(refId)) {
        counts.removedMissingRefs += 1;
        return;
      }
      if (refId === selfId) {
        counts.removedSelfRefs += 1;
        return;
      }
      if (seen.has(refId)) {
        counts.removedDuplicateRefs += 1;
        return;
      }
      seen.add(refId);
      result.push(refId);
    });
    return result;
  };

  Object.values(sanitized).forEach((task) => {
    sanitized[task.id] = {
      ...task,
      children: cleanRefs(task.children, task.id),
      dependencies: cleanRefs(task.dependencies, task.id),
    };
  });

  // 5. 親子関係を再構築する。
  //    - 1 つの子は 1 つの親だけを持つ（多重参照は先着優先で除去）
  //    - 親の祖先に子がいる場合は循環なので辺を落とす
  //    これにより children グラフは必ず森（閉路なし・単一親）になる。
  const parentOf = new Map<string, string>();
  Object.values(sanitized).forEach((task) => {
    const kept: string[] = [];
    task.children.forEach((childId) => {
      if (parentOf.has(childId)) {
        counts.multiParent += 1;
        return;
      }

      let cursor: string | undefined = task.id;
      while (cursor !== undefined) {
        if (cursor === childId) {
          counts.childCycles += 1;
          return;
        }
        cursor = parentOf.get(cursor);
      }

      parentOf.set(childId, task.id);
      kept.push(childId);
    });
    sanitized[task.id] = { ...sanitized[task.id], children: kept };
  });

  // 6. 依存関係の循環を切る（先着優先で辺を採用し、循環を作る辺は捨てる）
  const accepted: Record<string, Task> = {};
  Object.values(sanitized).forEach((task) => {
    accepted[task.id] = { ...task, dependencies: [] };
  });
  Object.values(sanitized).forEach((task) => {
    const kept: string[] = [];
    task.dependencies.forEach((depId) => {
      accepted[task.id] = { ...accepted[task.id], dependencies: [...kept, depId] };
      if (hasDependencyPath(accepted, depId, task.id)) {
        counts.dependencyCycles += 1;
        accepted[task.id] = { ...accepted[task.id], dependencies: kept };
        return;
      }
      kept.push(depId);
    });
    accepted[task.id] = { ...accepted[task.id], dependencies: kept };
  });

  // 7. 親リンクと並び順（rootIds）を確定する
  const tasks: Record<string, Task> = {};
  Object.values(accepted).forEach((task) => {
    tasks[task.id] = { ...task, parentId: parentOf.get(task.id) ?? null };
    const rawParent = rawParentById.get(task.id) ?? null;
    if ((parentOf.get(task.id) ?? null) !== rawParent) {
      counts.inconsistentParent += 1;
    }
  });

  const inputRootIds = Array.isArray(input.rootIds)
    ? input.rootIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (input.rootIds !== undefined && !Array.isArray(input.rootIds)) {
    counts.invalidRootIds += 1;
  }

  const orderedRootIds: string[] = [];
  const seenRoots = new Set<string>();
  const pushRoot = (id: string) => {
    if (parentOf.has(id) || !tasks[id] || seenRoots.has(id)) return;
    seenRoots.add(id);
    orderedRootIds.push(id);
  };
  inputRootIds.forEach(pushRoot);
  Object.keys(tasks).forEach(pushRoot);

  appendRepairWarnings(warnings, counts);

  return {
    ok: true,
    tasks,
    rootIds: orderedRootIds,
    projectConfig,
    warnings,
  };
}

function appendRepairWarnings(warnings: string[], counts: RepairCounts): void {
  if (counts.droppedTasks > 0) {
    warnings.push(`ID が無い・重複したタスク ${counts.droppedTasks} 件を除外しました`);
  }
  if (counts.invalidListFields > 0) {
    warnings.push(`子/依存リストが配列でない項目 ${counts.invalidListFields} 件を空にしました`);
  }
  if (counts.invalidDates > 0) {
    warnings.push(`不正な日付 ${counts.invalidDates} 件を未設定にしました`);
  }
  if (counts.invalidNumbers > 0) {
    warnings.push(`不正な数値 ${counts.invalidNumbers} 件を既定値に修正しました`);
  }
  if (counts.invalidStrings > 0) {
    warnings.push(`不正な文字列 ${counts.invalidStrings} 件を既定値に修正しました`);
  }
  if (counts.invalidBooleans > 0) {
    warnings.push(`不正な真偽値 ${counts.invalidBooleans} 件を既定値に修正しました`);
  }
  if (counts.removedMissingRefs > 0) {
    warnings.push(`存在しないタスクを参照する項目 ${counts.removedMissingRefs} 件を削除しました`);
  }
  if (counts.removedSelfRefs > 0) {
    warnings.push(`自己参照 ${counts.removedSelfRefs} 件を削除しました`);
  }
  if (counts.removedDuplicateRefs > 0) {
    warnings.push(`重複した参照 ${counts.removedDuplicateRefs} 件を削除しました`);
  }
  if (counts.multiParent > 0) {
    warnings.push(`複数の親から参照されていたタスク ${counts.multiParent} 件の親を 1 つに絞りました`);
  }
  if (counts.childCycles > 0) {
    warnings.push(`親子関係の循環 ${counts.childCycles} 件を切断しました`);
  }
  if (counts.dependencyCycles > 0) {
    warnings.push(`依存関係の循環 ${counts.dependencyCycles} 件を切断しました`);
  }
  if (counts.inconsistentParent > 0) {
    warnings.push(`親子関係の不整合 ${counts.inconsistentParent} 件を子リストから再構築しました`);
  }
  if (counts.invalidRootIds > 0) {
    warnings.push('rootIds が不正なため親子関係から並び順を再計算しました');
  }
}
