import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEFT_PCK = path.resolve(__dirname, 'fixtures/left.pck');
const RIGHT_PCK = path.resolve(__dirname, 'fixtures/right.pck');

test.beforeEach(async ({ page }) => {
  await page.goto(gotoPath('/pck-diff/'));
  // Wait for WASM — the diff page shows "Compare" button in the chooser panel
  await page.waitForFunction(() => {
    const el = document.getElementById('app');
    return el?.textContent?.includes('Compare');
  }, { timeout: 15000 });
});

async function loadAndCompare(page: Page) {
  const leftInput = page.locator('input[type="file"]').first();
  await leftInput.setInputFiles(LEFT_PCK);
  const rightInput = page.locator('input[type="file"]').nth(1);
  await rightInput.setInputFiles(RIGHT_PCK);
  const compareBtn = page.locator('button:has-text("Compare")');
  await expect(compareBtn).toBeEnabled({ timeout: 10000 });
  await compareBtn.click();
  await expect(page.locator('[data-path]')).not.toHaveCount(0, { timeout: 15000 });
}

test('loads two packages, compares, shows correct diff counts', async ({ page }) => {
  await loadAndCompare(page);

  const summaryStats = page.locator('[class*="summaryStats"]');
  await expect(summaryStats).toContainText('added');
  await expect(summaryStats).toContainText('deleted');
  await expect(summaryStats).toContainText('modified');

  const treeItems = page.locator('[data-path]');
  const count = await treeItems.count();
  expect(count).toBeGreaterThanOrEqual(7);
});

test('selects modified text file and shows diff', async ({ page }) => {
  await loadAndCompare(page);

  const gameIni = page.locator('[data-path*="game.ini"]');
  await expect(gameIni).toBeVisible({ timeout: 10000 });
  await gameIni.click();

  await expect(page.locator('[class*="diffLine"], [class*="diff-line"]')).not.toHaveCount(0, { timeout: 5000 });
});

test('selects modified image file and shows image diff', async ({ page }) => {
  await loadAndCompare(page);

  const iconPng = page.locator('[data-path*="icon.png"]');
  await expect(iconPng).toBeVisible({ timeout: 10000 });
  await iconPng.click();

  // Should show image comparison UI (side-by-side tabs, images)
  await expect(page.locator('img, canvas')).not.toHaveCount(0, { timeout: 5000 });
});

test('selects added image file and shows single preview', async ({ page }) => {
  await loadAndCompare(page);

  const addedPng = page.locator('[data-path*="added.png"]');
  await expect(addedPng).toBeVisible({ timeout: 10000 });
  await addedPng.click();

  // Should show a diff banner for "new file" and an image preview
  await expect(page.locator('[class*="diffBanner"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('img, canvas')).not.toHaveCount(0, { timeout: 5000 });
});

test('navigates between text and image diffs without error', async ({ page }) => {
  await loadAndCompare(page);

  // Click text file first
  await page.locator('[data-path*="game.ini"]').click();
  await expect(page.locator('[class*="diffLine"], [class*="diff-line"]')).not.toHaveCount(0, { timeout: 5000 });

  // Switch to image file
  await page.locator('[data-path*="icon.png"]').click();
  await expect(page.locator('img, canvas')).not.toHaveCount(0, { timeout: 5000 });

  // Switch back to text
  await page.locator('[data-path*="game.ini"]').click();
  await expect(page.locator('[class*="diffLine"], [class*="diff-line"]')).not.toHaveCount(0, { timeout: 5000 });
});
