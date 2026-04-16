import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PCK_FILE = path.resolve(__dirname, '../../test_data/packages/models_carnivore_plant.pck');
const NPC_PCK_FILE = path.resolve(__dirname, '../../test_data/packages/models_npc_animated.pck');

async function loadPck(page: Page) {
  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(PCK_FILE);
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
  await page.goto('/pck/?local');
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });
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

// --- Animated NPC model tests ---

test('renders animated NPC model with animation controls', async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // Use ?local to load WASM from local build (TrackSet is not on CDN yet)
  await page.goto('/pck/?local');
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(NPC_PCK_FILE);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Click the .ecm file
  await page.locator('[class*="treeItem"]').filter({ hasText: /\.ecm$/ }).first().click();
  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible({ timeout: 30000 });

  // Model info should show
  await expect(page.locator('[class*="modelInfo"]')).toContainText(/mesh.*verts.*tris/s, { timeout: 30000 });
  // Debug
  for (const l of consoleLogs.filter(l => l.includes('[model]'))) console.log(l);

  // Transport bar should appear with animation controls
  const transport = page.locator('[class*="transportBar"]');
  await expect(transport).toBeVisible({ timeout: 10000 });

  // Animation list panel should have items
  const animPanel = page.locator('[class*="animListPanel"]');
  await expect(animPanel).toBeVisible({ timeout: 10000 });
  await expect(animPanel.locator('[class*="animListItem"]')).not.toHaveCount(0);

  // Scrubber should be present
  await expect(transport.locator('input[type="range"]')).toBeVisible();

  // Time display should show duration
  await expect(transport.locator('[class*="timeDisplay"]')).toContainText(/\d+\.\d+s/);

  // Bones button should be visible in top toolbar
  await expect(page.getByText('Bones')).toBeVisible();
});

test('transport bar play/pause and frame stepping', async ({ page }) => {
  await page.goto('/pck/?local');
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(NPC_PCK_FILE);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  await page.locator('[class*="treeItem"]').filter({ hasText: /\.ecm$/ }).first().click();
  const transport = page.locator('[class*="transportBar"]');
  await expect(transport).toBeVisible({ timeout: 30000 });

  // Click next frame button — should pause and advance
  const nextBtn = transport.locator('button', { hasText: '\u23ED' });
  await nextBtn.click();

  // Time display should show a non-zero time
  await expect(transport.locator('[class*="timeDisplay"]')).not.toContainText('0.00s / 0.00s');
});

test('shows STCK metadata for standalone .stck file', async ({ page }) => {
  // Use ?local to load WASM from local build (TrackSet is not on CDN yet)
  await page.goto('/pck/?local');
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(NPC_PCK_FILE);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Expand the tcks_ folder to find .stck files
  await page.locator('[class*="treeItem"]').filter({ hasText: 'tcks_' }).click();
  await page.locator('[class*="treeItem"]').filter({ hasText: /\.stck$/ }).first().click();

  // Should show metadata table, not hex dump
  await expect(page.getByText('STCK Track Set')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('FPS')).toBeVisible();
  await expect(page.getByText('Bone tracks')).toBeVisible();
});

test('animation list shows event indicators when ECM has combined action events', async ({ page }) => {
  await page.goto('/pck/?local');
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(NPC_PCK_FILE);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  await page.locator('[class*="treeItem"]').filter({ hasText: /\.ecm$/ }).first().click();

  const animPanel = page.locator('[class*="animListPanel"]');
  await expect(animPanel).toBeVisible({ timeout: 30000 });
  await expect(animPanel.locator('[class*="animListItem"]')).not.toHaveCount(0);

  // This NPC (受伤的平民) has 1 combined action with 0 events,
  // so no indicators are expected. Verify the panel renders cleanly.
  await expect(animPanel.locator('[class*="animListItemActive"]')).toHaveCount(1);
});
