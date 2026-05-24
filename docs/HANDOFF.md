# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

- WBS 編集、ガント表示、依存関係、JSON 保存/読込、Excel エクスポートまで動作する
- キーボードショートカットの制御ロジックを `App.tsx` からカスタムフック `useKeyboardShortcuts` (`src/hooks/useKeyboardShortcuts.ts`) として外出しし、コンポーネント構成を軽量化
- ヘッダーの `Project` メニューからプロジェクト祝日を登録・削除でき、Day view のカレンダー背景に反映される
- Excel エクスポートの左端列に WBS 番号（1, 1.1, 1.2 等）を付与済み。旧 WBS 列は Task Name にリネーム
- エクスポート時は `flattenTreeAll` を使い、折りたたみ状態に関係なく全タスクを出力する
- 予定（Plan / ベースライン）と実績・見込（Actual / 実績・見込み日）の二重管理およびベースライン固定機能を実装完了
  - `types.ts` の `Task` に `planStartDate`, `planEndDate`, `planDuration` を追加。
  - `ProjectConfig` に `baselineLocked` フラグ、`columnWidths` に `planDuration`, `planDate` を追加。
  - ヘッダーツールバーに「Lock Baseline」チェックボックスを追加。ONのときはオレンジ色で強調表示。
  - **ベースライン固定が OFF のとき**：予定と実績は相互に自動同期（連動）するため、最初の計画フェーズでの二重入力の手間を防止。
  - **ベースライン固定が ON のとき**：予定データは完全にロックされ、WBSやガントでの操作が禁止される。ドラッグ＆ドロップや日付直接入力では、実績・見込（`startDate`等）のみが変更される。
  - 親タスクの予定算出ロジックを拡張し、実績と同様に子タスクの予定の最小開始・最大終了日から親タスクの予定日程が自動計算されて上位に再帰伝播する。
  - WBS (Outliner) 上に「予定期間（Plan Dur.）」「予定日付（Plan Date）」および「実績期間（Act. Dur.）」「実績日付（Act. Date）」を表示。固定時は予定列をグレーアウト（操作禁止）にする。
  - ガントチャートと統合ビュー（IntegratedView）で、予定バー（上部・青系・太）と実績バー（下部・アンバー系・細）を上下に並べて美しく描画。
  - 依存線の接続 Ref は、ベースライン固定時には自動的に実績バーに切り替わり、依存線は常に実績・見込の日程に正しく追従する。
- **Ganttビュー・統合ビュー（IntegratedView）の共通ロジック完全分離（重複の根絶）**:
  - `GanttChart.tsx` と `IntegratedView.tsx` の間にあった約 80% 以上の重複コード（タイムライン・カレンダー計算、ドラッグ＆ドロップ操作、SVG 依存関係線のパス計算）を 3 つの共通カスタムフック (`useGanttTimeline`, `useGanttDrag`, `useGanttDependencies`) へ完全抽出。
  - コンポーネント側からピクセル座標計算や window マウスイベント、DOM 矩形追従の `useLayoutEffect` が一掃され、コンポーネントコードが劇的に軽量化（約 50% 削減）され、描画レイアウト責務に専念する綺麗な設計へ改善。

## 直近の検証結果

- `pnpm test -- --run` : 通過 (72テスト全件無敗の100%合格) - リファクタリングによるデグレードが一切存在しないことを保証。
- `pnpm run build` : 通過 (TypeScript型検査および本番ビルド通過)
- `pnpm tsc -b --noEmit` : 型エラーおよび未使用変数/インポートの警告 0 件で完全通過。

## 次に着手する優先課題

1. **削除整合性の追加ケース確認と堅牢化**
   - 複数選択削除や、多段にわたる先行・後行（依存関係）が入り組んでいるタスクを一括削除した際の日付再計算・依存関係クリーンアップについて Vitest を追加し整合性を保証する。
2. **WBS 横方向キーナビゲーション（詳細列間の移動）の実装**
   - 左右矢印キー（または特定のキー）で、WBS の Title ➔ Description ➔ Assignee ➔ Deliverables ➔ Dates などの隣の列のセルへスムーズにフォーカスが横移動できる仕組みを `useTaskCellKeyboard` に実装する。
3. **祝日変更時のスケジュール自動再計算方針の整理と実装**
   - 現在は祝日設定を変更しても既存タスクの日付は自動シフトしない。祝日が追加/削除された際、タスクの「稼働日数（Duration）」を維持したまま日付範囲を自動スライドするオプションをストアに実装する。
4. **Zustand ストアのツリー操作ロジックのさらなる分離**
   - `useTaskStore.ts` に残っているタスクのインデント (`indentTask`)、アウトデント (`outdentTask`)、ドラッグ並び替え (`reorderTask`) などのツリー構造変形ロジックを `src/store/taskStoreUtils.ts` に排出し、ストアファイルをスリム化する。
5. **ガント操作の E2E/UI 統合テストの補強**
   - ドラッグ移動、リサイズ、依存線追加の UI マウスジェスチャーが正しくストアの日付計算と連動しているかのテストを補強する。

## 注意点

- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと。
- `useGanttDrag` の中で `updateTask` や `addDependency` を直接叩いており、コンポーネントからの依存を最小限に抑えています。
- 祝日変更時、既存タスク日付の自動再計算はまだ行わない。必要なら仕様を決めてから入れること。
- Excel エクスポートは Electron main 側で生成・保存する構成を維持する。

## 次の作業で最初に見るとよい場所

- `src/hooks/useGanttTimeline.ts`
- `src/hooks/useGanttDrag.ts`
- `src/hooks/useGanttDependencies.ts`
- `src/components/GanttChart.tsx`
- `src/components/IntegratedView.tsx`

---

## 履歴 (History)

### Gantt & Integrated View Hooks Extraction (May 24, 2026)
- **タイムライン、ドラッグ、依存線パス計算ロジックの抽出**:
  - `useGanttTimeline.ts`, `useGanttDrag.ts`, `useGanttDependencies.ts` を新規作成し、`GanttChart.tsx` と `IntegratedView.tsx` に適用。
  - 重複コードを一掃し、各コンポーネントを 40〜60% スリム化。
  - 静的型コンパイル (`pnpm tsc -b`) および Vitest 全 72 件のテストが 100% 合格することを確認済み。

### WBS Cell Component Refactoring (May 24, 2026)
- **TaskRow.tsx のセル単位へのコンポーネント分割**:
  - `src/components/cells/` 配下に、個別の入力セル (`TaskOutlineCell`, `TaskTextCell` 等 8つ) を作成。
  - 宣言的フォーカス制御へ移行し、`GanttChart` サイドバーでの `TaskOutlineCell` の再利用を完了。

### Refactoring TaskRow - Step 1, 2, 3 Completed (May 24, 2026)
- 日付計算ロジックのストア完全移行、ローカル入力状態フック抽出、キーボードナビゲーションフック抽出を完了。
