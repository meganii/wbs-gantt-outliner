import { test, expect } from '@playwright/test';

test.describe('Reproduce Gantt Bar Drag Bug', () => {
  test('should verify if unrelated tasks move during/after drag and snap back on focus', async ({ page }) => {
    // 1. Load application
    page.on('console', (msg) => {
      if (msg.text().includes('[Memo TaskB]') || msg.text().includes('[App Render]')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });
    await page.goto('/');

    // 2. Add Task A and Task B
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

    // Extract Task IDs
    const taskIdA = await titleInputs.nth(1).getAttribute('data-task-id');
    const taskIdB = await titleInputs.nth(2).getAttribute('data-task-id');
    expect(taskIdA).not.toBeNull();
    expect(taskIdB).not.toBeNull();

    // 3. Configure initial Dates
    const planStartDateInputs = page.locator('input[data-field="planStartDate"]');
    const planEndDateInputs = page.locator('input[data-field="planEndDate"]');

    // Fill Task A (2026-06-01 to 2026-06-03)
    await planStartDateInputs.nth(1).fill('2026-06-01');
    await planEndDateInputs.nth(1).fill('2026-06-03');
    await planEndDateInputs.nth(1).press('Enter');

    // Fill Task B (2026-06-05 to 2026-06-08)
    await planStartDateInputs.nth(2).fill('2026-06-05');
    await planEndDateInputs.nth(2).fill('2026-06-08');
    await planEndDateInputs.nth(2).press('Enter');

    await page.waitForTimeout(500);

    // Get Gantt bar locators
    const barA = page.locator(`div[data-task-id="${taskIdA}"].bg-blue-100`);
    const barB = page.locator(`div[data-task-id="${taskIdB}"].bg-blue-100`);
    
    await expect(barA).toBeVisible();
    await expect(barB).toBeVisible();

    // Get initial bounding box of Task B
    const initialBoxB = await barB.boundingBox();
    expect(initialBoxB).not.toBeNull();
    const initialLeftB = initialBoxB!.x;
    console.log(`[Initial] Task B x-coordinate: ${initialLeftB}`);

    // Get bounding box of Task A to start dragging
    const boxA = await barA.boundingBox();
    expect(boxA).not.toBeNull();

    // Drag Task A to the left by 300 pixels (past the initial start date, forcing timeline extension)
    const startX = boxA!.x + boxA!.width / 2;
    const startY = boxA!.y + boxA!.height / 2;
    const destX = startX - 300;

    console.log('Dragging Task A to the left...');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(destX, startY, { steps: 10 });
    
    // Check Task B position WHILE dragging Task A
    await page.waitForTimeout(200);
    const draggingBoxB = await barB.boundingBox();
    const draggingLeftB = draggingBoxB!.x;
    console.log(`[Dragging] Task B x-coordinate: ${draggingLeftB}`);

    // Drop Task A
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Check Task B position AFTER drop (before any hover on Task B)
    const afterDropBoxB = await barB.boundingBox();
    const afterDropLeftB = afterDropBoxB!.x;
    console.log(`[After Drop, Before Hover] Task B x-coordinate: ${afterDropLeftB}`);

    // Hover on Task B
    console.log('Hovering on Task B to focus...');
    await barB.hover();
    await page.waitForTimeout(300);

    // Check Task B position AFTER hover (focus)
    const afterHoverBoxB = await barB.boundingBox();
    const afterHoverLeftB = afterHoverBoxB!.x;
    console.log(`[After Hover] Task B x-coordinate: ${afterHoverLeftB}`);

    // Assert the bug!
    // If the bug exists:
    // 1. draggingLeftB or afterDropLeftB is DIFFERENT from initialLeftB.
    // 2. afterHoverLeftB goes back to initialLeftB (or close to it, if not modified by timeline auto-extend).
    // In our case, the timeline should not auto-extend much because 2026-06-05 to 06-08 is within range.
    console.log(`Summary of x-coords: Initial=${initialLeftB}, Dragging=${draggingLeftB}, AfterDrop=${afterDropLeftB}, AfterHover=${afterHoverLeftB}`);
    
    // We expect Task B's text input to NOT change (which user confirmed)
    await expect(planStartDateInputs.nth(2)).toHaveValue('06/05');
  });
});
