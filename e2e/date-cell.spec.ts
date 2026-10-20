import { test, expect } from '@playwright/test';

test.describe('日付セル（MM/DD + カレンダー + 複数行ペースト）', () => {
  test('128px に収まり、直接入力・複数行ペースト・カレンダー導線が機能する', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'WBS', exact: true }).click();

    // 3 行（Project Root / Date A / Date B）を用意する。
    const titleInputs = page.locator('input[data-field="title"]');
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await titleInputs.nth(1).fill('Date A');
    await page.keyboard.press('Enter');
    await titleInputs.nth(2).fill('Date B');
    await titleInputs.nth(2).blur();
    await expect(titleInputs).toHaveCount(3);

    const startInputs = page.locator('input[data-field="startDate"]');
    const endInputs = page.locator('input[data-field="endDate"]');

    // 直接入力（フル日付）→ フォーカスを外すと MM/DD 表示になる。
    await startInputs.nth(1).fill('2026-06-01');
    await endInputs.nth(1).fill('2026-06-03');
    await endInputs.nth(1).press('Enter');
    await startInputs.nth(2).fill('2026-06-04');
    await endInputs.nth(2).fill('2026-06-08');
    await endInputs.nth(2).press('Enter');
    await page.waitForTimeout(200);

    await expect(startInputs.nth(1)).toHaveValue('06/01');
    await expect(endInputs.nth(1)).toHaveValue('06/03');
    await expect(startInputs.nth(2)).toHaveValue('06/04');
    await expect(endInputs.nth(2)).toHaveValue('06/08');

    // 日付列は 128px。入力欄・カレンダーボタンがセルの外へはみ出さない。
    const dateCells = page.locator('[data-date-cell]');
    await expect(dateCells).toHaveCount(3);
    const cellBox = await dateCells.nth(1).boundingBox();
    expect(cellBox?.width).toBe(128);

    const fitsInsideCell = await dateCells.nth(1).evaluate((cell) => {
      const cellRect = cell.getBoundingClientRect();
      return Array.from(cell.querySelectorAll<HTMLElement>('input[data-field], button')).every(
        (element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= cellRect.left - 0.5 && rect.right <= cellRect.right + 0.5;
        }
      );
    });
    expect(fitsInsideCell).toBe(true);

    // 葉タスクには開始・終了それぞれのカレンダーボタンと、ネイティブピッカー用 input がある。
    await expect(
      page.locator('button[aria-label="開始日のカレンダーを開く"]')
    ).toHaveCount(3);
    await expect(page.locator('input[data-date-picker="startDate"]')).toHaveCount(3);
    await expect(page.locator('input[data-date-picker="endDate"]')).toHaveCount(3);
    // 終了日ピッカーの下限は開始日。
    await expect(page.locator('input[data-date-picker="endDate"]').nth(1)).toHaveAttribute(
      'min',
      '2026-06-01'
    );

    // 2 行を選択して複数行ペースト → 視覚順に 1 行ずつ割り当てる。
    await startInputs.nth(1).click();
    await startInputs.nth(2).click({ modifiers: ['Shift'] });
    await startInputs.nth(1).evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', '2026-07-01\n2026-07-02');
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    });

    await expect(startInputs.nth(1)).toHaveValue('07/01');
    await expect(startInputs.nth(2)).toHaveValue('07/02');
  });
});
