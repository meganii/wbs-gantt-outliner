# ガント・統合ビュー アーキテクチャおよび仕様設計書 (Gantt & Integrated View Architecture)

本ドキュメントは、ガントチャート（`GanttChart.tsx`）および WBS統合ビュー（`IntegratedView.tsx`）における描画レイアウトと、その基盤を構成する 3 つのカスタムフックのアーキテクチャおよび現在の仕様についてまとめた設計書です。

---

## 1. 全体アーキテクチャ

本システムでは、**「日程計算・ドラッグ制御・SVG描画計算」のすべてのステートフルなロジックを3つのカスタムフックへカプセル化**し、コンポーネント自体は **「UIの描画とレイアウト（DOM表現）」**に専念する疎結合な設計となっています。

### 構成図 (Dependency Relationships)

```mermaid
graph TD
    %% Hooks
    useTimeline["useGanttTimeline (日程・カレンダー計算)"]
    useDrag["useGanttDrag (ドラッグ・リサイズ・描画操作)"]
    useDeps["useGanttDependencies (SVG 依存線の座標計算)"]

    %% Components
    Gantt[GanttChart.tsx <br/> ガントチャート表示]
    Integrated[IntegratedView.tsx <br/> WBS・ガント統合ビュー]

    %% Store
    Store[(Zustand Store)]

    %% Connections
    useTimeline -.-->|Zustand 購読| Store
    useDrag -.-->|Zustand 購読 & アクション呼出| Store
    useDeps -.-->|Zustand 購読| Store

    useDrag -->|タイムライン情報参照| useTimeline

    Gantt -->|適用| useTimeline
    Gantt -->|適用| useDrag
    Gantt -->|適用| useDeps

    Integrated -->|適用| useTimeline
    Integrated -->|適用| useDrag
    Integrated -->|適用| useDeps
```

---

## 2. 共通カスタムフックの仕様

### ① `useGanttTimeline` (タイムライン & カレンダー計算)
表示モード（日・週・月・年）に応じたセルのピクセル幅、カレンダー期間の配列生成、1日あたりのピクセル比率などを一元管理するフックです。

*   **役割**: スケジュール軸（カレンダーのヘッダーおよびグリッド背景）に必要な定数と日付計算関数の提供。
*   **主なステートと計算ロジック**:
    *   `viewMode`（Day / Week / Month / Year）に応じた `cellWidth` の決定。
    *   `date-fns` を駆使した、表示する全日付の一覧（`timeRange` 配列）の生成。
    *   表示範囲の総日数や、ピクセル ➔ 日付・日付 ➔ ピクセル の相互変換に使う `pixelsPerDay` の計算。
*   **インターフェース**:
    ```typescript
    export interface GanttTimeline {
      cellWidth: number;
      timeRange: Date[];
      timelineMetrics: {
        timelineStart: Date;
        timelineEnd: Date;
        totalDays: number;
        totalWidth: number;
        pixelsPerDay: number;
      };
      viewMode: 'Day' | 'Week' | 'Month' | 'Year';
      calendar: ProjectConfig['calendar'];
    }
    ```

### ② `useGanttDrag` (ドラッグ＆ドロップ・インタラクション制御)
ガントチャート上でのマウス操作（バーの左右ドラッグ移動、リサイズ、新規範囲のドラッグ描画、タスク接続ハンドルのドラッグ）に伴う状態変更と、Zustand ストアへのコミットを一元管理するフックです。

*   **役割**: マウス位置から日付への動的マッピングと、グローバルなドラッグ処理の集約。
*   **主なステートと計算ロジック**:
    *   `dragState`（ドラッグ対象タスクID、モード[`move`/`resize-left`/`resize-right`/`dependency`/`draw-range`]、開始/現在の日付）の管理。
    *   `mousePos`（依存関係線を引いている間のドラッグ線の終点座標）のリアルタイム更新。
    *   `window.addEventListener` による `mousemove` および `mouseup` のグローバルハンドリング。
    *   **営業日を考慮した期間計算**: マウスドラッグで移動・リサイズされたピクセル値から日付範囲を算出し、`getWorkDaysCount` を用いて営業日ベースの `duration` を割り出す処理。
    *   ドラッグ終了時、Zustand の `updateTask` や `addDependency` アクションを叩いてストアデータを安全に永続化・伝播させる処理。
*   **インターフェース**:
    ```typescript
    export interface GanttDragState {
      taskId: string;
      mode: 'move' | 'resize-left' | 'resize-right' | 'dependency' | 'draw-range';
      startX: number;
      startY: number;
      initialStartDate: Date;
      initialEndDate: Date;
      currentStartDate: Date;
      currentEndDate: Date;
    }
    ```

### ③ `useGanttDependencies` (依存関係線の動的パス計算)
タスク同士の接続線（依存関係の矢印）を DOM 要素の座標から検出し、SVG パス文字列を動的に計算するフックです。

*   **役割**: 先行タスク（PlanEnd / End）から後行タスク（PlanStart / Start）へ引かれる接続矢印の描画パスの算出。
*   **主なステートと計算ロジック**:
    *   `taskBarRefs` (各タスクバーの DOM Map) を経由した、接続元・接続先要素のクライアント矩形 (`getBoundingClientRect`) の取得。
    *   スクロール量や左側 Outliner の幅（`leftOffset`）を考慮した、SVG ローカル座標への変換。
    *   タスクの前後関係（逆流しているか、順流か）に応じた、折れ曲がり（L字・S字）SVG Path 文字列（例: `M 10 20 L 30 20 L 30 50 L 60 50`）の自動構成。
*   **インターフェース**:
    ```typescript
    export interface DependencyLine {
      key: string;      // "fromTaskId::toTaskId"
      d: string;        // SVG パス文字列
      fromId: string;   // 接続元タスクID
      toId: string;     // 接続先タスクID
    }
    ```

---

## 3. 対象コンポーネントの仕様と役割分担

コンポーネントは日程や操作計算のステートフルなロジックから解放されており、純粋なマークアップ構造の記述とレイアウト表現に特化しています。

### ① `GanttChart.tsx` (ガントチャート単体ビュー)
*   **担当責務**: 
    *   タイムラインヘッダー（日付セル・曜日ラベル）のレイアウト描画。
    *   右側操作サイドバー（Day/Week/Month/Year 切り替えプルダウン）の配置。
    *   グリッド背景（営業日/週末の背景色塗り分け）の描画。
    *   タスクバー（予定バー：青、実績バー：アンバー）の描画と、進捗率（Progress）に基づくグラデーションカラーの充填。
    *   SVG レイヤーの包含（`dependencyLines` のマッピング描画）。
    *   左側サイドバーが有効な場合、`TaskOutlineCell` を用いた階層型タスク名リストの描画（スクロールリサイズ同期含む）。

### ② `IntegratedView.tsx` (WBS・ガント統合ビュー)
*   **担当責務**:
    *   左側に WBS（`TaskRow` 経由の Outliner リスト）を配置し、右側にガントチャートグリッドを配する 2 ペイン結合レイアウトの制御。
    *   左右ペインの間にあるリサイズバー（スプリッター）のドラッグ管理（`outlinerWidth` の制御）。
    *   `@dnd-kit/core` および `SortableContext` を用いた、タスク行全体の上下ドラッグ＆ドロップによる並び替え（Reorder）イベントのハンドリング。
    *   単一スクロールコンテナ内での、左右ペインの完全な同期レンダリング。
