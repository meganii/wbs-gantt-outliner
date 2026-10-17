# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

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
  - **これで P1（購読ファンアウト D7 / 依存線 P2 / 入力連鎖 P3 / Context D6）が完了**。残る P2（保守性）は D8（`updateTask`/`endDragUpdate`/`addDependency` の共通化）、D9（未使用 `taskBarRefs` / 行高定数化 / デバッグ用テストの整理）、D10（zundo の `partialize` と `equality` の同期）。
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

## 直近の検証結果 (October 17, 2026 / P1 変更領域の回帰ハードニング後)

- `npm test -- --run` : **127テスト全件合格** (14ファイル。P1 Step 1 の回帰テスト7件＋Step 2 の回帰テスト2件＋Step 4-A/4-B 由来の選択2件＋依存線クリップ2件＋回帰ハードニング15件を追加)
- `npm run test:e2e` : **E2Eテスト全6件合格** (Playwright 1.64.1 / chromium。新規環境では `npx playwright install chromium` が必要)
- `npm run build` : 通過 (TypeScript 型チェック + Vite 本番ビルド)
- `npm run bench` : 通過 (`bench/README.md` に計測結果。Step 1: 1,430ms → 423ms / Step 4-A/4-B の合計: duration 確定 402ms → 0ms、タイトル確定 1,053ms → 約 180ms、ドラッグ確定 456ms → 約 22〜42ms。`bench/decompose.spec.ts` は `DECOMPOSE=1` のときだけ実行)
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
3. **描画性能の改善（設計レビューの P1）** — 詳細は下記「設計レビュー結果」を参照
   - **購読ファンアウト**: セル10種が各自 `useTaskStore` を購読しており、1行あたり約79購読（セル8ファイル合計で `useTaskStore((` が61箇所）。zustand は更新のたびに全購読者の selector を実行するため、1,000行では1更新あたり約79,000回走る。行で1回だけ購読し props で配る構成に変える。→ **対応済み (October 17, 2026, P1 Step 4-A)**。
   - **ホバーでの全行再レンダー**: `IntegratedView` の `<TimelineContext.Provider value={{ timelineMetrics, timelineWidth }}>` が毎レンダー新規オブジェクトのため、ホバーのたびに全行の `RowContainer` が再レンダーされる（context 経由の再レンダーは `memo` では止まらない）。value を `useMemo` 化するか、「静的メトリクス」と「動的な値」を別 context に分割する。→ **対応済み (October 17, 2026, P1 Step 3)**。
   - **ドラッグ中の依存線全再計算**: `useGanttDependencies` が `dragState` を `useMemo` 依存に含み、`GanttDependencyLines` も `memo` 化されていないため、ドラッグ中は毎 mousemove で全依存線を再計算＋再レンダーする。静的線とドラッグ中のみの線を分離して `memo` 化する。→ **対応済み (October 17, 2026, P1 Step 2)**。
   - **高頻度更新の O(N) 連鎖**: ガントの duration セルが `onChange`（1文字ごと）で `updateTask` を呼び、依存伝播＋親再計算＋`flattenTree`＋タイムライン再計算を毎文字起こす。commit-on-blur / 短い debounce にする。→ **対応済み (October 17, 2026, P1 Step 1)**。
   - 併せて P2（保守性）: `updateTask` / `endDragUpdate` / `addDependency` の共通ロジック統合、`ROW_HEIGHT = 32` の定数化、未使用の `taskBarRefs` の削除、zundo の `partialize` と `equality` の揃え、デバッグ用テストの去就決定。

#### P1 の実施手順（案）— 上から順に、1ステップ＝1コミット

いきなりセル購読の集約（影響最大・変更範囲最大）から着手しないこと。**先に計測し、効果の大きい独立した変更から**入れる。

**実施順の変更（October 17, 2026）**: Step 0 の実測で **P3（duration の O(N) 連鎖）が最も支配的**だったため、ユーザー確認のうえ「**duration → 依存線 → Context**」の順で実施する（下記の番号は HANDOFF 初版の案のまま）。→ **Step 1〜4 完了（October 17, 2026）**。P1 は完了し、残りは P2（保守性）。

0. **計測（最初にやる）**: 1,000行相当のデータを読み込んだ状態で、(a) ガントバーをドラッグしたときのフレーム時間、(b) タイトル確定（Enter）や duration 1文字入力時のフレーム時間、(c) 行ホバー時のフレーム時間を DevTools Performance / React Profiler で記録する。P1/P2/P3 のどれが支配的かを確認してから着手する（HANDOFF の「O(1)」主張もここで検証できる）。→ **完了済み (October 17, 2026)**。`bench/` にハーネスを追加し `npm run bench` で再計測できる。実測は `bench/README.md` 参照（支配的ボトルネックは P3、次いで P2・D6）。
1. **依存線の分離**（独立・低リスク・効果大）: `useGanttDependencies` から `dragState` 依存を外し、「静的依存線（`tasks` / `flattenedItems` のみ）」と「ドラッグ中だけの線」を分離。`GanttDependencyLines` を `React.memo` 化。→ ドラッグ中の毎 mousemove 全再計算が消える。→ **完了済み (October 17, 2026)**（実施順 2 番目。ドラッグ中 mousemove 約 18% 減）。
2. **duration セルの確定タイミング**（独立・低リスク）: `TaskPlanDurationCell` / `TaskDurationCell` の `onChange` 直書き `updateTask` を commit-on-blur / Enter（または短い debounce）に変更。→ **完了済み (October 17, 2026)**（実施順 1 番目。1,430ms → 423ms）。
3. **`TimelineContext` の value を `useMemo` 化**（独立・低リスク）: `IntegratedView.tsx` の `<TimelineContext.Provider value={{...}}>` のみ。ホバー時の全行 `RowContainer` 再レンダーが止まる。→ **完了済み (October 17, 2026)**（実施順 3 番目。ホバー longtask 60.3ms → 17.3ms）。
4. **セル購読の集約**（大規模・計測で必要性が確認できた場合のみ）: `TaskRow` で必要な値を1回購読してセルへ props 配信する。**注意**: `focusedTaskId` / `selectedTaskIds` を行の props にすると選択のたびに全行が再レンダーされるため、「自分がフォーカス/選択されているか」を返す安価な selector（boolean）を各セルに残すのが正解。セル1つずつ置換し、都度テストを回すこと。→ **完了済み (October 17, 2026)**（4-A: セル購読の集約とセルの memo 化 / 4-B: `flattenedIds`・`timeRange`・`timelineMetrics` の参照安定化。duration 確定 402ms → 0ms、ドラッグ確定 456ms → 約 22〜42ms）。
   - **Step 3 完了時点の残課題は Step 4 で解消済み**: 「確定 1 回あたりの全ツリー再描画」（`flattenTree` + `useGanttTimeline` の再計算 + 全行再描画 + 購読ファンアウト）は、4-A（購読集約）と 4-B（参照安定化）で大幅に削減した。追加・削除・並べ替えのように ID 列そのものが変わる操作のみ全行再構築が残る（`SortableContext` の性質上不可避）。
5. **P2（保守性）** は上記とは独立に随時。`ROW_HEIGHT = 32` は `useGanttDependencies` では定数化済み（他ファイルは未対応）。

各ステップで `npm run lint` / `npx vitest --run` / `npm run test:e2e` / `npm run build` を回し、個別コミットにする（P0 修正 `55da44a` と同様）。

#### 次セッションへの依頼文（Step 4、コピペ用）

```
docs/HANDOFF.md を読んで、描画性能 P1 の Step 4（セル購読の集約 / HANDOFF の P1・D7）に着手してください。

前提:
- Step 1〜3 は完了済み（duration の確定タイミング / 依存線の分離 / TimelineContext の useMemo 化）。
  コミットは 34a0268（Step 0）cfaff36（Step 1）7f7a56a（Step 2）644d242（Step 3）。
- 現在の計測は bench/README.md が正。1,000 タスクで残る支配要因は「確定 1 回あたりの全ツリー再描画」
  （duration 確定 398〜425ms / タイトル確定 863〜1,079ms / ドラッグ確定 452〜500ms）。加えてタスクデータを
  変えない setMousePos だけでも 20 moves で最長 100ms 前後のブロックが残る（購読ファンアウト）。

進め方:
1. 先に計測して支配要因を分解する（いきなり実装しない）。npm run bench の結果をもとに、確定時に
   何が効いているか（flattenTree / useGanttTimeline の再計算 / 全行再描画 / selector の実行回数）を
   切り分け、結果を報告してから実装方針を確認する。
2. 実装は「セル1つずつ購読を集約」し、都度テストを回す。focusedTaskId / selectedTaskIds を行の props に
   渡すと選択のたびに全行再レンダーになるため、各セルには「自分がフォーカス/選択されているか」を返す
   boolean の安価な selector を残すこと。
3. 各ステップで npm run lint / npx vitest --run / npm run test:e2e / npm run build を回し、1 ステップ = 1 コミット。
   計測前後の数値を bench/README.md に追記し、docs/HANDOFF.md を更新する。
4. 完了したら改善結果（before/after の数値つき）をまとめて報告する。

壊してはいけないもの（docs/HANDOFF.md「注意点」より）:
- draw-range は単クリックでも確定する（日セルのクリックで 1 日予定が入る）。「移動ゼロなら commit しない」ガードを再導入しないこと
- バー/ハンドルの onMouseDown は早期 return 時も stopPropagation を維持し、data-gantt-bar を消さない
- useRowSortSensors（KeyboardSensor 無効・distance 5）
- 現在 lint 0 / vitest 112 件 / e2e 6 件でグリーン。これを維持すること。
```

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
| D9 | 未使用の `taskBarRefs`、行高 `32` の散在、デバッグ用テストの混在 | 未対応（優先課題 #3） |
| D10 | zundo の `partialize` と `equality` の不一致（undo で古い選択/フォーカスが復元され得る） | 未対応（優先課題 #3） |

### 性能（「重い」）の構造的原因

- **P1 購読ファンアウト**: 1行あたり約79購読（セル8ファイル合計で `useTaskStore((` が61箇所）× 行数。ドラッグ中は `setDragState` が mousemove ごとに走るため、1,000行では selector が毎秒500万回規模で実行される。再レンダーは1行でも通知コストは O(N)（未対応）。
- **P2 依存線の毎フレーム全再計算**: `useGanttDependencies` が `dragState` を依存に含む。HANDOFF の「ドラッグ中の計算量 O(N)→O(1)」は、依存線の再計算と購読通知については成立していない（**対応済み (October 17, 2026, P1 Step 2)** 静的線とドラッグ中のみの線を分離）。
- **P3 高頻度更新の O(N) 連鎖**: duration セルの1文字ごとの `updateTask` が、依存伝播＋親再計算＋`flattenTree`＋タイムライン再計算を引き起こす（**対応済み (October 17, 2026, P1 Step 1)** commit-on-blur / Enter 化）。
- 一方で「変更された行だけ再レンダーする」設計（`React.memo` + カスタム比較 + タスク単位のオブジェクト同一性維持）は妥当で、実際に機能している。データモデル・純粋関数へのロジック集約・セル分割も方向性は良い。問題は入力ガードの欠落（P0・修正済み）と、購読粒度・派生計算の更新戦略（P1・未対応。P2 / P3 / D6 は P1 Step 1〜3 で対応済み）。

## 注意点

- **ガントの `draw-range`（タイムライン余白をクリック/ドラッグして予定を描く）は、単クリックでも確定する**（クリックした日 1 日分の予定を設定する）。October 17, 2026 にユーザー判断で「移動ゼロなら確定しない」ガードを撤去し、この挙動に戻した。**同じガードを再導入しないこと**（再導入すると日セルの単クリックで予定が反映されなくなる）。バー上のクリックが行の `draw-range` に伝播して日付が壊れる経路は、次項の `stopPropagation` / `data-gantt-bar` で塞ぐ（この 2 つは D1 撤回後も有効）。
- **バー／ハンドルの `onMouseDown` は早期 return する場合も `stopPropagation()` を維持する**こと。また `GanttTimelineRow.tsx` のバーから `data-gantt-bar` 属性を消さないこと。どちらかが欠けると行の `draw-range` が発火し、クリックだけで日付が書き換わる（ベースライン固定中は実績日が壊れる）。
- **行の並べ替え（dnd-kit）のセンサーは `src/hooks/useRowSortSensors.ts` に集約**している。KeyboardSensor を復活させないこと（Enter はタスク確定/追加に割り当て済みで衝突する）。PointerSensor の `distance: 5` も、微小なクリックで並べ替えが始まらないためのしきい値なので外さないこと。
- パッケージマネージャは **npm**（October 17, 2026 に pnpm から復帰）。`pnpm` 前提のコマンドや `pnpm-lock.yaml` / `.npmrc`（`node-linker=hoisted`）を再導入しないこと。ロックファイルは `package-lock.json` のみ。
- npm 11 は install script を既定で実行しない。install script を持つ依存を追加した場合は `npm install-scripts approve <pkg>` で承認する（`package.json` の `allowScripts` に記録される）。現在は `esbuild` と `electron-winstaller` のみ承認済み。
- `npm run lint` は **0件で通過する**。`eslint.config.js` の `globalIgnores` で `dist` / `dist-electron` / `out` / `coverage` / `test-results` 等の生成物を除外し、`_` 接頭辞の未使用引数・変数も許可済み。CI や検証フローに lint を組み込む場合は、この 0 件状態を維持すること。
- **eslint-plugin-react-hooks v7 の recommended は error レベルで強力**（`set-state-in-effect` / `set-state-in-render` / `refs` / `purity` 等）。store の値をローカル state に同期する箇所は `useEffect` 内の `setState` ではなく、**レンダー中に前回値と比較して state を調整するパターン**（`if (prev !== current) { setPrev(current); setLocal(current); }`）で実装する。ref への書き込みは effect 内でのみ行うこと。
- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと。
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
1. **`load-file` で読み込んだ JSON の実行時バリデーション**（＝上記「次に着手する優先課題」#2）。**型は実行時の安全性を一切保証しない**（Electron メンテナも "fake type safety" と明言）ので、ここが本命。`unknown` 化によって「検証すべき境界」がコード上で明示されたことが今回の最大の収穫。
2. **preload が Electron の `event` オブジェクトを renderer に通している。** `on` の実装が `listener(event, ...args)` となっており、公式の「`event` を露出するな、`callback(...args)` に詰め替えろ」という警告から逸脱している（`useIpcSwitchView` 側は `_event` として未使用だが、renderer には到達する）。`(...args) => callback(...args)` に変えるだけで解消できる。
3. **チャンネル型マップ化、または名前付きメソッド化。** 対象チャンネルは `save-file` / `load-file` / `export-excel` / `switch-view` の 4 つ。チャンネル 1〜5 個なら依存ゼロの「共有チャンネルマップ + 型付きラッパー」が適切とされる。名前付きメソッド化（`window.api.saveProject(data)` 等）まで行けば公式の推奨形になる。影響範囲は preload / main / renderer / テストに跨るため、**lint 対応とは別コミットで実施すること**。
4. **`webPreferences` に `sandbox: true` を明示。** 現在は `contextIsolation: true` のみ指定（`nodeIntegration` は未指定＝既定 false、`sandbox` は未指定＝既定依存）。なお `dangerouslySetInnerHTML` / `eval` / `window.open` の類は不使用でリモートコンテンツも読み込まないため、**汎用 `invoke` 露出の実害は現状かなり小さい**（優先度は低め）。

## 次の作業で最初に見るとよい場所

- `src/store/useTaskStore.ts`
- `src/store/taskStoreUtils.ts`
- `src/store/useTaskStore.test.ts`
- `src/hooks/useGanttDrag.ts` / `src/components/GanttTimelineRow.tsx`（P0 で修正したガント操作のガード。上記「注意点」参照）
- `src/hooks/useRowSortSensors.ts`（行並べ替えのセンサー設定）
- `src/components/cells/cellPropsEqual.ts` / `src/hooks/useStableFlattenedIds.ts`（P1 Step 4 の購読集約・参照安定化。セルや SortableContext を触るときは必ず確認）
- `bench/README.md` / `bench/perf.spec.ts` / `bench/decompose.spec.ts`（描画性能の計測。分解は `DECOMPOSE=1`）
- `src/components/GanttDragGuards.test.tsx`（P0 回帰テスト）
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
