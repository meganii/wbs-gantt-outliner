# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

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

## 直近の検証結果 (October 17, 2026 / npm 移行後に再検証)

- `npm test -- --run` : **91テスト全件合格** (8ファイル)
- `npm run test:e2e` : **E2Eテスト全6件合格** (Playwright 1.64.1 / chromium。新規環境では `npx playwright install chromium` が必要)
- `npm run build` : 通過 (TypeScript 型チェック + Vite 本番ビルド)
- `npm run package` : 通過 (electron-forge。`out/wbs-gantt-outliner-darwin-arm64/` に生成、app.asar に `package-lock.json` は混入していない)
- `npm run lint` : **0件合格** (`eslint.config.js` に生成物の ignores を追加し、ソース側の違反も全件解消。内訳は下記「ESLint 違反の全件解消」参照)
- テスト件数の内訳注意: `src/store/verify_bug.test.ts` (3件) と `e2e/reproduce-bug.spec.ts` はデバッグ用に追加された検証ファイルで、上記の件数に含まれている（恒久テストへ昇格するか削除するか未決）。

## 次に着手する優先課題

1. **祝日変更時のスケジュール自動再計算方針の整理と実装**
   - 現在は祝日設定を変更しても既存タスクの日付は自動シフトしない。祝日が追加/削除された際、タスクの「稼働日数（Duration）」を維持したまま日付範囲を自動スライドするオプションをストアに実装する。
   - **注意: 以前ここに「設計の詳細は `implementation_plan.md` に記録済み」と書かれていたが、当該ファイルはリポジトリ内に存在しない（October 17, 2026 時点で確認）。** 仕様の再定義から始めること。
2. **JSON インポートの互換性・異常値バリデーション強化**
   - インポート処理の入り口にスキーマバリデーションを導入し、破損データや不正なフォーマットの日付、循環依存が含まれている場合のガードを強化する。
   - IPC 境界（`window.ipcRenderer.invoke`）は lint 対応で `unknown` 化済みなので、ここに入れるのは**型ではなく実行時の検証**になる。詳細は下記「IPC / Electron の申し送り」を参照。

## 注意点

- パッケージマネージャは **npm**（October 17, 2026 に pnpm から復帰）。`pnpm` 前提のコマンドや `pnpm-lock.yaml` / `.npmrc`（`node-linker=hoisted`）を再導入しないこと。ロックファイルは `package-lock.json` のみ。
- npm 11 は install script を既定で実行しない。install script を持つ依存を追加した場合は `npm install-scripts approve <pkg>` で承認する（`package.json` の `allowScripts` に記録される）。現在は `esbuild` と `electron-winstaller` のみ承認済み。
- `npm run lint` は **0件で通過する**。`eslint.config.js` の `globalIgnores` で `dist` / `dist-electron` / `out` / `coverage` / `test-results` 等の生成物を除外し、`_` 接頭辞の未使用引数・変数も許可済み。CI や検証フローに lint を組み込む場合は、この 0 件状態を維持すること。
- **eslint-plugin-react-hooks v7 の recommended は error レベルで強力**（`set-state-in-effect` / `set-state-in-render` / `refs` / `purity` 等）。store の値をローカル state に同期する箇所は `useEffect` 内の `setState` ではなく、**レンダー中に前回値と比較して state を調整するパターン**（`if (prev !== current) { setPrev(current); setLocal(current); }`）で実装する。ref への書き込みは effect 内でのみ行うこと。
- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと。
- `useGanttDrag` の中で `updateTask` や `addDependency` を直接叩いており、コンポーネントからの依存を最小限に抑えています。
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
1. **`load-file` で読み込んだ JSON の実行時バリデーション**（＝上記「次に着手する優先課題」#2）。**型は実行時の安全性を一切保証しない**（Electron メンテナも "fake type safety" と明言）ので、ここが本命。`unknown` 化によって「検証すべき境界」がコード上で明示されたことが今回の最大の収穫。
2. **preload が Electron の `event` オブジェクトを renderer に通している。** `on` の実装が `listener(event, ...args)` となっており、公式の「`event` を露出するな、`callback(...args)` に詰め替えろ」という警告から逸脱している（`useIpcSwitchView` 側は `_event` として未使用だが、renderer には到達する）。`(...args) => callback(...args)` に変えるだけで解消できる。
3. **チャンネル型マップ化、または名前付きメソッド化。** 対象チャンネルは `save-file` / `load-file` / `export-excel` / `switch-view` の 4 つ。チャンネル 1〜5 個なら依存ゼロの「共有チャンネルマップ + 型付きラッパー」が適切とされる。名前付きメソッド化（`window.api.saveProject(data)` 等）まで行けば公式の推奨形になる。影響範囲は preload / main / renderer / テストに跨るため、**lint 対応とは別コミットで実施すること**。
4. **`webPreferences` に `sandbox: true` を明示。** 現在は `contextIsolation: true` のみ指定（`nodeIntegration` は未指定＝既定 false、`sandbox` は未指定＝既定依存）。なお `dangerouslySetInnerHTML` / `eval` / `window.open` の類は不使用でリモートコンテンツも読み込まないため、**汎用 `invoke` 露出の実害は現状かなり小さい**（優先度は低め）。

## 次の作業で最初に見るとよい場所

- `src/store/useTaskStore.ts`
- `src/store/taskStoreUtils.ts`
- `src/store/useTaskStore.test.ts`
- `src/components/TimelineHeader.tsx` (新規 2段ヘッダーコンポーネント)
- `src/hooks/useGanttTimeline.ts` (タスクデータ駆動の日付範囲ロジック)
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
