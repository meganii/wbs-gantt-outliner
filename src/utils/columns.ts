import type { ColumnId } from '../types';

/**
 * 列定義の共有メタデータ。列ヘッダー（TaskTableHeader）と
 * 表示項目メニュー（ColumnVisibilityMenu）の両方から参照する。
 */
export const COLUMN_LABELS: { id: ColumnId; label: string }[] = [
  { id: 'taskName', label: 'タスク名' },
  { id: 'description', label: '説明' },
  { id: 'assignee', label: '担当者' },
  { id: 'deliverables', label: '成果物' },
  { id: 'status', label: 'ステータス' },
  { id: 'progress', label: '進捗率' },
  { id: 'planDuration', label: '予定期間' },
  { id: 'planDate', label: '予定日付' },
  { id: 'duration', label: '実績期間' },
  { id: 'date', label: '実績日付' },
];

/** 表示順を規定する正規の列順序。 */
export const COLUMN_ORDER: ColumnId[] = COLUMN_LABELS.map((c) => c.id);

/** 列 ID → ラベル のルックアップ。 */
export const COLUMN_LABEL = Object.fromEntries(
  COLUMN_LABELS.map(({ id, label }) => [id, label])
) as Record<ColumnId, string>;

/** 予定（ベースライン）系の列。 */
export const PLAN_COLUMNS: ColumnId[] = ['planDuration', 'planDate'];

/** 実績系の列。 */
export const ACTUAL_COLUMNS: ColumnId[] = ['duration', 'date'];

/** ヘッダーで中央寄せする列。 */
export const CENTERED_COLUMNS: ColumnId[] = [
  'status',
  'progress',
  'planDuration',
  'planDate',
  'duration',
  'date',
];
