# HANDOFF

このファイルは次セッション向けの開発メモです。ユーザー向け仕様書ではなく、直近の状態と次の打ち手をすぐ把握するための引き継ぎ情報をまとめています。

## 現在の状態

- WBS 編集、ガント表示、依存関係、JSON 保存/読込、Excel エクスポートまで動作する
- 直近で以下の安定化修正を入れている
  - タスク削除時の再帰削除
  - 削除タスクへの依存関係参照のクリーンアップ
  - 営業日ロジックの `workDays + holidays` 統一
  - Undo/Redo の型整理
  - プロジェクト読込時の履歴クリア

## 直近の検証結果

- `npm test -- --run` : 通過
- `npm run build` : 通過
- Excel エクスポートを Electron main 側へ移動済み
  - renderer は IPC で `export-excel` を呼ぶだけになり、`exceljs` は renderer バンドルから外れた
  - `npm run build` で renderer 側の大きなチャンク警告は解消
  - `dist-electron/main.js` は大きいが、配布用の Electron main バンドルであり、今回の Vite chunk warning の対象ではない

## 次に着手する優先課題

1. 削除整合性の追加ケース確認
   - 複数選択削除、依存関係が多段にあるケース、空状態直後の操作を追加で確認したい
2. 祝日設定 UI の実装
   - `projectConfig.calendar.workDays` と `holidays` はロジック側で使える状態なので、UI を乗せやすい
3. ストア責務の整理継続
   - `src/store/useTaskStore.ts` のアクションはまだ多いので、ツリー操作や選択操作をさらに分離する余地がある
4. ガント操作の E2E 補強
   - ドラッグ移動、リサイズ、依存線追加/削除の UI テストが不足している
5. JSON インポート強化
   - 読込時の正規化はあるが、壊れた入力や互換性の扱いを詰める余地がある

## 注意点

- `src/store/useTaskStore.ts` は履歴管理も含むため、ロード処理を変えるときは undo/redo の境界を崩さないこと
- 営業日計算は `src/utils/date.ts` を経由して一貫させること。曜日判定を個別実装しないこと
- 依存関係 UI は最低限動くが、操作体験はまだ粗い
- 祝日設定 UI は未実装だが、内部データ構造は存在する
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
