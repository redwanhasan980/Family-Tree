import { expect, test, type Page } from '@playwright/test';

import { readUid, seedTree, signedInUid } from './support/emulators';

// Phase 3: the dashboard (TREE-01..03) and the editor shell (VIS-01, TREE-06/07/08).

async function enterApp(page: Page): Promise<string> {
  await page.goto('/en/trees');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  return signedInUid(page);
}

async function createTree(page: Page, name: string, root?: string): Promise<string> {
  await page.getByRole('button', { name: /Create a family tree|New tree/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tree name').fill(name);
  if (root) {
    await dialog.getByLabel('Oldest person you remember (optional)').fill(root);
    await dialog.getByText('Man', { exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Create tree' }).click();
  await expect(page).toHaveURL(/\/en\/trees\/[A-Za-z0-9]+\?view=tree$/);
  return /\/trees\/([A-Za-z0-9]+)/.exec(page.url())![1]!;
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

async function openTreeSettings(page: Page): Promise<void> {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Tree menu' }).click();
    await page.getByRole('menuitem', { name: 'Tree settings' }).click();
  } else {
    await page.getByRole('button', { name: 'Tree settings' }).click();
  }
  await expect(page.getByRole('dialog', { name: 'Tree settings' })).toBeVisible();
}

test.describe('dashboard', () => {
  test('create, rename and delete a tree (TREE-01, TREE-03)', async ({ page }) => {
    await enterApp(page);
    // The first person's gender is asked once a name is typed.
    await page.getByRole('button', { name: 'Create a family tree' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tree name').fill('The Karim family');
    await dialog.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
    await dialog.getByRole('button', { name: 'Create tree' }).click();
    await expect(dialog.getByText('Choose man or woman.')).toBeVisible();
    await dialog.getByText('Man', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Create tree' }).click();

    // The editor opens on the new tree, with the first person in it.
    await expect(page).toHaveURL(/\/en\/trees\/[A-Za-z0-9]+\?view=tree$/);
    await expect(page.getByRole('treeitem', { name: /Abdul Karim/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible();

    await page.getByRole('link', { name: 'All my trees' }).first().click();
    const card = page.getByRole('listitem').filter({ hasText: 'The Karim family' });
    await expect(card).toContainText('1 person');
    await expect(card).toContainText('Starts with Abdul Karim');
    await expect(card).toContainText('Owner');

    await card.getByRole('button', { name: 'Options for The Karim family' }).click();
    await page.getByRole('menuitem', { name: 'Name and description' }).click();
    await page.getByRole('dialog').getByLabel('Tree name').fill('Karim family (father’s side)');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    const renamed = page.getByRole('listitem').filter({ hasText: 'Karim family (father’s side)' });
    await expect(renamed).toBeVisible();

    await renamed.getByRole('button', { name: /^Options for/ }).click();
    await page.getByRole('menuitem', { name: 'Delete tree' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('This tree and the 1 person in it will be deleted');
    await confirm.getByRole('button', { name: 'Delete for good' }).click();
    await expect(page.getByText('“Karim family (father’s side)” was deleted.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  });

  test('a tree with more than ten people needs its name typed to delete', async ({ page }) => {
    const uid = await enterApp(page);
    await seedTree(uid, `big${Date.now()}`, { name: 'Big family', personCount: 57 });
    const card = page.getByRole('listitem').filter({ hasText: 'Big family' });
    await expect(card).toContainText('57 people');

    await card.getByRole('button', { name: 'Options for Big family' }).click();
    await page.getByRole('menuitem', { name: 'Delete tree' }).click();
    const confirm = page.getByRole('dialog');
    const submit = confirm.getByRole('button', { name: 'Delete for good' });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel("Type the tree's name to confirm").fill('big family');
    await expect(submit).toBeDisabled();
    await confirm.getByLabel("Type the tree's name to confirm").fill(' Big family ');
    await submit.click();
    await expect(card).toHaveCount(0);
  });

  test("a tree someone can't see reads as unavailable", async ({ page }) => {
    await enterApp(page);
    await page.goto('/en/trees/doesNotExist123');
    await expect(page.getByRole('heading', { name: "This tree isn't available" })).toBeVisible();
    await page.getByRole('link', { name: 'All my trees' }).click();
    await expect(page).toHaveURL(/\/en\/trees$/);
  });
});

test.describe('editor shell', () => {
  test('an empty tree starts with its first person (P3-03)', async ({ page }) => {
    await enterApp(page);
    await createTree(page, 'Begum family');
    await page.getByRole('button', { name: 'Add the first person' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('রহিমা বেগম');
    await dialog.getByText('Woman', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    // The new person is in the tree and selected: details beside it on desktop, and the
    // selection bar on phones, which opens the details sheet.
    await expect(page.getByRole('treeitem', { name: /রহিমা বেগম/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    if (isPhone(page)) await page.getByRole('button', { name: /^Details: রহিমা বেগম/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Name in Bangla')).toHaveValue('রহিমা বেগম');
  });

  test('views live in the URL and survive a reload (VIS-01)', async ({ page }) => {
    await enterApp(page);
    await createTree(page, 'Karim family', 'Abdul Karim');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page).toHaveURL(/\?view=list$/);
    await expect(page.getByRole('tree', { name: 'Family list' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tree', { name: 'Family list' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('tree settings apply and are saved (TREE-06)', async ({ page }) => {
    await enterApp(page);
    await createTree(page, 'Karim family', 'Abdul Karim');
    await openTreeSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Tree settings' });
    const dates = dialog.getByRole('switch', { name: 'Show years of birth and death' });
    await expect(dates).toBeChecked();
    await dates.click();
    await expect(dates).not.toBeChecked();
    await page.keyboard.press('Escape');

    await page.reload();
    await openTreeSettings(page);
    await expect(
      page.getByRole('switch', { name: 'Show years of birth and death' }),
    ).not.toBeChecked();
  });

  test('statistics count the people (TREE-08)', async ({ page }) => {
    await enterApp(page);
    await createTree(page, 'Karim family', 'Abdul Karim');
    if (isPhone(page)) {
      await page.getByRole('button', { name: 'Tree menu' }).click();
      await page.getByRole('menuitem', { name: 'Statistics' }).click();
    } else {
      await page.getByRole('button', { name: 'Statistics' }).click();
    }
    const people = page.getByRole('definition').first();
    await expect(people).toHaveText('1');
    await expect(page.getByText('Not recorded')).toBeVisible();
  });

  test('a guest’s trees stay theirs after a reload', async ({ page }) => {
    const uid = await enterApp(page);
    await createTree(page, 'Karim family', 'Abdul Karim');
    await page.reload();
    await expect(page.getByRole('treeitem', { name: /Abdul Karim/ })).toBeVisible();
    expect(await readUid(page)).toBe(uid);
  });
});
