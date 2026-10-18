import { test, expect } from '@playwright/test';

/**
 * 予定（見込み）／実績（事実）／基準計画（登録した当初計画）の 3 層モデルの E2E。
 *
 * - 予定と実績は双方向同期しない（それぞれ独立に編集できる）
 * - 基準計画は「基準計画として登録」でスナップショットを取り、通常の日程変更では動かない
 * - 「基準計画を更新」で再登録すると旧基準が 1 世代退避され、「元に戻す」で復帰できる
 */
test.describe('基準計画（ベースライン）', () => {
  test('予定と実績は独立し、基準計画は登録後に不変で、更新後は元に戻せる', async ({ page }) => {
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

    const planStart = page.locator('input[data-field="planStartDate"]').nth(1);
    const planEnd = page.locator('input[data-field="planEndDate"]').nth(1);
    const actualStart = page.locator('input[data-field="startDate"]').nth(1);
    const actualEnd = page.locator('input[data-field="endDate"]').nth(1);

    // 1. 予定を入力しても実績は空のまま（同期しない）
    await planStart.fill('2026-06-01');
    await planEnd.fill('2026-06-02');
    await planEnd.press('Enter');
    await page.waitForTimeout(200);

    await expect(planStart).toHaveValue('06/01');
    await expect(planEnd).toHaveValue('06/02');
    await expect(actualStart).toHaveValue('');
    await expect(actualEnd).toHaveValue('');

    // 2. 実績開始日を入力しても予定は書き換わらない（独立）
    await actualStart.click();
    await actualStart.fill('2026-06-05');
    await actualStart.press('Enter');
    await page.waitForTimeout(200);

    await expect(actualStart).toHaveValue('06/05');
    await expect(planStart).toHaveValue('06/01');
    await expect(planEnd).toHaveValue('06/02');

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

    // 5. 予定を変更しても基準計画は不変
    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    await page.waitForTimeout(200);
    await planStart.click();
    await planStart.fill('2026-06-15');
    await planStart.press('Enter');
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
