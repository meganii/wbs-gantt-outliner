import { test, expect } from '@playwright/test';

test.describe('ホバーツールチップ', () => {
  test('日付セルとガントバーでフル日付 / 日程情報を素早く表示する', async ({ page }) => {
    await page.goto('/');

    const titleInputs = page.locator('input[data-field="title"]');
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await titleInputs.nth(1).fill('Tooltip Task');
    await titleInputs.nth(1).press('Enter');

    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    const startInput = page.locator('input[data-field="startDate"]').nth(1);
    const endInput = page.locator('input[data-field="endDate"]').nth(1);
    await startInput.fill('2026-06-01');
    await endInput.fill('2026-06-02');
    await endInput.press('Enter');
    await page.waitForTimeout(200);

    // 日付セル: ネイティブ title ではなく、フル日付のツールチップが表示される。
    await expect(startInput).not.toHaveAttribute('title');
    await startInput.hover();
    await expect(page.getByRole('tooltip')).toContainText('開始日: 2026/06/01');
    await expect(page.getByRole('tooltip')).toContainText(
      'クリックで入力 / カレンダーから選択'
    );

    // ガントバー: タイトル・日程・期間・進捗を 1 つのツールチップに表示する。
    await page.getByRole('button', { name: 'ガントチャート', exact: true }).click();
    await page.waitForTimeout(300);
    const bar = page
      .locator('[data-gantt-bar="schedule"]')
      .filter({ hasText: 'Tooltip Task' });
    await expect(bar).toHaveCount(1);
    await expect(bar).not.toHaveAttribute('title');

    await bar.hover();
    const barTooltip = page.getByRole('tooltip');
    await expect(barTooltip).toContainText('Tooltip Task');
    await expect(barTooltip).toContainText('開始日: 2026-06-01');
    await expect(barTooltip).toContainText('終了日: 2026-06-02');
    await expect(barTooltip).toContainText('期間: 2日');
    await expect(barTooltip).toContainText('進捗 0%');
  });
});
