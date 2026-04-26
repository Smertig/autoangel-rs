import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fixture: NPC PCK with its ECM rewritten to fire a GFX event (StartTime=50)
// on the default clip (站立) referencing gfx\container_v58.gfx — a real
// GfxContainer element (type_id 200). Proves the registry dispatches type 200
// through spawnContainerRuntime (the sync runtime appears even when the
// nested gfx_path doesn't resolve in this fixture).
// Rebuild via: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
const FIXTURE_PCK = path.resolve(__dirname, 'fixtures/models/ecm_with_gfx_container_event.pck');

test('container GFX spawns in ECM viewer when event fires', async ({ page }) => {
  test.setTimeout(60000);
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(FIXTURE_PCK);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Two top-level roots (gfx\ and models\) in this fixture — filter to force
  // expand of the ECM so the click resolves.
  await page.locator('input[class*="filterInput"]').fill('.ecm');
  await page.locator('[class*="treeItem"]').filter({ hasText: /\.ecm$/ }).first().click();
  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible({ timeout: 30000 });

  await expect(page.locator('[class*="transportBar"]')).toBeVisible({ timeout: 30000 });

  await expect.poll(
    () => page.evaluate(() => typeof (window as any).__gfxEventsFired === 'function'),
    { timeout: 5000 },
  ).toBe(true);

  // Force 0 → >0 transition to prove the dispatch actually ran: 跪下 has no
  // events, 站立 has the container event.
  const animPanel = page.locator('[class*="animListPanel"]');
  await expect(animPanel).toBeVisible({ timeout: 10000 });

  await animPanel.locator('[class*="animListItem"]').filter({ hasText: '跪下' }).first().click();
  await expect.poll(
    () => page.evaluate(() => (window as any).__gfxEventsFired()),
    { timeout: 5000 },
  ).toBe(0);
  const before = await page.evaluate(() => (window as any).__gfxEventsFired());
  expect(before).toBe(0);

  await animPanel.locator('[class*="animListItem"]').filter({ hasText: '站立' }).first().click();
  await expect.poll(
    () => page.evaluate(() => (window as any).__gfxEventsFired()),
    { timeout: 10000, intervals: [50, 100, 200, 500] },
  ).toBeGreaterThanOrEqual(1);

  const after = await page.evaluate(() => (window as any).__gfxEventsFired());
  console.log(`[e2e] __gfxEventsFired before=${before} after=${after}`);
  for (const l of consoleLogs.filter((l) => l.includes('[gfx-runtime]') || l.includes('[model]'))) {
    console.log(l);
  }
});
