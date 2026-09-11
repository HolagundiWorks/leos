import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_SERVER_PORT, E2E_VITE_PORT } from './tests/helpers/env';

// Browser-mode E2E for LEOS.
//
// Browser-mode coverage uses the React renderer with an injected Electron
// bridge backed by the isolated TypeScript router adapter.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: './tests/global/playwright-global.ts',

  outputDir: './tests/reports/playwright-artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './tests/reports/playwright', open: 'never' }],
    ['json', { outputFile: './tests/reports/playwright/results.json' }],
  ],

  use: {
    baseURL: E2E_BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Serve the LEOS frontend, pointed at the isolated test API server.
  webServer: {
    command: `npx vite --port ${E2E_VITE_PORT} --strictPort`,
    cwd: './frontend',
    url: E2E_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_BASE: `http://localhost:${E2E_SERVER_PORT}`,
    },
  },
});
