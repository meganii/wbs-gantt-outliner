import type { ColumnId } from '../types';

/**
 * 列定義の共有メタデータ。列ヘッダー（TaskTableHeader）と
 * 表示項目メニュー（ColumnVisibilityMenu）の両方から参照する。
 *
 * 2 層モデルでは日付は 1 系統（開始日 / 終了日）だけを持つため、
 * 予定・実績で列を分けない。
 */
export const COLUMN_LABELS: { id: ColumnId; label: string }[] = [
  { id: 'taskName', label: '項目名' },
  { id: 'description', label: '説明' },
  { id: 'assignee', label: '担当者' },
  { id: 'deliverables', label: '成果物' },
  { id: 'status', label: '状態' },
  { id: 'progress', label: '進捗率' },
  { id: 'duration', label: '期間' },
  { id: 'date', label: '開始日 / 終了日' },
];

/** 表示順を規定する正規の列順序。 */
export const COLUMN_ORDER: ColumnId[] = COLUMN_LABELS.map((c) => c.id);

/** 列 ID → ラベル のルックアップ。 */
export const COLUMN_LABEL = Object.fromEntries(
  COLUMN_LABELS.map(({ id, label }) => [id, label])
) as Record<ColumnId, string>;

/** ヘッダーで中央寄せする列。 */
export const CENTERED_COLUMNS: ColumnId[] = [
  'status',
  'progress',
  'duration',
  'date',
];
