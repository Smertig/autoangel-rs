import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Fixture: NPC PCK with its ECM rewritten to add a GFX event (StartTime=50)
// on the default clip (站立), plus gfx\particle_point.gfx so the event
// resolves to a real particle runtime.
// Rebuild via: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
const FIXTURE_PCK = path.resolve(__dirname, 'fixtures/models/ecm_with_gfx_event.pck');

test('particle GFX spawns in ECM viewer when event fires', async ({ page }) => {
  test.setTimeout(60000);
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(FIXTURE_PCK);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Filter to the ECM — the tree has two top-level roots (gfx\ for the
  // particle fixture, models\ for the NPC), so auto-expand doesn't open
  // anything; filtering triggers it.
  await page.locator('input[class*="filterInput"]').fill('.ecm');
  await page.locator('[class*="treeItem"]').filter({ hasText: /\.ecm$/ }).first().click();
  await expect(page.locator('[class*="modelContainer"] canvas')).toBeVisible({ timeout: 30000 });

  // Wait for initial clip (站立) to load — transport bar appearing is the
  // cleanest signal that the mixer/scheduler is wired.
  await expect(page.locator('[class*="transportBar"]')).toBeVisible({ timeout: 30000 });

  await expect.poll(
    () => page.evaluate(() => typeof (window as any).__gfxEventsFired === 'function'),
    { timeout: 5000 },
  ).toBe(true);

  // Force 0 → >0 transition: 跪下 has no events (fresh scheduler stays at 0),
  // then 站立 has the GFX event at StartTime=50 ms.
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
  // Wait past StartTime (50 ms) + async GFX resolution + one render frame.
  await expect.poll(
    () => page.evaluate(() => (window as any).__gfxEventsFired()),
    { timeout: 10000, intervals: [50, 100, 200, 500] },
  ).toBeGreaterThan(0);

  const after = await page.evaluate(() => (window as any).__gfxEventsFired());
  console.log(`[e2e] __gfxEventsFired before=${before} after=${after}`);
  for (const l of consoleLogs.filter((l) => l.includes('[gfx-runtime]') || l.includes('[model]'))) {
    console.log(l);
  }
});
