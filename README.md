# WBS Gantt Outliner

WBS（作業分解構成図）をアウトライナー形式で素早く作成し、ガントチャートでスケジュールを管理するためのデスクトップアプリケーションです。

## 主な機能

- **WBS作成:** アウトライナー形式で直感的にタスクを階層化できます。
- **ガントチャート:** WBSと連動したガントチャートでスケジュールを可視化します。
- **統合ビュー:** WBSとガントチャートを同時に表示・操作できます。
- **ドラッグ＆ドロップ:** タスクの並べ替えや親子関係の変更が簡単に行えます。
- **ファイル操作:** プロジェクトをJSON形式で保存・読み込みできます。
- **Excelエクスポート:** 作成したWBSをExcelファイルに出力できます。

## 使用技術

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Dnd Kit](https://dndkit.com/)

## 開発タスク

### TODO

- [ ] タスクの依存関係設定
- [ ] 実績の入力
- [ ] 祝日設定
- [ ] JSONファイルからのインポート機能

### DONE

- [x] WBSの基本的な階層化
- [x] ガントチャートの表示
- [x] Excelエクスポート機能
- [x] ファイルの保存・読み込み


## ビルド

```bash
npm run build
npx electron-builder
```
