import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/family';

// Phase 8: the first-run wizard and the first-use tips (P8-02, ONB-02, ONB-03).
// These visitors are new: none of the "already onboarded" storage the other specs get.
test.use({ storageState: { cookies: [], origins: [] } });

const tip = (page: Page) => page.getByRole('region', { name: 'Tip' });

test('a new visitor: language, oldest ancestor, children, then tips (AC ONB-02)', async ({
  page,
}) => {
  await page.goto('/en');
  await page.getByRole('link', { name: 'Start your family tree' }).first().click();
  await expect(page).toHaveURL(/\/en\/start$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome! Which language would you like?' }),
  ).toBeVisible();
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expectAccessible(page);

  // Bangla, and back to English: the wizard keeps its place.
  await page.getByRole('main').getByRole('button', { name: 'বাংলা' }).click();
  await expect(page).toHaveURL(/\/bn\/start\?step=ancestor$/);
  await expect(
    page.getByRole('heading', { name: 'আপনার মনে থাকা সবচেয়ে পুরনো পূর্বপুরুষ কে?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'পেছনে' }).click();
  await page.getByRole('main').getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/start\?step=ancestor$/);

  // A name and man or woman are both needed.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter a name in English or Bangla.')).toBeVisible();
  await page.getByLabel('Their name').fill('Abdul Karim');
  await page.getByText('Man', { exact: true }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Next' }).click();

  // The tree opens on step 3: their children.
  await expect(page).toHaveURL(/\/en\/trees\/[A-Za-z0-9]+(\?|$)/);
  const children = page.getByRole('dialog', { name: 'Add children' });
  await expect(children.getByText(/Step 3 of 3/)).toBeVisible();
  await children.getByRole('textbox', { name: 'Name of child 1' }).fill('Rahim');
  await children.getByRole('textbox', { name: 'Name of child 1' }).press('Enter');
  await children.getByRole('textbox', { name: 'Name of child 2' }).fill('Karima');
  await children.getByRole('button', { name: 'Add 2 children' }).click();
  await expect(children).toBeHidden();
  await expect(page.getByRole('treeitem', { name: /^Karima/ })).toBeVisible();

  // Then a short tour of tips, one at a time.
  await expect(tip(page)).toContainText('Tap a person to choose them');
  for (const step of ['1 of 4', '2 of 4', '3 of 4']) {
    await expect(tip(page)).toContainText(step);
    await tip(page).getByRole('button', { name: 'Next tip' }).click();
  }
  await tip(page).getByRole('button', { name: 'Got it' }).click();
  await expect(tip(page)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible();

  // Seen once: neither the tips nor the wizard come back.
  await page.reload();
  await expect(page.getByRole('treeitem', { name: /^Karima/ })).toBeVisible();
  await expect(tip(page)).toBeHidden();
  await page.goto('/en/trees');
  await expect(page.getByRole('heading', { name: 'My family trees' })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/trees$/);
});

test('the wizard can be skipped, and other views have their own tip (ONB-03)', async ({ page }) => {
  await page.goto('/en/trees');
  await expect(page).toHaveURL(/\/en\/start$/);
  await page.getByRole('button', { name: "Skip, I'll look around myself" }).click();
  await expect(page).toHaveURL(/\/en\/trees$/);
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();

  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Test family');
  await create.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await expect(tip(page)).toContainText('Tap a person to choose them');
  await tip(page).getByRole('button', { name: 'Close the tips' }).click();

  await page
    .getByRole('navigation', { name: 'Views' })
    .filter({ visible: true })
    .getByRole('button', { name: 'Circle', exact: true })
    .click();
  await expect(tip(page)).toContainText('Double-tap someone');
  await expect(tip(page)).not.toContainText('1 of');
  await tip(page).getByRole('button', { name: 'Got it' }).click();
  await page
    .getByRole('navigation', { name: 'Views' })
    .filter({ visible: true })
    .getByRole('button', { name: 'Tree', exact: true })
    .click();
  await expect(tip(page)).toBeHidden();
});
