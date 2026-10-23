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
  globalSetup: './e2e/support/global-setup.ts',
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
  webServer: [
    // Auth and Firestore emulators (the build must have NEXT_PUBLIC_USE_EMULATORS=true).
    // Locally, emulators that are already running (`pnpm emulators`) are reused.
    {
      name: 'Emulators',
      command: 'firebase emulators:start --only auth,firestore --project demo-shikor',
      // The hub answers first; e2e/support/global-setup.ts waits for Auth and Firestore.
      url: 'http://127.0.0.1:4400/emulators',
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: 'SIGINT', timeout: 10_000 },
      timeout: 120_000,
    },
    // Tests run against a production build: run `pnpm build` first (CI does).
    {
      name: 'App',
      command: `pnpm start --port ${PORT}`,
      // Test-only Cloudinary settings: the tests intercept every Cloudinary request.
      env: {
        CLOUDINARY_API_KEY: 'e2e-key',
        CLOUDINARY_API_SECRET: 'e2e-secret',
        APP_ENV: 'test',
      },
      url: `${baseURL}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
