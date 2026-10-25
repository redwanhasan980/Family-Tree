import { expect, test, type Page } from '@playwright/test';

import {
  readProfile,
  readUid,
  signedInUid,
  uniqueEmail,
  verifyEmailInEmulator,
} from './support/emulators';

// Phase 1: guest sessions, sign-up by linking, log-in, reset, settings (against the emulators).

const PASSWORD = 'family tree 2024';

async function enterApp(page: Page): Promise<string> {
  await page.goto('/en');
  await page.getByRole('link', { name: 'Start your family tree' }).first().click();
  await expect(page.getByRole('heading', { name: 'My family trees' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guest' })).toBeVisible();
  return signedInUid(page);
}

async function signUp(page: Page, email: string, name = 'Rahima Begum'): Promise<void> {
  await page.goto('/en/signup');
  await page.getByLabel('Your name (optional)').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/trees$/);
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect.poll(() => readUid(page)).toBeNull();
}

test.describe('guest session', () => {
  test('the landing page does not create a guest', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('link', { name: 'Start your family tree' }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await readUid(page)).toBeNull();
  });

  test('entering the app creates a guest with a profile (AUTH-01)', async ({ page }) => {
    const uid = await enterApp(page);
    // This browser already did the first-run wizard (playwright.config.ts), and the
    // dashboard copies that into the new profile (P8-02).
    await expect
      .poll(() => readProfile(uid))
      .toMatchObject({
        isGuest: true,
        locale: 'en',
        onboardingCompleted: true,
        schemaVersion: 1,
      });
  });

  test('the guest survives reloads and a new browser context (AC AUTH-02)', async ({
    page,
    browser,
  }) => {
    const uid = await enterApp(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Guest' })).toBeVisible();
    expect(await readUid(page)).toBe(uid);

    const storageState = await page.context().storageState({ indexedDB: true });
    const later = await browser.newContext({ storageState });
    const again = await later.newPage();
    await again.goto('/en/trees');
    await expect(again.getByRole('button', { name: 'Guest' })).toBeVisible();
    expect(await readUid(again)).toBe(uid);
    await later.close();
  });

  test('the guest chip explains guest storage (AUTH-03)', async ({ page }) => {
    await enterApp(page);
    await page.getByRole('button', { name: 'Guest' }).click();
    const popover = page.getByRole('dialog');
    await expect(popover.getByText('only in this browser')).toBeVisible();
    await popover.getByRole('link', { name: 'Create a free account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });
});

test.describe('accounts', () => {
  test('sign-up keeps the guest user ID (AC AUTH-04)', async ({ page }) => {
    const guestUid = await enterApp(page);
    const email = uniqueEmail('signup');
    await signUp(page, email);

    expect(await readUid(page)).toBe(guestUid);
    await expect(page.getByRole('button', { name: 'Guest' })).toHaveCount(0);
    await expect
      .poll(() => readProfile(guestUid))
      .toMatchObject({
        isGuest: false,
        email,
        displayName: 'Rahima Begum',
      });
  });

  test('the form explains what is wrong before sending', async ({ page }) => {
    await page.goto('/en/signup');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  });

  test('email verification banner goes away once the link is opened (AUTH-08)', async ({
    page,
  }) => {
    await enterApp(page);
    const email = uniqueEmail('verify');
    await signUp(page, email);
    await expect(page.getByText('Please confirm your email.')).toBeVisible();

    await verifyEmailInEmulator(email);
    // Coming back to the tab re-checks the account.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Please confirm your email.')).toHaveCount(0);
  });

  test('log out, then log back in to the same account (AUTH-06, AUTH-10)', async ({ page }) => {
    const uid = await enterApp(page);
    const email = uniqueEmail('login');
    await signUp(page, email);
    await logOut(page);

    await page.getByRole('link', { name: 'Log in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('wrong password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('main [role=alert]')).toHaveText(
      'The email or password is incorrect.',
    );

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/trees$/);
    expect(await readUid(page)).toBe(uid);
  });

  test('signed-in users skip the sign-up and log-in pages', async ({ page }) => {
    await enterApp(page);
    await signUp(page, uniqueEmail('redirect'));
    for (const path of ['/en/signup', '/en/login']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/trees$/);
    }
  });

  test('password reset never reveals whether an account exists (AUTH-09)', async ({ page }) => {
    await page.goto('/en/reset-password');
    await page.getByLabel('Email').fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: 'Send link' }).click();
    await expect(page.getByText('If an account exists for this email')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('language and theme follow the account to a new device (AUTH-11)', async ({
    page,
    browser,
  }) => {
    await enterApp(page);
    const email = uniqueEmail('settings');
    await signUp(page, email);
    const uid = await signedInUid(page);

    await page.goto('/en/settings');
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: 'বাংলা' }).first().click();
    await expect(page).toHaveURL(/\/bn\/settings$/);
    await expect.poll(() => readProfile(uid)).toMatchObject({ locale: 'bn', theme: 'dark' });

    // A fresh browser starts in English and light, then takes the account's choices.
    const other = await browser.newContext({ colorScheme: 'light' });
    const fresh = await other.newPage();
    await fresh.goto('/en/login');
    await fresh.getByLabel('Email').fill(email);
    await fresh.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await fresh.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(fresh).toHaveURL(/\/bn\/trees$/);
    await expect(fresh.locator('html')).toHaveClass(/\bdark\b/);
    await other.close();
  });

  test('a failed log-in does not undo a later theme change', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 400, 'the header theme switch is hidden on narrow phones');
    const uid = await enterApp(page);
    await page.goto('/en/login');
    await page.getByLabel('Email').fill(uniqueEmail('nobody'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('main [role=alert]')).toBeVisible();

    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect.poll(() => readProfile(uid)).toMatchObject({ theme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('a registered user can change their name', async ({ page }) => {
    await enterApp(page);
    await signUp(page, uniqueEmail('name'));
    const uid = await signedInUid(page);
    await page.goto('/en/settings');
    await page.getByLabel('Your name').fill('Rahima Khatun');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible();
    await expect.poll(() => readProfile(uid)).toMatchObject({ displayName: 'Rahima Khatun' });
  });
});

test.describe('in-app browsers (AUTH-15)', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0;]',
  });

  test('show the open-in-browser guide instead of Google sign-in', async ({ page }) => {
    await page.goto('/en/signup');
    await expect(page.getByTestId('in-app-browser-notice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    // Email sign-up still works there.
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
