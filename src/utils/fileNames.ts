import { format } from 'date-fns';

/**
 * 保存ダイアログに渡す既定ファイル名。
 *
 * 保存先を記憶しない（毎回ピッカーを出す）ため、同名で上書きしやすいよう
 * 日時を入れておく。Excel 側の `excelExportFileName` と書式を揃えている。
 */
export function projectJsonFileName(now: Date = new Date()): string {
  return `wbs-project_${format(now, 'yyyyMMdd_HHmm')}.json`;
}

/** Excel 出力の既定ファイル名。 */
export function excelExportFileName(now: Date = new Date()): string {
  return `project_gantt_${format(now, 'yyyyMMdd_HHmmss')}.xlsx`;
}
