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

  // The debug hook is installed inside renderFromSmd after the scheduler is
  // constructed, so it must be readable by the time the viewer canvas and
  // transport bar are live.
  await expect.poll(
    () => page.evaluate(() => typeof (window as any).__gfxRuntimeCount === 'function'),
    { timeout: 5000 },
  ).toBe(true);

  // The default-picked clip (站立) carries a GFX event at StartTime=50 ms —
  // by the time Playwright locates the transport bar the clip has already
  // crossed that mark, so the count is already nonzero. Switch to 跪下
  // (no events in the fixture) to force a scheduler rebuild with an empty
  // active list, observe count=0, then switch back to 站立 and observe the
  // spawn. This exercises the exact 0 → >0 transition we care about.
  const animPanel = page.locator('[class*="animListPanel"]');
  await expect(animPanel).toBeVisible({ timeout: 10000 });

  await animPanel.locator('[class*="animListItem"]').filter({ hasText: '跪下' }).first().click();
  await expect.poll(
    () => page.evaluate(() => (window as any).__gfxRuntimeCount()),
    { timeout: 5000 },
  ).toBe(0);
  const before = await page.evaluate(() => (window as any).__gfxRuntimeCount());
  expect(before).toBe(0);

  await animPanel.locator('[class*="animListItem"]').filter({ hasText: '站立' }).first().click();
  // Wait past StartTime (50 ms) + async GFX resolution + one render frame.
  await expect.poll(
    () => page.evaluate(() => (window as any).__gfxRuntimeCount()),
    { timeout: 10000, intervals: [50, 100, 200, 500] },
  ).toBeGreaterThan(0);

  const after = await page.evaluate(() => (window as any).__gfxRuntimeCount());
  console.log(`[e2e] __gfxRuntimeCount before=${before} after=${after}`);
  for (const l of consoleLogs.filter((l) => l.includes('[gfx-runtime]') || l.includes('[model]'))) {
    console.log(l);
  }
});
