import { test, expect } from '@playwright/test';

/**
 * 予定・実績モデル（2 層: 基準計画 + 現在の日程 + 進捗率）の E2E。
 *
 * - 日付は 1 系統（開始日 / 終了日）で、進捗率は日付を書き換えない（規則 2）
 * - 基準計画は「基準計画として登録」でスナップショットを取り、通常の日程変更では動かない
 * - 「基準計画を更新」で再登録すると旧基準が 1 世代退避され、「元に戻す」で復帰できる
 */
test.describe('基準計画（ベースライン）', () => {
  test('日程を編集しても基準計画は不変で、更新後は元に戻せる', async ({ page }) => {
    await page.goto('/');

    // タスクを追加
    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(2);
    await titleInputs.nth(1).fill('Task A');
    await titleInputs.nth(1).press('Enter');

    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    await page.waitForTimeout(200);

    const startInput = page.locator('input[data-field="startDate"]').nth(1);
    const endInput = page.locator('input[data-field="endDate"]').nth(1);

    // 1. 開始日 / 終了日を入力する
    await startInput.fill('2026-06-01');
    await endInput.fill('2026-06-02');
    await endInput.press('Enter');
    await page.waitForTimeout(200);

    await expect(startInput).toHaveValue('06/01');
    await expect(endInput).toHaveValue('06/02');

    // 2. 進捗率を入力しても日付は書き換わらない（規則 2）
    const progressInput = page.locator('input[data-field="progress"]').nth(1);
    await progressInput.click();
    await progressInput.fill('50');
    await progressInput.press('Enter');
    await page.waitForTimeout(200);
    await expect(startInput).toHaveValue('06/01');
    await expect(endInput).toHaveValue('06/02');

    // 3. 基準計画として登録
    const baselineButton = page.getByRole('button', { name: '基準計画', exact: true });
    await baselineButton.click();
    await page.getByRole('button', { name: '基準計画として登録' }).click();
    await page.waitForTimeout(200);

    // 4. ガントで基準計画ゴーストバーが出る（登録時の 06/01-06/02）
    await page.getByRole('button', { name: 'ガントチャート', exact: true }).click();
    await page.waitForTimeout(300);
    const ghost = page.locator('[title^="基準計画: Task A"]');
    await expect(ghost).toHaveCount(1);
    await expect(ghost).toHaveAttribute('title', /2026-06-01 - 2026-06-02/);

    // 5. 日程を変更しても基準計画は不変
    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    await page.waitForTimeout(200);
    await startInput.click();
    await startInput.fill('2026-06-15');
    await startInput.press('Enter');
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'ガントチャート', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('[title^="基準計画: Task A"]')).toHaveAttribute(
      'title',
      /2026-06-01 - 2026-06-02/
    );

    // 6. 基準計画を更新 → 旧基準が退避され「元に戻す」が有効になる
    await baselineButton.click();
    await page.getByRole('button', { name: '基準計画を更新' }).click();
    await page.waitForTimeout(200);

    await baselineButton.click();
    const restoreButton = page.getByRole('button', { name: '基準計画を元に戻す' });
    await expect(restoreButton).toBeEnabled();
    await restoreButton.click();
    await page.waitForTimeout(200);

    // 7. 元に戻すと当初の基準計画（06/01-06/02）へ復帰する
    await expect(page.locator('[title^="基準計画: Task A"]')).toHaveAttribute(
      'title',
      /2026-06-01 - 2026-06-02/
    );
  });
});
