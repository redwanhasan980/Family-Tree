import { expect, test, type Page } from '@playwright/test';

import {
  authUserExists,
  createAccount,
  docExists,
  readUid,
  seedTree,
  signedInUid,
  uniqueEmail,
} from './support/emulators';

// Phase 3: the guest merge (AUTH-06/07) and deleting data (AUTH-10/12).

const PASSWORD = 'family tree 2024';

async function enterApp(page: Page): Promise<string> {
  await page.goto('/en/trees');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  return signedInUid(page);
}

async function createTree(page: Page, name: string, root: string): Promise<string> {
  await page.getByRole('button', { name: /Create a family tree|New tree/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tree name').fill(name);
  await dialog.getByLabel('Oldest person you remember (optional)').fill(root);
  await dialog.getByText('Man', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create tree' }).click();
  await expect(page).toHaveURL(/\/en\/trees\/[A-Za-z0-9]+\?view=tree$/);
  await expect(page.getByRole('treeitem', { name: new RegExp(root) })).toBeVisible();
  return /\/trees\/([A-Za-z0-9]+)/.exec(page.url())![1]!;
}

async function logIn(page: Page, email: string): Promise<void> {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/trees$/);
}

test.describe('guest merge', () => {
  test('a guest’s tree moves into the existing account (AC AUTH-07)', async ({ page }) => {
    const email = uniqueEmail('merge');
    const accountUid = await createAccount(email, PASSWORD);
    await seedTree(accountUid, `y${Date.now()}`, { name: 'Tree Y', personCount: 4 });

    const guestUid = await enterApp(page);
    await createTree(page, 'Tree X', 'Abdul Karim');
    await logIn(page, email);

    const dialog = page.getByRole('dialog', { name: 'Move your guest trees?' });
    await expect(dialog).toContainText('Tree X');
    await expect(dialog).toContainText('1 person');
    await expect(dialog.getByRole('radio', { name: 'Move to my account' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('1 tree moved to your account.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Tree X' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Tree Y' })).toBeVisible();
    expect(await readUid(page)).toBe(accountUid);
    await expect.poll(() => authUserExists(guestUid)).toBe(false);
  });

  test('a discarded guest tree is deleted, and the dialog comes back until answered', async ({
    page,
  }) => {
    const email = uniqueEmail('discard');
    await createAccount(email, PASSWORD);
    await enterApp(page);
    const treeId = await createTree(page, 'Practice tree', 'Test Person');
    await logIn(page, email);

    const dialog = page.getByRole('dialog', { name: 'Move your guest trees?' });
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(dialog).toBeVisible();

    await dialog.getByText('Discard', { exact: true }).click();
    await expect(dialog).toContainText('Discarded trees are deleted for good.');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Your guest trees were discarded.')).toBeVisible();
    await expect.poll(() => docExists(`trees/${treeId}`)).toBe(false);
    await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  });
});

test.describe('deleting data', () => {
  test('a guest deletes their data and starts afresh (AUTH-10)', async ({ page }) => {
    const guestUid = await enterApp(page);
    const treeId = await createTree(page, 'Karim family', 'Abdul Karim');
    await page.goto('/en/settings');
    await page.getByRole('button', { name: 'Delete my guest data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete for good' }).click();
    await expect(page.getByText('Your guest data has been deleted.')).toBeVisible();

    await expect.poll(() => authUserExists(guestUid)).toBe(false);
    expect(await docExists(`trees/${treeId}`)).toBe(false);
    expect(await docExists(`users/${guestUid}`)).toBe(false);
    // A new, empty guest takes over.
    await expect.poll(() => readUid(page)).not.toBe(guestUid);
    await page.goto('/en/trees');
    await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  });

  test('a registered user deletes their account (AUTH-12)', async ({ page }) => {
    const email = uniqueEmail('delete');
    const uid = await createAccount(email, PASSWORD);
    await logIn(page, email);
    await createTree(page, 'Karim family', 'Abdul Karim');

    await page.goto('/en/settings');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Delete for good' });
    await dialog.getByLabel('Your password').fill(PASSWORD);
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Type your email address to confirm').fill(email.toUpperCase());
    await submit.click();

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByText('Your account has been deleted.')).toBeVisible();
    await expect.poll(() => authUserExists(uid)).toBe(false);
    expect(await docExists(`users/${uid}`)).toBe(false);
    expect(await readUid(page)).toBeNull();
  });
});
