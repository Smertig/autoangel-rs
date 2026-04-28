import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `models_carnivore_plant.pck` ships ECM, SMD, BON, SKI, DDS — covers
// the full outgoing-ref graph (ECM → SMD → BON, SKI → textures).
const PCK = path.resolve(__dirname, '../../test_data/packages/models_carnivore_plant.pck');
const ECM = '利齿绿萼.ecm';
const SMD = '花苞食人花.smd';

test.beforeEach(async ({ page }) => {
  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });
});

test('refs panel shows outgoing for selected ECM', async ({ page }) => {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(PCK);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Select the ECM.
  const treeItems = page.locator('[class*="treeItem"]');
  const count = await treeItems.count();
  for (let i = 0; i < count; i++) {
    const t = await treeItems.nth(i).textContent();
    if (t?.includes(ECM)) {
      await treeItems.nth(i).click();
      break;
    }
  }

  // The refs panel should mount once a file is selected (the indexer
  // may still be running, but the panel renders even before edges
  // arrive). Use heading role to avoid matching the empty-state text
  // "No outgoing references."
  await expect(
    page.getByRole('heading', { name: 'Outgoing' }),
  ).toBeVisible({ timeout: 15000 });

  // Eventually the SMD ref shows up. Allow generous time for indexer
  // to reach the .ecm file (low-priority background, may yield to
  // initial parse).
  await expect(page.getByText('skin-model')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(SMD, { exact: false })).toBeVisible({ timeout: 30000 });

  // Clicking the resolved row navigates to the SMD.
  await page.getByText(SMD, { exact: false }).first().click();
  await expect(page.locator('[class*="breadcrumb"]')).toContainText(SMD);
});

test('refs panel shows incoming for the SMD (back to its ECM)', async ({ page }) => {
  const fileInput = page.getByTestId('package-add').locator('input[type="file"]');
  await fileInput.setInputFiles(PCK);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Wait for indexer to finish its sweep (no banner visible) — generous
  // timeout. Looking for the absence of the indexing banner.
  const banner = page.locator('text=Indexing').first();

  // Select the SMD.
  const treeItems = page.locator('[class*="treeItem"]');
  const count = await treeItems.count();
  for (let i = 0; i < count; i++) {
    const t = await treeItems.nth(i).textContent();
    if (t?.includes(SMD)) {
      await treeItems.nth(i).click();
      break;
    }
  }

  await expect(
    page.getByRole('heading', { name: 'Used by' }),
  ).toBeVisible({ timeout: 15000 });

  // The ECM that referenced this SMD should appear in the incoming
  // section. Wait until indexing completes.
  await expect(banner).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByText(ECM, { exact: false })).toBeVisible();
});
