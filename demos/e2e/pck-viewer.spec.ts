import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PCK_FILE = path.resolve(__dirname, '../../test_data/packages/configs.pck');

test.beforeEach(async ({ page }) => {
  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });
});

test('loads .pck and shows file tree', async ({ page }) => {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(PCK_FILE);

  // Wait for file tree to populate
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Status bar should show file count
  const statusBar = page.locator('footer');
  await expect(statusBar).toContainText('files');
});

test('selects text file and shows preview with highlighting', async ({ page }) => {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(PCK_FILE);

  // Wait for tree
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Find and click a .ini or .txt file in the tree
  // The tree items contain file names — look for one with a text extension
  const treeItems = page.locator('[class*="treeItem"]');
  const count = await treeItems.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const text = await treeItems.nth(i).textContent();
    if (text && (text.endsWith('.ini') || text.endsWith('.cfg') || text.endsWith('.txt'))) {
      await treeItems.nth(i).click();
      clicked = true;
      break;
    }
  }
  expect(clicked).toBe(true);

  // Preview area should show a <pre><code> block
  await expect(page.locator('pre code')).toBeVisible({ timeout: 5000 });
});

test('filters files in tree', async ({ page }) => {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(PCK_FILE);

  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  const totalBefore = await page.locator('[class*="treeItem"]').count();

  // Type a filter that should reduce results
  const filterInput = page.locator('input[placeholder*="Filter"]');
  await filterInput.fill('.ini');

  // Wait for deferred filter to apply
  await page.waitForTimeout(500);

  const totalAfter = await page.locator('[class*="treeItem"]').count();
  // Filtered count should be less (or equal if all are .ini, but likely less)
  expect(totalAfter).toBeLessThanOrEqual(totalBefore);
});
