import { expect, test, type Route } from '@playwright/test';
import { injectFile, resetStore } from './helpers';

/**
 * These tests use `page.route()` to intercept the chunk PUT requests and
 * simulate transient failures (503), per-chunk timeouts, and a hard
 * offline. They verify that:
 *   - upload-core's retryWithBackoff recovers from a small number of 5xx
 *   - exhausting retries surfaces a categorized error in the UI
 *   - the queue keeps the failing row in `failed` (not silently lost)
 *
 * The backend itself is not paused — Playwright fulfils / aborts the
 * requests at the browser boundary, which is closer to a flaky network
 * than tearing down the server.
 */

test.describe('Network resilience', () => {
  let testSeed = 0;

  test.beforeEach(async ({ page }) => {
    testSeed = Date.now() + Math.floor(Math.random() * 10_000);
    await page.goto('/');
    await resetStore(page);
    await expect(page.getByText(/drag & drop files/i)).toBeVisible();
  });

  test('recovers from two transient 503s on chunk 0 (within retry budget)', async ({ page }) => {
    // The default upload-core config retries 3 times with 1s/2s/4s backoff.
    // Fail the first two attempts on chunk 0, then let the third through.
    let attempts = 0;
    await page.route(/\/api\/uploads\/[0-9a-f-]+\/chunks\/0$/i, async (route: Route) => {
      attempts++;
      if (attempts <= 2) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'service_unavailable' }),
        });
        return;
      }
      await route.continue();
    });

    await injectFile(page, {
      name: 'flaky.jpg',
      mimeType: 'image/jpeg',
      size: 1500,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Complete')).toBeVisible({ timeout: 20_000 });
    expect(attempts).toBe(3);
  });

  test('surfaces a categorized failure when chunk 0 hits the retry ceiling', async ({ page }) => {
    // 4 attempts requested (1 + maxRetries-1=3 retries beyond first) — all 503.
    // upload-core gives up after maxRetries=3 and emits an error event.
    await page.route(/\/api\/uploads\/[0-9a-f-]+\/chunks\/0$/i, async (route: Route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'service_unavailable' }),
      });
    });

    await injectFile(page, {
      name: 'doomed.jpg',
      mimeType: 'image/jpeg',
      size: 1200,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Failed')).toBeVisible({ timeout: 25_000 });

    const errorBox = row.getByTestId('upload-error');
    await expect(errorBox).toContainText(/SERVER/i);
    await expect(errorBox).toContainText(/retrying may help/i);
  });

  test('fails fast on a permanent 4xx without burning retries', async ({ page }) => {
    // 401 from chunk PUT is not retryable per upload-core's HttpError.isRetryable.
    // Should land on Failed immediately, not after the full backoff chain.
    let attempts = 0;
    await page.route(/\/api\/uploads\/[0-9a-f-]+\/chunks\/0$/i, async (route: Route) => {
      attempts++;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'missing_user_id' }),
      });
    });

    const start = Date.now();
    await injectFile(page, {
      name: 'unauth.jpg',
      mimeType: 'image/jpeg',
      size: 1000,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Failed')).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - start;

    // No retry => attempts should be 1 (not 3). Elapsed should be well under
    // the 1+2+4=7 s backoff total. Generous 4s ceiling for slow CI.
    expect(attempts).toBe(1);
    expect(elapsed).toBeLessThan(4_000);

    const errorBox = row.getByTestId('upload-error');
    await expect(errorBox).toContainText(/AUTH/i);
  });

  test('simulated offline: aborted chunk PUTs surface as a NETWORK error', async ({ page }) => {
    // route.abort() simulates a TCP-level failure — fetch rejects with a
    // generic TypeError that upload-core's HttpError.isRetryable treats as
    // retryable, so the retries run. After the budget is exhausted the row
    // lands on Failed with the network category.
    await page.route(/\/api\/uploads\/[0-9a-f-]+\/chunks\/0$/i, (route) =>
      route.abort('connectionrefused')
    );

    await injectFile(page, {
      name: 'offline.jpg',
      mimeType: 'image/jpeg',
      size: 900,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Failed')).toBeVisible({ timeout: 25_000 });

    const errorBox = row.getByTestId('upload-error');
    await expect(errorBox).toContainText(/NETWORK/i);
  });
});
