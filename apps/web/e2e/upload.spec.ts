import { expect, test } from '@playwright/test';
import { injectFile, resetStore } from './helpers';

test.describe('Media uploader — E2E', () => {
  // Each test gets a fresh seed so the bytes are unique across runs and
  // the server's MD5 dedup doesn't surface previous-session uploads. The
  // dedup test below picks its own intentionally-repeated seed.
  let testSeed = 0;

  test.beforeEach(async ({ page }) => {
    // Use the full ms timestamp so two consecutive runs produce different
    // MD5s. The seed only enters the bytes via `(i * seed) & 0xff`, so even
    // large values map into byte space.
    testSeed = Date.now() + Math.floor(Math.random() * 10_000);
    await page.goto('/');
    await resetStore(page);
    await expect(page.getByText(/drag & drop files/i)).toBeVisible();
  });

  test('uploads a small JPEG end-to-end and shows it in history', async ({ page }) => {
    await injectFile(page, {
      name: 'happy.jpg',
      mimeType: 'image/jpeg',
      size: 1500,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row).toContainText('happy.jpg');
    await expect(row.getByText('Complete')).toBeVisible({ timeout: 15_000 });

    // The "View uploaded file" link should expose the server URL.
    const link = row.getByRole('link', { name: /view uploaded file/i });
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/uploads\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{32}_happy\.jpg$/);

    // History panel picks the entry up (newest first).
    await expect(page.getByRole('heading', { name: /history/i })).toBeVisible();
    await expect(page.getByText('happy.jpg').last()).toBeVisible();
  });

  test('rejects a text-bytes file declared as image/png with INVALID TYPE', async ({ page }) => {
    await injectFile(page, {
      name: 'fake.png',
      mimeType: 'image/png',
      size: 200,
      seed: 1,
      shape: 'text',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Failed', { exact: true })).toBeVisible({ timeout: 10_000 });

    const errorBox = row.getByTestId('upload-error');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText(/INVALID TYPE/i);
    await expect(errorBox).toContainText(/that file type isn't allowed/i);
  });

  test('re-uploading the same payload yields a Deduplicated badge', async ({ page }) => {
    // Same name + size + seed → identical bytes → identical MD5. The seed
    // is run-unique so the first upload is fresh (Complete), and the second
    // matches it (Deduplicated).
    const args = {
      name: 'twin.jpg',
      mimeType: 'image/jpeg',
      size: 1200,
      seed: testSeed,
      shape: 'jpeg' as const,
    };

    await injectFile(page, args);
    await expect(
      page.getByTestId('upload-item').nth(0).getByText('Complete', { exact: true })
    ).toBeVisible({ timeout: 15_000 });

    await injectFile(page, { ...args, name: 'twin-copy.jpg' });
    const secondRow = page.getByTestId('upload-item').nth(1);
    await expect(secondRow).toContainText('twin-copy.jpg');
    await expect(secondRow.getByText('Deduplicated', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Remove drops a completed row from the queue', async ({ page }) => {
    await injectFile(page, {
      name: 'removable.jpg',
      mimeType: 'image/jpeg',
      size: 800,
      seed: testSeed,
      shape: 'jpeg',
    });

    const row = page.getByTestId('upload-item').first();
    await expect(row.getByText('Complete')).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'Remove' }).click();
    // The queue empty-state copy returns when the only row leaves.
    await expect(page.getByText(/no uploads yet/i)).toBeVisible();
  });
});
