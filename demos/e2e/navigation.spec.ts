import { test, expect } from '@playwright/test';

const PAGES = [
  { path: '/pck/', name: 'PCK', readyText: 'Ready' },
  { path: '/elements/', name: 'Elements', readyText: 'Ready' },
  { path: '/pck-diff/', name: 'Diff', readyText: 'PCK Diff' },
];

for (const from of PAGES) {
  for (const to of PAGES) {
    if (from === to) continue;

    test(`navbar: ${from.name} → ${to.name}`, async ({ page }) => {
      await page.goto(from.path);
      await expect(page.locator('#app')).toContainText(from.readyText, { timeout: 15000 });

      await page.locator('nav').getByRole('link', { name: to.name }).click();
      await expect(page).toHaveURL(new RegExp(`${to.path.replace(/\//g, '\\/')}$`));
      await expect(page.locator('#app')).toContainText(to.readyText, { timeout: 15000 });
    });
  }
}
