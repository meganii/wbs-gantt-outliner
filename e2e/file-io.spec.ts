import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

/**
 * ブラウザのファイル入出力（保存 / 読み込み / Excel 出力）の E2E。
 *
 * ネイティブの File System Access API ピッカーは Playwright から操作できないため、
 * ピッカーを無効化してフォールバック経路（`<a download>` / `<input type="file">`）
 * を使い、`download` / `filechooser` イベントで検証する。
 * ピッカー経路そのものは `src/platform/fileIO.test.ts` でモック検証している。
 */

const PROJECT = {
  schemaVersion: 4,
  tasks: {
    a: {
      id: 'a',
      parentId: null,
      title: '設計',
      startDate: '2026-05-11',
      endDate: '2026-05-15',
      duration: 5,
      progress: 25,
      status: '',
      isCollapsed: false,
      children: [],
      dependencies: [],
    },
  },
  rootIds: ['a'],
  milestones: [{ id: 'm1', title: '設計レビュー', date: '2026-05-20' }],
};

async function loadProject(page: import('@playwright/test').Page, content: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '読み込み', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf-8'),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      showSaveFilePicker?: unknown;
      showOpenFilePicker?: unknown;
    };
    w.showSaveFilePicker = undefined;
    w.showOpenFilePicker = undefined;
  });
  await page.goto('/');
});

test('JSON を保存し、その内容を読み込み直せる', async ({ page }) => {
  await loadProject(page, JSON.stringify(PROJECT));
  await expect(page.getByText('プロジェクトを読み込みました')).toBeVisible();
  await expect(page.locator('input[data-field="title"]').first()).toHaveValue('設計');

  // 保存 → ダウンロードされた JSON を検証
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^wbs-project_\d{8}_\d{4}\.json$/);

  const path = await download.path();
  expect(path).not.toBeNull();
  const saved = JSON.parse(await readFile(path!, 'utf-8'));
  expect(saved.schemaVersion).toBe(4);
  expect(saved.rootIds).toEqual(['a']);
  expect(saved.tasks.a.title).toBe('設計');
  expect(saved.milestones).toEqual([
    expect.objectContaining({ title: '設計レビュー', date: '2026-05-20' }),
  ]);

  // 保存した内容をそのまま読み込み直せる
  await page.getByRole('button', { name: '通知を閉じる' }).click();
  await loadProject(page, JSON.stringify(saved));
  await expect(page.locator('input[data-field="title"]').first()).toHaveValue('設計');
});

test('Excel を出力できる', async ({ page }) => {
  await loadProject(page, JSON.stringify(PROJECT));

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Excel 出力', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^project_gantt_\d{8}_\d{6}\.xlsx$/);

  const path = await download.path();
  expect(path).not.toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(path!));

  const sheet = workbook.getWorksheet('Gantt Chart');
  expect(sheet).toBeDefined();
  expect(sheet!.getRow(1).getCell(2).value).toBe('項目名');
  expect(sheet!.getRow(2).getCell(2).value).toBe('設計');
});
