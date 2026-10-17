import { test, expect } from '@playwright/test';

test.describe('WBS Gantt Outliner E2E Tests', () => {
  test('should load application, add a new task via keyboard shortcut, and edit its title', async ({ page }) => {
    // 1. Load application
    await page.goto('/');

    // 2. Locate the main task title inputs. The first input should be "Project Root".
    const titleInputs = page.locator('input[data-field="title"]');
    await expect(titleInputs.first()).toBeVisible();
    await expect(titleInputs.first()).toHaveValue('Project Root');

    // 3. Focus the initial task
    await titleInputs.first().click();

    // 4. Press 'Enter' key to spawn a new task right after the active one
    console.log('Pressing Enter on Project Root task...');
    await page.keyboard.press('Enter');

    // 5. Assert that a second task row input is generated
    await expect(titleInputs).toHaveCount(2);

    const secondInput = titleInputs.nth(1);
    await expect(secondInput).toBeVisible();

    // 6. Fill the newly spawned task with a description
    console.log('Writing task name...');
    await secondInput.fill('My First Playwright Task');

    // 7. Press Enter again to commit, which should also spawn a 3rd task row
    await page.keyboard.press('Enter');

    // 8. Assert there are now 3 task inputs, and the 2nd one is saved
    await expect(titleInputs).toHaveCount(3);
    await expect(secondInput).toHaveValue('My First Playwright Task');

    console.log('E2E task creation test successfully verified!');
  });
});
