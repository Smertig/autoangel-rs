import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, '../../test_data/packages');
const CONFIGS_PCK = path.join(PACKAGES_DIR, 'configs.pck');
const MODELS_PLANT_PCK = path.join(PACKAGES_DIR, 'models_carnivore_plant.pck');
const MODELS_NPC_PCK = path.join(PACKAGES_DIR, 'models_npc_animated.pck');

test.beforeEach(async ({ page }) => {
  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });
});

async function loadPackages(page: Page, files: string[]) {
  // Prefer the package-add button's input (always present); falls back to the
  // empty-drop-panel input when first loading.
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(files);
  // Wait for tree to render at least one item
  await expect(page.locator('[class*="treeItem"]').first()).toBeVisible({ timeout: 15000 });
}

async function addPackage(page: Page, file: string) {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(file);
}

test('loads two disjoint packages and shows two chips', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);

  const chips = page.locator('[data-testid="package-chip"]');
  await expect(chips).toHaveCount(2, { timeout: 10000 });
});

test('merged tree contains entries from both packages (filter spot-check)', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);

  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });

  const filterInput = page.locator('input[placeholder*="Filter"]');

  // Filter for .ini — should find entries from configs.pck
  await filterInput.fill('.ini');
  await expect
    .poll(() => page.locator('[class*="treeItem"]').count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  // With .ini filter, tree should contain configs entries (e.g., backshop.ini)
  await expect(page.locator('[class*="treeItem"]', { hasText: 'backshop.ini' })).toBeVisible({
    timeout: 5000,
  });

  // Clear and filter for .ski — should find entries from models_carnivore_plant.pck
  await filterInput.fill('');
  await filterInput.fill('.ski');
  await expect
    .poll(() => page.locator('[class*="treeItem"]').count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  // The plant package has .ski files
  await expect(page.locator('[class*="treeItem"]').filter({ hasText: '.ski' }).first()).toBeVisible({
    timeout: 5000,
  });
});

test('breadcrumb includes package segment with colored underline', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });

  // Pick an .ini file from configs to click (unambiguous)
  const filterInput = page.locator('input[placeholder*="Filter"]');
  await filterInput.fill('backshop.ini');
  const target = page.locator('[class*="treeItem"]', { hasText: 'backshop.ini' }).first();
  await expect(target).toBeVisible({ timeout: 5000 });
  await target.click();

  // Breadcrumb should include a package segment with the packageCrumb class.
  // CSS Modules hash the class so use a [class*=] selector.
  const packageCrumb = page.locator('[class*="packageCrumb"]');
  await expect(packageCrumb).toBeVisible({ timeout: 5000 });
  await expect(packageCrumb).toContainText('configs');

  // The packageCrumb style uses a colored border-bottom (2px solid via --pkg-underline).
  // Verify via computed style that border-bottom is not 'none'/'0px'.
  const borderBottomWidth = await packageCrumb.evaluate((el) =>
    getComputedStyle(el).borderBottomWidth,
  );
  expect(borderBottomWidth).not.toBe('0px');
});

test('removing a package removes its chip and its files from the tree', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });

  // Confirm plant .ski files are present before removal
  const filterInput = page.locator('input[placeholder*="Filter"]');
  await filterInput.fill('.ski');
  await expect
    .poll(() => page.locator('[class*="treeItem"]').count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  // Clear filter before removing so it doesn't confuse state
  await filterInput.fill('');

  // Find the chip for 'models_carnivore_plant' and click its × button
  const plantChip = page.locator('[data-testid="package-chip"]', {
    hasText: 'models_carnivore_plant',
  });
  await expect(plantChip).toBeVisible({ timeout: 5000 });
  await plantChip.locator('[data-testid="package-chip-remove"]').click();

  // Chip count should drop to 1
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(1, { timeout: 5000 });

  // Filtering for .ski (only in plant package) should now show zero items
  await filterInput.fill('.ski');
  // Give the deferred filter time to apply
  await expect
    .poll(() => page.locator('[class*="treeItem"]').count(), { timeout: 5000 })
    .toBe(0);
});

test('add a third package after removal brings chip count back up', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });

  // Remove plant package
  const plantChip = page.locator('[data-testid="package-chip"]', {
    hasText: 'models_carnivore_plant',
  });
  await plantChip.locator('[data-testid="package-chip-remove"]').click();
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(1, { timeout: 5000 });

  // Add npc_animated package
  await addPackage(page, MODELS_NPC_PCK);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });
  await expect(
    page.locator('[data-testid="package-chip"]', { hasText: 'models_npc_animated' }),
  ).toBeVisible();
});

test('dropping a matching stem replaces the existing slot instead of duplicating', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK]);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(1, { timeout: 10000 });

  // Drop the exact same file again — stem matches, so it should replace, not duplicate.
  await addPackage(page, CONFIGS_PCK);

  // Chip count stays at 1; label remains `configs`.
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(1, { timeout: 10000 });
  await expect(
    page.locator('[data-testid="package-chip"]', { hasText: 'configs' }),
  ).toBeVisible();
});

test('preview is cleared when its owning package is removed', async ({ page }) => {
  await loadPackages(page, [CONFIGS_PCK, MODELS_PLANT_PCK]);
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(2, { timeout: 10000 });

  // Select a file from configs (package A)
  const filterInput = page.locator('input[placeholder*="Filter"]');
  await filterInput.fill('backshop.ini');
  const target = page.locator('[class*="treeItem"]', { hasText: 'backshop.ini' }).first();
  await expect(target).toBeVisible({ timeout: 5000 });
  await target.click();

  // Breadcrumb's package segment should be visible now
  await expect(page.locator('[class*="packageCrumb"]')).toBeVisible({ timeout: 5000 });

  // Clear filter so removal doesn't leave a stale query
  await filterInput.fill('');

  // Remove the configs package
  const configsChip = page.locator('[data-testid="package-chip"]', { hasText: 'configs' });
  await configsChip.locator('[data-testid="package-chip-remove"]').click();

  // Chip should be gone
  await expect(page.locator('[data-testid="package-chip"]')).toHaveCount(1, { timeout: 5000 });

  // Preview should revert to placeholder (breadcrumb's packageCrumb disappears,
  // and the placeholder "Select a file to preview" reappears).
  await expect(page.locator('[class*="packageCrumb"]')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText('Select a file to preview')).toBeVisible({ timeout: 5000 });
});
