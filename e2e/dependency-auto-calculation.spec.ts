import { test, expect } from '@playwright/test';

test.describe('Task Dependency Chain & Auto-calculation E2E Tests', () => {
  test('should add three tasks, establish dependency chain A -> B -> C, and auto-calculate dates', async ({ page }) => {
    // 1. Load application
    await page.goto('/');

    // 2. Add Task A, B, and C
    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();

    // Focus Project Root and hit Enter to spawn Task A
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(2);
    await titleInputs.nth(1).fill('Task A');

    // Spawn Task B
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(3);
    await titleInputs.nth(2).fill('Task B');

    // Spawn Task C
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(4);
    await titleInputs.nth(3).fill('Task C');

    // Make sure we have 4 tasks
    await expect(titleInputs.nth(1)).toHaveValue('Task A');
    await expect(titleInputs.nth(2)).toHaveValue('Task B');
    await expect(titleInputs.nth(3)).toHaveValue('Task C');

    // Extract Task IDs from the DOM attributes
    const taskIdA = await titleInputs.nth(1).getAttribute('data-task-id');
    const taskIdB = await titleInputs.nth(2).getAttribute('data-task-id');
    const taskIdC = await titleInputs.nth(3).getAttribute('data-task-id');

    expect(taskIdA).not.toBeNull();
    expect(taskIdB).not.toBeNull();
    expect(taskIdC).not.toBeNull();

    // 3. Configure initial Dates on Task A, B, C via WBS input fields
    // Plan Start Dates
    const planStartDateInputs = page.locator('input[data-field="planStartDate"]');
    const planEndDateInputs = page.locator('input[data-field="planEndDate"]');

    // Fill Task A (2026-06-01 to 2026-06-02 - duration 2)
    await planStartDateInputs.nth(1).fill('2026-06-01');
    await planEndDateInputs.nth(1).fill('2026-06-02');
    await planEndDateInputs.nth(1).press('Enter');

    // Fill Task B (2026-06-03 to 2026-06-04 - duration 2)
    await planStartDateInputs.nth(2).fill('2026-06-03');
    await planEndDateInputs.nth(2).fill('2026-06-04');
    await planEndDateInputs.nth(2).press('Enter');

    // Fill Task C (2026-06-05 to 2026-06-08 - duration 2, because 06 and 07 are weekend)
    await planStartDateInputs.nth(3).fill('2026-06-05');
    await planEndDateInputs.nth(3).fill('2026-06-08');
    await planEndDateInputs.nth(3).press('Enter');

    // Let the state settle
    await page.waitForTimeout(200);

    // 4. Create dependency Task A -> Task B
    // Locate the dependency handle of Task A plan bar, drag to Task B's plan bar
    const barA = page.locator(`[data-task-id="${taskIdA}"].bg-blue-100`);
    const connectorA = page.locator(`[data-task-id="${taskIdA}"] [title="Drag to create dependency"]`);
    const barB = page.locator(`[data-task-id="${taskIdB}"].bg-blue-100`);

    await expect(barA).toBeVisible();
    await expect(connectorA).toBeVisible();
    await expect(barB).toBeVisible();

    // Hover A to trigger the dependency handle visibility
    await barA.hover();
    const boxA = await connectorA.boundingBox();
    const boxB = await barB.boundingBox();

    if (boxA && boxB) {
      await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
      await page.mouse.down();
      // Move in steps for a smoother/more realistic drag in browser E2E
      await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 5 });
      await page.mouse.up();
    }

    // Let the state settle
    await page.waitForTimeout(200);

    // 5. Create dependency Task B -> Task C
    const connectorB = page.locator(`[data-task-id="${taskIdB}"] [title="Drag to create dependency"]`);
    const barC = page.locator(`[data-task-id="${taskIdC}"].bg-blue-100`);
    await expect(connectorB).toBeVisible();
    await expect(barC).toBeVisible();

    await barB.hover();
    const boxB_conn = await connectorB.boundingBox();
    const boxC = await barC.boundingBox();

    if (boxB_conn && boxC) {
      await page.mouse.move(boxB_conn.x + boxB_conn.width / 2, boxB_conn.y + boxB_conn.height / 2);
      await page.mouse.down();
      await page.mouse.move(boxC.x + boxC.width / 2, boxC.y + boxC.height / 2, { steps: 5 });
      await page.mouse.up();
    }

    // Let the state settle
    await page.waitForTimeout(300);

    // 6. Change Task A's plan start date to 2026-06-10 (shifting it forward by 9 days)
    // Task A will now be 2026-06-10 to 2026-06-11 (2 workdays: Wed, Thu)
    // Task B (which depends on A) should shift to next workdays: 2026-06-12 (Fri) to 2026-06-15 (Mon) (2 workdays, skipping weekend)
    // Task C (which depends on B) should shift to next workdays: 2026-06-16 (Tue) to 2026-06-17 (Wed) (2 workdays)
    
    await planStartDateInputs.nth(1).fill('2026-06-10');
    await planStartDateInputs.nth(1).press('Enter');

    // Let the automatic recalculation cascade propagate through the chain
    await page.waitForTimeout(500);

    // 7. Verify Task B and C shifted automatically!
    await expect(planStartDateInputs.nth(1)).toHaveValue('2026-06-10');
    await expect(planEndDateInputs.nth(1)).toHaveValue('2026-06-11');

    await expect(planStartDateInputs.nth(2)).toHaveValue('2026-06-12');
    await expect(planEndDateInputs.nth(2)).toHaveValue('2026-06-15');

    await expect(planStartDateInputs.nth(3)).toHaveValue('2026-06-16');
    await expect(planEndDateInputs.nth(3)).toHaveValue('2026-06-17');

    console.log('Dependency chain auto-calculation E2E test passed perfectly!');
  });
});
