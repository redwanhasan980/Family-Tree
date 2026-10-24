import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Phase 8: the landing, help and privacy pages (P8-01, P8-04).

for (const locale of ['bn', 'en'] as const) {
  test(`public pages read well and have no serious accessibility problems (${locale})`, async ({
    page,
  }) => {
    for (const path of ['', '/help', '/privacy']) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows, `${path} scrolls sideways`).toBe(false);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
    }
  });
}

test('the landing page leads into the app, with nothing from Firebase before (ONB-01)', async ({
  page,
}) => {
  const firebase: string[] = [];
  page.on('request', (request) => {
    if (/firebase|googleapis|identitytoolkit|:9099|:8080/.test(request.url())) {
      firebase.push(request.url());
    }
  });
  await page.goto('/en');
  await expect(page.getByRole('img', { name: /An example family tree/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start your family tree' }).first()).toHaveAttribute(
    'href',
    '/en/trees',
  );
  await page.waitForLoadState('networkidle');
  expect(firebase).toEqual([]);

  // Social cards and links between the languages (I18N-06).
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/og\/en\.png$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="bn"]')).toHaveAttribute(
    'href',
    /\/bn$/,
  );
  await page.getByRole('link', { name: 'How we look after your data' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
});

test('help answers open and close', async ({ page }) => {
  await page.goto('/en/help');
  const question = page.getByText('Can I add several children at once?');
  const answer = page.getByText(/Choose “Son or daughter”, type the first name/);
  await expect(answer).toBeHidden();
  await question.click();
  await expect(answer).toBeVisible();
});

test('robots and sitemap list the public pages only', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /*/trees');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/bn', '/en', '/bn/help', '/en/privacy']) {
    expect(sitemap).toContain(`${path}</loc>`);
  }
  expect(sitemap).not.toContain('/trees');
  expect((await request.get('/og/bn.png')).ok()).toBe(true);
});
