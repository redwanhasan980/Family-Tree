import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// Helpers shared by the view specs (Phase 6).

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** A new guest tree starting from one man, open in the Tree view. */
export async function newTree(page: Page, name: string): Promise<void> {
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Test family');
  await create.getByLabel('Oldest person you remember (optional)').fill(name);
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await expect(page.getByRole('treeitem', { name: new RegExp(`^${name}`) })).toBeVisible();
}

/**
 * A new guest tree: Abdul Karim and his children Rahim, Karima (a daughter) and Salam,
 * open in the Tree view.
 */
export async function familyOfFour(page: Page): Promise<void> {
  await newTree(page, 'Abdul Karim');
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

/**
 * Finds someone with the header search, which selects and centres them (VIS-04), so no
 * card hides under the tree controls on small phones.
 */
export async function findPerson(page: Page, name: string): Promise<void> {
  await page
    .getByRole('button', { name: 'Find someone' })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Find someone' });
  await dialog.getByPlaceholder('Search by name or nickname').fill(name);
  await dialog.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('tree').getByRole('treeitem', { name: new RegExp(`^${name}`) }),
  ).toHaveAttribute('aria-selected', 'true');
}

/** Switches view with the header tabs (desktop) or the bottom bar (phones). */
export async function openView(page: Page, name: 'Tree' | 'Family' | 'Circle' | 'List') {
  await page
    .getByRole('navigation', { name: 'Views' })
    .filter({ visible: true })
    .getByRole('button', { name, exact: true })
    .click();
}

/** No serious or critical accessibility problems in the main area. */
export async function expectAccessible(page: Page): Promise<void> {
  // Colours are checked as drawn: let fades and slides (the Family card's) finish first.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))),
  );
  const results = await new AxeBuilder({ page }).include('main').analyze();
  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`),
  ).toEqual([]);
}
