import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, familyOfFour, isPhone, openView } from './support/family';

// Phase 6: the List view, an outline of the family (P6-01, P6-02, P6-09).

const row = (page: Page, name: string) =>
  page.getByRole('tree', { name: 'Family list' }).getByRole('treeitem', {
    name: new RegExp(`^${name}`),
  });

async function openList(page: Page): Promise<void> {
  await openView(page, 'List');
  await expect(page.getByRole('tree', { name: 'Family list' })).toBeVisible();
}

/** The children's rows, checked in order. */
const expectChildren = (page: Page, names: string[]) =>
  expect(
    page.getByRole('tree', { name: 'Family list' }).locator('[role=treeitem][aria-level="2"]'),
  ).toHaveText(names.map((name) => new RegExp(name)));

test('the outline numbers the family and moves with the keyboard (LV-01, LV-06)', async ({
  page,
}) => {
  await familyOfFour(page);
  await openList(page);

  await expect(row(page, 'Abdul Karim')).toHaveAttribute('aria-level', '1');
  await expect(row(page, 'Abdul Karim')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, 'Karima')).toHaveAccessibleName(/number 1\.2/);
  await expect(row(page, 'Salam')).toHaveAttribute('aria-posinset', '3');
  await expect(row(page, 'Salam')).toHaveAttribute('aria-setsize', '3');

  // Arrow keys move between rows; left closes a branch, right opens it again.
  await row(page, 'Abdul Karim').focus();
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'Rahim')).toBeFocused();
  await page.keyboard.press('End');
  await expect(row(page, 'Salam')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row(page, 'Abdul Karim')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row(page, 'Abdul Karim')).toHaveAttribute('aria-expanded', 'false');
  await expect(row(page, 'Rahim')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Rahim')).toBeVisible();

  await expectAccessible(page);
});

test('a row adds relatives and reorders siblings, undoably (LV-03)', async ({ page }) => {
  await familyOfFour(page);
  await openList(page);
  await expectChildren(page, ['Rahim', 'Karima', 'Salam']);

  await row(page, 'Salam').click();
  await page.getByRole('button', { name: 'Move Salam up' }).click();
  await expectChildren(page, ['Rahim', 'Salam', 'Karima']);
  await expect(page.getByRole('button', { name: 'Move Salam up' })).toBeFocused();
  await page.getByRole('button', { name: 'Move Salam up' }).click();
  await expect(page.getByRole('button', { name: 'Move Salam up' })).toBeDisabled();
  await expectChildren(page, ['Salam', 'Rahim', 'Karima']);

  await page.getByRole('button', { name: /^Undo: / }).click();
  await expectChildren(page, ['Rahim', 'Salam', 'Karima']);

  // Inline quick add: two taps from the row to the add menu (UX rule 1).
  await row(page, 'Karima').click();
  await row(page, 'Karima').getByRole('button', { name: 'Add a relative of Karima' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Husband' }).click();
  const husband = page.getByRole('dialog', { name: 'Add a husband' });
  await husband.getByLabel('Name').fill('Jamal Uddin');
  await husband.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(husband).toBeHidden();
  await expect(
    row(page, 'Karima').getByRole('button', { name: 'Husband: Jamal Uddin' }),
  ).toBeVisible();
});

test('everyone, found by name, sorted and filtered (LV-04)', async ({ page }) => {
  await familyOfFour(page);
  await openList(page);
  await page.getByRole('button', { name: 'Everyone' }).click();
  const people = page.getByRole(isPhone(page) ? 'list' : 'table', {
    name: 'Everyone in the tree',
  });
  await expect(people).toBeVisible();
  await expect(page.getByText('4 people')).toBeVisible();

  await page.getByPlaceholder('Find by name').fill('kar');
  await expect(page.getByText('2 people')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('4 people')).toBeVisible();

  if (isPhone(page)) await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('combobox', { name: 'Men or women' }).selectOption({ label: 'Women' });
  await expect(page.getByText('1 person')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Men or women' })
    .selectOption({ label: 'Men and women' });
  await page.getByRole('combobox', { name: 'Generation' }).selectOption({ label: 'Generation 2' });
  await expect(page.getByText('3 people')).toBeVisible();

  await expectAccessible(page);

  // The list mode is remembered, and choosing someone shows their details.
  await page.reload();
  await expect(people).toBeVisible();
  await people.getByRole('button', { name: /Karima/ }).click();
  if (isPhone(page)) await page.getByRole('button', { name: 'Details: Karima' }).click();
  await expect(page.getByRole('heading', { name: 'Karima' })).toBeVisible();
});
