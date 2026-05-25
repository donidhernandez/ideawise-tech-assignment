import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright drives the web SPA against a real Vite dev server + a real PHP
 * built-in backend. Both are started by Playwright before tests and torn
 * down after.
 *
 * Backend bootstrap (one-time, on a fresh clone):
 *   cd apps/server
 *   composer install
 *   php bin/console doctrine:migrations:migrate --no-interaction
 */
export default defineConfig({
  testDir: './e2e',
  // Sequential — the suite reuses the same backend SQLite DB and the
  // dedup test deliberately re-uploads the same payload.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_URL: 'http://127.0.0.1:8000',
        // Fresh user id per Playwright run. X-User-Id keys the rate-limit
        // bucket, so this keeps the suite's ~12 inits well under the
        // 10/min ceiling without changing the production limit.
        VITE_USER_ID: `e2e-${Date.now()}`,
      },
    },
    {
      // PHP built-in server on :8000 against apps/server/public. Port-based
      // health check avoids the 401 that the /api endpoints would return
      // without an X-User-Id header.
      command: process.platform === 'win32'
        ? 'C:\\tools\\php85\\php.exe -S 127.0.0.1:8000 -t public'
        : 'php -S 127.0.0.1:8000 -t public',
      cwd: '../server',
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        // E2E may run many sequential inits per user; keep the ceiling
        // generous. The spec defaults stay intact in dev / prod.
        RATE_LIMIT_INIT: '1000',
        RATE_LIMIT_CHUNK: '6000',
      },
    },
  ],
});
