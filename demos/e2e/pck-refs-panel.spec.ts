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
  // IndexedDB persists across Playwright runs (browser data dir is reused),
  // so a previous run's `indexingEnabled: true` would seep into this run's
  // session. Wipe IDB on every test entry to keep the indexing default off.
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases?.();
    if (!dbs) return;
    await Promise.all(dbs.map((db) => new Promise<void>((resolve) => {
      if (!db.name) return resolve();
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    })));
  });
  await page.reload();
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

  // Indexing is opt-in per session; `handleEnableIndexing` no-ops until the
  // session upsert settles (~500ms debounce after package load).
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'enable' }).click();
  await expect(page.getByRole('button', { name: 'enable' })).toBeHidden({ timeout: 5000 });

  // The refs panel should mount once a file is selected (the indexer
  // may still be running, but the panel renders even before edges
  // arrive). Use heading role to avoid matching the empty-state text
  // "No outgoing references."
  await expect(
    page.getByRole('heading', { name: 'Outgoing' }),
  ).toBeVisible({ timeout: 15000 });

  // Eventually the SMD ref shows up. Allow generous time for indexer
  // to reach the .ecm file (low-priority background, may yield to
  // initial parse). The ref renders as a <button>; the tree leaf is a
  // <span>, so scope to button role to disambiguate.
  await expect(page.getByText('skin-model')).toBeVisible({ timeout: 30000 });
  const smdRefBtn = page.getByRole('button', { name: SMD, exact: false });
  await expect(smdRefBtn).toBeVisible({ timeout: 30000 });

  // Clicking the resolved row navigates to the SMD.
  await smdRefBtn.click();
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

  // Indexing is opt-in per session; `handleEnableIndexing` no-ops until the
  // session upsert settles (~500ms debounce after package load).
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'enable' }).click();
  await expect(page.getByRole('button', { name: 'enable' })).toBeHidden({ timeout: 5000 });

  await expect(
    page.getByRole('heading', { name: 'Used by' }),
  ).toBeVisible({ timeout: 15000 });

  // The ECM that referenced this SMD should appear in the incoming
  // section. Wait until indexing completes. Scope to button role: the
  // ref renders as a <button>, the tree leaf is a <span>.
  await expect(banner).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: ECM, exact: false })).toBeVisible();
});
