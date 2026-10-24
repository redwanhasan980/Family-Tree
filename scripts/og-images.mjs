// Social card images for the landing page (P8-01): public/og/{bn,en}.png, 1200×630.
// Drawn by a real browser from the landing page's hero, so Bangla is shaped correctly
// (image generators without a shaping engine break conjuncts). Run against a server:
//   pnpm build && pnpm start --port 3000   then   pnpm og:images
import { chromium } from '@playwright/test';

const base = process.env.OG_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
for (const locale of ['bn', 'en']) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await page.goto(`${base}/${locale}`);
  await page.addStyleTag({
    content: `
      header > div, main > section:not(:first-child), footer { display: none !important; }
      main > section:first-child { min-height: 540px; padding-top: 24px !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/og/${locale}.png` });
  await context.close();
}
await browser.close();
