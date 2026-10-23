import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Phase 6: the List view, an outline of the family (P6-01, P6-02, P6-09).

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;
const row = (page: Page, name: string) =>
  page.getByRole('tree', { name: 'Family list' }).getByRole('treeitem', {
    name: new RegExp(`^${name}`),
  });

/** A new guest tree with a couple and three children, open in the Tree view. */
async function familyOfFive(page: Page): Promise<void> {
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Test family');
  await create.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  const root = page.getByRole('treeitem', { name: /^Abdul Karim/ });
  await root.click();
  await page
    .getByRole('button', { name: 'Add a relative of Abdul Karim' })
    .filter({ visible: true })
    .last()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Son or daughter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  const names = ['Rahim', 'Karima', 'Salam'];
  for (const [index, name] of names.entries()) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(name);
    if (name === 'Karima') {
      await dialog
        .getByRole('radiogroup', { name: `Son or daughter: child ${index + 1}` })
        .getByText('Daughter')
        .click();
    }
    if (index < names.length - 1) await input.press('Enter');
  }
  await dialog.getByRole('button', { name: 'Add 3 children' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('treeitem', { name: /^Salam/ })).toBeVisible();
}

async function openList(page: Page): Promise<void> {
  if (isPhone(page) && (await page.getByRole('button', { name: 'Clear selection' }).isVisible())) {
    await page.getByRole('button', { name: 'Clear selection' }).click();
  }
  await page
    .getByRole('navigation', { name: 'Views' })
    .filter({ visible: true })
    .getByRole('button', { name: 'List' })
    .click();
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
  await familyOfFive(page);
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

  const results = await new AxeBuilder({ page }).include('main').analyze();
  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('a row adds relatives and reorders siblings, undoably (LV-03)', async ({ page }) => {
  await familyOfFive(page);
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
