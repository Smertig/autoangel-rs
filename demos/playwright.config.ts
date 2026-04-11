import { defineConfig } from '@playwright/test';

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
