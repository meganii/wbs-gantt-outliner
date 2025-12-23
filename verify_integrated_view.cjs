const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // The default view is 'integrated', so we just need to load the page.
  await page.goto('http://localhost:4173');

  // Wait for rendering to settle
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/home/jules/verification/integrated_view_fix.png' });

  await browser.close();
})();
