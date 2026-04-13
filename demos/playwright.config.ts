import { defineConfig } from '@playwright/test';
import { existsSync, symlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create symlinks for local WASM build so ?local works in tests.
// Each page (pck/, elements/, pck-diff/) resolves './autoangel-wasm-pkg' relative to its own URL.
const wasmPkg = resolve(__dirname, '../autoangel-wasm/pkg');
if (existsSync(wasmPkg)) {
  for (const subdir of ['pck', 'elements', 'pck-diff']) {
    const link = resolve(__dirname, subdir, 'autoangel-wasm-pkg');
    if (!existsSync(link)) {
      try { symlinkSync(wasmPkg, link, 'junction'); } catch {}
    }
  }
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:9854',
    headless: true,
    screenshot: 'only-on-failure',
  },
  outputDir: './e2e/test-results',
  webServer: {
    command: 'npx vite --port 9854',
    port: 9854,
    reuseExistingServer: !process.env.CI,
  },
});
