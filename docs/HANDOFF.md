# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

- WBS 編集、ガント表示、依存関係、JSON 保存/読込、Excel エクスポートまで動作する
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
  - 【デグレード修正】
    - 予定バーの `div` に `data-task-id={id}` 属性が欠落していたため、ベースライン固定 OFF（予定モード）時に依存関係を引けなくなっていた不具合を、属性を正しく付与することで解消。
    - 予定モード時（ベースライン固定 OFF）に依存関係による自動スケジュール調整が予定日程（`planStartDate`, `planEndDate`, `planDuration`）に連動して伝播しないバグを、日程伝播エンジン（`propagateDependencyDates` / `shiftDescendants`）へ `baselineLocked` フラグを引き渡して同期更新を行うことで解消。
    - ヘッダーでのベースラインロック切り替え時に、依存関係線が即時再描画されなかった問題を、`GanttChart` および `IntegratedView` 内の依存線用 `useLayoutEffect` の依存配列へ `baselineLocked` を追加することで解消。
    - 予定バーに `group` クラスが欠損していたためにホバー時の「青い円（接続ハンドル）」が表示されず、依存線をドラッグ開始できなかった不具合を、クラスを追加することで解消。また、ドラッグ中の仮接続線の起点を `baselineLocked` の状態に応じて適切な座標（予定／実績バーの位置）から伸びるように動的調整。
    - 予定モード時（ベースライン固定 OFF）に予定バーに `truncate` クラスが適用されていたため、ホバーした際に `overflow: hidden` により右端の依存関係プラスボタン（青い接続ハンドル）がクリップされて非表示になっていたバグを、予定バー親要素の `truncate` クラスを削除することで解消（バー内部のタイトル用 span 自体は引き続き `truncate` されるため、表示上の不具合もありません）。
- 直近で以下の安定化修正を入れている
  - タスク削除時の再帰削除
  - 削除タスクへの依存関係参照のクリーンアップ
  - 営業日ロジックの `workDays + holidays` 統一
  - Undo/Redo の型整理
  - プロジェクト読込時の履歴クリア
  - Windows環境向けに Shift + Alt + 矢印キー でのタスク移動に対応
  - `Integrated` / `Gantt` View のレイアウト見直し
    - ガント領域の縦スクロールが効くように `min-h-0` / `h-full` を整理
    - `App` で可視タスク一覧を共有し、折りたたみ時の Outliner と Gantt の行ズレを抑制
    - ホバー中タスク ID を `App` で共有し、Outliner と Gantt の行ハイライトを同期
  - `Integrated` View を単一の行コンポーネント構成へ変更
    - 左のタスク列と右のガント列を 1 つの縦スクロールコンテナに統合
    - `TaskRow` は外側コンテナ差し替えに対応し、統合行の左セルとして再利用
    - 左ペイン幅は列合計未満に縮まないようクランプ
  - 祝日設定 UI を追加
    - `Project > Holiday Settings` から `projectConfig.calendar.holidays` を編集可能
    - 読込時は `projectConfig` を既定値マージし、古い JSON の欠損項目を補完
    - 祝日一覧はソート・重複除去して保持
  - `WBS` View のキーボード移動を改善
    - `TaskRow` にフォーカス中の列 (`title` / `description` / `assignee` / `deliverables` / `duration` / `startDate` / `endDate`) を保持
    - `Task Description` 以外のセルでも上下矢印で同じ列の前後タスクへ移動可能
    - タイトル列専用だった `Enter` / `Tab` / 削除系ショートカットとは分離し、詳細列の既存編集挙動を維持
  - ヘッダーに `Expand All` / `Collapse All` を追加
    - ボタン操作と `Cmd/Ctrl + Alt + ↑ / ↓` のショートカットで全体の折り畳みを切り替えられる
  - WBSのインデント変更ショートカットを `Tab`/`Shift+Tab` から `Alt+Shift+→/←` (Macでは `Cmd+Shift+→/←` も可) に移行。これにより `Tab` キーは標準のフォーカス移動として利用可能になった
  - 「Gantt」View の表示と開閉操作性を改善
    - タスク名の左側に WBS 番号（1, 1.1, 1.2 等）を表示し、階層の深さ（depth）に応じたインデントを適用
    - 子タスクを持つ親タスクの左隣に開閉用 chevron ボタン（`ChevronRight` / `ChevronDown`）を配置し、クリックで展開/折り畳みをトグル可能に
    - タスク名列をクリックすることで、WBS View と同様に選択（青色背景）できるように変更
    - 選択中のタスクに対して、キーボードショートカット `Alt + ↑ / ↓` での折り畳み（Collapse）/ 展開（Expand）操作に対応。文字入力フォーカス時にはバイパスされ影響しません
    - タスク名（Task Name）列の右端にリサイズバーを設置し、ドラッグにより列幅を手動調整できるように改善（WBS Viewのタスク名列幅と連動）
    - キーボード `↑ / ↓`（ArrowUp/Down）による選択タスクの上下移動、および `Shift + ↑ / ↓` による範囲選択拡張に対応。行が上下のスクロール範囲外に出た場合の自動スクロール追従も実装しました
    - 子タスクの開始日・終了日を入力した際に、親タスク（およびそれ以上の階層のタスク）に自動的に最小開始日・最大終了日（および稼働日数に基づく期間）を伝播させる仕組みを実装
      - WBSビュー上で親タスクの `startDate`, `endDate`, `duration` は自動計算値として読み取り専用（`readOnly` & `cursor-not-allowed` などのスタイル）にロック
      - Gantt / Integrated ビュー上で親タスクバーのドラッグ移動・リサイズ・描画範囲選択ジェスチャーを無効化
      - 親タスクのガント表示を専用の「サマリータスク」スタイル（Slateカラー、スリムな形状、左右に下向きのブラケット三角形）に差し替え
    - 階層変更（インデント・アウトデント・移動）時に、循環参照の原因となる親子・先祖子孫間の不正な依存関係を自動検出・切断する `cleanupHierarchicalDependencies` 機能を実装
      - 単一アトミックトランザクションにより、依存関係の自動切断と日付再計算を含めて完璧に Undo/Redo が動作することを確認済み
      - 既存の親子・先祖子孫のタスク間に対して、後からドラッグ等で不正な依存関係を手動追加できないよう `addDependency` 内で安全チェックを追加しブロック
    - 行操作やセル入力時における行選択（`selectedTaskIds`）とセルフォーカス（`focusedTaskId`）の不一致バグ、およびインプットの白抜け問題を解消
      - `TaskRow.tsx` の最外枠行コンテナに統合された `onMouseDown` ハンドラ（`handleRowMouseDown`）を実装。WBS番号や余白のクリックで行選択を動作させ、入力欄への修飾キー（Shift, Ctrl, Cmd）クリック時にはブラウザ本来の挙動（テキスト範囲選択やフォーカス移動）を `preventDefault` で抑止して行の範囲選択・トグル選択を正確に行えるようデグレードを解消
      - ブラウザの User Agent デフォルトスタイルによる入力欄の白抜けを防ぐため、すべてのインプット要素に対して明示的に `style={{ backgroundColor: 'transparent' }}` を指定
    - 親タスクの依存関係日付伝播における子タスク自動同期を実装
      - 親タスクが依存関係（先行タスクの移動）によって開始日がシフトされる際、属するすべての子孫タスクの日付を正確な稼働日相対オフセット・期間を維持したまま一括で同期シフトする `shiftDescendants` ヘルパーを `taskStoreUtils.ts` 内に実装
      - 伝播処理 `propagateDependencyDates` で親タスクをシフトする際、すべての子孫タスクを同時にシフトし、それら子孫タスクのIDも連鎖伝播用の queue に追加することで、下流タスクへの変更伝播も正しく連鎖するように拡張。最終パスで再帰的に上方向の親タスク日付も完全同期
      - `addDependency` アクションが成功した直後に日付の伝播を自動的にトリガーするよう修正
    - 親タスクが関与するすべての依存関係設定（線の描画および追加）の完全禁止化
      - `addDependency` 内で先行（`fromTask`）または後行（`toTask`）のいずれかが子タスクを持つ親タスクである場合にエラー警告を出して完全にブロックするようガードを追加
      - `GanttChart.tsx` および `IntegratedView.tsx` の UI ドラッグ＆ドロップドロップ処理内で、ドロップ先（`targetTask`）が親タスクである場合のアクションを無効化するガードを配置し、子タスクから親タスクへの依存関係設定を完全に抑止した。

## 直近の検証結果

- `pnpm test -- --run` : 通過 (64テスト全件通過) - 新規追加した予定・実績同期、ベースライン固定時のロック制御のVitestを含む。
- `pnpm run build` : 通過 (TypeScript型検査および本番ビルド通過)
- `src/components/Outliner.test.tsx` を追加し、`Description` / `Duration` 列の矢印移動を確認済み
- `src/App.test.tsx` を追加し、`Expand All` / `Collapse All` のボタン操作 and ショートカットを確認済み
- `WBS` View のキーボード移動を改善
  - `TaskRow` にフォーカス中の列 (`title` / `description` / `assignee` / `deliverables` / `duration` / `startDate` / `endDate`) を保持
  - `Task Description` 以外のセルでも上下矢印で同じ列の前後タスクへ移動可能
  - タイトル列専用だった `Enter` / `Tab` / 削除系ショートカットとは分離し、詳細列の既存編集挙動を維持
- ヘッダーに `Expand All` / `Collapse All` を追加
  - ボタン操作と `Cmd/Ctrl + Alt + ↑ / ↓` のショートカットで全体の折り畳みを切り替えられる
- WBSのインデント変更ショートカットを `Tab`/`Shift+Tab` から `Alt+Shift+→/←` (Macでは `Cmd+Shift+→/←` も可) に移行。これにより `Tab` キーは標準のフォーカス移動として利用可能になった
- 「Gantt」View の表示と開閉操作性を改善
  - タスク名の左側に WBS 番号（1, 1.1, 1.2 等）を表示し、階層の深さ（depth）に応じたインデントを適用
  - 子タスクを持つ親タスクの左隣に開閉用 chevron ボタン（`ChevronRight` / `ChevronDown`）を配置し、クリックで展開/折り畳みをトグル可能に
  - タスク名列をクリックすることで、WBS View と同様に選択（青色背景）できるように変更
  - 選択中のタスクに対して、キーボードショートカット `Alt + ↑ / ↓` での折り畳み（Collapse）/ 展開（Expand）操作に対応。文字入力フォーカス時にはバイパスされ影響しません
  - タスク名（Task Name）列の右端にリサイズバーを設置し、ドラッグにより列幅を手動調整できるように改善（WBS Viewのタスク名列幅と連動）
  - キーボード `↑ / ↓`（ArrowUp/Down）による選択タスクの上下移動、および `Shift + ↑ / ↓` による範囲選択拡張に対応。行が上下のスクロール範囲外に出た場合の自動スクロール追従も実装しました
  - 子タスクの開始日・終了日を入力した際に、親タスク（およびそれ以上の階層のタスク）に自動的に最小開始日・最大終了日（および稼働日数に基づく期間）を伝播させる仕組みを実装
    - WBSビュー上で親タスクの `startDate`, `endDate`, `duration` は自動計算値として読み取り専用（`readOnly` & `cursor-not-allowed` などのスタイル）にロック
    - Gantt / Integrated ビュー上で親タスクバーのドラッグ移動・リサイズ・描画範囲選択ジェスチャーを無効化
    - 親タスクのガント表示を専用の「サマリータスク」スタイル（Slateカラー、スリムな形状、左右に下向きのブラケット三角形）に差し替え
  - 階層変更（インデント・アウトデント・移動）時に、循環参照の原因となる親子・先祖子孫間の不正な依存関係を自動検出・切断する `cleanupHierarchicalDependencies` 機能を実装
    - 単一アトミックトランザクションにより、依存関係の自動切断と日付再計算を含めて完璧に Undo/Redo が動作することを確認済み
    - 既存の親子・先祖子孫のタスク間に対して、後からドラッグ等で不正な依存関係を手動追加できないよう `addDependency` 内で安全チェックを追加しブロック
  - 行操作やセル入力時における行選択（`selectedTaskIds`）とセルフォーカス（`focusedTaskId`）の不一致バグ、およびインプットの白抜け問題を解消
    - `TaskRow.tsx` の最外枠行コンテナに統合された `onMouseDown` ハンドラ（`handleRowMouseDown`）を実装。WBS番号や余白のクリックで行選択を動作させ、入力欄への修飾キー（Shift, Ctrl, Cmd）クリック時にはブラウザ本来の挙動（テキスト範囲選択やフォーカス移動）を `preventDefault` で抑止して行の範囲選択・トグル選択を正確に行えるようデグレードを解消
    - ブラウザの User Agent デフォルトスタイルによる入力欄の白抜けを防ぐため、すべてのインプット要素に対して明示的に `style={{ backgroundColor: 'transparent' }}` を指定
  - 親タスクの依存関係日付伝播における子タスク自動同期を実装
    - 親タスクが依存関係（先行タスクの移動）によって開始日がシフトされる際、属するすべての子孫タスクの日付を正確な稼働日相対オフセット・期間を維持したまま一括で同期シフトする `shiftDescendants` ヘルパーを `taskStoreUtils.ts` 内に実装
    - 伝播処理 `propagateDependencyDates` で親タスクをシフトする際、すべての子孫タスクを同時にシフトし、それら子孫タスクのIDも連鎖伝播用の queue に追加することで、下流タスクへの変更伝播も正しく連鎖するように拡張。最終パスで再帰的に上方向の親タスク日付も完全同期
    - `addDependency` アクションが成功した直後に日付の伝播を自動的にトリガーするよう修正
  - 親タスクが関与するすべての依存関係設定（線の描画および追加）の完全禁止化
    - `addDependency` 内で先行（`fromTask`）または後行（`toTask`）のいずれかが子タスクを持つ親タスクである場合にエラー警告を出して完全にブロックするようガードを追加
    - `GanttChart.tsx` および `IntegratedView.tsx` の UI ドラッグ＆ドロップドロップ処理内で、ドロップ先（`targetTask`）が親タスクである場合のアクションを無効化するガードを配置し、子タスクから親タスクへの依存関係設定を完全に抑止した。
  - キーボードショートカットによる View 切り替え機能の修正・改善
    - `Ctrl + 1` (Mac では `Cmd + 1`): WBS view
    - `Ctrl + 2` (Mac では `Cmd + 2`): Integrated view
    - `Ctrl + 3` (Mac では `Cmd + 3`): Gantt view
    - ブラウザのデフォルト挙動（Chromiumによるタブ切り替え等）やインプット要素フォーカス時の競合を防ぐため、Electronのメインプロセス側 `before-input-event` でキーダウンをインターセプトし、`event.preventDefault()` したうえで `'switch-view'` IPCメッセージをレンダラーに送信して確実に切り替わるように制御。
    - レンダラー側 (`App.tsx`) に `'switch-view'` の IPC リスナーを追加。テストや非Electron環境向けに既存のキーダウンリスナーもフォールバックとして保持。

## 直近の検証結果

- `pnpm test -- --run` : 通過 (63テスト全件通過、IPC経由のビュー切り替えテストを追加)
- `pnpm run build` : 通過 (TypeScript型検査および本番ビルド通過)
- `src/components/Outliner.test.tsx` を追加し、`Description` / `Duration` 列の矢印移動を確認済み
- `src/App.test.tsx` に `switch-view` IPC経由の切り替えテストを追加し、`Expand All` / `Collapse All` のボタン操作とショートカットを確認済み
- `src/components/GanttChart.test.tsx` を追加し、Gantt View での WBS表示、階層インデント、Chevron開閉、タスク選択、Alt + ↑/↓ のトグル動作、列のドラッグリサイズ動作、および↑/↓（Shift含む）キーによる選択・行移動動作を網羅検証し、Vitest 全件通過を確認済み
- Excel エクスポートを Electron main 側へ移動済み
  - renderer は IPC で `export-excel` を呼ぶだけになり、`exceljs` は renderer バンドルから外れた
  - `pnpm run build` で renderer 側の大きなチャンク警告は解消
  - `dist-electron/main.js` は大きいが、配布用の Electron main バンドルであり、今回の Vite chunk warning の対象ではない

## 次に着手する優先課題

1. 削除整合性の追加ケース確認
   - 複数選択削除、依存関係が多段にあるケースを確認したい（※空状態直後の操作は改修済み）
2. 祝日変更時のスケジュール再計算方針の整理
   - 現状はカレンダー表示と今後の営業日計算には反映されるが、既存タスクの start/end を自動再計算はしていない
3. ストア責務の整理継続
   - `src/store/useTaskStore.ts` のアクションはまだ多いので、ツリー操作や選択操作をさらに分離する余地がある
4. WBS ショートカット設計の見直し
   - インデント変更を `Alt+Shift+→/←`（Macでは `Cmd+Shift+→/←` も可）へ移行し、`Tab` で標準のフォーカス移動ができるよう改修済み。
   - `Task Description` から `Description` などの横方向への列移動は未実装。必要に応じて追加のキーナビゲーション設計を検討する。
5. ガント操作の E2E 補強
   - ドラッグ移動、リサイズ、依存線追加/削除の UI テストが不足している
6. JSON インポート強化
   - 読込時の正規化はあるが、壊れた入力や互換性の扱いを詰める余地がある

## 注意点

- `src/store/useTaskStore.ts` は履歴管理も含むため、ロード処理を変えるときは undo/redo の境界を崩さないこと
- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと
- 依存関係 UI は最低限動くが、操作体験はまだ粗い
- 祝日設定 UI は `Project > Holiday Settings` に実装済み
- 祝日変更時、既存タスク日付の自動再計算はまだ行わない。必要なら仕様を決めてから入れること
- Excel エクスポートは Electron main 側で生成・保存する構成になった
  - 保存ダイアログやファイル書き込みも main 側が担当する

## 次の作業で最初に見るとよい場所

> **注記:** 現在 `feature/pnpm-and-forge-migration` ブランチにて、`npm` から `pnpm` への移行、および `electron-builder` から `electron-forge` への移行を検証中です。パッケージング時の権限エラー（EPERM）回避策としてテストしています。

- `README.md`
- `src/store/useTaskStore.ts`
- `src/store/taskStoreUtils.ts`
- `src/components/GanttChart.tsx`

## 次の作業でよく使うコマンド

```bash
pnpm test -- --run
pnpm run build
pnpm run make
```
