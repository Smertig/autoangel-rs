import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../../tests/test_data/elements/elements_v102.data');

test.beforeEach(async ({ page }) => {
  await page.goto('/elements/');
  await page.waitForFunction(() => {
    const el = document.getElementById('app');
    return el?.textContent?.includes('Ready');
  }, { timeout: 15000 });
});

test('loads elements.data and shows lists', async ({ page }) => {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(DATA_FILE);

  // Wait for lists to appear
  await expect(page.locator('[class*="listItem"]')).not.toHaveCount(0, { timeout: 15000 });

  // Status bar should show list and entry counts
  const statusBar = page.locator('footer');
  await expect(statusBar).toContainText('lists');
  await expect(statusBar).toContainText('entries');
});

test('selects list and entry, shows detail fields', async ({ page }) => {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(DATA_FILE);

  // Wait for lists
  await expect(page.locator('[class*="listItem"]')).not.toHaveCount(0, { timeout: 15000 });

  // Click first list
  await page.locator('[class*="listItem"]').first().click();

  // Entries should populate
  await expect(page.locator('[class*="entryItem"]')).not.toHaveCount(0, { timeout: 5000 });

  // First entry should be auto-selected; detail table should have rows
  await expect(page.locator('table tr')).not.toHaveCount(0, { timeout: 5000 });

  // Detail should have field names and values
  const firstFieldName = page.locator('[class*="fieldName"]').first();
  await expect(firstFieldName).toBeVisible();
});
