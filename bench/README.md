# 描画性能ベンチマーク（P1: 描画性能 Step 0）

`docs/HANDOFF.md` の「次に着手する優先課題 #3（描画性能の改善）」の Step 0（計測）用ハーネスです。
改善前後の効果を同じ条件で比較するために、実ブラウザ（Chromium）で計測します。

## 実行方法

```bash
# サンプル JSON の再生成（決定的。Math.random を使わない）
npm run bench:fixtures

# 計測（vite dev サーバーを自動起動）
npm run bench
```

計測結果は `bench/results/step0.json` に出力されます（`bench/results/` は `.gitignore` 済み）。

## 構成

- `bench/generate-tasks.mjs` — 3 階層（フェーズ → グループ → リーフ）のサンプル生成器。決定的。
- `bench/generate-fixtures.mjs` — `bench/fixtures/tasks-{100,1000}.json` を生成。
- `bench/fixtures/tasks-1000.json` — **1,000 タスク**（25 フェーズ / 75 グループ / 900 リーフ / 225 依存）。
- `bench/fixtures/tasks-100.json` — スケーリング比較用の 100 タスク版。
- `bench/perf.spec.ts` — Playwright ベンチマーク本体。
- `playwright.bench.config.ts` — ベンチ専用の Playwright 設定（`testDir: ./bench`、`workers: 1`）。

## 計測方法

- `window.ipcRenderer` をスタブし、**「読み込み」ボタン（実インポート経路）** からサンプル JSON を投入する。
  （アプリ本体にテスト用フックを足さず、実際の JSON 取り込み処理を通している）
- 主指標は `PerformanceObserver` の **longtask**（メインスレッドを 50ms 以上ブロックしたタスク）と操作窓の実時間。
  ヘッドレス Chromium の `requestAnimationFrame` は vsync に同期しないため、フレーム差分は補助情報。
- 計測窓には、最後のイベントのコミットを含めるための 120ms の待機が含まれる。
- 読み取り専用の操作（ホバー / バードラッグ / 依存ハンドルのドラッグ）は 3 回実行して集計。

### ハーネスの改訂（Step 2 時点）

Step 2 の効果（ドラッグ中 mousemove のコスト削減）を測るため、ハーネスを次のように改訂しました。

- **バー位置の取得を修正**: 旧実装は `scrollLeft` を手計算で調整していたため、確定後の再計測で
  対象バーが画面外（viewport 1600px に対し x≈1839）に外れ、`mouse.down` がバーに当たらず
  **ドラッグが始まっていない計測が混ざっていた**。`locator.scrollIntoViewIfNeeded()` +
  `boundingBox()` に置き換え、`mouse.down` 直後に `.cursor-grabbing` の存在を確認して
  ドラッグが始まったことを検証するようにしました（始まらなければテストが失敗します）。
- **ドラッグ計測を 3 分割**: `drag bar (30 moves)`（全体）/ `drag mousemove only (30 moves, in-page)` /
  `drag commit (mouseup)`。`mouseup` の確定コミット（1,000 タスクで 450ms 前後の longtask）が
  ドラッグ中のコストを覆い隠すためです。
- **`in-page` はページ内で合成 `mousemove` を 30 回送出**します。`page.mouse.move` は 1 回ごとに
  CDP 往復待ちが入るため、30 moves の大半がプロトコル待ちになりアプリ側の差が埋もれます。
  合成イベントでは毎回 macrotask を 1 つ挟んで React の再描画を発生させ、その区間の実時間を測ります。
  5 回実行して集計（再現性: 例 1,000 タスクで 341.7ms / 340.2ms）。

## Step 0 の計測結果（2026-10-17, 改善前）

環境: Playwright 1.64.1 / Chromium (headless) / viewport 1600x900 / macOS (Apple Silicon)。
アプリは dev サーバー + React `StrictMode`（開発ビルドなので本番より重い）。

### 初期表示

| 指標 | 100 タスク | 1,000 タスク |
|---|---|---|
| 読み込み〜描画完了 | 890ms | 2,020ms |
| 行数（`.gantt-row-optimized`） | 100 | 1,000 |
| 依存線（`svg.absolute.inset-0 > path`） | 18 | 225 |
| 総 DOM ノード数 | 7,005 | 61,512 |

### 操作別（1 操作あたりの main-thread ブロック）

| 操作 | 100 タスク | 1,000 タスク | 倍率 |
|---|---|---|---|
| (a) バーをドラッグ（30 moves） | 99ms（最長 128ms） | **418ms（最長 455ms）** | 約 4.2x |
| (b) duration セルに 3 文字入力 | 152ms（最長 52ms × 3） | **1,302ms（最長 490ms × 3）** | 約 8.6x |
| (b) タイトル確定（Enter → 新規タスク） | 98ms | **869ms** | 約 8.9x |
| (c) 行ホバー（20 行） | 0ms | **63ms（最長 99ms）** | — |
| (d) 依存ハンドルのドラッグ（setMousePos のみ） | 0ms | 35ms（最長 105ms） | — |

### 支配的なボトルネック（優先順）

1. **(b) 入力系の O(N) 連鎖が最大**。duration は 1 文字ごとに `updateTask` → 依存伝播＋親再計算＋`flattenTree`＋タイムライン再計算＋全行再描画が走り、**1 文字 ≒ 430ms** ブロックする。タイトル確定（Enter）も新規タスク追加で **869ms** 停止する。→ HANDOFF の **P3** が支配的。
2. **(a) ドラッグ確定時の全行再描画**。ドラッグ中は安いが、`mouseup` の `endDragUpdate` でタスクが更新されると全行が再描画され **455ms** ブロック。加えて `useGanttDependencies` が `dragState` を依存に持ち `GanttDependencyLines` が `memo` 化されていないため、ドラッグ中は毎 mousemove で **225 本の依存線を全再計算＋再レンダー**している。→ HANDOFF の **P2**。
3. **(c) ホバー時の全行再レンダー**。`TimelineContext.Provider` の value が毎レンダー新規オブジェクトのため、ホバーのたびに 1,000 行の `RowContainer` が再レンダーされ、20 行のホバーで **99ms** のブロックが出る。→ HANDOFF の **D6**。
4. **(d) 購読ファンアウト**。タスクデータを変えない `setMousePos` だけでも、1 更新あたり約 59,000 の selector が走るため 30 moves で **105ms** のブロックが出る。→ HANDOFF の **P1 / D7**。

いずれも 1,000 タスクで急増しており、**P3（入力の確定タイミング）→ P2（依存線の分離）→ D6（Context の `useMemo` 化）** の順に着手するのが効果的。

## 改善の記録

### Step 1: duration セルを commit-on-blur / Enter 化（P3）

`TaskDurationCell` / `TaskPlanDurationCell` を、入力中はローカル state のみを更新し、
blur / Enter で確定する方式へ変更（Escape で取り消し）。タイトル・進捗セルと同じパターン。

計測条件: Playwright 1.64.1 / Chromium (headless) / viewport 1600x900。
`duration type(3) + Enter commit` = 3 文字入力して Enter で確定するまでを 1 計測窓に含む。

| シナリオ | Before | After |
|---|---|---|
| duration type(3) + Enter（1,000 タスク） | **1,430ms**（最長 538ms × 3 回 = 1 文字ごとに O(N) 連鎖） | **423ms**（最長 423ms × 1 回 = 確定時のみ） |
| duration type(3) + Enter（100 タスク） | 101ms | 54ms |

確定は 1 回だけになったため main-thread ブロックは約 1/3.4。残る 423ms は
「確定 1 回あたりの全ツリー再描画（`flattenTree` + タイムライン再計算 + 全行再描画）」で、
これは購読粒度の集約（HANDOFF の P1 / D7）側の課題。

### Step 2: 依存線レイヤーの分離（P2）

`useGanttDependencies` は `dragState`（mousemove のたびに新オブジェクトになる）を購読していたため、
ドラッグ中は 1 mousemove ごとに全依存線（1,000 タスクで 225 本）を再計算し、
`GanttDependencyLines`（`memo` なし）が再レンダーしていました。

変更:

- `useGanttDependencies` の購読を `dragState` 全体 → **ドラッグ中タスク ID（primitive）** に変更。
  日付（`currentStartDate` / `currentEndDate`）の変化では再計算しない。
  静的レイヤーはドラッグ中タスクに接続する線を描画しない。
- `GanttDependencyLines` を `memo` 化（親のホバー等で再レンダーされない）。
- `useDraggedDependencyLines` / `DraggedDependencyLines` を新設。ドラッグ中タスクに接続する線
  （自身の `dependencies` と、自身に依存しているタスク）**だけ**を毎 mousemove 描画する。
  線は非インタラクティブ（ドラッグ中の誤クリックで依存が消えないようにするため）。
- `IntegratedView` / `GanttChart` の SVG に `DraggedDependencyLines` を追加。
- 回帰テスト `src/components/DependencyLinesDrag.test.tsx`（2 件）:
  ドラッグ中も依存線がちょうど 1 本描画されバーに追従すること、静的線がホバーで変化しないこと。

計測結果（改訂ハーネス、1 操作あたり）:

| シナリオ | Before | After |
|---|---|---|
| drag mousemove only (30 moves, in-page) / 1,000 タスク | 405.9ms / 425.4ms | **341.7ms / 340.2ms** |
| drag mousemove only (30 moves, in-page) / 100 タスク | 153.4ms / 152.1ms | 147.8ms / 148.3ms |
| drag bar (30 moves) の longtask / 1,000 タスク | 420〜440ms | 482〜497ms（支配項は確定コミットで変化なし） |
| drag commit (mouseup) / 1,000 タスク | 445〜456ms | 452〜500ms（変化なし） |

ドラッグ中のコストは 1,000 タスクで約 18%（30 moves あたり約 75ms ≒ 1 move 約 2.5ms）減少しました。
100 タスクでは依存線が 18 本しかないため差は小さい（約 3%）です。

一方、`drag bar (30 moves)` 全体の longtask は `mouseup` の確定コミット
（`endDragUpdate` → 全ツリー再描画で 450ms 前後）が支配しており、Step 2 では変わりません。
これは「購読粒度の集約」（HANDOFF の P1 / D7）側の課題で、今回の対象外です。

### Step 3: `TimelineContext` の value を `useMemo` 化（D6）

`IntegratedView` / `GanttChart` の `<TimelineContext.Provider value={{ timelineMetrics, timelineWidth }}>` は
毎レンダーで新しいオブジェクトを作っていました。context の値は参照比較されるため、
`IntegratedView` が再レンダーするたび（＝行ホバーで `hoveredTaskId` が変わるたび）に
**全行の `RowContainer`（context 消費側）が再レンダー**されます。`RowContainer` ↔ `TaskRow` 間が
`React.memo` でも context 経由の再レンダーは止まりません。

変更:

- `IntegratedView` / `GanttChart` で `value` を `useMemo` 化（依存: `timelineMetrics` / `timelineWidth`）。
  `timelineMetrics` は `useGanttTimeline` 内で既に `useMemo` 済み、`timelineWidth` は数値なので、
  ホバーによる再レンダーでは値の参照が変わらなくなります。

計測結果（1,000 タスク、`hover(20 rows)`、3 回実行の集計）:

| 指標 | Before | After |
|---|---|---|
| 操作窓 | 741.7ms | **524.2ms / 511.0ms** |
| longtask 合計（20 ホバーあたり） | 60.3ms（最長 91ms） | **17.3ms / 19.7ms（最長 52ms / 59ms）** |
| over 50ms の longtask 数 | 2 | 0〜1 |

ホバー時の main-thread ブロックは約 71%（60.3ms → 17.3ms）、最長タスクは約 43%（91ms → 52ms）減少しました。
100 タスクでも 0ms のまま（元から longtask なし。操作窓は 473.3ms → 466.3ms）。

挙動は変わらない（純粋な再レンダー削減）ため、回帰テストの追加はしていません。
既存のユニットテスト（この時点で 105 件）と E2E 6 件で退行がないことを確認しています。

### Step 4-A: セル購読の集約とセルの `memo` 化（P1 / D7）

1 行あたり約 79 購読（セル 8 ファイルで `useTaskStore(` が 61 箇所）していた構成を、
`TaskRow` で 1 回だけ購読してセルへ props で配る形へ変更しました。セルは
`React.memo` + 関数 props を無視する比較関数でメモ化し、「自分がフォーカスされているか」
だけを返す boolean selector を残しています（選択状態を行の props にすると選択のたびに
全行が再レンダーされるため）。

変更:

- `TaskRow`: `columnWidths` / `baselineLocked` を 1 回購読し、`task` と合わせて全セルへ配布。
- `src/components/cells/cellPropsEqual.ts`（新規）: 関数 props を比較対象から外す共通 `memo` 比較関数。
- セル 8 種（`TaskOutlineCell` / `TaskTextCell` / `TaskStatusCell` / `TaskProgressCell` /
  `TaskPlanDurationCell` / `TaskPlanDateCell` / `TaskDurationCell` / `TaskDateCell`）:
  `useTaskStore` の購読を全廃（操作は `getState()`、フォーカスのみ boolean selector）。
  `TaskOutlineCell` の Enter / Backspace / Delete は `getEffectiveTaskIds(taskId)` を
  イベント発生時に評価。
- `useTaskCellKeyboard`: 購読をやめ、選択状態（effectiveIds）をハンドラ実行時に読む。

計測（1,000 タスク / `npm run bench -- bench/perf.spec.ts`、同一セッション・同一環境での A/B）:

| 操作 | Before(HEAD) longtask | After longtask | Before window | After window |
|---|---|---|---|---|
| duration type(3) + Enter commit | **402ms** | **84ms** | 616.4ms | 301.2ms |
| title commit (Enter → 追加) | **1,053ms** | **184ms** | 1,197.5ms | 318.0ms |
| drag commit (mouseup) | **456ms** | **106.7ms** | 584.1ms | 233.8ms |
| drag bar (30 moves) | **486ms** | **162ms** | 1,142.9ms | 799.0ms |
| drag mousemove only (30 moves, in-page) | 0ms | 0ms | 339.8ms | 185.8ms |
| hover(20 rows) | 20.3ms | 36.7ms（ばらつき大） | 509.2ms | 516.4ms |
| dependency-drag mousemove | 0ms | 0ms | 670.9ms | 675.3ms |

100 タスク（longtask / run）:

| 操作 | Before | After |
|---|---|---|
| duration type(3) + Enter | 60ms | 61ms |
| title commit | 98ms | 0ms |
| drag commit | 75ms | 18ms |
| drag bar (30 moves) | 106.7ms | 62.7ms |

確定 1 回あたりの主要因（全行の入力セルが再描画され、そのたびに約 96,000 個の selector が
走っていた）が解消し、`duration` は約 79%、`title` は約 83%、`drag commit` は約 77% 減少しました。
全体を支配していた「確定 1 回の全ツリー再描画」のうち、`flattenTree`（約 3ms）と
selector 実行はこの段階でほぼ除去されています。

### Step 4-B: 派生データの参照安定化（`flattenedIds` / `timeRange` / `timelineMetrics`）

Step 4-A でセルは `memo` 化されましたが、`IntegratedView` / `Outliner` の
`SortableContext items={flattenedIds}` と `TimelineContext.Provider` の値は、親の再レンダーごとに
参照が変わるため、context 経由で **全行（`useSortable` 消費側 / `RowContainer`）が再レンダー**
され続けていました（context 経由の再レンダーは `React.memo` では止まりません）。

変更:

- `src/hooks/useStableFlattenedIds.ts`（新規）: 表示順 ID 配列を内容ベースで安定化
  （文字列キーに対する `useMemo`。キー生成も `useMemo` で編集コミット時のみ）。
  `IntegratedView` / `Outliner` の `flattenedIds` に適用。
- `useGanttTimeline`: `timeRange` / `timelineMetrics` を **値（epoch ms / Date の時刻）に依存**
  させ、日付範囲が変わらない編集（タイトル変更など）では参照を据え置くようにした。
  `getTaskDateRange` は `useMemo` で分離し、日付範囲の最小・最大を primitive（ms）で扱う。

計測（1,000 タスク、Before = Step 4-A 適用後）:

| 操作 | A longtask | B longtask | A window | B window |
|---|---|---|---|---|
| duration type(3) + Enter commit | 84ms | **0ms** | 301.2ms | 245.3ms |
| title commit (Enter → 追加) | 184ms | 179〜185ms | 318.0ms | 308.9〜319.3ms |
| drag commit (mouseup) | 106.7ms | **22〜42ms** | 233.8ms | 174.2〜177.6ms |
| drag bar (30 moves) | 162ms | **77〜80ms** | 799.0ms | 723.3〜740.8ms |
| drag mousemove only (30 moves, in-page) | 0ms | 0ms | 185.8ms | 191.1〜197.2ms |
| hover(20 rows) | 36.7ms | 17.3〜36ms | 516.4ms | 520.7〜546.0ms |
| dependency-drag mousemove | 0ms | 21.7〜24.7ms（※） | 675.3ms | 683.4〜689.2ms |

（※）`dependency-drag` の longtask は、待機窓を 400ms に広げた条件では **Before（Step 4-A のみ）でも
同程度（21.7ms / 最長 65ms）** に出ることから、窓長・環境による偶発的な longtask と判断しています
（操作窓の実時間は 675ms → 685ms とほぼ不変）。Step 4-B による退行ではありません。

`title commit` は Enter で **新規タスクを追加**する操作で、ID 列そのものが変わるため
`SortableContext` の再構築（全行再レンダー）が残ります（1,053ms → 約 180ms で、残りはこの
構造変更由来）。追加・削除を含まない編集では、`duration` / `drag commit` の longtask がほぼ 0 になりました。

### Step 4 のまとめ（HEAD → Step 4-B、1,000 タスク）

| 操作 | P1 開始前 longtask（Step 0 実測） | Step 4-B 後 longtask |
|---|---|---|
| duration 3 文字入力 + 確定 | 1,302〜1,430ms | **0ms** |
| タイトル確定（Enter → 追加） | 869〜1,053ms | **約 180ms** |
| バードラッグ確定（mouseup） | 455〜500ms | **約 22〜42ms** |
| 行ホバー（20 行） | 63〜99ms | **約 17〜36ms** |

### 分解用ハーネス（`bench/decompose.spec.ts`）

「commit 1 回の時間が `flattenTree` / タイムライン再計算 / React の行再描画 / selector 実行の
どこに落ちているか」を CDP の CPU プロファイラ（自己時間）で切り分けるハーネスです。
通常の `npm run bench` ではスキップされます。

```bash
DECOMPOSE=1 npx playwright test --config playwright.bench.config.ts bench/decompose.spec.ts
```

結果は `bench/results/decompose.json` に出力されます（上位 40 関数の自己時間）。


