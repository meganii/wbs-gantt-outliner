# WBS Gantt Outliner

WBS（作業分解構成図）をアウトライナー形式で素早く作成し、ガントチャートでスケジュール管理できる Electron デスクトップアプリです。現状は「WBS 編集」「ガント操作」「JSON 保存/読込」「Excel エクスポート」を一通り備えた、開発継続中のツールになっています。

## 現在できること

- アウトライナー形式でタスクを追加、削除、並べ替え、インデント、アウトデントできる
- 複数選択とキーボード中心の編集操作に対応している
- `WBS / Integrated / Gantt` の 3 ビューを切り替えられる
- ガントチャート上で期間のドラッグ移動、リサイズ、範囲描画ができる
- タスク依存関係の追加、削除、循環依存の簡易検知、後続タスクの日付伝播ができる
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

## 開発コマンド

```bash
# 開発サーバー
npm run dev

# テスト実行
npm test -- --run

# 本番ビルド
npm run build

# パッケージング
npx electron-builder
```

## プロジェクト構成

- `src/components`
  - Outliner、TaskRow、GanttChart などの画面コンポーネントを管理します。
- `src/store`
  - Zustand ストアと、タスク整合性や依存伝播などのロジックを管理します。
- `src/utils`
  - ツリー展開、営業日計算、Excel エクスポートなどの補助処理をまとめています。
- `electron`
  - Electron の main/preload を持ち、ファイル保存/読込の IPC を扱います。

## 技術スタック

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Zundo](https://github.com/charkour/zundo)
- [Dnd Kit](https://dndkit.com/)
- [ExcelJS](https://github.com/exceljs/exceljs)
- [Vitest](https://vitest.dev/)

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

### 未完了・今後の改善候補

- [ ] 実績入力
- [ ] 依存関係 UI の磨き込み
- [ ] JSON インポート強化とバリデーション
- [ ] ガント操作まわりの E2E テスト追加
- [ ] ストア責務のさらなる整理

## 補足

- 現時点の引き継ぎ事項、優先課題、注意点は [docs/HANDOFF.md](docs/HANDOFF.md) にまとめています。
- `npm run build` は通りますが、Excel エクスポート由来の大きいチャンクに関する警告が出ます。現状は既知事項として扱っています。
