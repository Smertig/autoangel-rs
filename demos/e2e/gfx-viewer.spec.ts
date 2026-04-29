import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { gotoPath } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Reuse the ECM/GFX particle fixture — it bundles a real
// gfx\particle_point.gfx file we can open directly in the GFX viewer
// without needing a separate single-file fixture.
// Rebuild via: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
const FIXTURE_PCK = path.resolve(__dirname, 'fixtures/models/ecm_with_gfx_event.pck');

async function loadGfxViewer(page: import('@playwright/test').Page) {
  await page.goto(gotoPath('/pck/'));
  await expect(page.getByTestId('empty-drop-panel')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('package-add').locator('input[type="file"]').setInputFiles(FIXTURE_PCK);
  await expect(page.locator('[class*="treeItem"]')).not.toHaveCount(0, { timeout: 10000 });

  // Filter to the .gfx file. The fixture has both gfx\ and models\ roots,
  // so auto-expand doesn't open them — filtering does.
  await page.locator('input[class*="filterInput"]').fill('.gfx');
  await page.locator('[class*="treeItem"]').filter({ hasText: /\.gfx$/ }).first().click();

  // The new viewer mounts when the GFX header appears.
  await expect(page.locator('text=/^GFX v\\d+/')).toBeVisible({ timeout: 30000 });
}

test('GFX viewer mounts header, sidebar, scene, and transport', async ({ page }) => {
  test.setTimeout(60000);
  await loadGfxViewer(page);

  // Header badge "GFX v…" is the mount signal.
  await expect(page.locator('text=/^GFX v\\d+/')).toBeVisible();

  // Sidebar lists at least one parsed element row.
  await expect(page.locator('[data-row]').first()).toBeVisible({ timeout: 10000 });
  expect(await page.locator('[data-row]').count()).toBeGreaterThan(0);

  // Combined-render canvas is mounted with a <canvas> child.
  const scene = page.getByTestId('gfx-scene');
  await expect(scene).toBeVisible();
  await expect(scene.locator('canvas')).toBeVisible();

  // Transport play/pause button.
  await expect(page.locator('button[title="Pause (space)"], button[title="Play (space)"]')).toBeVisible();
});

test('toggling a row checkbox flips its checked state', async ({ page }) => {
  test.setTimeout(60000);
  await loadGfxViewer(page);

  const firstRow = page.locator('[data-row]').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });
  const cb = firstRow.locator('input[type="checkbox"]');

  await expect(cb).toBeChecked();
  await cb.click();
  await expect(cb).not.toBeChecked();
  await cb.click();
  await expect(cb).toBeChecked();
});

test('restart button resets the time readout near 0', async ({ page }) => {
  test.setTimeout(60000);
  await loadGfxViewer(page);

  // Let the clock advance for ~1.5s so the readout is well past 0.
  await page.waitForTimeout(1500);

  // The time span sits in the transport bar. After restart the readout
  // should round to ~0.0s (the rAF + 100ms interval may give a small value).
  // Use force: true because the canvas may overlap the transport bar in
  // the demo's panel layout — pointer-event hit-testing isn't what we
  // care about; we just want the click handler to fire.
  const restart = page.locator('button[title="Restart (R)"]');
  await expect(restart).toBeVisible();
  await restart.click({ force: true });

  await expect.poll(async () => {
    const txt = await page.locator('text=/\\d+\\.\\d{2}s\\s*\\//').first().textContent();
    if (!txt) return null;
    const m = txt.match(/^(\d+\.\d{2})s/);
    return m ? parseFloat(m[1]) : null;
  }, { timeout: 5000, intervals: [100, 200, 300] }).toBeLessThan(0.5);
});

test('speed slider updates speed label', async ({ page }) => {
  test.setTimeout(60000);
  await loadGfxViewer(page);

  const slider = page.locator('input[type="range"][title="Playback speed (double-click to reset)"]');
  await expect(slider).toBeVisible();

  // React tracks the input's value via a native setter override, so
  // assigning `.value` directly won't trigger the synthetic onChange.
  // Use the prototype setter, then dispatch 'input' (which React maps
  // to the onChange handler in development and production builds).

  // Drive to the minimum (fraction=0 → speed=0.25 → "0.25×").
  await slider.evaluate((el: HTMLInputElement, raw: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(el, raw);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, '0');
  await expect(page.locator('text=/0\\.\\d{2}×/').first()).toBeVisible({ timeout: 3000 });

  // Drive to the maximum (fraction=1 → speed=4 → "4.0×").
  await slider.evaluate((el: HTMLInputElement, raw: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(el, raw);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, '1');
  await expect(page.locator('text=/[1-9]\\.\\d×/').first()).toBeVisible({ timeout: 3000 });
});

test('clicking a row opens the drawer; close button dismisses it', async ({ page }) => {
  test.setTimeout(60000);
  await loadGfxViewer(page);

  const firstRow = page.locator('[data-row]').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });

  // Click the row name (not the checkbox / chevron / solo button) to open
  // the drawer. The .name span is the largest neutral hit target.
  await firstRow.locator('[class*="name"]').first().click();

  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible({ timeout: 5000 });

  await drawer.locator('button[aria-label="Close drawer"]').click();
  await expect(drawer).not.toBeVisible({ timeout: 5000 });
});
