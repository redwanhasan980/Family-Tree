/**
 * Tree view benchmark (P4-13, NFR-PERF-03). Measures, on a production build with the CPU
 * slowed down to stand in for a mid-range phone:
 *
 * - how long showing the whole tree takes once its data is in (expand all, fit, direction),
 * - frames per second while panning and zooming, and the longest frame.
 *
 * Needs the emulators with the demo trees (`pnpm emulators`, `pnpm seed`) and the app
 * built and started (`pnpm build && pnpm start --port 3100`). Then:
 *
 *   pnpm bench:tree [demo500|demo2000] [phone|desktop] [throttle]
 *
 * Results are in docs/PERFORMANCE.md. Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled
 * Chromium, and BENCH_URL for another address.
 */
import { chromium, devices, type Page } from '@playwright/test';

const BASE = process.env.BENCH_URL ?? 'http://127.0.0.1:3100';
const DEMO = { email: 'demo@shikor.test', password: 'shikor-demo' };
const [tree = 'demo500', device = 'phone', throttle = '4'] = process.argv.slice(2);

interface FrameStats {
  fps: number;
  p95: number;
  max: number;
}

interface LongTasks {
  count: number;
  max: number;
  total: number;
}

declare global {
  interface Window {
    benchLong: number[];
    benchFrames: number[];
    benchRunning: boolean;
    benchTick: (now: number) => void;
  }
}

/** Long tasks and frame times, recorded in the page. */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.benchLong = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.benchLong.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
}

async function takeLongTasks(page: Page): Promise<LongTasks> {
  return page.evaluate(() => {
    const tasks = window.benchLong;
    window.benchLong = [];
    return {
      count: tasks.length,
      max: Math.round(Math.max(0, ...tasks)),
      total: Math.round(tasks.reduce((a, b) => a + b, 0)),
    };
  });
}

async function measureFrames(page: Page, gesture: () => Promise<void>): Promise<FrameStats> {
  await page.evaluate(() => {
    window.benchFrames = [];
    window.benchRunning = true;
    let last = performance.now();
    // A property, not a named local: tsx would wrap a named function in a helper the
    // page doesn't have.
    window.benchTick = (now) => {
      window.benchFrames.push(now - last);
      last = now;
      if (window.benchRunning) requestAnimationFrame(window.benchTick);
    };
    requestAnimationFrame(window.benchTick);
  });
  await gesture();
  const stats = await page.evaluate(() => {
    window.benchRunning = false;
    const frames = window.benchFrames.slice(1);
    const total = frames.reduce((a, b) => a + b, 0);
    const sorted = [...frames].sort((a, b) => a - b);
    // No named helpers in page code (see benchTick); rounded in Node instead.
    return {
      fps: frames.length / (total / 1000),
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      max: sorted.at(-1) ?? 0,
    };
  });
  const round = (n: number) => Math.round(n * 10) / 10;
  return { fps: round(stats.fps), p95: round(stats.p95), max: round(stats.max) };
}

/** Milliseconds from clicking a control to the next painted frame. */
async function timeClick(page: Page, label: string): Promise<number | null> {
  return page.evaluate(
    (label) =>
      new Promise<number | null>((resolve) => {
        const button = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
        if (!button) return resolve(null);
        const start = performance.now();
        button.click();
        requestAnimationFrame(() =>
          setTimeout(() => resolve(Math.round(performance.now() - start))),
        );
      }),
    label,
  );
}

async function main() {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH && {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    }),
  });
  const context = await browser.newContext(
    device === 'phone' ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } },
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const cards = () => page.locator('[role=treeitem]').count();

  await page.goto(`${BASE}/en/login`);
  await page.locator('input[type=email]').fill(DEMO.email);
  await page.locator('input[type=password]').fill(DEMO.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/trees$/);
  // Start from the default collapse state, not one a previous run left behind.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('shikor:ui:')) localStorage.removeItem(key);
    }
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });

  const opened = Date.now();
  await page.goto(`${BASE}/en/trees/${tree}?view=tree`);
  await page.locator('[role=treeitem]').first().waitFor({ timeout: 120_000 });
  const firstCardMs = Date.now() - opened;
  await page.getByText('Loading the family…').waitFor({ state: 'hidden', timeout: 120_000 });
  const loadedMs = Date.now() - opened;
  await page.waitForTimeout(1500);
  await instrument(page);

  const expandAllMs = await timeClick(page, 'Expand all');
  await page.waitForTimeout(1500);
  const expandLongTasks = await takeLongTasks(page);

  // Fit as much as the 10% zoom limit allows on screen.
  await page.locator('[role=treeitem]').first().focus();
  await page.keyboard.press('f');
  await page.waitForTimeout(2500);
  const cardsAtFit = await cards();
  const fitLongTasks = await takeLongTasks(page);

  const directionMs = await timeClick(page, 'Show left to right');
  await page.waitForTimeout(1500);
  const directionLongTasks = await takeLongTasks(page);
  await timeClick(page, 'Show left to right');
  await page.waitForTimeout(1500);
  await takeLongTasks(page);

  const box = (await page.locator('svg[role=tree]').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const pan = () =>
    measureFrames(page, async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) {
        const x = cx + Math.sin(i / 6) * box.width * 0.3;
        await page.mouse.move(x, cy + Math.cos(i / 6) * box.height * 0.2);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(600);
    });
  const zoom = (delta: number) =>
    measureFrames(page, async () => {
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(600);
    });
  const gestures: Record<string, FrameStats & { longTasks: LongTasks; cards: number }> = {};
  for (const [name, run] of [
    ['panAtFit', pan],
    ['zoomIn', () => zoom(-60)],
    ['panZoomedIn', pan],
    ['zoomOut', () => zoom(60)],
  ] as const) {
    const frames = await run();
    gestures[name] = { ...frames, longTasks: await takeLongTasks(page), cards: await cards() };
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        tree,
        device,
        throttle: `${throttle}x`,
        firstCardMs,
        loadedMs,
        expandAllMs,
        expandLongTasks,
        cardsAtFit,
        fitLongTasks,
        directionMs,
        directionLongTasks,
        ...gestures,
      },
      null,
      2,
    )}\n`,
  );
  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
