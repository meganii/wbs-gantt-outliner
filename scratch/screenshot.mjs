/**
 * 画面のスクリーンショットを一括で撮る開発用ツール。
 *
 *   npm run shots            # scratch/shots/ に出力
 *   SCRATCH_URL=http://localhost:5173 npm run shots
 *
 * 事前に dev サーバを起動しておくこと（別ターミナルで `npm run dev`）。
 * Electron の ipcRenderer をモックして `scratch/sample-project.json` を
 * 「読み込み」させ、3 ビュー（WBS / 統合表示 / ガントチャート）と
 * 選択状態・狭い幅・ダイアログを撮影する。UI 変更時の目視確認用。
 *
 * 出力先（scratch/shots/）は .gitignore 済み。生成物なのでコミットしない。
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'shots');
const sampleProject = readFileSync(join(here, 'sample-project.json'), 'utf-8');
const baseUrl = process.env.SCRATCH_URL ?? 'http://localhost:5173';

/** Electron 既定ウィンドウに合わせた表示サイズ */
const VIEWPORT = { width: 1440, height: 900 };
const VIEWS = [
  ['wbs', 'WBS'],
  ['integrated', '統合表示'],
  ['gantt', 'ガントチャート'],
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

// Electron の preload（ipcRenderer）をモックする。load-file はサンプルを返し、
// save / export は何もしない。
await page.addInitScript((payload) => {
  window.ipcRenderer = {
    invoke: async (channel) => (channel === 'load-file' ? payload : undefined),
    send: () => {},
    on: () => () => {},
  };
}, sampleProject);

const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });

try {
  await page.goto(baseUrl, { timeout: 10_000 });
} catch {
  await browser.close();
  console.error(
    `dev サーバに接続できませんでした (${baseUrl})。\n` +
      '別ターミナルで `npm run dev` を起動してから再実行してください。'
  );
  process.exit(1);
}

const loadButton = page.getByRole('button', { name: '読み込み', exact: true });
await loadButton.waitFor({ state: 'visible', timeout: 10_000 });
await loadButton.click();

// 読み込み完了トーストが写り込まないよう閉じる
const closeToasts = async () => {
  const closeButtons = page.getByRole('button', { name: '通知を閉じる' });
  for (let i = await closeButtons.count(); i > 0; i -= 1) {
    await closeButtons.first().click();
  }
};
await page.waitForTimeout(500);
await closeToasts();
await page.waitForTimeout(200);

for (const [id, label] of VIEWS) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(300);
  await shot(id);
}

// 行を 1 つ選択した状態（左ペイン + タイムラインの選択帯を確認する用）
for (const [id, label] of [
  ['integrated-selected', '統合表示'],
  ['gantt-selected', 'ガントチャート'],
]) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator('input[data-field="title"]').nth(2).click();
  await page.waitForTimeout(200);
  await shot(id);
}

// 複数行選択 + フォーカス列（全体選択 / フォーカス列 / 行ホバーの 3 段階の見分けを確認）
await page.getByRole('button', { name: 'WBS', exact: true }).click();
await page.waitForTimeout(200);
const descInputs = page.locator('input[data-field="description"]');
await descInputs.nth(1).click();
await descInputs.nth(5).click({ modifiers: ['Shift'] });
await page.locator('input[data-field="title"]').nth(9).hover();
await page.waitForTimeout(200);
await shot('wbs-active-column');

await page.getByRole('button', { name: '統合表示', exact: true }).click();
await page.waitForTimeout(200);
const progressInputs = page.locator('input[data-field="progress"]');
await progressInputs.nth(1).click();
await progressInputs.nth(5).click({ modifiers: ['Shift'] });
await page.waitForTimeout(200);
await shot('integrated-active-column');

// 狭いウィンドウ（ヘッダー/サブバーのはみ出し確認用）
await page.setViewportSize({ width: 1024, height: 800 });
await page.getByRole('button', { name: '統合表示', exact: true }).click();
await page.waitForTimeout(300);
await shot('integrated-narrow');
await page.setViewportSize(VIEWPORT);

// プロジェクト設定ダイアログ
await page.getByRole('button', { name: '設定' }).click();
await page.getByRole('button', { name: '祝日設定' }).click();
await page.waitForTimeout(300);
await shot('dialog');
const dialog = page.locator('.rounded-xl.border').first();
if (await dialog.count()) {
  await dialog.screenshot({ path: join(outDir, 'dialog-closeup.png') });
}

await browser.close();
console.log(`done: ${VIEWS.length + 7} screenshots -> ${outDir}`);
