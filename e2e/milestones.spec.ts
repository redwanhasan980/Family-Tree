import { expect, test, type Page } from '@playwright/test';

import { openExport, save } from './support/export';
import { expectAccessible, familyOfFour, findPerson, newTree } from './support/family';

// Phase 8: sign-up invitations for guests (AUTH-03) and milestone celebrations (UX-04).
// Onboarding is done as for the other specs, but no invitation has been dismissed yet.
test.use({
  storageState: async ({ baseURL }, provide) =>
    provide({
      cookies: [],
      origins: [
        {
          origin: baseURL!,
          localStorage: [
            { name: 'shikor:onboarding', value: 'done' },
            { name: 'shikor:tips', value: JSON.stringify(['tree', 'family', 'circle', 'list']) },
          ],
        },
      ],
    }),
});

const invitation = (page: Page) => page.getByRole('region', { name: 'Keep your trees safe' });

/** Opens "Add children" for a person and adds `names`. */
async function addChildren(page: Page, parent: string, names: readonly string[]) {
  await findPerson(page, parent);
  await page
    .getByRole('button', { name: `Add a relative of ${parent}` })
    .filter({ visible: true })
    .last()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Son or daughter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  for (const [index, name] of names.entries()) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(name);
    if (index < names.length - 1) await input.press('Enter');
  }
  const label = names.length === 1 ? 'Add 1 child' : `Add ${names.length} children`;
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog).toBeHidden();
}

test('a guest is invited to sign up after the 5th person, and can say not now', async ({
  page,
}) => {
  await familyOfFour(page);
  await expect(invitation(page)).toBeHidden();
  await addChildren(page, 'Rahim', ['Rafi']);
  await expect(invitation(page)).toContainText('Your tree is growing!');
  await expectAccessible(page);
  await expect(
    invitation(page).getByRole('link', { name: 'Create a free account' }),
  ).toHaveAttribute('href', '/en/signup');
  await invitation(page).getByRole('button', { name: 'Not now' }).click();
  await expect(invitation(page)).toBeHidden();

  // Dismissed for a week, also for the next people.
  await addChildren(page, 'Rahim', ['Nadia']);
  await expect(page.getByRole('treeitem', { name: /^Nadia/ })).toBeVisible();
  await expect(invitation(page)).toBeHidden();
});

test('the export dialog mentions accounts until the first export', async ({ page }) => {
  await newTree(page, 'Abdul Karim');
  const dialog = await openExport(page);
  await expect(invitation(page)).toContainText('saved only in this browser');
  await save(page);
  await expect(dialog).toBeHidden();
  await openExport(page);
  await expect(invitation(page)).toBeHidden();
});

test('a 3rd visit invites a guest to sign up', async ({ page }) => {
  await page.goto('/en/trees');
  await page.evaluate(() =>
    window.localStorage.setItem('shikor:visits', JSON.stringify({ count: 2, last: '2000-01-01' })),
  );
  await newTree(page, 'Abdul Karim');
  await expect(invitation(page)).toContainText('Welcome back!');
});

test('the 10th person is celebrated (UX-04)', async ({ page }) => {
  await newTree(page, 'Abdul Karim');
  await page.evaluate(() =>
    window.localStorage.setItem(
      'shikor:prompt:fifthPerson:dismissedAt',
      String(Date.UTC(2100, 0, 1)),
    ),
  );
  const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'];
  await addChildren(page, 'Abdul Karim', names);
  await expect(page.getByText('10 people in your family tree. Well done!')).toBeVisible();
});
