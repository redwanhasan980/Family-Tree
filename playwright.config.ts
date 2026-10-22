import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

// Environments with a preinstalled Chromium (and no WebKit) set PLAYWRIGHT_CHROMIUM_PATH;
// CI installs Playwright's own Chromium and WebKit instead.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const chromiumLaunch = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...chromiumLaunch } },
    ...(chromiumPath ? [] : [{ name: 'mobile-safari', use: { ...devices['iPhone 14'] } }]),
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...chromiumLaunch,
      },
    },
  ],
  // Tests run against a production build: run `pnpm build` first (CI does).
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `${baseURL}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
