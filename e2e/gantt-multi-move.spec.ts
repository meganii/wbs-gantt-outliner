import { test, expect, type Locator } from '@playwright/test';

type BarMetrics = { left: number; width: number };

async function barMetrics(locator: Locator): Promise<BarMetrics> {
  return locator.evaluate((el) => {
    const style = (el as HTMLElement).style;
    return {
      left: parseFloat(style.left),
      width: parseFloat(style.width),
    };
  });
}

test.describe('Gantt multi-select move', () => {
  test('moves selected leaf bars together, propagates successors, rolls up the parent, and undoes in one step', async ({ page }) => {
    page.on('console', (msg) => console.log(`[Browser Console] ${msg.text()}`));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');

    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();

    // 1. Project Root の下に Parent + Child A/B/C を作る
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(2);
    await titleInputs.nth(1).fill('Parent');

    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(3);
    await titleInputs.nth(2).fill('Child A');

    // Child A を Parent の子へインデントする
    await titleInputs.nth(2).click();
    await page.keyboard.press('Shift+Alt+ArrowRight');
    await page.waitForTimeout(200);

    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(4);
    await titleInputs.nth(3).fill('Child B');

    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(5);
    await titleInputs.nth(4).fill('Child C');
    await page.waitForTimeout(200);

    const parentId = await titleInputs.nth(1).getAttribute('data-task-id');
    const taskAId = await titleInputs.nth(2).getAttribute('data-task-id');
    const taskBId = await titleInputs.nth(3).getAttribute('data-task-id');
    const taskCId = await titleInputs.nth(4).getAttribute('data-task-id');
    expect(parentId).not.toBeNull();
    expect(taskAId).not.toBeNull();
    expect(taskBId).not.toBeNull();
    expect(taskCId).not.toBeNull();

    // 2. 日付を設定（Child A 06-01..06-02 / B 06-03..06-04 / C 06-05..06-08）
    //    日付列は WBS ビューにのみ表示される
    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    await page.waitForTimeout(200);

    const startDateInputs = page.locator('input[data-field="startDate"]');
    const endDateInputs = page.locator('input[data-field="endDate"]');

    await startDateInputs.nth(2).fill('2026-06-01');
    await endDateInputs.nth(2).fill('2026-06-02');
    await endDateInputs.nth(2).press('Enter');

    await startDateInputs.nth(3).fill('2026-06-03');
    await endDateInputs.nth(3).fill('2026-06-04');
    await endDateInputs.nth(3).press('Enter');

    await startDateInputs.nth(4).fill('2026-06-05');
    await endDateInputs.nth(4).fill('2026-06-08');
    await endDateInputs.nth(4).press('Enter');
    await page.waitForTimeout(300);

    await expect(startDateInputs.nth(1)).toHaveValue('06/01');
    await expect(endDateInputs.nth(1)).toHaveValue('06/08');

    // 3. Child B -> Child C の依存を作る（Child C は B の翌稼働日のまま）
    await page.getByRole('button', { name: '統合表示', exact: true }).click();
    await page.waitForTimeout(200);

    const barA = page.locator(`[data-task-id="${taskAId}"][data-gantt-bar="schedule"]`);
    const barB = page.locator(`[data-task-id="${taskBId}"][data-gantt-bar="schedule"]`);
    const barC = page.locator(`[data-task-id="${taskCId}"][data-gantt-bar="schedule"]`);
    const parentBar = page.locator(`[data-task-id="${parentId}"][data-gantt-bar="schedule"]`);
    const connectorB = page.locator(`[data-task-id="${taskBId}"] [title="Drag to create dependency"]`);

    await expect(barA).toBeVisible();
    await expect(barB).toBeVisible();
    await expect(barC).toBeVisible();
    await expect(parentBar).toBeVisible();

    await barC.scrollIntoViewIfNeeded();
    await barB.hover();
    const connectorBox = await connectorB.boundingBox();
    const barCBox = await barC.boundingBox();
    expect(connectorBox).not.toBeNull();
    expect(barCBox).not.toBeNull();
    if (connectorBox && barCBox) {
      await page.mouse.move(connectorBox.x + connectorBox.width / 2, connectorBox.y + connectorBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(50);
      await page.mouse.move(barCBox.x + barCBox.width / 2, barCBox.y + barCBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(300);

    const selectAAndB = async () => {
      // 直前の選択状態に依存しないよう、C → A → Ctrl+B の順で作り直す
      await barC.click();
      await barA.click();
      await barB.click({ modifiers: ['Control'] });
      await expect(barA).toHaveClass(/ring-2/);
      await expect(barB).toHaveClass(/ring-2/);
    };

    const dragAAndAssert = async () => {
      await selectAAndB();

      const before = {
        a: await barMetrics(barA),
        b: await barMetrics(barB),
        c: await barMetrics(barC),
        parent: await barMetrics(parentBar),
      };

      const box = await barA.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      await page.mouse.move(box.x + 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 20 + 80, box.y + box.height / 2, { steps: 10 });
      await page.waitForTimeout(150);

      // ドラッグ中のプレビュー: 選択中の A/B が同じ +2 日で動く
      const preview = {
        a: await barMetrics(barA),
        b: await barMetrics(barB),
        c: await barMetrics(barC),
        parent: await barMetrics(parentBar),
      };
      expect(preview.a.left - before.a.left).toBe(80);
      expect(preview.b.left - before.b.left).toBe(80);
      // 選択外の後続・親はドラッグ中には動かない（ドロップ後に再計算）
      expect(preview.c).toEqual(before.c);
      expect(preview.parent).toEqual(before.parent);

      await page.mouse.up();
      await page.waitForTimeout(300);

      const afterDrop = {
        a: await barMetrics(barA),
        b: await barMetrics(barB),
        c: await barMetrics(barC),
        parent: await barMetrics(parentBar),
      };
      expect(afterDrop.a).toEqual(preview.a);
      expect(afterDrop.b).toEqual(preview.b);
      // 後続の C は B の終了日（06-06）の翌稼働日 06-08 へ、親は 06-03..06-09 にロールアップ
      expect(afterDrop.c.left - before.c.left).toBe(120);
      expect(afterDrop.parent.left - before.parent.left).toBe(80);
      expect(afterDrop.parent.width - before.parent.width).toBe(-40);

      // Undo 1 回で全タスクが元に戻る
      const undoButton = page.locator('button[title*="元に戻す"]');
      await expect(undoButton).toBeEnabled();
      await undoButton.click();
      await page.waitForTimeout(300);

      const afterUndo = {
        a: await barMetrics(barA),
        b: await barMetrics(barB),
        c: await barMetrics(barC),
        parent: await barMetrics(parentBar),
      };
      expect(afterUndo).toEqual(before);
    };

    // 4. ガントチャートで一括移動
    await page.getByRole('button', { name: 'ガントチャート', exact: true }).click();
    await page.waitForTimeout(300);
    await dragAAndAssert();

    // 5. 統合表示でも同じ操作ができる
    await page.getByRole('button', { name: '統合表示', exact: true }).click();
    await page.waitForTimeout(300);
    await dragAAndAssert();

    // 6. 最終状態（Undo 後）は元の日付のまま
    await page.getByRole('button', { name: 'WBS', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(startDateInputs.nth(2)).toHaveValue('06/01');
    await expect(endDateInputs.nth(2)).toHaveValue('06/02');
    await expect(startDateInputs.nth(3)).toHaveValue('06/03');
    await expect(endDateInputs.nth(3)).toHaveValue('06/04');
    await expect(startDateInputs.nth(4)).toHaveValue('06/05');
    await expect(endDateInputs.nth(4)).toHaveValue('06/08');
    await expect(startDateInputs.nth(1)).toHaveValue('06/01');
    await expect(endDateInputs.nth(1)).toHaveValue('06/08');
  });
});
