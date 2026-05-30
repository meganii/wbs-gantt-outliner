import { test, expect } from '@playwright/test';

test.describe('Baseline Lock E2E Tests', () => {
  test('should lock plan dates when baseline is locked and allow independent actual date editing', async ({ page }) => {
    // 1. Load application
    await page.goto('/');

    // 2. Add Task A
    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();

    await titleInputs.first().click();
    await page.keyboard.press('Enter');
    await expect(titleInputs).toHaveCount(2);
    await titleInputs.nth(1).fill('Task A');

    // Extract task ID
    const taskIdA = await titleInputs.nth(1).getAttribute('data-task-id');
    expect(taskIdA).not.toBeNull();

    // 3. Select 'Integrated' view to see both plan and actual date columns in Outliner
    const integratedTab = page.locator('button:has-text("Integrated")');
    await integratedTab.click();
    await page.waitForTimeout(200);

    // 4. Set Initial Plan Dates (baseline lock is OFF by default)
    const planStartDateInputs = page.locator('input[data-field="planStartDate"]');
    const planEndDateInputs = page.locator('input[data-field="planEndDate"]');
    const actualStartDateInputs = page.locator('input[data-field="startDate"]');
    const actualEndDateInputs = page.locator('input[data-field="endDate"]');

    // Initially actual and plan dates are empty or defaulted
    // Set plan start date
    await planStartDateInputs.nth(1).fill('2026-06-01');
    await planEndDateInputs.nth(1).fill('2026-06-02');
    await planEndDateInputs.nth(1).press('Enter');

    await page.waitForTimeout(200);

    // Assert that actual dates remain empty (decoupled) when baselineLock is OFF
    await expect(actualStartDateInputs.nth(1)).toHaveValue('');
    await expect(actualEndDateInputs.nth(1)).toHaveValue('');

    // Now set actual start date
    await actualStartDateInputs.nth(1).fill('2026-06-05');
    await actualEndDateInputs.nth(1).fill('2026-06-08');
    await actualEndDateInputs.nth(1).press('Enter');

    await page.waitForTimeout(200);

    // Assert actual dates are set, plan dates remain separate
    await expect(actualStartDateInputs.nth(1)).toHaveValue('2026-06-05');
    await expect(planStartDateInputs.nth(1)).toHaveValue('2026-06-01');

    // 5. Turn ON baseline lock
    const lockCheckbox = page.locator('label:has-text("Lock Baseline") input[type="checkbox"]');
    await expect(lockCheckbox).not.toBeChecked();
    await lockCheckbox.click();
    await expect(lockCheckbox).toBeChecked();

    await page.waitForTimeout(200);

    // 6. Verify plan date columns are completely hidden/removed from Outliner when baseline is locked!
    await expect(planStartDateInputs).toHaveCount(0);
    await expect(planEndDateInputs).toHaveCount(0);

    // 7. Update actual start date
    await actualStartDateInputs.nth(1).fill('2026-06-10');
    await actualStartDateInputs.nth(1).press('Enter');

    await page.waitForTimeout(300);

    // 8. Assertions:
    // - Actual start date has changed to 2026-06-10
    // - Actual end date has shifted accordingly to 2026-06-11 (retaining 2 workday duration, Fri to Mon)
    await expect(actualStartDateInputs.nth(1)).toHaveValue('2026-06-10');
    await expect(actualEndDateInputs.nth(1)).toHaveValue('2026-06-11');

    console.log('Baseline lock E2E test passed successfully!');
  });
});
