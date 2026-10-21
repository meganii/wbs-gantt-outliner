import { defineConfig, devices } from '@playwright/test';

/**
 * 描画性能ベンチマーク専用の Playwright 設定。
 * `npm test:e2e`（playwright.config.ts / testDir=./e2e）とは分離している。
 *
 * - 計測のばらつきを避けるため並列実行しない（workers: 1）。
 * - 全行を DOM に展開するため、ビューポートは広めに固定する。
 */
export default defineConfig({
  testDir: './bench',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 900 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
