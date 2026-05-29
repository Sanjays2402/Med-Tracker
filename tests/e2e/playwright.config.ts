import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  retries: 1,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm --filter @med/web start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
