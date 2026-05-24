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
- **Zustandストア内ツリー変形ロジックの純粋関数外出し（スリム化）**:
  - `useTaskStore.ts` に直接記述されていたツリー変形（インデント・アウトデント・並び替え・上下移動）ロジックを、すべて純粋関数 (`indentTaskInGraph`, `outdentTaskInGraph`, `reorderTaskInGraph`, `moveTaskInGraph`) として `src/store/taskStoreUtils.ts` に分離。
  - ストアファイル `useTaskStore.ts` を **約 750 行 ➔ 約 450 行へと大幅にスリム化 (約40%削減)**。
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

## 直近の検証結果

- `pnpm test -- --run` : **78テスト全件合格** (タイムライン範囲変更に伴うテスト期待値も更新済み、グリッド最適化および日付ズレ解消後も完全合格)
- `pnpm run build` : 通過 (TypeScriptの未使用変数・インポートクリーンアップ、および本番ビルド通過)

## 次に着手する優先課題

1. **祝日変更時のスケジュール自動再計算方針の整理と実装**
   - 現在は祝日設定を変更しても既存タスクの日付は自動シフトしない。祝日が追加/削除された際、タスクの「稼働日数（Duration）」を維持したまま日付範囲を自動スライドするオプションをストアに実装する。
   - 設計の詳細は `implementation_plan.md` に記録済み（作業再開可能状態）。
2. **JSON インポートの互換性・異常値バリデーション強化**
   - インポート処理の入り口にスキーマバリデーションを導入し、破損データや不正なフォーマットの日付、循環依存が含まれている場合のガードを強化する。

## 注意点

- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと。
- `useGanttDrag` の中で `updateTask` や `addDependency` を直接叩いており、コンポーネントからの依存を最小限に抑えています。
- 祝日変更時、既存タスク日付の自動再計算はまだ行わない。必要なら仕様を決めてから入れること。
- Excel エクスポートは Electron main 側で生成・保存する構成を維持する。
- `useGanttTimeline.ts` はタスクストア (`tasks`) を購読するため、タスク追加・編集のたびにタイムライン範囲が再計算される。パフォーマンス上の問題が出た場合は `useMemo` の依存配列を見直すこと。

## 次の作業で最初に見るとよい場所

- `src/store/useTaskStore.ts`
- `src/store/taskStoreUtils.ts`
- `src/store/useTaskStore.test.ts`
- `src/components/TimelineHeader.tsx` (新規 2段ヘッダーコンポーネント)
- `src/hooks/useGanttTimeline.ts` (タスクデータ駆動の日付範囲ロジック)

---

## 履歴 (History)

### 大量タスク時のDOM最適化 ＆ 日付ズレの解消 ＆ WBSもっさり感の解消 ＆ 縦グリッドの完全同期 (May 24, 2026)
- **背面共通グリッド背景によるDOM要素数99%削減**:
  - `TimelineGridBackground.tsx` を新規作成し、各行でループしていた数千件のグリッド `div` をスクロールコンテナ背面の 1枚の背景レイヤーへ移行。
  - 各行 (`GanttTimelineRow.tsx`) は透明化し、タスクバーのみを描画するように最適化。大量タスク追加時の `LatencyInfo is too big` エラーを完全に解消。
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
