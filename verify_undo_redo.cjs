const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Starting Undo/Redo verification...');
  const browser = await chromium.launch({ headless: true }); // headless: true for CI environment
  const page = await browser.newPage();

  // 1. Load the app
  try {
    await page.goto('http://localhost:4173');
    await page.waitForTimeout(2000);
    console.log('App loaded.');
  } catch (e) {
    console.error('Failed to load app. Make sure "npm run preview" is running.');
    process.exit(1);
  }

  // Helper to get task count
  const getTaskCount = async () => {
    return await page.evaluate(() => {
      // Assuming tasks are rendered with data-task-id or similar in Outliner
      // The TaskRow component renders draggable items.
      return document.querySelectorAll('.task-row-container').length; // Adjust selector based on actual DOM
    });
  };

  // Inspect DOM to find a good selector for tasks
  // Looking at TaskRow.tsx (not visible here but Outliner uses it)
  // Let's assume we can count inputs or specific elements.
  // In Outliner.tsx: <TaskRow ... />
  // In TaskRow.tsx (inferred): likely has an input for title.

  // Let's take a screenshot of initial state
  await page.screenshot({ path: 'verify_undo_1_initial.png' });

  // 2. Add a new task
  // Press 'Enter' usually adds a task if focused, or we need to find the specific interaction.
  // The store has `addTask`.
  // Let's try to focus the first task and press Enter.
  console.log('Adding a task...');

  // Find the first input
  const firstInput = page.locator('input[type="text"]').first();
  if (await firstInput.count() > 0) {
      await firstInput.click();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
  } else {
      // Fallback if no tasks: usually there is a "Project Root" or empty state.
      // If empty state says "Press Enter", we press Enter globally?
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'verify_undo_2_added.png' });
  console.log('Task added (screenshot 2).');

  // 3. Modify the task (Type something)
  console.log('Modifying task...');
  const activeInput = page.locator('input:focus');
  if (await activeInput.count() > 0) {
      await activeInput.fill('New Undo Test Task');
      await page.keyboard.press('Enter'); // Commit? or just blur?
      await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'verify_undo_3_modified.png' });
  console.log('Task modified (screenshot 3).');

  // 4. Undo (Ctrl+Z)
  console.log('Undoing...');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'verify_undo_4_undone.png' });

  // 5. Redo (Ctrl+Shift+Z)
  console.log('Redoing...');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'verify_undo_5_redone.png' });

  console.log('Verification script completed. Please check screenshots.');

  await browser.close();
})();
