import { test, expect } from '@playwright/test';
import { addDays, format, parseISO } from 'date-fns';

/**
 * マイルストーン（Phase 1: 表示のみ）の E2E。
 *
 * - サブツールバーから追加・編集・削除できる
 * - ガントのヘッダー直下にバンドと縦ガイド線が出る
 * - 横スクロール時にバンドがヘッダーと同期する
 * - タスクの日程は変更しない
 */
test.describe('マイルストーン', () => {
  test('追加・編集・削除でき、ガント上部に表示される', async ({ page }) => {
    await page.goto('/');

    const milestoneDate = format(addDays(new Date(), 2), 'yyyy-MM-dd');
    const formattedDate = format(parseISO(milestoneDate), 'yyyy/MM/dd');

    // 追加
    await page.getByRole('button', { name: 'マイルストーン', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'マイルストーン' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('例: 設計凍結').fill('E2E マイルストーン');
    await dialog.getByLabel('日付').fill(milestoneDate);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // ガントに表示される
    await page.getByRole('button', { name: 'ガントチャート', exact: true }).click();
    const lane = page.getByTestId('milestone-lane');
    await expect(lane).toBeVisible();
    await expect(
      lane.getByRole('button', {
        name: `マイルストーン: E2E マイルストーン (${formattedDate})`,
      })
    ).toBeVisible();
    await expect(page.locator('[data-milestone-guide]')).toHaveCount(1);

    // 横スクロールに追従する
    const scroller = page.locator('div.overflow-auto').first();
    await scroller.evaluate((el) => {
      el.scrollLeft = 320;
    });
    await expect
      .poll(async () =>
        page
          .getByTestId('milestone-lane-timeline')
          .evaluate((el) => el.parentElement?.scrollLeft ?? -1)
      )
      .toBe(320);

    // 編集
    await lane
      .getByRole('button', {
        name: `マイルストーン: E2E マイルストーン (${formattedDate})`,
      })
      .click();
    dialog = page.getByRole('dialog', { name: 'マイルストーン' });
    await dialog.getByPlaceholder('例: 設計凍結').fill('E2E マイルストーン（改）');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();

    await expect(
      lane.getByRole('button', {
        name: `マイルストーン: E2E マイルストーン（改） (${formattedDate})`,
      })
    ).toBeVisible();

    // 削除するとバンド自体が消える
    await lane
      .getByRole('button', {
        name: `マイルストーン: E2E マイルストーン（改） (${formattedDate})`,
      })
      .click();
    dialog = page.getByRole('dialog', { name: 'マイルストーン' });
    await dialog.getByRole('button', { name: '削除', exact: true }).click();

    await expect(lane).toHaveCount(0);
  });
});
