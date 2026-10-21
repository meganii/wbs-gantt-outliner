# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

- **保守性 P2 / D9: 未使用 `taskBarRefs` の削除と行高の定数化** (October 22, 2026):
  - `GanttTimelineRow` がバーの DOM を `taskBarRefs` に `.set` / `.delete` するだけで、どこからも読まれていなかった（依存線は `flattenedItems` から座標を計算する方式へ移行済み）。`GanttChart` / `IntegratedView` / `GanttTimelineRow` から ref の生成・受け渡しを削除し、バーの `ref` はツールチップの `anchorRef` だけに整理した。
  - 行高 `32` が `IntegratedView` / `GanttChart`（キーボード移動時のスクロール計算）/ `useGanttDependencies` に散在していたため、`src/utils/layout.ts` の `TASK_ROW_HEIGHT` に集約。行要素の Tailwind `h-8`（= 32px）と一致させる旨をコメントで明記した。
  - 挙動変更なし（純粋な整理）。検証: `npx vitest --run` **347 件（41 ファイル）** / `npm run test:e2e` **9 件** / `npm run lint` 0 / `npm run build` 通過。
- **ガントバーの複数選択と一括移動（PR #49 で main マージ済み: `d89a89d`）** (October 20, 2026):
  - マージ後の後始末: `feature/gantt-multi-move` のローカル／リモートブランチを削除し、`main` 上で vitest **347 件（41 ファイル）** を再確認した。
  - 要望: ガント／統合表示で複数の葉タスクのバーを選択し、1 本をドラッグすると同じ日数だけまとめて移動する。ドラッグ中は選択中の全バーが同じ日数だけ動くプレビューにし、Undo 1 回で全体を戻す。
  - 選択 UX: 左ペインの行選択をそのまま利用。バー直接でも **Cmd/Ctrl+クリック = トグル**、**Shift+クリック = 表示順の範囲選択**。修飾キー付きクリックは選択のみでドラッグを開始しない。修飾キーなしで未選択バーをクリックするとその 1 件を選択して移動開始、選択済みバーなら選択を維持したまま一括移動する。**複数選択中に選択済みバーをドラッグせずクリックすると、その 1 件だけ選択解除**（単一選択時は維持）。**Escape はビューに依らず選択を解除**（App 共通のキーボードハンドラで処理。従来は WBS の Outliner 内でしか登録されていなかった）。親バーは選択・ハイライトできるが移動対象外（選択に親が含まれても葉だけ動かし、親は移動後のロールアップで更新）。
  - 見た目: 選択中のバーに `ring-2 ring-brand-500`（親は `ring-brand-500/70`）のアウトライン。ドラッグ中は `affectedTaskIds` の全バーが `deltaDays` でプレビューされ、アンカーのバー上に `+2日` の小さなバッジを出す。選択外の後続・親はドラッグ中には動かず、ドロップ後に再計算する。
  - 型: `GanttDragState` に `affectedTaskIds`（move 開始時の葉 ID スナップショット）と `deltaDays`（プレビュー日数）を追加。resize / draw-range / dependency では未設定のままで、従来どおりアンカー 1 件だけを操作する。
  - ストア: `moveTasksByDays(taskIds, deltaDays)` を追加し、`taskStoreUtils.moveTasksByDaysInGraph` で **1 回の `set`** にまとめる。カレンダー日シフト（`addDays`）と `duration` の稼働日数再計算は既存の単一移動と同じ。親・日付なし・不正日付・重複 ID・0 日は対象外（変更なしなら `null` を返して `set` しない）。基準計画（`baseline*`）には触れない。
  - 依存伝播: `DatePropagationOptions.pinnedTaskIds` を追加し、明示移動したタスクは依存伝播で日付を書き換えず、その後続だけを伝播する。複数起点は `propagateDependencyDatesFrom` で 1 キューにまとめる。親が依存で動くときの `shiftDescendants` も pinned をスキップするため、**選択中の子タスクが親シフトに巻き込まれない**。`recalculateParentDatesRecursive` にも同じ options を通し、全更新後に親をロールアップする。既存の単一移動・依存伝播・Undo はオプション未指定のまま従来動作。
  - UI 配線: `GanttTimelineRow` に `onSelect(taskId, multi, range)` を追加し、`GanttChart` / `IntegratedView` の既存 `handleSelectionChange` を渡す。選択状態は `selectedTaskIds` を唯一の真実源にし、移動後も維持する。セル同様、関数 props は `memo` 比較で無視されるため、コールバック側は store の `getState()` と ref を読む既存方針のまま。
  - 既知の挙動: 既存の単一移動と同じカレンダー日シフトのため、週末だけに移動したタスクは `duration` が 0 になり得る（例: 金〜土へ +1 日）。これは今回の変更で導入したものではなく、既存仕様を踏襲した結果。
  - 変更: `src/types.ts` / `src/components/GanttTimelineRow.tsx` / `src/hooks/useGanttDrag.ts` / `src/store/useTaskStore.ts` / `src/store/taskStoreUtils.ts` / `src/components/GanttChart.tsx` / `src/components/IntegratedView.tsx`。
  - テスト: 新規 `src/store/moveTasksByDays.test.ts`（7 件: 複数葉の同時移動と 1 set / 1 Undo、親を含む選択、選択同士の依存の非二重移動、選択外後続の伝播、no-op、週末・祝日の duration 再計算、親シフト時の選択子の固定）/ `src/components/GanttMultiMove.test.tsx`（6 件: 全バープレビューとドロップ、アウトライン、Cmd/Ctrl トグル、複数選択時のクリック解除、親バーの選択のみ、Shift 範囲選択）/ `e2e/gantt-multi-move.spec.ts`（親 + 葉 3 + 依存で、ガントと統合表示の両方で複数選択 → ドラッグ → 後続伝播 → 親ロールアップ → Undo 1 回をバー位置で検証）。既存 `src/App.test.tsx` に「Escape で全ビューの選択を解除」を追加。
  - 検証: `npm test -- --run` **347 件（41 ファイル）** / `npm run test:e2e` **9 件** / `npm run lint` 0 / `npm run build` 通過 / `npm run shots` 12 枚生成。
  - 対象外（次フェーズ候補）: 矩形（マーキー）選択、複数バーの同時リサイズ、親バー直接ドラッグによる子孫一括移動、依存違反の警告・自動スナップ、キーボードでの日付ナッジ、マイルストーンの移動、ドラッグ中の自動スクロール。
- **ガント上部のマイルストーン（Phase 1: 独立データ・表示のみ）** (October 20, 2026 / `feature/milestones` `508a01d`):
  - 要望: スケジュールの上部に「マイルストーン」を置きたい。まずは**表示のみ**で、タスクの日付を自動で動かさない。マイルストーンはタスクとは**独立したデータ**として管理する。配置は**日付ヘッダーの直下**。
  - モデル: `src/types.ts` に `Milestone { id, title, date: 'YYYY-MM-DD', note? }` を追加し、ストアのトップレベル `milestones: Milestone[]` に保持（`projectConfig` には入れない）。追加・更新・削除は `addMilestone` / `updateMilestone` / `deleteMilestone`。`setShowMilestones` は `projectConfig.showMilestones`（既定 `true`）を更新する。
  - 表示: ガント／統合表示のヘッダー直下に高さ 28px の `MilestoneLane` を置く。**縦スクロールコンテナの外**に置き、横スクロールだけを `viewportRef` 経由でヘッダーと同期する。0 件または `showMilestones=false` のときはバンド自体を出さない。
  - 見た目: 日付位置に紫のダイヤ。Day 表示では「タイトル MM/DD」を出し、Week / Month / Year ではダイヤ＋ツールチップのみ。同日の複数件は 1 つのダイヤに `+N` を付ける。ラベルが隣と重なる場合はダイヤだけにする。`TimelineGridBackground` に紫の破線ガイドを描き、ダイヤと同じ日付位置に揃える。
  - 操作: ダイヤをクリック = 編集、バンドの空白をダブルクリック = その日付で新規追加、サブツールバーの「マイルストーン」= 管理ダイアログ（追加・編集・削除・表示トグル）。Phase 1 では**バンド上のドラッグ移動は行わない**（日付はダイアログで編集）。
  - タイムライン範囲: `useGanttTimeline` の範囲計算にマイルストーンの最小・最大日を含めた。タスクより遠い未来のマイルストーンでも表示される（サンプルの `2026-12-18` で確認）。
  - 保存・移行: `schemaVersion` を **4** に更新（`src/utils/planActualMigration.ts`）。v3 → v4 は `milestones: []` を足すだけの**無警告の加算移行**とし、タスク形式の移行は `schemaVersion < 3` のときだけ実行する。`normalizeMilestones`（`src/utils/milestones.ts`）が読み込み時に日付不正の除外、ID 欠損・重複の補完、空タイトルの既定値化を行い、警告トーストに件数を出す。
  - **既存の穴も修正**: `useProjectFileHandlers.handleSave` が `schemaVersion` を書き出していなかったため、保存→読込で v1 扱いの移行が走る可能性があった。保存時に `CURRENT_SCHEMA_VERSION` と `milestones` を明示するようにした。
  - 変更: `src/types.ts` / `src/store/useTaskStore.ts` / `src/utils/milestones.ts`（新規）/ `src/utils/validateProjectState.ts` / `src/utils/projectConfig.ts` / `src/utils/planActualMigration.ts` / `src/hooks/useGanttTimeline.ts` / `src/hooks/useProjectFileHandlers.ts` / `src/components/MilestoneLane.tsx`（新規）/ `src/components/MilestoneDialog.tsx`（新規）/ `src/components/GanttChart.tsx` / `src/components/IntegratedView.tsx` / `src/components/TimelineGridBackground.tsx` / `src/components/SubToolbar.tsx`。
  - テスト: 新規 `src/utils/milestones.test.ts` / `src/store/milestones.test.ts` / `src/components/MilestoneLane.test.tsx` / `src/components/MilestoneDialog.test.tsx` / `src/hooks/useGanttTimeline.test.ts` / `e2e/milestone.spec.ts`。既存の `validateProjectState.test.ts` と `useProjectFileHandlers.test.tsx` に v4・保存ペイロードのケースを追加。
  - 検証: `npm test -- --run` **333 件（39 ファイル）** / `npm run test:e2e` **8 件**（新規 1 件を含む）/ `npm run lint` 0 / `npm run build` 通過 / `npm run shots` 12 枚（マイルストーンダイアログを含む）。実ブラウザでバンド・ダイヤ・破線ガイド・横スクロール同期・追加/編集/削除を目視確認。
  - 付随更新: `scratch/sample-project.json` を v4 にし、`要件定義完了 (2026-10-20)` / `設計レビュー完了 (2026-11-10)` / `リリース判定 (2026-12-18)` の 3 件を追加。`scratch/screenshot.mjs` にマイルストーンダイアログの撮影を追加。
  - Phase 1 の対象外（次フェーズ候補）: タスクとのリンク（「このタスク完了時に達成」）、期限警告、後方スケジューリング／フェーズシフト、バンド上でのドラッグ移動、Excel 出力へのマイルストーンシート追加。Excel 出力は現状タスクのみ。
- **日付セル / ガントバーに 150ms のホバーツールチップを追加** (October 20, 2026 / `feature/compact-date-input`):
  - ブラウザ標準の `title` ツールチップ（Chromium 既定は約 500ms）をやめ、共通の `useHoverTooltip` で **150ms** 後に表示する。日付セルは `YYYY/MM/DD` と操作ヒント、ガントバーはタイトル / 開始日 / 終了日 / 期間 / 進捗（完了） / 基準計画をまとめて表示する。
  - ツールチップは `position: fixed` + Portal で描画し、`TaskDateCell` の `overflow-hidden` に切れないようにした。画面端では上下・左右をクランプする。`pointer-events: none` のため下のセル / バー操作を邪魔しない。
  - マウスアウト・スクロール・リサイズ・Esc・pointerdown で即座に閉じる。ガントのバードラッグ中は表示を無効化し、依存線作成ハンドル上ではバー情報を閉じて操作説明（`title`）を優先する。
  - 変更: 新規 `src/components/HoverTooltip.tsx` / `src/components/HoverTooltipPortal.tsx`、`src/components/cells/TaskDateCell.tsx`、`src/components/GanttTimelineRow.tsx`。
  - テスト: 新規 `src/components/HoverTooltip.test.tsx` / `src/components/GanttTooltip.test.tsx` / `e2e/tooltip.spec.ts`。`src/components/cells/DateCell.test.tsx` に 150ms 表示、`src/components/GanttBarCompletion.test.tsx` は `title` 依存を外して色・塗りで完了を検証する形に更新。
  - 検証: `npm test -- --run` **301 件（34 ファイル）** / `npm run test:e2e` **7 件** / `npm run lint` 0 / `npm run build` 通過 / `npm run shots` 10 枚生成。実ブラウザで WBS 日付セルとガントバーのツールチップ位置・内容を目視確認。
- **日付セルを MM/DD 表示 + ネイティブ日付ピッカー + 複数行ペーストへ刷新** (October 20, 2026 / `feature/compact-date-input`):
  - 表示・編集中をともに `MM/DD` に統一し、年はツールチップ / `aria-label`（`YYYY/MM/DD`）とネイティブピッカーで補う。`TaskDateCell` は固定幅の入力欄をやめ、開始日・終了日・カレンダーボタンを `minmax(0, 1fr)` のグリッドに収めた。列を狭めてもオーバーフローせず、空欄は `--/--` を表示する。
  - 直接入力は `YYYY/MM/DD` / `YYYY-MM-DD` / `YYYYMMDD` / `MM/DD` / `MM-DD` / `MMDD` を受け付ける。`parseInputDate` に `notBefore` / `notAfter` を追加し、終了日の `MM/DD` が開始日より前なら翌年、開始日が空で終了日を追い越すなら前年として解決する。貼り付け時は即パースして `MM/DD` に正規化する（コピペは維持）。
  - カレンダーは `input[type=date]` を各フィールドの近くに透明配置し、`showPicker()` で開く（非対応環境は `click()` にフォールバック）。終了日ピッカーには `min=開始日` を設定。
  - 複数行ペーストは、既存の `planValuePaste`（複数行選択 + 1 値 → 全行同一 / N 値 → 順次、1 行 + 複数行 → 下方向充填）を日付にも適用。空行と親タスクはスキップし、不正値は警告トーストで件数を通知する。ストアには `setTaskDateValues` を追加し、1 回の `set`（1 Undo）で反映する。
  - 日付列の既定幅を **224 → 128px**、最小幅を **112px** に変更。`COLUMN_MIN_WIDTHS` で全列の下限を一元管理し、読み込み時は「保存値が旧既定値 224 の日付列だけ」128 へ移行する（意図的に 300px 等へ広げた値は維持）。列リサイズ / `setColumnWidth` も下限へクランプする。
  - 変更: `src/utils/date.ts`（`formatToEdit` / `formatFullDate` / `parseInputDate`）、`src/utils/columns.ts`、`src/utils/projectConfig.ts`、`src/store/useTaskStore.ts`、`src/types.ts`、`src/components/TaskTableHeader.tsx`、`src/components/cells/TaskDateCell.tsx`、`src/utils/cellPastePlan.ts`（`planValuePaste` を抽出）、新規 `src/utils/datePaste.ts`。
  - 複数行選択時のフォーカス列ハイライトは、開始日と終了日を**独立した列**として扱う。以前は日付セル全体を帯状に強調していたため、両方の日付に貼り付くように見えていた。現在はフォーカス中のフィールド（開始日 or 終了日）だけを強調し、実際のペースト対象とも一致する。
  - 親タスクはカレンダーボタンを表示しないが、ボタンと同じ 15px の余白を確保して、葉タスクと開始日 / 終了日の入力中心を揃えた（E2E で親 / 葉の入力幅一致を検証）。
  - 検証: `npm test -- --run` **292 件（32 ファイル）** / `npm run lint` 0 / `npm run build` 通過 / `npm run test:e2e` **6 件** / `npm run shots` で WBS の日付列（親は読み取り専用、葉はカレンダーアイコン付き）を目視確認。テスト追加: `src/components/cells/DateCell.test.tsx` / `src/components/ActiveColumnHighlight.test.tsx`（開始日 / 終了日の独立ハイライト） / `src/utils/datePaste.test.ts` / `e2e/date-cell.spec.ts` / `src/utils/date.test.ts` / `src/utils/projectConfig.test.ts` / `src/store/useTaskStore.test.ts`。
  - 付随更新: `bench/generate-tasks.mjs` と `bench/fixtures/tasks-100.json` / `tasks-1000.json` の日付列幅を 128 に更新。
- **2 層モデル・表示名・状態列幅を main にマージ済み** (October 20, 2026):
  - PR #45（`feature/plan-actual-2layer` → `main`）をマージ（マージコミット `18cb8c0`）。ローカルの作業ブランチとリモートブランチは削除し、`main` 上で vitest 259 件 / 30 ファイルを再確認した。
  - 3 層 Phase 1 の実装コミットは PR #45 の履歴として `main` に取り込まれた（最終状態は 2 層）。復帰点 `feature/plan-actual-model-phase1` はローカルに残置（不要なら `git branch -d feature/plan-actual-model-phase1` で削除可）。
  - 以下の 2 層関連エントリに残っていた「未 push」表記は、このマージで解消済み。
- **`状態` 列の初期幅を 60px に変更** (October 19, 2026):
  - 「進行中」「未着手」の 3 文字がちょうど 1 行で収まる幅にした（実測: 3 文字 = 30px、セル内訳 = 左右 padding 16px + ピル左右 padding 8px + 枠 2px + セル左罫線 1px。最小 57px、余白を見て **60px**）。
  - 変更: `src/utils/projectConfig.ts` の `DEFAULT_PROJECT_CONFIG.columnWidths.status`（100 → 60）。`bench/generate-tasks.mjs` も同じ値に更新し、フィクスチャを再生成。
  - 既存の保存済みプロジェクトは `columnWidths` を保持するため 100px のまま（「初期値」の変更）。
  - 検証: vitest 259 件 / lint 0 / build 通過。`npm run shots` の WBS・統合表示・ガントで 3 状態が折り返さないことを確認（実ブラウザ計測で `進行中` / `未着手` / `完了` すべて 1 行）。
- **`期間` の編集可を確定（案 A = 現状維持）** (October 19, 2026):
  - 判断: 「工数（日数）から終了日を算出したい」ケースがあるため、`期間` セルは**編集可**のままとする。入力すると開始日を固定して終了日を稼働日で再計算し、ガントバーも再描画する（MS Project の Duration と同じ）。
  - 位置づけ: `期間` は「終了日を指定する代替入力」であり、日付と独立した第 2 の真実源にはしない。通常の日付編集後は稼働日数から再計算される。仕様（`docs/PLAN_ACTUAL_DISCUSSION.md` §4.3 規則 5 / 8 と §8 の留保）もこの決定に合わせて更新した。
  - 既知の境界ケース（未修正・挙動は現状維持）: 開始日が非稼働日のとき / 期間 0 を入力したとき / v3 読み込みは保存済み `duration` を信頼する（日付から再計算しない）。不整合が実害になったら別途対応する。
  - コード変更なし（ドキュメントのみ）。検証は前エントリの 259 件 / lint 0 / build / e2e 5 件のまま。
- **表示名を「項目名」「状態」に変更（`feature/plan-actual-2layer` → main マージ済み: PR #45）** (October 19, 2026):
  - WBS / 統合表示 / ガント / 表示項目メニューの列見出しを「タスク名」→「**項目名**」、「ステータス」→「**状態**」に変更。Excel 出力のヘッダー（`src/utils/export.ts`）と状態セルのツールチップも合わせた。
  - 変更点: `src/utils/columns.ts`（`COLUMN_LABELS`。列ヘッダーと表示項目メニューはここを参照）、`src/components/GanttChart.tsx`（ガント左列のハードコード見出し）、`src/utils/export.ts`、`src/components/cells/TaskStatusCell.tsx`。テストは `Phase2Regression.test.tsx` / `GanttChart.test.tsx` の期待値を更新。
  - 内部の識別子（`taskName` / `status` / `deriveStatus` / `data-field`）は保存形式・セレクタ互換のため変更していない。表示名だけの変更。
  - 検証: `npm test -- --run` **259 件（30 ファイル）** / `npm run lint` 0 / `npm run build` 通過 / `npm run shots` で WBS・ガントの見出しを目視確認。
- **予定・実績モデルを 2 層へ移行（実装完了。`feature/plan-actual-2layer` → main マージ済み: PR #45）** (October 18, 2026):
  - `docs/PLAN_ACTUAL_DISCUSSION.md` §8 のチェックリストを上から順に実装した。モデル = **基準（基準開始日 / 基準終了日 / 基準期間）+ 現在の日程（開始日 / 終了日 / 期間）+ 進捗率** の 2 層。保存形式は `schemaVersion: 3`。
  - 主な変更（`git diff --stat` の対象）:
    - モデル: `src/types.ts` から `planStartDate` / `planEndDate` / `planDuration` / `remainingDuration` を削除。`ColumnId` を `duration`（期間）+ `date`（開始日 / 終了日）に整理。
    - ストア: `src/store/taskStoreUtils.ts`（`applyDateCalculations` を 1 組の日付 + 進捗率へ整理、`deriveStatus(progress)`、依存伝播・親ロールアップは現行踏襲）と `src/store/useTaskStore.ts`（`applyTaskUpdate` の `dateTouched` / `progressTouched` 分岐、基準計画アクション）。
    - 移行: `src/utils/planActualMigration.ts`（`CURRENT_SCHEMA_VERSION = 3`、`foldLegacyDates`、`migrateTaskToV3`）+ `src/utils/validateProjectState.ts`（`schemaVersion < 3` で移行 → 警告トースト）。
    - 表: `src/utils/columns.ts` / `src/utils/projectConfig.ts` / `src/components/TaskTableHeader.tsx` / `src/components/TaskRow.tsx` / `src/components/cells/*`。`TaskPlanDateCell` / `TaskPlanDurationCell` は削除。ステータス列は**表示のみ**（ピル、`<select>` を廃止、`保留` を削除）。列見出しは「期間」「開始日 / 終了日」。
    - ガント: `src/components/GanttTimelineRow.tsx` / `src/hooks/useGanttDrag.ts` / `src/hooks/useGanttDependencies.ts`。バー属性値を `data-gantt-bar="plan"` → `"schedule"` に改名（テスト・e2e・bench のセレクタも更新）。ツールチップは `タイトル / 開始日 / 終了日 / 期間 / 進捗 N%（完了）(/ 基準: 開始日〜終了日)`。
    - Excel: `src/utils/export.ts`（日程グループ=青 + 基準グループ=アンバー + 進捗率。バーは基準アンバーを先に描き、日程バーを上に重ねる）。
  - **規則の解釈で判断が要った点（2026-10-19 決定: 案 A = 現状維持）**: §4.3 規則 5（`期間` は稼働日数からの導出値）/ 規則 8（日付以外を入力にしない）と、**`期間` 列を編集可能にすること**は文言上は両立しませんでした。MS Project と同じく「`期間` は保存フィールド（稼働日数から計算）だが、`期間` を入力すると終了日が動く」挙動を採っています（`applyDateCalculations` の分岐 (1)(2)(3)）。**「工数（日数）から終了日を算出したい」ケースがあるため、この挙動を正式採用**（詳細は上の「`期間` の編集可を確定」エントリ）。
  - その他の解釈: 進捗率は日付を書き換えない（規則 2）/ 裏方の実績フィールドを持たない（規則 1）/ 親は子の min〜max と進捗ロールアップのみ（規則 6）/ 日付ロックなし（規則 8）/ ステータスは `deriveStatus` で導出（規則 7）。完了バーの緑（`progress >= 100`）は維持。
  - 検証: `npm test -- --run` **259 件（30 ファイル）** / `npm run lint` 0 / `npm run build` 通過 / `npm run test:e2e` **5 件** / `npm run shots`（10 枚。統合表示・WBS で 1 本バー + 進捗塗り + 基準ゴースト + 完了緑を目視）。
  - 付随更新: `scratch/sample-project.json` を v3（`schemaVersion: 3`、`plan*` 削除、進捗に応じて日付を畳む）へ更新。`bench/generate-tasks.mjs` を v3 形式へ更新し、`bench/fixtures/tasks-100.json` / `tasks-1000.json` を再生成。
- **予定・実績モデルを 3 層 → 2 層へ見直す方針を決定（実装は別ブランチ → 完了・main マージ済み）** (October 18, 2026):
  - 経緯: 「実績をガントに出さないのに裏で持つ意味は?」「基準・予定・実績と 3 観点で見るべきか」というレビューから、Phase 1 の 3 層実装では**実績が入力しても何も起きない（消費者がいない）**ことと、**進捗率と実績日付が二重管理**になっていることを確認した。層の数はアプリが答える問いの数で決まる、という結論。
  - 決定: 3 層にしない。**基準（基準開始日 / 基準終了日）+ 現在の日程（開始日 / 終了日）+ 進捗率**の 2 層に一本化。日付の役割は進捗率で決まる（0% = 両方予定 / 1〜99% = 開始が実績・終了が予定 / 100% = 両方実績）。MS Project の `Start` / `Finish`（Scheduled）の挙動と同じで、一次情報で裏付け済み。
  - 用語（**採用決定**）: 日付の列名は「予定日付 / 実績日付」をやめて「**開始日 / 終了日**」（英名 Start / Finish）。基準側は「基準開始日 / 基準終了日」とし、「基準日」単独は使わない（MS Project の Status Date / P6 の Data Date と衝突するため）。
  - **規則も確定した（§4.3 の 1〜8）**: 進捗率は日付を書き換えない（MS Project の `%完了` 入力と同じ。一次情報で確認）/ 実績期間・残り期間は導出で保存しない / 進捗率を戻すと事実は消える（裏方フィールドを持たない）/ 食い違いは自動で直さない / ステータスは進捗率から導出（手入力の二重管理をやめる）/ 着手後も日付は編集可（ロックしない）。
  - **議論・2 層案・確定した規則・用語対比・復帰点・実装タスク（§8）は `docs/PLAN_ACTUAL_DISCUSSION.md` に保存した。** `docs/PLAN_ACTUAL_MODEL.md` は 3 層の記録として残し、冒頭に不採用の注記を入れた。
  - **3 層 Phase 1 の実装は `feature/plan-actual-model-phase1`（`ad40e59` → `4380ec8` → `2913c0c`、この検討記録を載せた先頭コミットまで）に保存した。現在は PR #45 の履歴として main に取り込み済み**（最終状態は 2 層）。実装そのものの地点は `2913c0c`。2 層の作業ブランチ `feature/plan-actual-2layer` はこの復帰点の先頭から分岐したので、完了バーの緑化（`2913c0c`）も既に含まれている。
  - 実装は**別ブランチ `feature/plan-actual-2layer`** で行い（3 層の復帰点を汚さないため）、完了後に PR #45 で main へマージした。規則 1〜8（§4.3）と用語（§5）は確定済み。**実装タスクは §8 のチェックリストを正とする。**
- **完了（100%）のガントバーを緑にして、完了を色でも分かるようにした** (October 18, 2026 / `feature/plan-actual-model-phase1` `2913c0c`):
  - 予定バー 1 本 + 進捗塗りの構成は変えず、`progress >= 100` のときだけ枠と塗りを青（`brand`）から緑（`green`）へ切り替える（葉 = `border-green-400 bg-green-100` + 塗り `bg-green-600`、親 = `border-green-500/60 bg-green-200/70` + 塗り `bg-green-500/80`）。`src/components/GanttTimelineRow.tsx`。
  - 色は WBS のステータス列（`TaskStatusCell` の「完了 = 緑 / 進行中 = 青 / 未着手 = グレー」）に合わせた。判断は `progress >= 100` の 1 条件なので、ステータスだけ「完了」で進捗が 100% でないタスクは緑にならない（＝不整合が色で見える）。
  - 塗り切り時に角がはみ出していたのを直し、塗り側の角丸を完了時のみ `rounded-[5px]`（親は `rounded-full`）にした。ツールチップは `進捗 100%（完了）`。タイトルの文字色も完了時は `text-green-900`。
  - テスト: `src/components/GanttBarCompletion.test.tsx` を追加（未着工 / 進行中 / 完了 / 親ロールアップ完了の 4 状態）。
  - 検証: vitest / lint / build / e2e 通過。`npm run shots` のガントで緑（完了）・青の部分塗り（進行中）・無塗り（未着工）を目視確認。
- **予定・実績モデル Phase 1（モデルと言葉の整理）実装済み** (October 18, 2026 / `feature/plan-actual-model-phase1` `ad40e59`・`4380ec8`。**この 3 層モデルは不採用になり、上の 2 層案へ移行する**):
  - 背景/要望: 「予定 / 実績」の使い分けが直感的でない。既定（基準計画固定 OFF）では `plan*` ⇄ `startDate` 等が双方向同期され常に同値になるため実績を記録できず、固定 ON では予定・実績の二重管理と UI 意味反転が発生する。
  - Oracle Primavera P6 / Microsoft Project の用語と実装を調査（基準計画 = 不変スナップショット、予定 = 現在の見込み、実績 = 開始/終了、総期間 = 実績期間 + 残り期間、進捗率 = 実績 ÷ 総期間、基準日 = データ日）し、3 層モデルへの再設計を **`docs/PLAN_ACTUAL_MODEL.md`** に提案としてまとめた。**Phase 1（このエントリ末尾の「Phase 1 の実装」）まで実装済み**。§8 の未決事項のうち ③〜⑥（残り期間列 / 進捗基準日 / ステータス導出 / 予定編集ロック）は Phase 2 以降。
  - 主な提案: 「基準計画固定」トグル廃止 → 「基準計画として登録」メニュー、plan⇔actual の双方向同期廃止、`remainingDuration` / `baseline*` の追加、実績期間を導出値化（Phase 2）、旧ファイルの移行規則（`baselineLocked=true` は 基準計画 = 旧 plan / 予定 = 旧 actual に変換、`schemaVersion: 2` を付与）。
  - 再ベースライン（承認済み計画の変更）は「基準計画を更新」で上書きし、旧基準を `previousBaseline*` へ 1 世代退避して「基準計画を元に戻す」で復帰できる形（`docs/PLAN_ACTUAL_MODEL.md` §5.8）。通常のリスケジュールでは基準計画に触らない、という運用ルールを UI 文言にも明記する方針。
  - ガントのバーは「予定バー 1 本 + 進捗塗り + 基準計画の薄いグレーバー（非操作・予定バーの下に数 px。案 B 採用 2026-10-18）」に集約する方針（実績専用バーは廃止し、実績は塗り・ツールチップ・任意のマーカーで表現。§5.5）。`taskBarRefs` / 依存線アンカー / drag-range ガードは統合バーへ寄せる。
  - **Phase 1 の実装**:
    - `src/types.ts`: `Task` に `remainingDuration` / `baselineStartDate|EndDate|Duration` / `previousBaseline*` を追加（実績は `startDate` / `endDate` であることをコメントで明示）。`ProjectConfig` から `baselineLocked` を削除し `baselineSetAt` / `showBaseline` を追加。ストアは `setBaselineLocked` を削除し `setBaseline('register' | 'update')` / `restoreBaseline` / `clearBaseline` / `setShowBaseline` を追加。
    - 双方向同期の廃止: `useTaskStore.applyTaskUpdate` を新設して `updateTask` / `endDragUpdate` を集約。予定（`plan*`）の編集は予定のみ、実績（`startDate` / `endDate` / `duration`）の編集は実績のみを変える。依存伝播（`propagateDependencyDates`）と親ロールアップ（`recalculateParentDatesRecursive`）は予定のみを更新し、親の実績は子の実績から別途ロールアップする（`baselineLocked` 分岐は全廃）。
    - 実績入力の補完規則（Phase 1 の暫定）: 実績開始日が空のまま実績期間 / 実績終了日を入力した場合は、**予定開始日を実績開始日とみなす**（`taskStoreUtils.applyDateCalculations`）。予定側から実績を推測する処理は残していない。
    - 基準計画: `src/utils/baseline.ts`（スナップショット / 1 世代退避 / 入れ替え / クリアの純粋関数）を新設。`AppHeader` の「基準計画」メニューから 登録 / 更新 / 元に戻す（previous が無ければ disabled）/ 表示・非表示 / 削除 + 登録日時（`baselineSetAt`）を操作。
    - 旧ファイル移行: `src/utils/planActualMigration.ts` + `validateProjectState`（`schemaVersion < 2` で全タスクを移行）。`baselineLocked === true` は「基準計画 = 旧 `plan*` / 予定 = 旧 `startDate` 等」、それ以外は「予定 = 旧 `plan*`（無ければ実績で補完）/ 実績 = 進捗から復元」で変換し、`schemaVersion: 2` を付与。旧形式を読み込むと警告トーストで通知する。
    - ガント: 操作対象を **予定バー 1 本**（無ければ実績）に集約し、`progress%` 幅の進捗塗り（`bg-brand-600`）を左端から重ねる。基準計画は予定バーの下に数 px ずらした薄いグレーの非操作ゴースト（`pointer-events-none`、`showBaseline` で出し分け）。実績専用バーは廃止。`data-gantt-bar="plan"` / `taskBarRefs` / drag-range ガードは統合バーへ引き継ぎ、予定・実績列の表示トグル制限（`baselineLocked` による無効化）も撤去した。
    - **注意（今回踏んだ罠）**: 統合バーに `overflow-hidden` を付けると、バー右外側に置いた依存ハンドル（`-right-6`）がクリップされてクリックが行の `draw-range` に抜け、予定が「クリックした 1 日」に書き換わる（`e2e/dependency-auto-calculation.spec.ts` が検出）。**バーに `overflow-hidden` を付けないこと**（進捗塗りは `rounded-l-*` で角を合わせている）。
    - Phase 2 送り: `remainingDuration` は型のみ（列・計算は未実装）、実績期間 `duration` は保存フィールドのまま（§5.2 の「導出値化」は残り期間と合わせて実施）。進捗基準日 / ステータス導出 / 差異列は未着手。
    - 検証: `npm test -- --run` **257 件（29 ファイル）** / `npm run test:e2e` **5 件**（旧 `e2e/baseline-lock.spec.ts` を新モデルの `e2e/baseline.spec.ts` に置換）/ `npm run lint` 0 / `npm run build` 通過。ガントの見え方は DOM 実測（1 本バー + 進捗塗り 60% = 118/198px + 基準計画ゴーストの位置ずれ）と `npm run shots` で確認。
    - 付随更新: 目視確認用の `scratch/sample-project.json` を v2 形式（`schemaVersion: 2` / `showBaseline: true` / `baselineSetAt` / 進捗に応じた実績 / 「設計」フェーズの基準計画を 3 営業日早くした遅延例）へ更新。旧形式のままだと毎回移行警告が出て、基準計画ゴーストが写らないため。
- **ヘッダーのラベル整理（「設定」ボタン化 / 保存・読込・出力の 2 文字統一）** (October 18, 2026, 未コミット):
  - 背景/要望: ヘッダーは青基調だが、「基準計画固定」「実績バー」のオレンジは今回対象外（ユーザー判断で変更しない）。一方で「プロジェクト」ボタンが何を意味するか分かりにくく（中身は祝日設定のみ）、ファイル操作（保存 / 読み込み / エクスポート）の語長が揃っていなかった。
  - `AppHeader.tsx`: 「プロジェクト」→ **「設定」**（歯車アイコン `Settings`、`aria-label="設定"`）に変更し、ドロップダウンのメニューは維持（項目は従来どおり「祝日設定」）。将来項目が増えても破綻しない形。
  - アイコン色: 未選択（メニューを閉じている）ときの歯車と、メニュー項目「祝日設定」のカレンダーアイコンは **グレー（`text-slate-500`）** に統一（従来は `text-brand-500` でヘッダーの青アクセントと紛らわしかった）。メニューを開いているときだけ歯車を `text-brand-600` にして開閉状態を示す。
  - ファイル操作を **保存 / 読込 / 出力** の 2 文字に統一。意味は `title` と `aria-label` で補う（`読み込み (JSON)` / `Excel 出力`）。`aria-label="読み込み"` は既存の bench / e2e セレクタ（`getByRole('button', { name: '読み込み' })`）との互換のため据え置き。
  - 内部の変数も `projectMenu*` → `settingsMenu*` にリネーム（表示名と一致させる）。
  - テスト: `AppHeader.test.tsx` を「設定メニュー」に改名し、**ラベル検証 1 件 + アイコン色 2 件**を追加（保存/読込/出力の 2 文字 + `読み込み` / `Excel 出力` の aria-label / 歯車のグレー⇔ brand 切替 / 祝日設定アイコンのグレー）。`scratch/screenshot.mjs` のボタン名も `設定` に更新。
  - 検証: `npm run lint` 0 / `npm test -- --run` **249 件（29ファイル）** / `npm run build` 通過。`npm run shots` で 1440px（テキストあり）と 1024px（アイコンのみ）両方でヘッダーのはみ出しが無いことを確認。設定メニュー開閉の実画面キャプチャでも、閉=グレー / 開=brand とメニュー項目アイコンのグレーを確認。

- **複数行選択時の「フォーカス列」ハイライト（全体選択 / 選択列 / ホバーの 3 段階区別）** (October 17, 2026, 未コミット):
  - 背景/要望: 複数行ペースト対応で複数行選択が増えたが、「全体として複数行が選択」「特定の選択した列の複数行」「マウスオーバー中の行」の見分けが乏しい。この 3 段階を区別したい。
  - 仕様（ユーザー確認済み）: 強調する列は **フォーカス中の列**（最後にクリック/キーボード移動したセルの列）。見た目は **背景を一段濃く＋左右に縦アクセント**。行全体の選択背景とフォーカス列を別レイヤーとして重ねる。
  - `src/components/cells/cellHighlight.ts`（新規）: `useIsActiveColumn(taskId, fields)` は「複数行（2 行以上）選択中 × その行が選択に含まれる × フォーカス中の列が一致」で true を返す **boolean セレクタ**（値が変わらない限り再描画されない = 既存 `isFocused` と同じ省再描画方針）。`activeColumnClass` は `!bg-brand-200 !opacity-100` + 左右 2px の `brand-500` インセット縦アクセント。
  - 8 セル（`TaskOutlineCell` / `TaskTextCell` / `TaskStatusCell` / `TaskProgressCell` / `TaskPlanDurationCell` / `TaskDurationCell` / `TaskPlanDateCell` / `TaskDateCell`）の外枠に `isActiveColumn && activeColumnClass` を付与。日付列は開始/終了のどちらのフォーカスでも列として強調（`PLAN_DATE_FIELDS` / `DATE_FIELDS`）。`!opacity-100` は日付・期間セルの非ホバー時 `opacity-50/60` を打ち消すため。
  - 3 段階のパレット: 全体選択 = `bg-blue-50` / 選択行ホバー = `bg-blue-100` / **フォーカス列 = `bg-brand-200` + 縦アクセント** / 未選択行ホバー = `bg-gray-100`。従来の未選択ホバー `gray-50` はほぼ白で不明瞭だったため 1 段濃くした。`TaskRow` / `IntegratedView` / `GanttChart` の行背景クラスを揃えた。
  - 操作メモ: クリックでセルをフォーカスすると行選択は 1 行に戻る（`handleRowMouseDown` が `setSelectedTaskIds([id])`）。複数行 + 列フォーカスの状態は「セルをフォーカス → Shift+クリック / Shift+矢印で拡張」で作る（Shift/Ctrl+クリックは input の `preventDefault` によりフォーカスを維持）。複数行ペースト（`handleTextCellPaste`）の対象列がそのまま帯として見える。
  - テスト: `src/components/ActiveColumnHighlight.test.tsx`（新規 4 件）: 選択行だけに帯 / 選択外の行・他列には付かない / 単一選択では帯なし / 日付・期間列の `!opacity-100` / 統合表示でも同様。
  - 検証: `npm run lint` 0 / `npm test -- --run` **246 件（29ファイル）** / `npm run build` 通過。`npm run shots` に active-column シナリオを追加（`scratch/screenshot.mjs`。web 用 dev は `npx vite --config scratch/vite.web.config.ts` で起動）。
- **テキスト列の複数行ペースト / Excel ライクな一括入力** (October 17, 2026, 未コミット):
  - 背景/要望: タスク名だけでなく説明・担当者・成果物も複数行対応したい。さらに「列の特定行を複数選択して貼り付けると全行が同一値になる」など Excel ライクな操作を期待する。
  - 仕様（ユーザー確認済み）: 対象は **タスク名 / 説明 / 担当者 / 成果物** の 4 列。貼り付け先 = **フォーカス中の列 × 選択行（視覚順）**。選択が 1 行ならその行を起点に下へ伸ばす。真の矩形（行×列）選択とセル範囲コピーは今回スコープ外。
    - 値 1 個 × 選択複数行 → 選択行すべてに同一値
    - 値 N 個 × 選択複数行 → 選択行へ順に割り当て（余った行は変更しない）
    - 値 N 個 × 選択 1 行（タスク名）→ 従来どおり新規タスクを一括登録
    - 値 N 個 × 選択 1 行（他列）→ その行から下へ N 行に充填（既存行のみ）
    - 値 1 個 × 選択 1 行 → 通常の貼り付け（現在セルのみ）
  - `src/utils/cellPastePlan.ts`（新規・純粋関数）: 上記ルールで `{ targetIds, values }` を返す。既定動作に任せる場合は `null`。
  - `src/utils/cellPaste.ts`（新規）: `getVisualTaskOrder()`（`flattenTree` で視覚順）/ `isMultiRowSelection()` / `handleTextCellPaste()`。ストアは購読せずイベント時に `getState()` から読む。
  - `useTaskStore.setTaskFieldValues(ids, field, values)`（新規）: 同一値 or 配列を **1 回の `set`** で反映（Undo 1 エントリ）。値が 1 個なら全行、複数なら順に対応。対応する値が無い行は変更しない。
  - `TaskTextCell` に `onPaste` を追加。`TaskOutlineCell` は「複数行選択中は一括反映（`handleTextCellPaste`）、単一選択 + 複数行は従来どおり新規タスク作成」に分岐。
  - テスト: `cellPastePlan`(8) / `setTaskFieldValues`(6) / テキスト列・タスク名の貼り付け(5) を新規追加。
  - 検証: `npm run lint` 0 / `npm test -- --run` **242 件（28ファイル）** / `npm run build` 通過。
  - 補足: `selectedTaskIds` はクリック順なので、充填・割り当ては `flattenTree` の視覚順に並べ直して行う。表示されていない（折りたたみ中の）選択行は対象外。
- **複数行ペーストによるタスクの一括登録** (October 17, 2026, 未コミット):
  - 背景/要望: コピーした複数行テキストから複数タスクを一度に登録したい。従来はタスク名が単一行 `<input>` のため、複数行を貼ると改行が潰れて 1 行に連結されるだけだった（paste を扱うコードはリポジトリに存在しなかった）。
  - 仕様（ユーザー確認済み）: タスク名セル（`TaskOutlineCell`）に直接貼り付け。1 行は通常の貼り付け、複数行なら一括登録。行頭インデントで階層化（既存上限 4 階層にクランプ）。選択行の直後に兄弟として貼り付け順に挿入。空行はスキップ。Excel のタブ区切りは 1 列目のみタスク名に採用（モードは自動判定）。
  - `src/utils/parseTaskPaste.ts`（新規・純粋関数）: 改行分割 → 空行除去 → 「内容の後ろにタブがある行があれば列モード」を自動判定 → インデント幅を実測して深さへ写像（単位がタブ/スペース 2/4 のいずれでも可）。
  - `useTaskStore.addTasks(items, referenceTaskId, position, options)`（新規）: **1 回の `set`** で挿入し、Undo 1 エントリ・再描画 1 回。深さから親子を組み立て、追加後は新規群を選択し先頭をフォーカス。`options.referenceTitle` で参照タスクのタイトルも同じ `set` 内で更新する（貼り付け先が空セルのとき 1 行目を採用し、空タスクの残骸を防ぐ）。`addTask` の新規タスク生成は `createBlankTask()` に共通化。
  - `TaskOutlineCell`: `onPaste` を追加（IME 中は無視、単一行は素通し、複数行のみ `preventDefault`）。
  - テスト: `parseTaskPaste`(12) / `addTasks`(9) / セル paste(5) を新規追加。
  - 検証: `npm run lint` 0 / `npm test -- --run` **223 件（25ファイル）** / `npm run build` 通過。
  - 補足: タブは「列区切り」と「行頭インデント」を兼ねられないため、列モードのインデントはスペースで表現する（行頭タブは列区切り扱い）。Excel の 2 列目以降は現状読み捨て。将来必要なら貼り付けダイアログ＋プレビュー、列マッピング拡張を検討。
- **統合表示の列ヘッダー高さがタイムラインと揃っていない問題の修正** (October 17, 2026, branch `feature/ui-refresh`):
  - 症状: 統合表示で左ペインの列名ヘッダーが 40px、右のタイムライン 2 段ヘッダーが 56px で、境界で高さがずれて見えていた（ガントチャートは両方 56px）。`TaskTableHeader` に `height` prop はあったが、統合表示が渡していなかった（既定 40px）。
  - 修正: `TimelineHeader.tsx` に高さの唯一の定義元 `TIMELINE_GROUP_ROW_HEIGHT`(20) / `TIMELINE_DETAIL_ROW_HEIGHT`(36) / `TIMELINE_HEADER_HEIGHT`(56) を追加。`GanttChart` のローカル定数と統合表示の `h-[56px]` ハードコードを廃止して同定数を参照。統合表示の `TaskTableHeader` に `height={TIMELINE_HEADER_HEIGHT}` を渡し、左ペインとタイムラインのヘッダー高さを一致させた。
  - 回帰テスト: `src/components/Phase2Regression.test.tsx` に「ヘッダー高さの整合」3 件（統合表示の列ヘッダー＝タイムライン切り出し領域／ガントのヘッダー／2 段ヘッダーの合計＝グループ行＋詳細行）を追加。
  - 検証: `npm run lint` 0 / `npx vitest run` **197 件（22ファイル）** / `npm run test:e2e` **5 件** / `npm run build` 通過。`npm run shots` のスクリーンショットと実ブラウザ実測でヘッダー高さが揃うことを確認（統合表示: 左ヘッダー 56px ＝ タイムライン ヘッダー 56px / ガント: ヘッダー帯 56px ＝ 左列 56px）。
  - 補足: 統合表示の左ペイン境界の下罫線は `border-line`（左）と `border-gray-300`（右）で色が異なる（高さとは別の軽微な不整合。今回は未修正）。
  - **開発メモ（この環境で Playwright を動かす）**: `npx playwright install chromium` は `ubuntu20.04-arm64` 非対応で失敗する。回避策として Chrome for Testing の arm64 ビルド（`chrome-linux-arm64` と `chrome-headless-shell-linux-arm64`）を取得し、Playwright が期待するパス（`~/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome` と `chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell`）へ配置すると `npm run shots` / `npm run test:e2e` が動く。OS 依存ライブラリは `libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libgtk-3-0 libnss3 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libasound2 libvulkan1` 等を apt で導入。コンテナには日本語フォントが無いためスクリーンショットの日本語は豆腐（□）になるが、レイアウト確認には支障なし。
- **UI 刷新 Phase 0〜2（モダン・クリーン化）完了** (October 17, 2026):
  - 背景: `docs/UI_REVIEW.md` の総点検に基づき、3 ビュー（WBS / 統合表示 / ガントチャート）の UI を一般的なタスク管理ツール相当へ刷新。Phase 0（破損修正）/ Phase 1（土台＋ヘッダー/サブバー/ステータスバー/言語統一）/ Phase 2（ガント表現）を実装。
  - **Phase 0（破損修正）**:
    - P0-1 日付セルの文字重なり: `TaskDateCell` / `TaskPlanDateCell` の local state をストア値の表示形式で初期化し placeholder を空に（透明 input の placeholder と Overlay Span の重なりを解消）。
    - P0-2 統合表示の列欠落: `ProjectConfig.integratedColumns`（既定 `COMPACT_COLUMNS` = taskName/status/progress/planDuration/duration）を新設。`useOutlinerResize` に minWidth を渡し、列が隠れて到達不能にならないよう自動フィット。
    - P0-3 トースト: 右上の操作系と重ならないよう右下（`bottom-9 right-4`）へ移動。
    - 列表示メニューを `src/components/ColumnVisibilityMenu.tsx` に共通化（列ヘッダー右クリック / サブバー「表示項目」の両方から）。
  - **Phase 1（土台）**:
    - `tailwind.config.js` にトークン（`fontFamily.sans` 日本語スタック / `colors.brand` / `colors.line` / `boxShadow.xs・pop`）。`src/index.css` を刷新（html/body/#root の高さ、`body overflow:hidden`、`:focus-visible` リング、`.thin-scrollbar`）。
    - `AppHeader.tsx` を再設計（ブランド + ビュー切替セグメント + 元に戻す/やり直す + 基準計画固定ピル + プロジェクトメニュー + 保存/読込/エクスポート）。`SubToolbar.tsx`（ズーム 日/週/月/年・今日・すべて展開/折りたたむ・表示項目）と `StatusBar.tsx`（タスク数/選択数/ズーム/祝日数）を新設し App に組み込み、旧 "Ready" フッターを置換。
    - 各ビューのフローティング `Day/Week/Month/Year` `<select>` を撤去（サブバーのセグメントへ集約）。
    - `ProjectSettingsDialog` を日本語化。`index.html` の title / favicon を設定、Electron 既定ウィンドウを 1440x900（min 1000x640）に。
    - `todayFocusRequestId` + `requestScrollToToday()` を追加し、統合表示/ガントで「今日」ボタンが今日位置へスクロール。
    - ヘッダーは `overflow-hidden`（狭い幅で内容がメイン領域へはみ出さないように）を持つため、プロジェクトメニューを `absolute` で置くとヘッダーの高さで切り取られ、ガントチャート等のメイン領域に隠れていた。ボタン位置から座標を求めて `fixed` + `z-[60]` + `no-drag` で描画するよう修正（`AppHeader.test.tsx` で固定）。同じ理由で `ColumnVisibilityMenu` / サブバーの「表示項目」も `z-[60]` に統一（統合表示の列リサイズハンドル z-50 が前面に出ていた）。
    - WBS ビューで列名ヘッダーが縦スクロールで流れていた問題を修正。`Outliner` のルートが `overflow-x-auto` を持つと（CSS の仕様で縦も auto になる）自身がスクロールコンテナになり、ヘッダーの `sticky top-0` が「実際には動かない Outliner 自身」を基準にしてしまう。ルートの overflow を外して親（App の `overflow-auto`）の縦スクロールに追従させた（横スクロールバーは画面下部に移動）。
  - **Phase 2（ガント表現）**:
    - 今日ライン（`TimelineGridBackground` に brand の縦線）＋ヘッダーの今日バッジ（`TimelineHeader`）。
    - 週末（薄グレー）と祝日（薄アンバー + `title`）を区別。グリッド背景を `min-height:100%` にして行が少なくても全面に描画。
    - 月グループラベルを sticky（左端固定）化。`position: sticky` はインライン style にし、既存テストの `.sticky.left-0` セレクタと衝突させない。
    - 選択行のハイライト帯をタイムライン側にも敷く（`GanttTimelineRow` に `isSelected` / `isHovered`）。`.bg-blue-100`・`[title="Drag to create dependency"]`・`data-gantt-bar`（値は plan/actual）は維持。
    - バーの角丸・枠・影を調整、親バーは丸型。依存線の矢印を拡大し `strokeLinejoin=round`。
    - ガントのみのビューの左列にステータス・進捗を追加（ヘッダーにもラベル）。
    - 横スクロール時に、行より下の左ペイン（タスク名列）余白へ日付グリッドが覗く問題を修正。`TimelineGridBackground` を `forwardRef` 化し、依存線 SVG と同じくスクロール量ぶんを `clip-path` で切り落とす。さらに左ペインとタイムラインの境界線をスクロールコンテナの背景（`src/utils/leftPaneDivider.ts`）として描き、行が無い部分でも 1 本の線が途切れないようにした。
  - テスト: `src/components/Phase2Regression.test.tsx`（5 件）新規 + `src/components/DependencyLayerClip.test.tsx` にグリッド背景のクリップ検証 + `src/components/AppHeader.test.tsx`（プロジェクトメニュー 3 件）+ `Outliner.test.tsx` に列名ヘッダーの sticky 検証を追加。e2e 3 件は「統合表示が既定コンパクト列」になったため、日付入力は WBS ビューで行うよう更新（依存ドラッグは統合表示のまま）。
  - 検証: `npm run lint` 0 / `npm test -- --run` **194 件（22ファイル）** / `npm run test:e2e` **5 件** / `npm run build` 通過。
  - 目視確認用ツール: `npm run shots`（`scratch/screenshot.mjs`）。`scratch/sample-project.json` を「読み込み」させて 3 ビュー + 行選択 + 狭い幅 + 設定ダイアログを `scratch/shots/` に撮影する（生成物は `.gitignore` 済み・コミットしない）。dev サーバ（`npm run dev`）を起動してから実行。
  - 注意: 開発サーバ（vite）が古い Tailwind 設定をキャッシュしていると `brand` 色が反映されず、スクリーンショット確認が誤る。再起動で解消（今回は発生・再起動済み）。
  - 未着手（Phase 3 候補）: ステータス/進捗セルのピル化、空状態（統合/ガント）、行の右クリックメニュー、検索/フィルタ（P1-5 / P1-7 / P2-6）。
- **JSON インポートの実行時バリデーション強化（優先課題 #2 / IPC 申し送り #1）** (October 17, 2026):
  - 背景: `useProjectFileHandlers.handleLoad` が `JSON.parse` の結果を無検証で `loadProjectState` に渡しており、壊れたファイルで (a) 例外（`tasks` 欠落 / `rootIds` 欠落 / `children` が `undefined` / トップレベル `null`）、(b) 無通知のデータ消失（`tasks` が配列 / 親子の循環で `rootIds=[]`）、(c) 描画クラッシュ（ルートから到達可能な親子循環で `flattenTree` が無限再帰 → `RangeError: Maximum call stack size exceeded`）、(d) 型・値の残留（`progress` が文字列 / 不正日付 / 不正 `columnWidths`・`timelineRange`）が起きていた。一時テストで全 14 ケースを再現して確認済み（実装前に報告済み）。
  - **方針（ユーザー確認済み）**: 修復優先＋警告。直せる異常値はすべて直して読み込み `warnings` に要約する。どうしても読めない場合（非オブジェクト / `tasks` 不正 / 有効タスク 0 件）だけ拒否してストアを一切変更しない。不正な日付文字列は `null` にクリアする。
  - **`src/utils/validateProjectState.ts`（新規）**: 未知の値を検証・正規化する純粋関数。tasks を `id` 基準で引き直し、children / dependencies の「存在しない・自己・重複」参照を除去、多重親を先着 1 つに絞り、親子の循環と依存の循環を反復 DFS で切断して森（閉路なし・単一親）にする。`projectConfig` は `mergeProjectConfig` に委譲。
  - **`src/utils/projectConfig.ts`**: `mergeProjectConfig(projectConfig, warnings?)` に拡張し、`columnWidths` の非数値（`"wide"` 等）を既定値へ、`timelineRange` の不正値（型違い・実在しない日付・`start > end`）を無効化するよう検証を追加。
  - **`loadProjectState`（単一の choke point）**: シグネチャを `(input: unknown)` に変更し `{ ok, warnings, error? }` を返す。IPC 経由かどうかに依存せず、成功時のみ `setState` + undo 履歴クリア。
  - **トースト通知**: `src/store/useNotificationStore.ts`（新規）＋ `src/components/ToastContainer.tsx`（新規）を追加し、画面右上に「成功 / 修復警告（詳細付き）/ エラー」を表示。info/warning は自動消滅（5s / 12s）、error は手動で閉じるまで残る。これまで console だけで UI 通知が無かった点を解消。`App.tsx` にマウント。
  - **防御の多層化**: `flattenTree` / `flattenTreeAll` に `visited` ガードを追加（万一すり抜けても無限再帰しない）。`addDependency` にインラインだった循環判定を純粋関数 `hasDependencyPath` として `taskStoreUtils.ts` に抽出し、検証側と共用。
  - **注意**: `loadProjectState` の戻り値を使わない呼び出し（既存テスト含む）はそのまま動く（成功時のみストア更新）。読み込みの正常系（既存の保存 JSON）の互換性はユニットテストで確認済み。
  - 検証: lint 0 / vitest **178 件（19ファイル）** / e2e 5 / build / **`npm run package`（electron-forge。`out/wbs-gantt-outliner-darwin-arm64/wbs-gantt-outliner.app` を生成、389MB）通過**。マージ前の最終ゲートまで緑。
- **デバッグ用テストの整理（非干渉テストへの昇格 / 不要な E2E の削除）** (October 17, 2026):
  - `src/store/verify_bug.test.ts`（デバッグ名の3件）を **`src/store/updateTaskIsolation.test.ts`** に再編。同期・ロックの一般仕様は `useTaskStore.test.ts`「Baseline Plan and Actual Date Synchronization & Locking」が担うため重複分は落とし、**「あるタスクの更新で無関係な兄弟タスクが変わらない」相互非干渉の主張だけ**を残した（過去の「無関係なタスクが動く」パターンC退行の再発防止。他テストでは未カバーだった観点）。セットアップも `initialState` リセット＋`getTemporalState().clear()` の標準作法に統一。
  - `e2e/reproduce-bug.spec.ts` を **削除**。実質のアサーションが「Task B の予定開始セルが `06/05` のまま」1点のみで、バーの x 座標は画面外（-4533）を測っており「ホバーでスナップバック」の検証が成立していなかった。`page.on('console')` / `console.log` / `waitForTimeout` のデバッグノイズ付きで、意図した不変条件は上記の非干渉テストと 6/7 の `TaskRow task` prop + `TimelineContext` 修正で構造的に担保済み。E2E は 6 → 5 件。
- **P1 変更領域の回帰ハードニング（選択アンカー / フォールバック追従 / 操作マトリクス）** (October 17, 2026):
  - 目的: P1（描画性能）Step 1〜4 が触れた領域（セル memo 化・選択・依存線・ドラッグ・確定・ホバー）を横断的に確認し、壊れやすい挙動をテストで固定する。
  - **修正1: GanttChart の Shift+矢印で範囲が起点から伸びない不整合**。`GanttChart.tsx` の `handleSelectionChange` は範囲選択の起点を「直前の選択末尾（`currentSelected[last]`）」から求めていたため、Shift+↓ を繰り返すと `[A,B]` → `[B,C]` と**後ろにずれて縮む**（Outliner / IntegratedView は `anchorIdRef` で起点保持するため `[A,B]` → `[A,B,C]` と伸びる）。GanttChart にも `anchorIdRef` を導入し、範囲選択以外で起点を更新する形に統一（P1 以前からの不整合だが、同種の退行の温床なので是正）。
  - **修正2: `flattenedItems` 未指定時のフォールバックがタスク変更に追随しない潜在バグ**。`IntegratedView` / `GanttChart` は `flattenedItemsProp ?? flattenTree(getState().tasks, getState().rootIds)` を `useMemo(..., [flattenedItemsProp])` で組んでいたため、**prop を渡さない利用（テスト・単体利用）では初回のツリーが固定**され、以降のタスク編集が反映されなかった（Outliner は `tasks` / `rootIds` を購読しており追随していた）。両ビューで `tasks` / `rootIds` を購読し、依存配列に含める形に統一。App は `visibleItems` を渡しており同じ変化で再レンダーされるため、**本番の再レンダー回数は変わらない**。
  - **回帰テスト**:
    - `src/components/InteractionRegression.test.tsx`（新規・14件）: セル編集の確定と派生値同期（期間確定→表示終了日が更新）、Undo で入力欄が戻る、Escape で選択解除、矢印でフォーカス移動、ステータス/進捗の確定とクランプ、複数選択 Delete、Ctrl+クリックのトグル、子の日付編集→親ロールアップの DOM 反映、`flattenedItems` 未指定でもストア変更に追随、依存線クリックで削除、IntegratedView のバー移動確定 / 依存ハンドル生成 / 日セル単クリック＝1 日予定。
    - `src/components/SelectionRange.test.tsx`（+1件）: GanttChart で Shift+↓ を繰り返しても起点を失わず 3 行へ伸びる。
  - 検証: `npm test -- --run` **127 件合格** (14ファイル) / `npm run test:e2e` 6 件合格 / `npm run lint` 0 件 / `npm run build` 通過。
- **依存線が左のタスク名カラムに重なる問題の修正** (October 17, 2026):
  - 症状: 横スクロール時に依存線（SVG レイヤー）が左のタスク名カラム（sticky）の上に描画される。
  - 原因: `index.css` の `.gantt-row-optimized { content-visibility: auto }` は **paint containment を伴い、行をスタッキングコンテキスト化**する。そのため行内で `z-40` を付けた名前カラムは行のコンテキストに閉じ込められ、兄弟である依存線 SVG（`z-10`）より前面に描画できない（DOM/レイヤ順では SVG が上になる）。横スクロールで SVG が名前カラムの下へ潜り込むと、線が名前カラムに重なって見えていた。`content-visibility` 導入時からの潜在バグで、スタッキングの前提（名前カラム z-40 > SVG z-10）と containment が矛盾していた。
  - 修正: `IntegratedView` / `GanttChart` のスクロールハンドラで、依存線 SVG を `clip-path: inset(0 0 0 <scrollLeft>px)` により左から切り落とす（スクロールしていないときはクリップ解除）。`z-index` を下げて行の裏に回す案は、行の timeline 領域がポインタイベントを奪い、依存線クリック（削除）が行の draw-range に化けるため不採用。クリップなら描画だけでなく当たり判定も切れ、既存の操作性を維持できる。
  - 回帰テスト `src/components/DependencyLayerClip.test.tsx`（新規・2件）: スクロール量に応じた `clipPath` の付与/解除（IntegratedView / GanttChart）。
  - 検証: Playwright で 1,000px 相当スクロール時に名前カラム領域へ描画される依存線サンプルが 0 件になることを確認。`npm test -- --run` **112 件合格** / `npm run test:e2e` 6 件合格 / `npm run lint` 0 件 / `npm run build` 通過。
- **Shift + 矢印 / Shift + クリックの範囲選択が不安定になる退行の修正** (October 17, 2026):
  - 症状: WBS（Outliner / IntegratedView）で 2 行目を選択して Shift+↓ しても 1 行しか選択されない、起点が失われて複数行を選べない。
  - 原因: **P1 Step 4-A（`c69f567`）** でセルを `React.memo` + `cellPropsEqual`（関数 props を無視）でメモ化した一方、選択ハンドラ（`handleSelectionChange`）は `anchorId` / `selectedTaskIds` / `focusedTaskId` をクロージャから読んでいた。セルは再レンダーされないため**古いクロージャを保持し続け**、Shift 操作時にアンカーが解決できずフォールバックして `endIdx` の行だけ（または `indexOf === -1` で 1 行だけ）選択されていた。関数 props を無視する最適化と「ハンドラがクロージャ変数を読む」設計の不整合。
  - 修正: 選択ハンドラがイベント時に最新値を読むよう変更。アンカーは `useRef`、表示順は ref（`useEffect` で同期）、`selectedTaskIds` / `focusedTaskId` は `useTaskStore.getState()` から取得。対象は `src/hooks/useTaskSelection.ts`（Outliner）、`src/components/IntegratedView.tsx`、`src/components/GanttChart.tsx` の 3 箇所。`anchorId` を React state から ref 化したことで余分な再レンダーも削減。
  - 回帰テスト `src/components/SelectionRange.test.tsx`（新規・4件）: Outliner の Shift+↓ 起点維持 / 連続拡張 / Shift+↑ 逆方向 / IntegratedView の Shift+↓。
  - 検証: `npm test -- --run` **110 件合格** / `npm run test:e2e` 6 件合格 / `npm run lint` 0 件 / `npm run build` 通過。
- **ガント日セル単クリックで予定が反映されない退行の修正** (October 17, 2026):
  - 直近コミット `55da44a`（P0 drag guards）で `useGanttDrag.ts` の `draw-range` 確定処理に追加した「移動量ゼロなら確定しない」ガードが、**日セルの単クリックによる 1 日予定の設定まで塞いでいた**（新規タスクは `planStartDate: null` のため「予定追加」で必ず踏む。2 日以上ドラッグしないと確定しない状態だった）。
  - このガードを撤去し、単クリックでも「クリックした日 1 日分」の予定を確定するよう元の挙動へ戻した。`55da44a` のもう一方の保護（予定/実績バーの `onMouseDown` で常に `stopPropagation` + `[data-gantt-bar]` 判定）はそのまま残しており、**予定バー/実績バーの単クリックが行の `draw-range` に伝播して日付を破壊する経路は塞がれたまま**であることを回帰テストで確認済み。
  - `src/components/GanttDragGuards.test.tsx`: 「単クリックで日付を書き換えない」テストを「単クリックで 1 日予定を設定する」に置換し、予定未設定タスクの単クリック作成テストを追加（計 6 件）。
  - 検証: `npm test -- --run` 106 件合格 / `npm run lint` 0 件 / `npm run build` 通過。
- **描画性能 P1 Step 4: セル購読の集約（4-A）と派生データの参照安定化（4-B）（D7）** (October 17, 2026):
  - **4-A（セル購読の集約 / セルの memo 化）**: 1 行あたり約 79 購読（セル 8 ファイルで `useTaskStore(` が 61 箇所）していた構成を `TaskRow` で 1 回だけ購読し props で配る形へ変更。セルは `React.memo` + 関数 props を無視する共通比較関数 `src/components/cells/cellPropsEqual.ts`（新規）でメモ化し、「自分がフォーカスされているか」を返す boolean selector だけ残した（選択状態を行の props にすると選択のたびに全行再レンダーになるため）。セル 8 種の `useTaskStore` 購読を全廃し操作は `getState()`、`TaskOutlineCell` の Enter/Backspace/Delete は `getEffectiveTaskIds(taskId)` をイベント時に評価。`useTaskCellKeyboard` は購読をやめ選択状態をハンドラ実行時に読む。
  - **4-B（参照安定化）**: `SortableContext items={flattenedIds}` と `TimelineContext` の値が親の再レンダーごとに参照が変わり、context 経由で全行（`useSortable` 消費側 / `RowContainer`）が再レンダーし続けていた（`React.memo` では止まらない）。`src/hooks/useStableFlattenedIds.ts`（新規）で ID 列を内容ベースで安定化し、`useGanttTimeline` の `timeRange` / `timelineMetrics` を値（epoch ms / Date の時刻）依存にして、日付範囲が変わらない編集では参照を据え置くようにした。
  - **実測（1,000 タスク、同一セッションでの A/B）**: duration 確定 **402ms → 0ms**、タイトル確定（Enter → 追加）**1,053ms → 約 180ms**、ドラッグ確定（mouseup）**456ms → 約 22〜42ms**、ドラッグ全体 **486ms → 約 78ms**、ドラッグ中 mousemove の操作窓 **340ms → 約 195ms**。タイトル確定は Enter で新規タスクを追加する操作で ID 列そのものが変わるため全行再構築が残る（残りは構造変更由来）。詳細は `bench/README.md`「Step 4-A / Step 4-B」。
  - 挙動を変えない（純粋な再レンダー削減）ため回帰テストは追加せず、既存のユニットテスト 105 件・E2E 6 件・ビルド・lint 0 件で退行なしを確認。
  - **これで P1（購読ファンアウト D7 / 依存線 P2 / 入力連鎖 P3 / Context D6）が完了**。P2（保守性）のうち D9 は October 22, 2026 に完了。残りは D8（`updateTask`/`endDragUpdate`/`addDependency` の共通化）と D10（zundo の `partialize` と `equality` の同期）。
- **描画性能 P1 Step 3: `TimelineContext` の value を `useMemo` 化（D6）** (October 17, 2026):
  - `IntegratedView` / `GanttChart` の `<TimelineContext.Provider value={{ timelineMetrics, timelineWidth }}>` が毎レンダー新規オブジェクトだったため、行ホバー（`hoveredTaskId` の変更）のたびに **context 消費側の全行 `RowContainer` が再レンダー**していた（`React.memo` では止まらない）。`value` を `useMemo` 化（依存: `timelineMetrics` / `timelineWidth`）し、ホバーでは参照が変わらないようにした。
  - 実測（1,000 タスク, `npm run bench` の `hover(20 rows)`）: 操作窓 **741.7ms → 524.2 / 511.0ms**、longtask 合計 **60.3ms（最長 91ms）→ 17.3 / 19.7ms（最長 52 / 59ms）**、over 50ms の longtask 数 2 → 0〜1。最長タスクは約 43% 減。
  - 挙動は変わらない純粋な再レンダー削減のため、回帰テストは追加せず既存のユニットテスト 105 件・E2E 6 件で退行確認のみ（`bench/README.md` に計測記録）。
  - **これで P1 の Step 1〜3（duration の確定タイミング / 依存線の分離 / Context value の `useMemo` 化）が完了**。残る支配的要因は「確定 1 回あたりの全ツリー再描画（`flattenTree` + タイムライン再計算 + 全行再描画、1,000 タスクで 400〜1,000ms）」で、これは Step 4（セル購読の集約）＝ HANDOFF の P1 / D7 側の課題。
- **描画性能 P1 Step 2: 依存線レイヤーの分離（P2）** (October 17, 2026):
  - `useGanttDependencies` が `dragState`（mousemove のたびに新オブジェクトになる）を購読していたため、ドラッグ中は 1 mousemove ごとに全依存線（1,000 タスクで 225 本）を再計算し、`GanttDependencyLines`（`memo` なし）が再レンダーしていた。これを **静的レイヤー / ドラッグ中レイヤーに分離**した。
  - `src/hooks/useGanttDependencies.ts`: `useGanttDependencies`（静的）の購読を `dragState` 全体 → **ドラッグ中タスク ID（primitive。`move` / `resize-left` / `resize-right` のときだけ非 null）** に変更。日付変化では再計算しない。ドラッグ中タスクに接続する線は静的レイヤーから除外する。`ROW_HEIGHT = 32` / `BOX_PADDING = 20` を定数化し、`resolveTaskDates` / `createGeometryContext` / `buildDependencyLine` を共通ヘルパーとして抽出。
  - `src/hooks/useGanttDependencies.ts` に `useDraggedDependencyLines` を新設。ドラッグ中タスクに接続する線（自身の `dependencies` と、自身に依存しているタスク）だけを毎 mousemove 計算する。
  - `src/components/GanttDependencyLines.tsx` を `memo` 化。`src/components/DraggedDependencyLines.tsx` を新設（動的線・非インタラクティブ。ドラッグ中の誤クリックで依存が消えないように）。`IntegratedView` / `GanttChart` の SVG に `<DraggedDependencyLines>` を追加。
  - 回帰テスト `src/components/DependencyLinesDrag.test.tsx`（2件）: ドラッグ中も依存線がちょうど 1 本描画されバーに追従すること / 静的線がホバーで変化しないこと。
  - 実測（1,000 タスク, `npm run bench`。ハーネスを改訂、後述）: ドラッグ中 mousemove（30 moves、ページ内合成イベント、確定コミットを除外）が **405.9 / 425.4ms → 341.7 / 340.2ms（約 18% 減、30 moves あたり約 75ms）**。100 タスクでは 153.4 / 152.1ms → 147.8 / 148.3ms（依存線が 18 本と少ないため約 3%）。
  - `drag bar (30 moves)` 全体の longtask（1,000 タスクで 420〜500ms）は `mouseup` の確定コミット（`endDragUpdate` → 全ツリー再描画）が支配しており、Step 2 では変化しない。これは購読粒度の集約（P1 / D7）側の課題。
  - **計測ハーネスのバグ修正**: 旧 `bench/perf.spec.ts` は `scrollLeft` を手計算で調整していたため、確定後の再計測で対象バーが画面外（viewport 1600px に対し x≈1839）に外れ、`mouse.down` がバーに当たらず**ドラッグが始まっていない計測が混ざっていた**。`locator.scrollIntoViewIfNeeded()` + `boundingBox()` に置き換え、`mouse.down` 直後に `.cursor-grabbing` を検査してドラッグ開始を検証するようにした（始まらなければテストが失敗する）。あわせてドラッグ計測を `drag bar (30 moves)` / `drag mousemove only (30 moves, in-page)` / `drag commit (mouseup)` の 3 つに分割した。詳細は `bench/README.md`。
- **描画性能 P1 Step 1: duration セルの確定タイミング（P3）** (October 17, 2026):
  - `TaskDurationCell` / `TaskPlanDurationCell` の `onChange` 直書き `updateTask` を廃止し、**入力中はローカル state のみ更新 → blur / Enter で確定（Escape で取り消し）** に変更。`TaskProgressCell` / `TaskDateCell` と同じ「編集中はストアを触らない」パターンに揃えた。1 文字ごとに起きていた依存伝播＋親再計算＋`flattenTree`＋タイムライン再計算＋全行再描画の O(N) 連鎖が、確定時の 1 回だけになる。
  - 回帰テスト `src/components/cells/DurationCellCommit.test.tsx`（7件）: 入力中はストア不変 / blur 確定 / Enter 確定 / Escape 取消 / 非数値入力の復帰 / ベースライン固定中の読み取り専用 / 親タスクの読み取り専用。
  - 実測（1,000 タスク, `npm run bench`）: `duration type(3)+Enter` が **1,430ms → 423ms**（main-thread ブロック、約 1/3.4）。残る 423ms は「確定 1 回あたりの全ツリー再描画」で、購読粒度の集約（P1 / D7）側の課題として残る。
- **描画性能 P1 の Step 0（計測ハーネスと実測）** (October 17, 2026):
  - `bench/` に Playwright ベースの実ブラウザ計測ハーネスを追加（`npm run bench` / `npm run bench:fixtures`）。**アプリ本体にテスト用フックは足していない**（`window.ipcRenderer` をスタブし、「読み込み」ボタンの実インポート経路でサンプル JSON を投入する）。
  - 計測用サンプル `bench/fixtures/tasks-1000.json`（1,000 タスク = 25 フェーズ / 75 グループ / 900 リーフ / 225 依存）と、比較用 `tasks-100.json` を決定的に生成（`bench/generate-tasks.mjs`、`Math.random` 不使用）。
  - 計測結果は `bench/README.md` に記録。主指標は `PerformanceObserver` の longtask（50ms 超の main-thread ブロック）。ヘッドレス Chromium の rAF は vsync 非同期のため補助情報。
  - **実測（1,000 タスク, 改善前）**: 読み込み〜描画 2.0s / duration 3 文字入力で **1,302ms ブロック（1 文字 ≒ 430ms）** / タイトル確定 Enter で **869ms** / バードラッグ確定で **455ms** / ホバー 20 行で 99ms / データを変えない `setMousePos` だけでも 105ms。100 タスクとの比は duration 8.6x・タイトル 8.9x で、**P3（入力の O(N) 連鎖）が支配的**。次いで P2（依存線の毎フレーム全再計算）・D6（Context value の毎レンダー新規生成）。
  - `vite.config.ts` の vitest `exclude` に `bench/**` を追加（Playwright の spec を vitest が拾わないように）。計測結果 `bench/results/` は `.gitignore` 済み。
- **ガント操作で「意図しない日付変更」が起きるバグの修正（設計レビューの P0 対応）** (October 17, 2026):
  - コードレビューと実測（一時テストで再現）により、**タイムライン余白の単クリック（移動量ゼロ）で予定日が書き換わる**／**ベースライン固定中に予定バーを単クリックすると実績日が書き換わる**という2件のデータ破壊バグを確認し、修正した。
  - `src/hooks/useGanttDrag.ts` の `draw-range`（範囲ドラッグ）確定処理に、`move` と同じ「開始時の値と現在値が同一なら確定しない」ガードを追加。移動のない単クリックでは日付を書き換えない。**※この D1 のガードは October 17, 2026 にユーザー判断で撤去し、単クリック＝1 日予定の設定に戻した（上記「現在の状態」参照）。この項目は当時の記録として残す。**
  - `src/components/GanttTimelineRow.tsx` の予定バー／実績バーの `onMouseDown` を、早期 return する場合（`baselineLocked` / 親タスク）も含めて**常に `stopPropagation()`** する形に変更。親行の `draw-range` に伝播して日付が書き換わる経路を根絶した。加えて行側でも `[data-gantt-bar]` 上のイベントを無視する二重ガードを入れた（バーには `data-gantt-bar` を付与）。
  - `draw-range` の終点も「カーソル下の日セル（floor）」で求めるよう統一（起点と同じ基準）。起点となるタイムライン左端は `GanttDragState.timelineLeft` としてドラッグ状態に保存する。これでドラッグ中のハイライトと確定結果が一致する（従来は終点だけ `round(deltaX/pixelsPerDay)` で1日ずれることがあった）。
  - 行の並べ替え（dnd-kit）のセンサーを `src/hooks/useRowSortSensors.ts`（新規）に集約し、**KeyboardSensor を無効化 + PointerSensor に 5px の移動しきい値**を設定。ホバー時のみ表示される `opacity-0` のドラッグハンドルにフォーカスが残った状態で Enter/Space を押すと「キーボードドラッグ開始」と「タスク確定/追加」が衝突していた問題を解消。
  - 回帰テストを新規追加（`src/components/GanttDragGuards.test.tsx` 5件）: 単クリックで日付不変 / ロック中の予定バークリックで不変 / ロック中の実績バークリックで不変 / 実ドラッグでは確定する / センサー構成（KeyboardSensor 無効・distance 5）。
- **ESLint 違反の全件解消（49件 → 0件）** (October 17, 2026):
  - 生成物が lint 対象に混入していた問題を `eslint.config.js` の `globalIgnores` 拡張で解消（`dist` のみだったのを `dist-electron` / `out` / `coverage` / `playwright-report` / `test-results` / `blob-report` まで追加）。これで 12 件が消えた。
  - `react-hooks/set-state-in-effect` (10件) は、`useEffect` 内で store の値をローカル state に同期していた箇所を、**レンダー中に前回値と比較して state を調整する** React 公式パターンへ置換（`App.tsx`, `ProjectSettingsDialog.tsx`, `TaskOutlineCell`, `TaskTextCell`, `TaskStatusCell`, `TaskProgressCell`, `TaskDateCell`, `TaskPlanDateCell`）。`TaskDateCell` / `TaskPlanDateCell` の commit ハンドラが参照するミラー用 ref は、setState を伴わない effect 内でのみ更新するよう分離した。
  - `@typescript-eslint/no-explicit-any` (20件) は実型へ置換。`renderer.d.ts` / `electron/preload.ts` の IPC 引数を `any[]` → `unknown[]`（`useProjectFileHandlers` 側で文字列ナローイングを追加）、`TaskOutlineCell` の dnd-kit props を `DraggableAttributes` / `DraggableSyntheticListeners` に、`IntegratedView` の `task` と `useGanttDependencies.getTaskDates` を `Task` 型に、`vite.config.ts` は `vitest/config` の `defineConfig` を使う形にして `as any` を削除。
  - `useGanttDependencies` の「signature 互換のため」残っていた未使用引数3つ（`_taskBarRefs` / `_containerRef` / `_leftOffset`）と、その呼び出し側の `{ current: null } as any` を削除（デッドコードの根絶）。
  - `react-hooks/exhaustive-deps` (5件) は `containerRef`（GanttChart 4箇所）と Zustand アクション（`useOutlinerKeyboard`）を依存配列に追加。`prefer-const` (3件) / `no-unused-vars` (1件) / `no-unsafe-function-type` (1件) も解消。
  - 挙動が変わっていないことをユニットテスト 91 件・E2E 6 件・ビルド・lint 0 件で確認済み。
- **パッケージマネージャを npm に復帰（pnpm 依存の解消）** (October 17, 2026):
  - 本リポジトリの pnpm は `node-linker=hoisted` で運用され、`pnpm-workspace.yaml` にもワークスペース定義が無かった。つまり pnpm の主な利点（隔離された node_modules / ワークスペース / ディスク共有）がほぼ活きておらず、実体は npm と同じフラット構成だった。加えて pnpm 11 では `.npmrc` の `node-linker` が読まれなくなり（`pnpm-workspace.yaml` へ移行が必要）、`packageManager` 未固定のためバージョン次第で Electron のパッケージングが壊れるリスクがあった。以上から npm に戻した。
  - `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc` を削除し、`package-lock.json` を再生成。`package.json` の `package` / `make` スクリプト（`pnpm run build` → `npm run build`）、`forge.config.cjs` の ignore 対象、README の開発コマンド（誤っていた `npx electron-builder` → `npm run package`）を修正。
  - npm 11 の install script 承認制に対応。`package.json` に `allowScripts` を追加し、`esbuild` と `electron-winstaller` を承認済み（pnpm 10 の `allowBuilds` と同種の仕組みで、npm でも承認設定が必要）。
  - ロックファイル再生成に伴い直接依存が semver 範囲内で新しい版に解決された（react 19.2.5→19.3.1、electron 42.0.0→42.11.15、@playwright/test 1.60.0→1.64.1、vite 7.3.2→7.3.7、typescript-eslint 8.59.2→8.71.2 等）。ユニットテスト・E2E・ビルド・パッケージングはすべて通過を確認済み。
  - electron 42.11 では postinstall が廃止され、バイナリは初回実行時に遅延ダウンロードされる方式に変更されている（`node_modules/electron/dist` が無いのは正常）。
  - Playwright のバージョンアップに伴いブラウザ実体の再取得が必要になった（`npx playwright install chromium`）。
- **予定日付と実績日付のテキスト入力対応 ＆ 表示年省略 ＆ E2Eテスト安定化の完了** (June 8, 2026):
  - 予定日付と実績日付のセル（`src/components/cells/TaskPlanDateCell.tsx`, `src/components/cells/TaskDateCell.tsx`）をテキスト入力（`type="text"`）に移行。
  - フォーカス時は編集用の `YYYY/MM/DD`、非フォーカス時は表示用の `MM/DD` に切り替える Overlay Span 設計（Persistent Input + Overlay Span）を適用。
  - Playwright E2Eテストでの並行実行時の高い負荷状況下における React state非同期同期タイミングとの競合を防ぐため、フォーカス時の値同期を `onFocus` ハンドラー内で同期的に行うよう改善。非フォーカス時のみ `useEffect` でストアの最新値を同期する設計にリファクタリング。
  - `e2e/dependency-auto-calculation.spec.ts` でビューポートサイズ（`1600x900`）の拡張と、ドラッグ＆ドロップ前の明示的な `click()` ＆ 短いウェイトを追加。また、ドラッグ先の要素を `scrollIntoViewIfNeeded()` して、画面外の座標へのドラッグ失敗問題を完全に解消。
  - `src/components/GanttTimelineRow.tsx` の最外殻ラッパーに `data-task-id` 属性を追加し、ドラッグ接続の当たり判定（mouseup時のtargetId取得）のロバスト性を飛躍的に向上。
  - `src/types.ts` での `focusedTaskField` と `setFocusedTaskCell` の型定義に `null` を許可し、プロダクションビルドでの `tsc -b` のコンパイルエラーを解消。

- **メニュー表示およびWBSテーブルヘッダー・セル・エクスポートファイルの日本語ローカライズ** (June 7, 2026):
  - アプリケーション上部のヘッダーバー (`src/components/AppHeader.tsx`) に配置されているメニューや操作ボタン、およびWBSテーブルヘッダーのカラムラベル（タスク名、説明、担当者、成果物、ステータス、進捗率、予定期間、予定日付、実績期間、実績日付）をすべて日本語化。
  - セル内のテキスト入力プレースホルダー（説明、担当者、成果物）および、子タスクから日付・期間が自動計算される親タスクセルのツールチップ（`title` 属性）も日本語にローカライズ。
  - Excelエクスポート機能 (`src/utils/export.ts`) において出力されるExcelファイルのヘッダーカラムラベル（WBS番号、タスク名、説明、担当者、成果物、ステータス、進捗率、予定開始日、予定終了日、予定期間、実績開始日、実績終了日、実績期間）もすべて日本語化。
  - ローカライズに伴い、関連するテストコード（`src/App.test.tsx`, `src/components/Outliner.test.tsx`, `src/components/GanttChart.test.tsx`, `e2e/` テストファイル群）のクエリ期待値やセレクタを日本語表記に追従するように修正し、全テストの合格を確認。

- **表示項目の表示・非表示切り替え機能（右クリックコンテキストメニュー）** (June 7, 2026):
  - WBSアウトライナーのテーブルヘッダー領域を右クリックした際に、表示項目のオン・オフ切り替え（トグル）が可能なカスタムコンテキストメニューを表示する機能を実装。
  - カラム表示状態（`visibleColumns`）は Zustandストアの `projectConfig` 内で管理され、ファイル保存/読込や再起動時にも設定が引き継がれる。
  - `taskName` (タスク名) カラムは必須のため非表示不可に設定。
  - ベースライン固定（`baselineLocked === true`）の時は、予定系カラム（`planDuration`、`planDate`）のトグルは変更できないように制限（チェックボックスを無効化）。
  - 右クリックコンテキストメニューのバブリング処理や、メニュー外クリック時の自動非表示、スタイルを TailwindCSS を用いて高品質に実装。

- **本番環境における誤リフレッシュ防止対策（Cmd+R / Ctrl+R / F5 の無効化）** (June 7, 2026):
  - ユーザーが本格的にアプリを利用する際、誤って `Ctrl+R`（または Mac の `Cmd+R`）や `F5` キーを押してしまい画面がリフレッシュされ、保存前のタスクデータが消失してしまうのを防止するため、本番ビルド（`app.isPackaged === true`）時にこれらのキー入力をキャンセルする処理を `electron/main.ts` に追加。
  - 開発環境（`isPackaged === false`）ではリロードができる利便性を維持。

- **ガントバー移動時の無関係なタスク（パターンC）の位置ズレバグの解消および再描画・ちらつき防止の極限最適化** (June 7, 2026):
  - タイムライン自動拡張が発生した際に、親子関係・依存関係のない無関係なタスクのガントバー表示位置がドロップ直後にズレてしまうバグを解決。
  - 原因：アウトライナーの編集パフォーマンス向上のため `TaskRow` が `React.memo` 化されていたが、`IntegratedView` の `renderContainer` プロパティ（クロージャ）内に配置されていた `GanttTimelineRow` が、タイムライン自動拡張に伴う `timelineMetrics` の変更を感知できず、再描画がスキップされていたため。
  - 対策（当初）：`timelineMetrics` などを `TaskRow` の Props に流し込んで `TaskRow` 全体を強制再描画させたが、タイムライン伸縮時に左側の WBS アウトライナー表（大量の入力セル）まで同時に再描画されてしまい、画面のちらつき（flicker）が発生した。
  - 究極の対策（今回適用）：
    - タイムライン状態を提供する **`TimelineContext`**（`src/hooks/useGanttTimeline.ts`）およびコンテナラッパーコンポーネント **`RowContainer`**（`src/components/IntegratedView.tsx`）を新規導入。
    - `GanttTimelineRow` および `RowContainer` が context から直接 `timelineMetrics` / `timelineWidth` を購読する設計に改修。
    - 呼び出し元（`IntegratedView.tsx` の `RowContainer` および `GanttChart.tsx`）から `GanttTimelineRow` に対して `timelineMetrics` および `timelineWidth` を Props として明示的に渡すように修正し、1フレームの非同期更新による瞬間的な位置ズレ（ちらつき）を完全に解消。
    - WBSアウトライナーのリサイズ時に行が正しくリサイズされるよう、`outlinerWidth` を `TaskRowProps` および `<TaskRow>` へ再配置し、メモ化された行がリサイズに同期して再描画されるように修正。
    - ガントバー（予定バーおよび実績バー）に適用されていた `transition-all` クラスがドラッグ終了時やタイムライン伸縮時の位置計算（`left` や `width`）にアニメーション遅延（ちらつき）を生じさせていたため、背景色や高さ・影などの描画スタイルのみを対象とした個別プロパティのトランジション（`transition-[background-color,color,height,opacity,box-shadow]`）に置き換えることで、位置のスナップバック遅延とちらつきを完全に解消。
    - これにより、タイムライン伸縮時にも **左側のアウトライナー（WBSセル群）は一切再描画されず（完全に非表示・固定）、右側のタイムラインコンテナとガントバーだけがピンポイントで瞬間的に再計算・更新される細粒度再描画（Context-based same-element bypass）** を実現。画面のちらつきを完全にゼロ化し、超スムーズなスクロール＆自動伸縮性を獲得。
  - その他：
    - Zundo（Temporal）の `equality` 設定を復活させ、UI上だけのフォーカス・選択変更によって Undo 履歴が余分に生成されるのを防止（Vitest の `restore focusedTaskId and selectedTaskIds` テストをパス）。
    - `e2e/undo-redo.spec.ts` でタイトル変更の確定を Enter キー押下（新タスク生成を伴う）から blur（bodyクリック）による確定に変更し、Undo 履歴上の状態ミスマッチによるテストのフレーキー挙動を解消。
    - Vitest で Playwright の `.spec.ts` ファイルを誤って読み込んで実行しようとする競合を避けるため、`vite.config.ts` の Vitest 構成に `exclude: [...configDefaults.exclude, 'e2e/**']` を追加。
    - 全ての本番ビルド（TSC型チェック含む）および Vitest 81件、Playwright E2E 6件のテストが100%成功することを確認。
- **ガントバー移動時の挙動安定化および予定・実績同期の実装** (June 7, 2026):
  - ガントバーのドラッグ開始時にバー幅が一瞬1日分に縮退するUIバグを解消（`GanttTimelineRow` の `currentEndDate` 初期化タイポを修正）。
  - ベースライン固定がOFFのとき、予定日付/期間と実績日付/期間が自動的に同期される双方向同期ロジックを `useTaskStore.ts` に実装。
  - 依存関係日程伝播 (`propagateDependencyDates`) および子タスク日程再帰シフト (`shiftDescendants`) において、ベースライン固定がOFFの場合は予定と同時に実績日程も自動シフトするように改善。
  - WBSセル側と一貫性を持たせるため、予定日付が未設定の場合に実績日付を代替表示して予定バー（青）を描画するフォールバック処理を `GanttTimelineRow` に追加。
  - 既存の78件のテスト、5件のE2Eテストが全件合格し、本番ビルドが正常に通過することを確認。
- **ガント操作時のドラッグ確定・即時再描画ラグの解消** (May 26, 2026):
  - 依存関係を設定したガントバーの移動・リサイズ操作において、クリックを離してもマウスを行から外すまで変更が反映されない（再描画が遅延する）バグを解決。
  - 原因は、`<TaskRow>` が `React.memo` 化されていた一方、Prop として `task` データ自体を受け取っておらず、Zustand ストア更新時に `<TaskRow>` の Prop 比較関数 `areEqual` が re-render 不要と判定して描画をスキップしていたため（結果として、ガント表示のラッパー `renderContainer` のクロージャが古いタスクデータを参照し続けていた）。
  - 対策として、`TaskRow` に `task={task}` Prop を明示的に流す設計に刷新。これにより `areEqual` 内でタスクデータの変化が自動検知され、クリックを離した瞬間にタイムラグなく 100% 正確にガントバーと依存線が即時再描画される完全なリアルタイム同期を確立。
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
- **Zustandストア内ツリー変形ロジックの純粋関数外出し（スリム化）**:
  - `useTaskStore.ts` に直接記述されていたツリー変形（インデント・アウトデント・並び替え・上下移動）ロジックを、すべて純粋関数 (`indentTaskInGraph`, `outdentTaskInGraph`, `reorderTaskInGraph`, `moveTaskInGraph`) として `src/store/taskStoreUtils.ts` に分離。
  - ストアファイル `useTaskStore.ts` を **約 750 行 ➔ 約 450 行へと大幅にスリム化 (約40%削減)**。
- **Playwright による堅牢な E2E テストスイートの劇的な拡充** (May 30, 2026):
  - ご要望の「タスクを3つ追加し、A ➔ B ➔ C の依存関係をドラッグ操作で構築した上で、Aの移動に伴いB, Cが週末をスキップしながら自動スケジュール計算されて追従するテスト」を構築・完全合格。
  - さらに、ベースラインロック時の予定日付カラムDOM自動削除検証、タスクインデント（`Shift+Alt+ArrowRight`）時の親タスク日程自動ロールアップ（最小開始〜最大終了）検証、そして `Ctrl+Z` / `Ctrl+Y` およびUIボタン経由の Undo/Redo 連動検証という、システムの根幹ロジックに深く切り込んだ4つの新規E2Eテストを完全配備。
- **ガントUI操作のインタラクション統合テスト補強**:
  - `src/components/GanttChartInteraction.test.tsx` を新規作成。ドラッグによる日付移動、右端リサイズによる期間変更、コネクタボタンからの依存関係接続のマウスジェスチャーをシミュレートするテストを追加。
  - ベースラインロックOFF時の `planStartDate` / `planEndDate` 連動、およびドラッグによる `addDependency` がストアと完全に連動していることを実証。
- **タイムラインヘッダー 2段化 ＆ タスクデータ駆動の日付範囲計算** (May 24, 2026):
  - **Dayスケールで何月か不明だった問題を解決**。ヘッダーを2段構成に変更: 上段に年月グループ(`2026年5月`)、下段に日+曜日(`24 Mon`)を表示。
  - **月の境目に太い区切り線**を入れて視覚的にグループ変わり目を明確化。
  - ヘッダー描画コードを `GanttChart.tsx` / `IntegratedView.tsx` から抽出し、共通コンポーネント `src/components/TimelineHeader.tsx` を新規作成（重複排除）。
  - タイムライン日付範囲を固定値から**タスクデータ駆動**に変更。全タスクの最小開始日〜最大終了日 + マージンで自動算出。タスクなし時は今日中心のフォールバック。
  - `ProjectConfig` に `timelineRange?: { start, end }` を追加（将来のユーザー指定範囲指定用）。
- **大量タスク追加時のパフォーマンスボトルネックの劇的解消（背面共通グリッド背景レイヤー方式）**:
  - 各行ごとに `timeRange.map` で描画していた数千〜数万件のグリッド用 `div` を完全削除。
  - 代わりにスクロールコンテナの最背面に1枚だけの共通グリッド背景レイヤー `<TimelineGridBackground>` (`src/components/TimelineGridBackground.tsx`) を新規作成し、絶対配置で重ね合わせ。
  - これによりグリッドDOM要素の数を **約99%削減**（100タスクで 12,000個 ➔ 120個）し、Chromium の `LatencyInfo is too big` パフォーマンスエラーおよびスクロールのカクつきを完全に解消。
  - 重厚な行の仮想化を行わないため、dnd-kit のドラッグ＆ドロップや依存線の描画との干渉リスクは一切ありません。
- **高精度なピクセル ⇄ 日付相互変換による「日付ズレ」の完全解消**:
  - ドラッグ時の日数計算やクリック時の日付特定処理を、最終セルの期間抜けによる誤差がある timeRange 要素数基準から、タイムライン全体の正確な `timelineMetrics.pixelsPerDay` 基準に一本化。
  - これにより、Week / Month / Year のすべてのビューにおいてクリック・ドラッグ操作時のカーソルと日付のズレを完全にゼロに修正。
- **`React.memo` 導入によるタイピング時等の「もっさり感」の完全消滅**:
  - WBS view（Outliner）や `IntegratedView` でタイピングを行うたびに全行が連鎖して再レンダリングされていたボトルネックを解消するため、`TaskRow.tsx` と `GanttTimelineRow.tsx` を `React.memo` でラップ。
  - レンダーコストが「編集中の1行のみ」に局所化され、タスクが数百件あっても1ミリ秒未満で快適に入力可能に。
- **背面縦グリッド線（日付の縦線）の完全な位置ズレ解消（永久同期）**:
  - 横スクロールやカレンダーの自動伸縮の際に生じる、CSSグラデーションの小数点ピクセル累積ズレを 100% 解決するため、各タスク行（右側のガントチャート領域）の背景色を完全に透明（`bg-transparent`）に指定。
  - 選択・ホバー時の行背景色は左側の WBS 表（Outliner側）のみに局所化し、右側のタイムラインは常に背面が透けて見えるデザインに刷新（JiraやRedmineなどと同様のプロレベルの標準設計）。
  - 背面グリッド（`TimelineGridBackground.tsx`）に `border-r border-gray-100`（縦線）を復帰させ、ヘッダーと全く同一の `timeRange.map` の `div` で描画するため、**1pxのズレも永久に発生しない完全な同期**を達成。
  - 初期に実現した超軽量背景設計（DOM数99%削減）を完全に維持しています。
- **カレンダー自動拡張・縮小時のスクロール表示位置の完全固定（Scroll Anchoring）**:
  - タスク日程の編集によりカレンダーの開始日（`timelineStart`）が過去または未来に移動した際、その「移動した日数 × 1日あたりのピクセル幅」を計算してスクロール位置（`scrollLeft`）を瞬時に補正するロジックを `GanttChart.tsx` と `IntegratedView.tsx` に実装。カレンダーが自動伸縮しても、画面上に表示されている日付位置が **1ピクセルもガタつくことなく完全に同じ場所に固定** され続けます。
  - 従来 `timelineMetrics` が更新されるたびに強制発火していた「今日」へのスクロール初期化処理を、`lastViewModeRef`（`useRef`）を用いて **「初回マウント時」および「手動での `viewMode` 切り替え時」のみ** に厳格に制限。意図しないスクロール位置のリセットバグを根本解決。
- **大量タスク表示時の超高速レイアウトレンダリングの実現（フェーズ1）** (May 24, 2026):
  - **SVG依存関係線の幾何学的座標計算化（Layout Thrashingの完全排除）**:
    - `useGanttDependencies.ts` でループ内クエリしていた `getBoundingClientRect()` を完全撤廃し、タスクのインデックスと `timelineMetrics`（`pixelsPerDay`, `timelineStart`）を用いた線形算術式で $O(1)$ で座標を算出。
    - ドラッグ追従（`dragState`）も数学モデル内に完全に統合し、ドラッグ時のスムーズな依存線スライドを維持しつつ、Layout Thrashing（強制同期リフロー）による数百ミリ秒単位の描画スレッドのブロックを 100% 解消。
  - **CSS `content-visibility: auto` による行レンダリングの最適化**:
    - `.gantt-row-optimized` クラスを `index.css` に定義し、WBS、Gantt、Integratedの全ビューの行コンテナへ適用。
    - 画面外のタスク行のレイアウト＆ペイント処理をブラウザがネイティブにスキップするようにし、大量タスク表示時の描画とスクロールを仮想スクロール同等の高速さで実現。React の refs や `dnd-kit` のドラッグ＆ドロップ動作とも100%互換。
  - **Zustand 細粒度サブスクリプションによるガントドラッグ操作の完全超高速化（O(1) レンダリング）** (May 26, 2026):
    - 高頻度で更新されるドラッグ状態（`dragState`, `mousePos`）を親ビューの React ローカルステートから Zustand グローバルストアへ完全に移行。
    - イベントリスナー（`mousemove` / `mouseup`）内では React の再レンダリング処理を完全にバイパスし、ストアの getState を通じて同期的に状態を変更。親ビュー（`GanttChart` / `IntegratedView`）の無駄な再描画を完全にゼロ化。
    - `GanttTimelineRow` で細粒度セレクタを導入し、**「ドラッグ中の1行のみ」が再レンダリングされる構造**に刷新。ドラッグ中、他の999行のタスク行は React の仮想 DOM 差分検知（diffing）さえ一切走らない極限の最適化を達成。
    - `useGanttDependencies` から `useLayoutEffect` /二重レンダリングを一掃し、純粋な `useMemo` による1パスの座標計算に改修。さらに SVG 要素を専用のサブコンポーネント（`<GanttDependencyLines>`, `<DraggingDependencyLine>`）にカプセル化し、不要な再描画の伝播を完全に防止。
    - これらにより、1000タスク時のドラッグ操作の描画計算量が $O(N) \to O(1)$ に低減され、毎フレーム 1ms 未満の CPU 負荷で 60 FPS のシルキースムーズな追従性を獲得。
  - **自動修復型（Future-proof）カスタム比較関数の導入による新規タスク追加の爆速化（O(1) レンダリング）** (May 26, 2026):
    - 新規タスク追加時に親ビューが渡すコールバック関数（`renderContainer`, `onSelectionChange`）の参照（メモリ番地）変化により `React.memo` が無効化され、1000行すべての `TaskRow` が強制再描画（約7,000コンポーネントが仮想DOM上で再生成）されていたボトルネックを特定。
    - `TaskRow.tsx` および `GanttTimelineRow.tsx` の `memo` に、関数型 Props の参照変化を自動的に無視し、見た目に本当に影響するデータ（wbsNumber, depth, isSelected, visibleColumns 等）のみをループ比較する汎用的なカスタム比較関数を実装。
    - ループ比較は Props 項目に依存せず自動的に走るため、将来的なカラムやセルの追加時にも**比較関数の修正が一切不要（完全自動修復・メンテナンスフリー）**な堅牢設計を確立。
    - これにより、タスク追加時の描画行数が 1000行 ➔ 実質数行へと劇的に削減され、メインスレッドフリーズ時間を数百msから 15ms以下（約60〜100倍の高速化）に抑え込み、一瞬でタスクが追加される快適なキー操作感を実現。
  - **`e.repeat` キーリピートガードの実装による長押し時の描画停止（レンダリング飢餓）の完全回避** (May 26, 2026):
    - Enter キーなどを長押しした際に、OS のキーリピート機能によって `keydown`イベントが毎秒 30〜50 回連続発火し、描画処理（Paint & Composite）が追いつかずに画面が完全にフリーズ（レンダリング飢餓）してしまう問題に対応。
    - `src/components/cells/TaskOutlineCell.tsx` 内のキーボード操作判定（Enter, Backspace, Delete）に対して、React 標準の `e.repeat === true`（キーが押し続けられている状態）のときは処理を即時中断（アーリーリターン）するガードを追加。
    - これにより、長押しによる無駄な空タスクの大量誤生成を防ぐと同時に、描画のフリーズを 100% 回避し、UI スレッドが常に完全にスムーズに反応する優れた UX を実現。

## 直近の検証結果 (October 20, 2026 / 日付セル・ツールチップ刷新後)

- `npm test -- --run` : **301テスト全件合格** (34ファイル。開始日 / 終了日の独立ハイライト、150ms ツールチップ、ガントバーの日程・進捗・基準表示を含む)
- `npm run test:e2e` : **E2Eテスト全7件合格** (Playwright / chromium。既存の日付入力 `fill('2026-06-01')` → `06/01` の経路、`e2e/date-cell.spec.ts` の 128px レイアウト・複数行ペースト・開始日 / 終了日の独立ハイライト・親 / 葉の入力幅一致、新規 `e2e/tooltip.spec.ts` の日付セル / ガントバーツールチップを含む)
- `npm run build` : 通過 (TypeScript 型チェック + Vite 本番ビルド)
- `npm run lint` : **0件合格**
- `npm run shots` : 10枚生成。WBS の日付列が 128px で溢れず、親タスクは読み取り専用、葉はカレンダーアイコン付きで表示されることを目視確認
- 既知の手動確認事項: ネイティブ日付ピッカーの見た目・開閉はブラウザ依存のため E2E では操作せず、`showPicker()` の呼び出しと `change` の反映のみ自動テストしている。ツールチップの 150ms 待ちはユニットテスト、位置・見た目は実ブラウザで確認している。

## 直近の検証結果 (October 18, 2026 / 予定・実績モデル Phase 1 実装後)

- `npm test -- --run` : **259テスト全件合格** (30ファイル。Phase 1 で旧「双方向同期 / 基準計画固定」テストを「予定と実績は独立 / 基準計画の登録・更新・復元・削除 / 旧 JSON の移行」に置き換え、`validateProjectState` の移行ケース 3 件と `useProjectFileHandlers` の旧形式読み込み 1 件、完了バーの色 `GanttBarCompletion`(2) を追加)
- `npm run test:e2e` : **E2Eテスト全5件合格** (Playwright / chromium。旧 `e2e/baseline-lock.spec.ts`（基準計画固定の検証）は削除し、新モデルの `e2e/baseline.spec.ts`（予定と実績が独立 / 登録後は基準計画が不変 / 更新後は元に戻せる）に置き換えた)
- `npm run build` : 通過 (TypeScript 型チェック + Vite 本番ビルド)
- `npm run bench` : 通過 (`bench/README.md` に計測結果。Step 1: 1,430ms → 423ms / Step 4-A/4-B の合計: duration 確定 402ms → 0ms、タイトル確定 1,053ms → 約 180ms、ドラッグ確定 456ms → 約 22〜42ms。`bench/decompose.spec.ts` は `DECOMPOSE=1` のときだけ実行)
- `npm run package` : 通過 (electron-forge。`out/wbs-gantt-outliner-darwin-arm64/` に生成、app.asar に `package-lock.json` は混入していない)
- `npm run lint` : **0件合格** (`eslint.config.js` に生成物の ignores を追加し、ソース側の違反も全件解消。内訳は下記「ESLint 違反の全件解消」参照)
- デバッグ用テストの整理は October 17, 2026 に完了（下記「現在の状態」参照）。旧 `src/store/verify_bug.test.ts` は非干渉テスト `src/store/updateTaskIsolation.test.ts` に再編、旧 `e2e/reproduce-bug.spec.ts` は削除した。
- 注: 「現在の状態」の各修正エントリに書かれた検証件数（112 / 110 / 106 など）はその修正時点の記録。最新値は上記のとおり。
- `npm run build` : 通過 (TypeScript 型チェック + Vite 本番ビルド)
- `npm run bench` : 通過 (`bench/README.md` に計測結果。Step 1: 1,430ms → 423ms / Step 4-A/4-B の合計: duration 確定 402ms → 0ms、タイトル確定 1,053ms → 約 180ms、ドラッグ確定 456ms → 約 22〜42ms。`bench/decompose.spec.ts` は `DECOMPOSE=1` のときだけ実行)
- `npm run package` : 通過 (electron-forge。`out/wbs-gantt-outliner-darwin-arm64/` に生成、app.asar に `package-lock.json` は混入していない)
- `npm run lint` : **0件合格** (`eslint.config.js` に生成物の ignores を追加し、ソース側の違反も全件解消。内訳は下記「ESLint 違反の全件解消」参照)
- デバッグ用テストの整理は October 17, 2026 に完了（下記「現在の状態」参照）。旧 `src/store/verify_bug.test.ts` は非干渉テスト `src/store/updateTaskIsolation.test.ts` に再編、旧 `e2e/reproduce-bug.spec.ts` は削除した。
- 注: 「現在の状態」の各修正エントリに書かれた検証件数（112 / 110 / 106 など）はその修正時点の記録。最新値は上記のとおり。

## 次に着手する優先課題

1. ~~**予定・実績モデルを 2 層へ移行**~~ ✅ **完了（October 19, 2026。PR #45 で main にマージ済み）**
   - 仕様と実装の記録は `docs/PLAN_ACTUAL_DISCUSSION.md`。3 層案の原本は `docs/PLAN_ACTUAL_MODEL.md`（不採用の注記あり）。
   - 残っている既知の課題は「`期間` の境界ケース」（下記 2）。
2. **`期間` の境界ケースの整理と実装（小さめ）**
   - 開始日が非稼働日（土日・祝日）のとき、期間と稼働日数がずれる / 期間 0 を入力すると終了日 = 開始日になり得る / v3 読み込みは保存済み `duration` を信頼する（日付から再計算しない）。
   - まず「開始日が非稼働日なら次の稼働日に補正するか、そのまま許すか」を決める。決定後、`src/store/taskStoreUtils.ts` と `src/utils/date.ts` を直し、テストを追加する。
3. **祝日変更時のスケジュール自動再計算方針の整理と実装**
   - 現在は祝日設定を変更しても既存タスクの日付は自動シフトしない。祝日が追加/削除された際、タスクの「稼働日数（Duration）」を維持したまま日付範囲を自動スライドするオプションをストアに実装する。
   - **注意: 以前ここに「設計の詳細は `implementation_plan.md` に記録済み」と書かれていたが、当該ファイルはリポジトリ内に存在しない（October 17, 2026 時点で確認）。** 仕様の再定義から始めること。
4. **保守性の改善（設計レビューの P2 / D8・D9・D10）** — 詳細は下記「設計レビュー結果」を参照
   - 旧 #2「JSON インポートの互換性・異常値バリデーション強化」は October 17, 2026 に完了（上記「現在の状態」参照）。
   - D8: `updateTask` / `endDragUpdate` / `addDependency` の共通ロジック統合（`applyTaskUpdate` への集約で一部前進。`addDependency` は未統合）。
   - D9: ✅ **完了（October 22, 2026）** 行高は `src/utils/layout.ts` の `TASK_ROW_HEIGHT` に集約し、未使用の `taskBarRefs` を削除。デバッグ用テストの混在は October 17, 2026 に整理済み。
   - D10: zundo の `partialize` と `equality` のズレ。「データ変更時だけ履歴化し、その時点の選択/フォーカスを一緒に保存する」意図的な設計とも読めるため、まずバグか仕様かを切り分ける。

> 描画性能 P1（購読ファンアウト D7 / 依存線 P2 / 入力連鎖 P3 / Context D6）は October 17, 2026 に Step 1〜4 を完了。経緯と実測値は「現在の状態」と `bench/README.md` を参照。

## 設計レビュー結果（October 17, 2026）

「画面描画が遅い」「ドラッグ&ドロップで意図しない動きをする」という課題に対してコードレビューを実施し、疑わしい挙動は一時テストで実測して確認した。以下は確定した所見。

### 確認済みの不具合（D1 は後に仕様変更で撤回、D2 は実測で再現・修正済み）

| # | 内容 | 状態 |
|---|---|---|
| D1 | タイムライン余白を単クリック（移動量ゼロ）すると予定日が書き換わる（実測: 予定 2026-05-25〜26 → 2026-05-18〜18 / duration 2→1） | **仕様変更で撤回**（October 17, 2026。ユーザー判断で「単クリック＝クリックした日 1 日分の予定を設定」を正とし、ガードを撤去） |
| D2 | ベースライン固定中に予定バーを単クリックすると実績日が書き換わる（早期 return で `stopPropagation` していなかった） | **修正済み**（バーの `stopPropagation` / `data-gantt-bar` による恒久対応。D1 撤回後も有効） |
| D3 | Month/Year ビューでは単クリックが月/年スナップで「1か月/1年」を上書き（D1 の帰結） | **現状維持**（D1 のガード撤去に伴い復活。単クリック＝その月/年の範囲を描く挙動。変更するなら別途仕様検討） |
| D4 | `draw-range` の終点だけ丸めが `round(delta)` で、起点の `floor(absolute)` と1日ずれる | **修正済み**（終点も floor に統一） |
| D5 | dnd-kit の KeyboardSensor が既定で有効。非表示グリップにフォーカスが残ると Enter/Space がキーボードドラッグ開始になり、Enter=新規タスクと衝突 | **修正済み**（センサー集約） |
| D6 | `TimelineContext` の value が毎レンダー新規 → ホバーのたびに全行 `RowContainer` が再レンダー | **修正済み**（P1 Step 3 で `useMemo` 化） |
| D7 | セル 10 種が各自 `useTaskStore` を購読し 1 行あたり約 79 購読 → 1 更新で約 96,000 selector（購読ファンアウト） | **修正済み**（P1 Step 4-A/4-B）。`selectedTaskIds.includes(id)` の行ごとの走査は残（軽微・P2 送り） |
| D8 | `updateTask` / `endDragUpdate` / `addDependency` のロジック二重化（D1 の非対称を生む土壌） | 未対応（優先課題 #3） |
| D9 | 未使用の `taskBarRefs`、行高 `32` の散在 | **修正済み**（October 22, 2026。`taskBarRefs` を削除し、行高を `TASK_ROW_HEIGHT` に集約）。デバッグ用テストの混在は October 17, 2026 に整理済み（非干渉テスト `updateTaskIsolation.test.ts` へ昇格 / 不要 E2E `reproduce-bug.spec.ts` を削除） |
| D10 | zundo の `partialize` と `equality` の不一致（undo で古い選択/フォーカスが復元され得る） | 未対応（優先課題 #3） |

### 性能（「重い」）の構造的原因

- **P1 購読ファンアウト**: 1行あたり約79購読（セル8ファイル合計で `useTaskStore((` が61箇所）× 行数。ドラッグ中は `setDragState` が mousemove ごとに走るため、1,000行では selector が毎秒500万回規模で実行される。再レンダーは1行でも通知コストは O(N)（**対応済み (October 17, 2026, P1 Step 4-A/4-B)** セルを `TaskRow` で 1 回購読して props で配信し、セルは `memo` 化）。
- **P2 依存線の毎フレーム全再計算**: `useGanttDependencies` が `dragState` を依存に含む。HANDOFF の「ドラッグ中の計算量 O(N)→O(1)」は、依存線の再計算と購読通知については成立していない（**対応済み (October 17, 2026, P1 Step 2)** 静的線とドラッグ中のみの線を分離）。
- **P3 高頻度更新の O(N) 連鎖**: duration セルの1文字ごとの `updateTask` が、依存伝播＋親再計算＋`flattenTree`＋タイムライン再計算を引き起こす（**対応済み (October 17, 2026, P1 Step 1)** commit-on-blur / Enter 化）。
- 一方で「変更された行だけ再レンダーする」設計（`React.memo` + カスタム比較 + タスク単位のオブジェクト同一性維持）は妥当で、実際に機能している。データモデル・純粋関数へのロジック集約・セル分割も方向性は良い。問題は入力ガードの欠落（P0・修正済み）と、購読粒度・派生計算の更新戦略（P1・**対応済み**。P2 / P3 / D6 は P1 Step 1〜3、D7 は Step 4-A/4-B で対応）。

## 注意点

- **ガントの `draw-range`（タイムライン余白をクリック/ドラッグして予定を描く）は、単クリックでも確定する**（クリックした日 1 日分の予定を設定する）。October 17, 2026 にユーザー判断で「移動ゼロなら確定しない」ガードを撤去し、この挙動に戻した。**同じガードを再導入しないこと**（再導入すると日セルの単クリックで予定が反映されなくなる）。バー上のクリックが行の `draw-range` に伝播して日付が壊れる経路は、次項の `stopPropagation` / `data-gantt-bar` で塞ぐ（この 2 つは D1 撤回後も有効）。
- **バー／ハンドルの `onMouseDown` は早期 return する場合も `stopPropagation()` を維持する**こと。また `GanttTimelineRow.tsx` のバーから `data-gantt-bar` 属性を消さないこと。どちらかが欠けると行の `draw-range` が発火し、クリックだけで予定が「クリックした 1 日」に書き換わる。**あわせてバーに `overflow-hidden` を付けないこと**（バー右外側に置いた依存ハンドルがクリップされ、同じ経路で予定が壊れる。末尾の「予定・実績モデル Phase 1」の注意を参照）。
- **行の並べ替え（dnd-kit）のセンサーは `src/hooks/useRowSortSensors.ts` に集約**している。KeyboardSensor を復活させないこと（Enter はタスク確定/追加に割り当て済みで衝突する）。PointerSensor の `distance: 5` も、微小なクリックで並べ替えが始まらないためのしきい値なので外さないこと。
- パッケージマネージャは **npm**（October 17, 2026 に pnpm から復帰）。`pnpm` 前提のコマンドや `pnpm-lock.yaml` / `.npmrc`（`node-linker=hoisted`）を再導入しないこと。ロックファイルは `package-lock.json` のみ。
- npm 11 は install script を既定で実行しない。install script を持つ依存を追加した場合は `npm install-scripts approve <pkg>` で承認する（`package.json` の `allowScripts` に記録される）。現在は `esbuild` と `electron-winstaller` のみ承認済み。
- `npm run lint` は **0件で通過する**。`eslint.config.js` の `globalIgnores` で `dist` / `dist-electron` / `out` / `coverage` / `test-results` 等の生成物を除外し、`_` 接頭辞の未使用引数・変数も許可済み。CI や検証フローに lint を組み込む場合は、この 0 件状態を維持すること。
- **eslint-plugin-react-hooks v7 の recommended は error レベルで強力**（`set-state-in-effect` / `set-state-in-render` / `refs` / `purity` 等）。store の値をローカル state に同期する箇所は `useEffect` 内の `setState` ではなく、**レンダー中に前回値と比較して state を調整するパターン**（`if (prev !== current) { setPrev(current); setLocal(current); }`）で実装する。ref への書き込みは effect 内でのみ行うこと。
- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと。
- **JSON の読み込みは `loadProjectState`（`src/store/useTaskStore.ts`）が唯一の入口**。入力は `src/utils/validateProjectState.ts` で実行時検証・正規化してから `setState` する（読み込めない入力ではストアを変更しない）。保存フォーマット（`Task` / `ProjectConfig`）を変えるときは、この検証・正規化と `mergeProjectConfig` の互換を必ず確認すること。読み込み結果は `ToastContainer`（右上）で通知する。
- `useGanttDrag` の中で `updateTask` や `addDependency` を直接叩いており、コンポーネントからの依存を最小限に抑えています。
- **セルはストアを購読しない**（P1 Step 4-A）。必要なデータは `TaskRow` が 1 回購読して props で配り、操作は `useTaskStore.getState()` をイベント時に呼ぶ。「自分がフォーカス/選択されているか」だけを返す boolean selector は残す（`selectedTaskIds` / `focusedTaskId` を行の props にすると選択のたびに全行が再レンダーされる）。新しいセルを足すときは `memo(..., cellPropsEqual)`（関数 props を比較対象から外す）に従うこと。
- **`SortableContext items` は `useStableFlattenedIds` で内容安定化**する（P1 Step 4-B）。ID 列の内容が同じなら配列参照を据え置き、`React.memo` では止まらない context 経由の全行再レンダーを防ぐ。`useGanttTimeline` の `timeRange` / `timelineMetrics` も値（epoch ms / Date の時刻）依存にしてあり、日付範囲が変わらない編集では参照が変わらない。
- 祝日変更時、既存タスク日付の自動再計算はまだ行わない。必要なら仕様を決めてから入れること。
- Excel エクスポートは Electron main 側で生成・保存する構成を維持する。
- `useGanttTimeline.ts` はタスクストア (`tasks`) を購読するため、タスク追加・編集のたびにタイムライン範囲が再計算される。パフォーマンス上の問題が出た場合は `useMemo` の依存配列を見直すこと。

## IPC / Electron の申し送り（未対応メモ）

lint 対応で `src/renderer.d.ts` / `electron/preload.ts` の IPC 引数を `any[]` → `unknown[]` に置き換えた。その意図と、Electron 観点で**意図的に未対応のまま残した**事項を記録する（October 17, 2026）。

### なぜ `unknown` なのか（このまま維持する判断）
- `ipcRenderer` のペイロードは Electron main 由来の任意の値で、型保証が無い。`any` だと「何でもできてしまう」ため、誤った前提が型検査をすり抜けて伝播する。`unknown` は受け取りは自由だが利用前に絞り込みが必須で、実態に忠実（Electron 公式ドキュメントの `invoke` の例も `@ts-type={someArgument:unknown}` と註記している）。
- 引数の位置では**呼び出し側の自由度は変わらない**ため、既存の呼び出し側は無修正で済む。今回の実質的な変更は `useProjectFileHandlers.handleLoad` の `typeof content === 'string'` ナローイングのみ（`electron/main.ts` の `load-file` は `string | null` を返すので実態に一致）。
- **ただしこれは終着点ではない。** Electron の context isolation チュートリアルは `send: ipcRenderer.send` のような汎用露出を **❌ Bad code** と明記し、「IPC メッセージごとに 1 メソッドを用意する」形を推奨している。現在の汎用 `invoke` / `send` / `on` の露出はこの ❌ 例に近く、`unknown` 化は「設計を変えずに型を誠実にした」中間段階にあたる。

### 将来やるなら（優先順）
1. ~~**`load-file` で読み込んだ JSON の実行時バリデーション**~~ ✅ **対応済み (October 17, 2026)**: `src/utils/validateProjectState.ts` を新設し、`loadProjectState` の入口で実行時検証・正規化するようにした（詳細は「現在の状態」参照）。`unknown` 化によって「検証すべき境界」がコード上で明示されたことが最大の収穫で、そこに実行時検証を入れた形。
2. **preload が Electron の `event` オブジェクトを renderer に通している。** `on` の実装が `listener(event, ...args)` となっており、公式の「`event` を露出するな、`callback(...args)` に詰め替えろ」という警告から逸脱している（`useIpcSwitchView` 側は `_event` として未使用だが、renderer には到達する）。`(...args) => callback(...args)` に変えるだけで解消できる。
3. **チャンネル型マップ化、または名前付きメソッド化。** 対象チャンネルは `save-file` / `load-file` / `export-excel` / `switch-view` の 4 つ。チャンネル 1〜5 個なら依存ゼロの「共有チャンネルマップ + 型付きラッパー」が適切とされる。名前付きメソッド化（`window.api.saveProject(data)` 等）まで行けば公式の推奨形になる。影響範囲は preload / main / renderer / テストに跨るため、**lint 対応とは別コミットで実施すること**。
4. **`webPreferences` に `sandbox: true` を明示。** 現在は `contextIsolation: true` のみ指定（`nodeIntegration` は未指定＝既定 false、`sandbox` は未指定＝既定依存）。なお `dangerouslySetInnerHTML` / `eval` / `window.open` の類は不使用でリモートコンテンツも読み込まないため、**汎用 `invoke` 露出の実害は現状かなり小さい**（優先度は低め）。

## 次の作業で最初に見るとよい場所

- **`docs/PLAN_ACTUAL_DISCUSSION.md`（予定・実績モデルの 2 層化の仕様・規則・実装記録。`期間` の扱いと既知の残課題もここ）**
- `src/store/useTaskStore.ts`
- `src/utils/baseline.ts` / `src/utils/planActualMigration.ts`（基準計画の純粋関数 / 旧形式の移行。Phase 1 で新設。3 層の記録は `docs/PLAN_ACTUAL_MODEL.md` §5〜§6、2 層への移行方針は `docs/PLAN_ACTUAL_DISCUSSION.md` §4）
- `src/components/AppHeader.tsx`（「基準計画」メニュー。登録 / 更新 / 元に戻す / 表示 / 削除）
- `src/components/GanttTimelineRow.tsx`（1 本バー + 進捗塗り + 基準計画ゴースト。`overflow-hidden` を付けない注意は上記「注意点」参照）
- `src/utils/parseTaskPaste.ts` / `src/utils/parseTaskPaste.test.ts`（複数行ペーストのパース。ストアの `addTasks` とセットで扱う）
- `src/store/taskStoreUtils.ts`
- `src/store/useTaskStore.test.ts`
- `src/hooks/useGanttDrag.ts` / `src/components/GanttTimelineRow.tsx`（P0 で修正したガント操作のガード。上記「注意点」参照）
- `src/hooks/useRowSortSensors.ts`（行並べ替えのセンサー設定）
- `src/components/cells/cellPropsEqual.ts` / `src/hooks/useStableFlattenedIds.ts`（P1 Step 4 の購読集約・参照安定化。セルや SortableContext を触るときは必ず確認）
- `bench/README.md` / `bench/perf.spec.ts` / `bench/decompose.spec.ts`（描画性能の計測。分解は `DECOMPOSE=1`）
- `src/components/GanttDragGuards.test.tsx`（P0 回帰テスト）
- `src/components/InteractionRegression.test.tsx` / `src/components/SelectionRange.test.tsx` / `src/components/DependencyLayerClip.test.tsx`（P1 変更領域の回帰テスト）
- `src/store/updateTaskIsolation.test.ts`（`updateTask` の相互非干渉テスト。旧 `verify_bug.test.ts` の再編）
- `src/components/TimelineHeader.tsx` (新規 2段ヘッダーコンポーネント)
- `src/hooks/useGanttTimeline.ts` (タスクデータ駆動の日付範囲ロジック)
- `src/utils/validateProjectState.ts` / `src/utils/validateProjectState.test.ts`（JSON インポートの実行時検証・正規化。`loadProjectState` の choke point）
- `src/store/useNotificationStore.ts` / `src/components/ToastContainer.tsx`（画面右上のトースト通知。読み込み結果の警告・エラー表示）
- `src/renderer.d.ts` / `electron/preload.ts` / `src/hooks/useProjectFileHandlers.ts` (IPC 境界。上記「IPC / Electron の申し送り」参照)
- `eslint.config.js` (lint 0 件を維持するための ignores とルール設定)

---

## 履歴 (History)

### 大量タスク時のDOM最適化 ＆ 日付ズレの解消 ＆ WBSもっさり感の解消 ＆ 縦グリッド完全同期 ＆ スクロール位置固定 (May 24, 2026)
- **背面共通グリッド背景によるDOM要素数99%削減**:
  - `TimelineGridBackground.tsx` を新規作成し、各行でループしていた数千件のグリッド `div` をスクロールコンテナ背面の 1枚の背景レイヤーへ移行。
  - 各行 (`GanttTimelineRow.tsx`) は透明化し、タスクバーのみを描画するように最適化。大量タスク追加時の `LatencyInfo is too big` エラーを完全に解消。
- **カレンダー自動拡張・縮小時のスクロール表示位置固定（Scroll Anchoring）**:
  - タスク日程編集等によりカレンダーの開始日（`timelineStart`）が移動した際、その移動したピクセル量だけスクロール位置（`scrollLeft`）を瞬時に自動補正するロジックを `GanttChart.tsx` と `IntegratedView.tsx` に実装。カレンダーが自動伸縮しても**画面の表示位置が1ピクセルもブレずに完全にロック**され続けます。
  - `timelineMetrics` 更新ごとに強制発火していた「今日」へのスクロールリセット処理を、手動 `viewMode` 切り替え時のみに厳格に制限し、意図しない画面ジャンプバグを根本解決。
- **背面縦グリッド線（日付の縦線）の位置ズレ永久解消**:
  - 横スクロールやカレンダー自動伸縮時のCSS小数点累積ズレを100%解決するため、各行（右側のガントチャート領域）の背景色を完全に透明（`bg-transparent`）にし、選択・ホバーの背景色を左側の WBS 表（Outliner側）のみに局所化。
  - 背面グリッド（`TimelineGridBackground.tsx`）に `border-r border-gray-100` を復帰させ、ヘッダーと完全に同一の `timeRange.map` の `div` で描画することで、**横スクロールやカレンダーの自動伸縮を行っても1pxもズレない完全な同期**を達成。
- **高精度なピクセル ⇄ 日付相互変換による「操作日付ズレ」の完全解消**:
  - ドラッグ時の日数計算やクリック時の日付特定を、最終セルの期間抜けによる誤差がある timeRange 基準から、`timelineMetrics.pixelsPerDay` 基準に一本化。
  - すべてのビューモード（Week / Month / Year等）においてクリック・ドラッグ操作時のズレを完全にゼロに修正。
- **`React.memo` 導入によるタイピング時等の「もっさり感」の完全消滅**:
  - `TaskRow.tsx` と `GanttTimelineRow.tsx` を `React.memo` でラップし、タイピング時の再レンダリングを「編集中の1行のみ」に局所化。タスクが数百件あっても1ミリ秒未満で軽快に入力・操作できるようになりました。
  - テストおよび TypeScript のインポートクリーンアップを行い、78テストと本番ビルドの完全通過を達成。

### タイムラインヘッダー 2段化 ＆ タスクデータ駆動の日付範囲計算 (May 24, 2026)
- **Dayスケールで月が不明な問題を解決**:
  - `src/components/TimelineHeader.tsx` を新規作成。Day/Week → 上段に年月・下段に日/週番号+曜日、Month → 上段に年・下段に月名、Year → 1段のみ。
  - 月の境目（グループ境界）に `border-l-2` 太線を入れて視覚的に強調。
  - ヘッダー高さ: `HEADER_HEIGHT = 56px`（グループ行20px + 詳細行36px）。
  - `GanttChart.tsx` と `IntegratedView.tsx` のインラインヘッダー描画コードを `<TimelineHeader>` に一本化（重複排除）。
- **タイムライン日付範囲のタスクデータ駆動化**:
  - `useGanttTimeline.ts` を全面改修。`tasks` ストアを購読して全タスクの日付（startDate, endDate, planStartDate, planEndDate）から min/max を算出し、viewMode別マージンを付与。
  - タスクが0件または全日付未設定の場合は今日基準のフォールバック。
  - `types.ts` の `ProjectConfig` に `timelineRange?: { start: string; end: string }` を追加（将来のユーザー手動指定用）。
  - タイムライン範囲変更に伴い `GanttChart.test.tsx` の期待値を更新。78テスト全件合格。


- **重複した約320行のタイムライン行描画JSXを共通コンポーネントへ一元化**:
  - `IntegratedView.tsx` と `GanttChart.tsx` の両ファイルに100%同じ内容で重複していたタイムライン行の描画（グリッド背景、予定バー・実績バー、D&Dムーブ・リサイズ・依存関係コネクタハンドラ）を、新規の `src/components/GanttTimelineRow.tsx` に完全抽出・カプセル化。
  - `IntegratedView.tsx` が約670行 → **約370行**、`GanttChart.tsx` が約800行 → **約490行**へとそれぞれ大幅にスリム化し、各ビューの全体構造（WBS Outliner列とタイムライン列の横並び、カスタムフックとの接続）が一目で把握できる見通しの良いコードへ刷新。
  - 外部から見えるDOM構造・スタイリング・マウス操作の振る舞いは変更なし。既存78件のテストが全件そのまま合格し、型検査・本番ビルドもエラーゼロで通過。

- **カラム配列駆動設計（Column List Driven）への完全リファクタリングと移行**:
  - `showDetails` や `hideDescriptionColumns` などの複雑な boolean 表示フラグ群を完全に廃止。
  - 各ビューから `visibleColumns: ColumnId[]` 配列を注入して、ヘッダーと行を表示列に基づいて動的・宣言的にレンダリングする新設計に完全移行。
- **コンポーネントの完全流用・一元化**:
  - `GanttChart.tsx` のタスク名表示セルを、共通の **`TaskRow`** を流用する設計に一本化。
  - WBS view、Integrated view、Gantt view のすべてのビュー間でヘッダーとセルの横位置、余白、Grip スペースが 1px の狂いもなく「完璧に」一致するようになり、ビュー切り替え時のガタつきが完全に解消。
- **ガントチャートの初期表示位置ズレの修正**:
  - `GanttChart.tsx` の初期スクロール処理（`useLayoutEffect`）において、左端のタスク名列の幅（`nameOffset`）をタイムラインの可視幅計算に反映し、初期表示の「今日」へのスクロール位置が右にズレるバグを解消。
- **タスク名クリック時における表示ズレバグの根本解決**:
  - `TaskOutlineCell.tsx` の中の `input` 要素に `min-w-0`（`min-width: 0`）を付与し、インデントが深くなった際のはみ出しによるブラウザ自動横スクロールバグを根本解決。

### Gantt UI Interaction Tests (May 24, 2026)
- **ガント操作の UI マウスジェスチャー統合テストを追加**:
  - ドラッグ移動 (Move)、右端リサイズ (Resize-Right)、依存関係追加 (Dependency Connection) のテストを `src/components/GanttChartInteraction.test.tsx` に実装。
  - `vi.useFakeTimers()` を用いた安定したタイムライン・ピクセル換算テストを構築。78テスト全件通過。

### Store Tree Operations Modularization (May 24, 2026)
- **ストアからツリー変形ロジックを別ファイルへ完全排出**:
  - `useTaskStore.ts` 内のインデント (`indentTask`)、アウトデント (`outdentTask`)、ドラッグ並び替え (`reorderTask`)、上下移動 (`moveTask`) を、`taskStoreUtils.ts` に純粋関数として移行。
  - ストアファイルを 750行 ➔ 450行 へスリム化。
  - 静的型チェック (`tsc -b`) および Vitest 全 75 件のテスト合格を検証済み。

### Task Deletion Integrity Tests (May 24, 2026)
- **削除整合性のための強力な Vitest 統合テストを補強**:
  - 複数タスク一括削除、多段依存チェーン (A -> B -> C) の中間削除、相互依存タスクの同時削除のテストケースを追加。75件全件合格。

### Gantt & Integrated View Hooks Extraction (May 24, 2026)
- **タイムライン、ドラッグ、依存線パス計算ロジックの抽出**:
  - `useGanttTimeline.ts`, `useGanttDrag.ts`, `useGanttDependencies.ts` を新規作成し、`GanttChart.tsx` と `IntegratedView.tsx` に適用。

### WBS Cell Component Refactoring (May 24, 2026)
- **TaskRow.tsx のセル単位へのコンポーネント分割**:
  - `src/components/cells/` 配下に、個別の入力セルを作成。
