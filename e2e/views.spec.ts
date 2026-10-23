import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, familyOfFour, isPhone, openView } from './support/family';

// Phase 6: ancestors in the Tree view, and moving between views (P6-06, P6-08, P6-09).

const treeCard = (page: Page, name: string) =>
  page.getByRole('tree').getByRole('treeitem', { name: new RegExp(`^${name}`) });

async function openDetails(page: Page, name: string) {
  await treeCard(page, name).click();
  if (isPhone(page)) await page.getByRole('button', { name: `Details: ${name}` }).click();
}

test('a person’s ancestors, and back to the family tree (TV-06)', async ({ page }) => {
  await familyOfFour(page);
  await openDetails(page, 'Karima');
  await page.getByRole('button', { name: 'Show ancestors' }).click();

  const pedigree = page.getByRole('tree', { name: 'Ancestors of Karima' });
  await expect(pedigree).toBeVisible();
  await expect(pedigree.getByRole('treeitem')).toHaveCount(2);
  await expect(page.getByText('Ancestors of Karima')).toBeVisible();

  // The father is to the right: the arrow keys move on screen.
  await pedigree.getByRole('treeitem', { name: /^Karima/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(pedigree.getByRole('treeitem', { name: /^Abdul Karim/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(pedigree.getByRole('treeitem', { name: /^Karima/ })).toBeFocused();

  await expectAccessible(page);

  await page.getByRole('button', { name: 'Back to the family tree' }).click();
  await expect(page.getByRole('tree', { name: 'Family tree' })).toBeVisible();
  await expect(treeCard(page, 'Salam')).toBeVisible();
  await expectAccessible(page);
});

test('switching views keeps the selected person and the focus (P6-08)', async ({ page }) => {
  await familyOfFour(page);
  await treeCard(page, 'Karima').click();

  await openView(page, 'List');
  const list = page.getByRole('tree', { name: 'Family list' });
  await expect(list.getByRole('treeitem', { name: /^Karima/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await openView(page, 'Circle');
  const circle = page.getByRole('tree', { name: 'Family circle' });
  await expect(circle.getByRole('treeitem', { name: /^Karima/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Put Rahim in the centre: the other views then start from him too.
  await circle.getByRole('treeitem', { name: /^Rahim/ }).dispatchEvent('dblclick');
  await expect(circle.getByRole('treeitem', { name: /^Rahim, in the centre/ })).toBeVisible();
  await openView(page, 'Tree');
  await expect(page.getByText('Showing the tree from Rahim')).toBeVisible();
  await openView(page, 'List');
  await expect(page.getByText('Showing the tree from Rahim')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Abdul Karim' }).click();
  await expect(list.getByRole('treeitem', { name: /^Salam/ })).toBeVisible();
});
