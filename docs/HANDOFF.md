# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

- WBS 編集、ガント表示、依存関係、JSON 保存/読込、Excel エクスポートまで動作する
- ヘッダーの `Project` メニューからプロジェクト祝日を登録・削除でき、Day view のカレンダー背景に反映される
- Excel エクスポートの左端列に WBS 番号（1, 1.1, 1.2 等）を付与済み。旧 WBS 列は Task Name にリネーム
- エクスポート時は `flattenTreeAll` を使い、折りたたみ状態に関係なく全タスクを出力する
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

## 直近の検証結果

- `npm test -- --run` : 通過
- `npm run build` : 通過
- `src/components/Outliner.test.tsx` を追加し、`Description` / `Duration` 列の矢印移動を確認済み
- `src/App.test.tsx` を追加し、`Expand All` / `Collapse All` のボタン操作とショートカットを確認済み
- Excel エクスポートを Electron main 側へ移動済み
  - renderer は IPC で `export-excel` を呼ぶだけになり、`exceljs` は renderer バンドルから外れた
  - `npm run build` で renderer 側の大きなチャンク警告は解消
  - `dist-electron/main.js` は大きいが、配布用の Electron main バンドルであり、今回の Vite chunk warning の対象ではない

## 次に着手する優先課題

1. 削除整合性の追加ケース確認
   - 複数選択削除、依存関係が多段にあるケースを確認したい（※空状態直後の操作は改修済み）
2. 祝日変更時のスケジュール再計算方針の整理
   - 現状はカレンダー表示と今後の営業日計算には反映されるが、既存タスクの start/end を自動再計算はしていない
3. ストア責務の整理継続
   - `src/store/useTaskStore.ts` のアクションはまだ多いので、ツリー操作や選択操作をさらに分離する余地がある
4. WBS ショートカット設計の見直し
   - 今回は上下矢印で同列の前後タスク移動のみ対応済み
   - `Task Description` から `Description` など横方向の列移動は未実装
   - `Tab` / `Shift+Tab` で列移動する案を第一候補として再検討する
   - その場合、現状 `Tab` / `Shift+Tab` に割り当てているインデント / アウトデントの代替ショートカット設計が必要
   - `Shift+Cmd/Alt+Left/Right` は案として出たが、テキスト入力のネイティブ操作や IME との競合を確認してから判断する
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

- `README.md`
- `src/store/useTaskStore.ts`
- `src/store/taskStoreUtils.ts`
- `src/components/GanttChart.tsx`

## 次の作業でよく使うコマンド

```bash
npm test -- --run
npm run build
```
