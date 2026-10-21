import { test, expect } from '@playwright/test';

/**
 * 自動保存とリロード時の復元の E2E。
 *
 * `beforeunload` の確認ダイアログは Playwright が自動で閉じる（＝遷移は続行する）。
 * ここで見たいのは「警告が出る状態か」と「リロード後に内容が戻るか」。
 * ダイアログの表示自体はヘッドレスでは確実に観測できないため、
 * ハンドラが `defaultPrevented` を立てることをページ内で確認する。
 */

// src/utils/autosave.ts の AUTOSAVE_STORAGE_KEY と同じ値。
// e2e から src を import すると依存一式を巻き込むため、ここでは文字列で持つ。
const AUTOSAVE_STORAGE_KEY = 'wbs-gantt-outliner:autosave:v1';

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
      progress: 0,
      status: '',
      isCollapsed: false,
      children: [],
      dependencies: [],
    },
  },
  rootIds: ['a'],
};

test.beforeEach(async ({ page }) => {
  // ネイティブのファイルピッカーは操作できないため、フォールバック経路を使う。
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

test('未保存の編集はリロード後に復元され、保存済みなら警告しない', async ({ page }) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '読み込み', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(PROJECT), 'utf-8'),
  });

  const title = page.locator('input[data-field="title"]').first();
  await expect(title).toHaveValue('設計');

  // 読み込んだ直後は保存済み扱い（未保存マークなし）
  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);

  // タイトルを編集すると未保存マークが付き、beforeunload がブロックする
  await title.fill('設計（改）');
  await title.press('Enter');

  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();
  const blocked = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(blocked).toBe(true);

  // デバウンス（800ms）後に自動保存される
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_STORAGE_KEY), {
      timeout: 5000,
    })
    .toContain('設計（改）');

  await page.reload();

  await expect(page.getByText('前回の編集内容を復元しました')).toBeVisible();
  await expect(page.locator('input[data-field="title"]').first()).toHaveValue('設計（改）');
  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();
});

test('保存に成功すると未保存マークが消える', async ({ page }) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '読み込み', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(PROJECT), 'utf-8'),
  });

  const title = page.locator('input[data-field="title"]').first();
  await title.fill('設計（改）');
  await title.press('Enter');
  await expect(page.getByTestId('unsaved-indicator')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  await expect(page.getByTestId('unsaved-indicator')).toHaveCount(0);
});
