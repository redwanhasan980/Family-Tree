import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Phase 0 smoke tests: locale routing, brand, language and theme switches, a11y, headers.

test.describe('locale routing', () => {
  test('redirects "/" to English for non-Bangla browsers', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test.describe('Bangla browser', () => {
    test.use({ locale: 'bn-BD' });

    test('redirects "/" to Bangla', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/bn$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    });
  });

  test('shows the localized not-found page', async ({ page }) => {
    const response = await page.goto('/bn/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'পৃষ্ঠাটি পাওয়া যায়নি' })).toBeVisible();
  });
});

for (const locale of ['bn', 'en'] as const) {
  test.describe(`landing page (${locale})`, () => {
    test('always shows the product name in Bangla script', async ({ page }) => {
      await page.goto(`/${locale}`);
      const name = page.locator('header [lang="bn"]', { hasText: 'শিকড়' });
      await expect(name).toBeVisible();
      await expect(page).toHaveTitle(/^শিকড় — /);
    });

    test('fits the screen without horizontal scrolling', async ({ page }) => {
      await page.goto(`/${locale}`);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflows).toBe(false);
    });

    test('has no serious accessibility violations', async ({ page }) => {
      await page.goto(`/${locale}`);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}

test('switches language without losing the page', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('button', { name: 'বাংলা' }).click();
  await expect(page).toHaveURL(/\/bn$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'আপনার পরিবারের গল্প, এক জায়গায়',
  );
  await expect(page.getByRole('button', { name: 'বাংলা' })).toHaveAttribute('aria-pressed', 'true');
});

test('switches to the dark theme', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('sends the security headers', async ({ request }) => {
  const response = await request.get('/en');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toContain('max-age=');
  expect(headers['content-security-policy-report-only']).toContain("frame-ancestors 'none'");
  expect(headers['x-powered-by']).toBeUndefined();
});
