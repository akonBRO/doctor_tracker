import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'small-mobile',
      use: { viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true },
    },
  ],
});
