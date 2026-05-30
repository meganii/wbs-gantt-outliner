import { test, expect } from '@playwright/test';

test.describe('Parent Task Roll-up E2E Tests', () => {
  test('should automatically calculate parent dates and duration based on child tasks', async ({ page }) => {
    // 1. Load application
    await page.goto('/');

    // 2. Locate the main task title inputs
    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();

    // 3. Select 'Integrated' view to see both plan and actual date columns in Outliner
    const integratedTab = page.locator('button:has-text("Integrated")');
    await integratedTab.click();
    await page.waitForTimeout(200);

    // 4. Focus first task (Project Root) and press Enter to spawn a new task (Parent Task)
    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(2);

    // Fill Parent Task. Pressing Enter to commit will automatically spawn the next row (which will be Child 1)
    await titleInputs.nth(1).fill('Parent Task');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(titleInputs).toHaveCount(3);

    // Fill Child 1.
    await titleInputs.nth(2).fill('Child 1');
    
    // Indent Child 1 under Parent Task by clicking it and pressing Shift+Alt+ArrowRight
    await titleInputs.nth(2).click();
    console.log('Indenting Child 1 via Shift+Alt+ArrowRight...');
    await page.keyboard.press('Shift+Alt+ArrowRight');
    await page.waitForTimeout(200);

    // Press Enter to commit Child 1, which automatically spawns the next row as sibling (Child 2)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(titleInputs).toHaveCount(4);

    // Fill Child 2
    await titleInputs.nth(3).fill('Child 2');
    await page.keyboard.press('Enter'); // Commit Child 2

    // Let the state settle
    await page.waitForTimeout(200);

    // 8. Set Child 1 planned date: 2026-06-01 to 2026-06-03 (3 workdays: Mon, Tue, Wed)
    const planStartDateInputs = page.locator('input[data-field="planStartDate"]');
    const planEndDateInputs = page.locator('input[data-field="planEndDate"]');
    const planDurationInputs = page.locator('input[data-field="planDuration"]');

    // Index 0: Project Root
    // Index 1: Parent Task (ReadOnly dates because it is a parent task now!)
    // Index 2: Child 1
    // Index 3: Child 2

    // Set Child 1 Dates
    await planStartDateInputs.nth(2).fill('2026-06-01');
    await planEndDateInputs.nth(2).fill('2026-06-03');
    await planEndDateInputs.nth(2).press('Enter');

    await page.waitForTimeout(200);

    // Assert Parent Task date matches Child 1 because it is currently the only child
    await expect(planStartDateInputs.nth(1)).toHaveValue('2026-06-01');
    await expect(planEndDateInputs.nth(1)).toHaveValue('2026-06-03');
    await expect(planDurationInputs.nth(1)).toHaveValue('3');

    // Set Child 2 Dates: 2026-06-04 to 2026-06-08 (3 workdays: Thu, Fri, Mon - skipping 06 and 07 weekend)
    await planStartDateInputs.nth(3).fill('2026-06-04');
    await planEndDateInputs.nth(3).fill('2026-06-08');
    await planEndDateInputs.nth(3).press('Enter');

    await page.waitForTimeout(300);

    // 9. Verify Parent Task dates are rolled up to encompass BOTH children!
    // Start date should be min(Child 1, Child 2) = 2026-06-01
    // End date should be max(Child 1, Child 2) = 2026-06-08
    // Duration should be total workdays from 2026-06-01 to 2026-06-08 = 6 workdays (Mon-Fri = 5, plus Mon = 1)
    await expect(planStartDateInputs.nth(1)).toHaveValue('2026-06-01');
    await expect(planEndDateInputs.nth(1)).toHaveValue('2026-06-08');
    await expect(planDurationInputs.nth(1)).toHaveValue('6');

    // 10. Verify Parent Task date inputs are ReadOnly
    await expect(planStartDateInputs.nth(1)).toHaveAttribute('readonly');
    await expect(planEndDateInputs.nth(1)).toHaveAttribute('readonly');

    console.log('Parent task roll-up E2E test passed successfully!');
  });
});
