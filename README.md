# WBS Gantt Outliner

WBS（作業分解構成図）をアウトライナー形式で素早く作成し、ガントチャートでスケジュール管理できる Web アプリです。Chrome / Edge の localhost で動作し、「WBS 編集」「ガント操作」「JSON 保存/読込」「Excel エクスポート」を一通り備えています。

## 現在できること

- アウトライナー形式でタスクを追加、削除、並べ替え、インデント、アウトデントできる
- 複数選択とキーボード中心の編集操作に対応している
- `WBS / Integrated / Gantt` の 3 ビューを切り替えられる
- ガントチャート上で期間のドラッグ移動、リサイズ、範囲描画ができる
- タスク依存関係の追加、削除、循環依存の簡易検知、後続タスクの日付伝播ができる
- ガント上部のマイルストーン（タスクとは独立したチェックポイント）を追加・編集・削除できる
- ヘッダーの `Project` メニューから祝日を登録し、カレンダー表示へ反映できる
- JSON 形式でプロジェクトを保存、読み込みできる
- Excel 形式で WBS + ガント表をエクスポートできる

## 最近の安定化対応

- タスク削除時に子孫タスクもまとめて削除し、孤児タスクが残らないようにした
- 削除されたタスクへの依存関係参照も同時にクリーンアップするようにした
- 営業日計算を `workDays + holidays` ベースで統一した
- Undo/Redo の `temporal` アクセスを型付きで扱うように整理した
- プロジェクト読込時に履歴をクリアし、過去プロジェクトへ undo できないようにした

## セットアップ

```bash
npm install
```

## 起動

```bash
# 日常利用（ビルドして http://localhost:4173/ で配信）
npm start

# 開発（http://localhost:5173/、HMR あり）
npm run dev
```

ブラウザは **Chrome / Edge** を対象にしています。`localhost` は secure context のため、保存・読込には File System Access API（`showSaveFilePicker` / `showOpenFilePicker`）が使われます。ピッカーが使えない環境では、ダウンロード / `<input type="file">` に自動でフォールバックします。

> 編集内容はブラウザ内（localStorage）に自動保存され、リロードすると復元されます。ただし正式な保存先は JSON ファイルです。未保存のままリロード・タブ終了しようとすると確認ダイアログが出ます（自動保存があるため、続行しても直近の編集は復元されます）。

## 開発コマンド

```bash
# テスト実行（ユニット）
npm test -- --run

# E2E テスト（Playwright。初回は `npx playwright install chromium` が必要）
npm run test:e2e

# Lint（eslint）
npm run lint

# 本番ビルド（dist/ に出力）
npm run build

# スクリーンショット生成 / 性能ベンチ
npm run shots
npm run bench
```

## プロジェクト構成

- `src/components`
  - Outliner、TaskRow、GanttChart などの画面コンポーネントを管理します。
- `src/store`
  - Zustand ストアと、タスク整合性や依存伝播などのロジックを管理します。
- `src/utils`
  - ツリー展開、営業日計算、Excel エクスポートなどの補助処理をまとめています。
- `src/platform`
  - ブラウザ API に依存する処理（ファイル保存 / 読み込み）のアダプタです。
- `e2e`
  - Playwright による結合テストを配置しています。

## 技術スタック

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Zundo](https://github.com/charkour/zundo)
- [Dnd Kit](https://dndkit.com/)
- [ExcelJS](https://github.com/exceljs/exceljs)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)

## ファイル入出力

- 保存 / 読込: `File System Access API` を優先。未対応・失敗時はダウンロード / ファイル選択にフォールバック。
- Excel 出力: ExcelJS を**出力時に動的 import** するため、通常の起動では読み込まれません（`dist/assets/export-*.js` に別チャンクとして出力）。
- 保存先パスは記憶しません（毎回ピッカーが開きます）。ファイル名には日時が入ります。
- 自動保存: 編集を止めて約 0.8 秒後に `localStorage`（`wbs-gantt-outliner:autosave:v1`）へ退避します。リロード・タブ終了時（`pagehide`）にも即時書き込みし、次回起動時に描画前へ復元します。保存ボタンで JSON に保存すると「未保存」状態が解除されます（保存ボタン横のオレンジの点が未保存の目印）。
- 自動保存はブラウザ内の一時データです。別ブラウザ・別プロファイル・キャッシュ削除では消えるため、必要な内容は JSON に保存してください。

## 開発状況

### 実装済み

- [x] WBS の基本的な階層編集
- [x] ガントチャート表示
- [x] 統合ビューでの同時操作
- [x] JSON 保存/読込
- [x] Excel エクスポート
- [x] Undo/Redo
- [x] タスク依存関係の基本処理
- [x] 祝日設定 UI
- [x] 自動保存（localStorage）とリロード時の復元 / 未保存警告

### 未完了・今後の改善候補

- [ ] 実績入力
- [ ] 依存関係 UI の磨き込み
- [ ] JSON インポート強化とバリデーション
- [ ] ガント操作まわりの E2E テスト追加
- [ ] ストア責務のさらなる整理

## 補足

- 現時点の引き継ぎ事項、優先課題、注意点は [docs/HANDOFF.md](docs/HANDOFF.md) にまとめています。
- `npm run build` では、ExcelJS の遅延チャンク（約 940KB）に対してチャンクサイズ警告が出ます。出力時にだけ読み込まれるため、現状は既知事項として扱っています。
