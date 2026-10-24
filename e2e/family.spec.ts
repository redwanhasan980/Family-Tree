import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, newTree, openView } from './support/family';

// Phase 6: the Family card, one family at a time (P6-10..13, FC-01..08).

// The card's own heading; the details panel beside it has one too.
const heading = (page: Page) => page.locator('#family-couple');
const parents = (page: Page) => page.getByRole('region', { name: 'Parents' });
const children = (page: Page) => page.getByRole('region', { name: 'Children' });
const siblings = (page: Page) => page.getByRole('navigation', { name: 'Brothers and sisters' });

test('a child’s family, and back with the browser (AC FC-02)', async ({ page }) => {
  await newTree(page, 'Abdul Karim');
  await openView(page, 'Family');
  await expect(heading(page)).toHaveText('Abdul Karim');
  await expect(parents(page).getByRole('button', { name: 'Add father' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a wife' }).click();
  const wife = page.getByRole('dialog', { name: 'Add a wife' });
  await wife.getByLabel('Name').fill('Fatema Begum');
  await wife.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(heading(page)).toHaveText('Abdul Karim and Fatema Begum');

  await children(page).getByRole('button', { name: 'Add children' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  // The other parent is already chosen: the only wife.
  await expect(dialog.getByText('Parents: Abdul Karim and Fatema Begum')).toBeVisible();
  const names = ['Rahim', 'Salam'];
  for (const [index, name] of names.entries()) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(name);
    if (index < names.length - 1) await input.press('Enter');
  }
  await dialog.getByRole('button', { name: 'Add 2 children' }).click();
  await expect(dialog).toBeHidden();
  await expect(children(page).getByRole('button', { name: /^Salam/ })).toContainText(
    'No children yet',
  );
  await expectAccessible(page);

  await children(page)
    .getByRole('button', { name: /^Salam/ })
    .click();
  await expect(heading(page)).toHaveText('Salam');
  await expect(heading(page)).toBeFocused();
  await expect(parents(page).getByRole('button', { name: /^Abdul Karim/ })).toBeVisible();
  await expect(parents(page).getByRole('button', { name: /^Fatema Begum/ })).toBeVisible();
  await expect(siblings(page).getByRole('button')).toHaveText([/Rahim$/, /Salam$/]);
  await expect(siblings(page).getByRole('button', { name: 'Salam' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('navigation', { name: 'From the start of the tree' })).toContainText(
    'Abdul Karim',
  );
  await expectAccessible(page);

  // A brother is one tap away.
  await siblings(page).getByRole('button', { name: 'Rahim' }).click();
  await expect(heading(page)).toHaveText('Rahim');

  // The browser's Back button goes back one family at a time.
  await page.goBack();
  await expect(heading(page)).toHaveText('Salam');
  await page.goBack();
  await expect(heading(page)).toHaveText('Abdul Karim and Fatema Begum');
  await page.goForward();
  await expect(heading(page)).toHaveText('Salam');

  // So does the Back button on the card.
  await page.getByRole('button', { name: 'Back to Abdul Karim' }).click();
  await expect(heading(page)).toHaveText('Abdul Karim and Fatema Begum');
});

test('the Family card and the Tree share the person in focus (P6-08)', async ({ page }) => {
  await newTree(page, 'Abdul Karim');
  await openView(page, 'Family');
  await children(page).getByRole('button', { name: 'Add children' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  await dialog.getByRole('textbox', { name: 'Name of child 1' }).fill('Salam');
  await dialog.getByRole('button', { name: 'Add 1 child' }).click();
  await expect(dialog).toBeHidden();

  await children(page)
    .getByRole('button', { name: /^Salam/ })
    .click();
  await expect(heading(page)).toHaveText('Salam');
  await openView(page, 'Tree');
  await expect(page.getByText('Showing the tree from Salam')).toBeVisible();
  await openView(page, 'Family');
  await expect(heading(page)).toHaveText('Salam');
});
