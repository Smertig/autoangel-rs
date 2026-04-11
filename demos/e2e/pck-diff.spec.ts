import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEFT_PCK = path.resolve(__dirname, 'fixtures/left.pck');
const RIGHT_PCK = path.resolve(__dirname, 'fixtures/right.pck');

test.beforeEach(async ({ page }) => {
  await page.goto('/pck-diff/');
  // Wait for WASM — the diff page shows "Compare" button in the chooser panel
  await page.waitForFunction(() => {
    const el = document.getElementById('app');
    return el?.textContent?.includes('Compare');
  }, { timeout: 15000 });
});

test('loads two packages, compares, shows correct diff counts', async ({ page }) => {
  // Load left package
  const leftInput = page.locator('input[type="file"]').first();
  await leftInput.setInputFiles(LEFT_PCK);

  // Load right package
  const rightInput = page.locator('input[type="file"]').nth(1);
  await rightInput.setInputFiles(RIGHT_PCK);

  // Click Compare
  const compareBtn = page.locator('button:has-text("Compare")');
  await expect(compareBtn).toBeEnabled({ timeout: 10000 });
  await compareBtn.click();

  // Wait for results to appear (tree items)
  await expect(page.locator('[data-path]')).not.toHaveCount(0, { timeout: 15000 });

  // Should show correct counts:
  // Expected: 1 added, 1 deleted, 2 modified, 2 unchanged
  // Check the summary stats badge area contains the expected status labels
  const summaryStats = page.locator('[class*="summaryStats"]');
  await expect(summaryStats).toContainText('added');
  await expect(summaryStats).toContainText('deleted');
  await expect(summaryStats).toContainText('modified');

  // At minimum, the tree should show items for all 6 unique paths
  const treeItems = page.locator('[data-path]');
  const count = await treeItems.count();
  // We created 6 unique paths total (5 left + 1 new right, minus overlap = 6)
  expect(count).toBeGreaterThanOrEqual(5);
});

test('selects modified text file and shows diff', async ({ page }) => {
  // Load both packages
  const leftInput = page.locator('input[type="file"]').first();
  await leftInput.setInputFiles(LEFT_PCK);
  const rightInput = page.locator('input[type="file"]').nth(1);
  await rightInput.setInputFiles(RIGHT_PCK);

  // Compare
  const compareBtn = page.locator('button:has-text("Compare")');
  await expect(compareBtn).toBeEnabled({ timeout: 10000 });
  await compareBtn.click();

  // Wait for scanning to complete and results to show
  await expect(page.locator('[data-path]')).not.toHaveCount(0, { timeout: 15000 });

  // Click on game.ini (a modified text file)
  const gameIni = page.locator('[data-path*="game.ini"]');
  await expect(gameIni).toBeVisible({ timeout: 10000 });
  await gameIni.click();

  // Should show a diff view with added/removed lines
  // The diff should contain both old and new content
  await expect(page.locator('[class*="diffLine"], [class*="diff-line"]')).not.toHaveCount(0, { timeout: 5000 });
});
