import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PCK_FILE = path.resolve(__dirname, '../../test_data/packages/models_carnivore_plant.pck');

async function loadPck(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(PCK_FILE);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });
}

function treeItem(page: Page, ext: string, excludeText?: string) {
  let locator = page.locator('[class*="treeItem"]').filter({ hasText: new RegExp(`\\${ext}$`) });
  if (excludeText) locator = locator.filter({ hasNotText: excludeText });
  return locator.first();
}

async function openEcm(page: Page) {
  await loadPck(page);
  await treeItem(page, '.ecm').click();
  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible({ timeout: 30000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/pck/');
  await expect(page.locator('#app')).toContainText('Ready', { timeout: 15000 });
});

test('loads model package and shows file tree', async ({ page }) => {
  await loadPck(page);
  await expect(page.locator('footer')).toContainText('files');
});

test('renders ECM model with 3D preview', async ({ page }) => {
  await openEcm(page);

  const modelInfo = page.locator('[class*="modelInfo"]');
  await expect(modelInfo).toBeVisible({ timeout: 30000 });
  await expect(modelInfo).toContainText(/mesh.*verts.*tris.*tex/s);

  await expect(page.getByText('Wireframe')).toBeVisible();
  await expect(page.getByText('Light BG')).toBeVisible();
  await expect(page.getByText('Reset Camera')).toBeVisible();
});

test('renders SKI skin file directly', async ({ page }) => {
  await loadPck(page);
  await treeItem(page, '.ski', '二级').click();

  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[class*="modelInfo"]')).toContainText('mesh', { timeout: 30000 });
});

test('model toolbar wireframe toggle works', async ({ page }) => {
  await openEcm(page);

  const wireframeBtn = page.getByText('Wireframe');
  await wireframeBtn.click();
  await expect(wireframeBtn).toHaveClass(/btnActive/);

  await wireframeBtn.click();
  await expect(wireframeBtn).not.toHaveClass(/btnActive/);
});

test('model source view toggle works', async ({ page }) => {
  await openEcm(page);

  await page.getByRole('button', { name: 'Source' }).click();
  const sourceView = page.locator('[class*="modelSource"]');
  await expect(sourceView).toBeVisible({ timeout: 5000 });
  await expect(sourceView.locator('pre')).toContainText('SkinModelPath');

  await page.getByText('3D').click();
  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible();
});
