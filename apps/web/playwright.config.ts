import { defineConfig } from '@playwright/test';

// Set BASE_URL to run against a Vercel preview deployment; otherwise a local production build is started.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3100';
export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start -p 3100',
        url: baseURL,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
      },
});
