import { expect, test, type Page } from '@playwright/test';

import { expectAccessible, familyOfFour, isPhone, openView } from './support/family';

// Phase 6: the Circle view (P6-04, P6-05, P6-09).

const circle = (page: Page) => page.getByRole('tree', { name: 'Family circle' });
const arc = (page: Page, name: string) =>
  circle(page).getByRole('treeitem', { name: new RegExp(`^${name}`) });

test('arcs for each child, keyboard moves, zoom in and back (CV-01, CV-03)', async ({ page }) => {
  await familyOfFour(page);
  await openView(page, 'Circle');
  await expect(circle(page)).toBeVisible();
  const centre = circle(page).getByRole('treeitem', { name: /^Abdul Karim, in the centre/ });
  await expect(centre).toBeVisible();
  for (const name of ['Rahim', 'Karima', 'Salam']) await expect(arc(page, name)).toHaveCount(1);

  // Arrows: out from the centre, then around the ring.
  await centre.focus();
  await page.keyboard.press('ArrowDown');
  await expect(arc(page, 'Rahim')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(arc(page, 'Karima')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(centre).toBeFocused();

  // Choosing someone shows their card; "Put … in the centre" zooms into them.
  await arc(page, 'Karima').dispatchEvent('click');
  await page.getByRole('button', { name: 'Put Karima in the centre' }).click();
  await expect(
    circle(page).getByRole('treeitem', { name: /^Karima, in the centre/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/focus=/);
  const crumbs = page.getByRole('navigation', { name: 'From the start of the tree' });
  await expect(crumbs.getByText('Karima')).toHaveAttribute('aria-current', 'location');
  await crumbs.getByRole('button', { name: 'Abdul Karim' }).click();
  await expect(centre).toBeVisible();
  await expect(crumbs).toBeHidden();

  // Double-tap does the same.
  await arc(page, 'Salam').dispatchEvent('dblclick');
  await expect(circle(page).getByRole('treeitem', { name: /^Salam, in the centre/ })).toBeVisible();

  await expectAccessible(page);
});

test('the number of generations is adjustable and remembered (CV-04)', async ({ page }) => {
  await familyOfFour(page);
  await openView(page, 'Circle');
  await expect(page.getByText('5 generations')).toBeVisible();
  await page.getByRole('button', { name: 'Show fewer generations' }).click();
  await expect(page.getByText('4 generations')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    if (await page.getByRole('button', { name: 'Show fewer generations' }).isEnabled()) {
      await page.getByRole('button', { name: 'Show fewer generations' }).click();
    }
  }
  await expect(page.getByText('2 generations')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show fewer generations' })).toBeDisabled();
  await page.reload();
  await expect(page.getByText('2 generations')).toBeVisible();

  // Selecting an arc opens the details (beside the circle, or from the bar on phones).
  await arc(page, 'Rahim').dispatchEvent('click');
  if (isPhone(page)) await page.getByRole('button', { name: 'Details: Rahim' }).click();
  await expect(page.getByRole('heading', { name: 'Rahim' })).toBeVisible();
});
