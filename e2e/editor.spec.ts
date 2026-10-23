import { expect, test, type Page } from '@playwright/test';

// Phase 4: building a family in the Tree view (P4-14).

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** A new guest tree that starts with `root`, open in the Tree view. */
async function newTree(page: Page, root: string): Promise<void> {
  await page.goto('/en/trees');
  await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tree name').fill('Test family');
  await dialog.getByLabel('Oldest person you remember (optional)').fill(root);
  await dialog.getByText('Man', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create tree' }).click();
  await expect(card(page, root)).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole('treeitem', { name: new RegExp(`^${name}`) });

/** Tap a person, then their "+" (on the card on desktop, in the selection bar on phones). */
async function openAddMenu(page: Page, name: string): Promise<void> {
  await card(page, name).click();
  await page
    .getByRole('button', { name: `Add a relative of ${name}` })
    .filter({ visible: true })
    .last()
    .click();
}

async function addChildren(
  page: Page,
  parent: string,
  children: { name: string; daughter?: boolean }[],
): Promise<void> {
  await openAddMenu(page, parent);
  await page.getByRole('dialog').getByRole('button', { name: 'Son or daughter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  for (const [index, child] of children.entries()) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(child.name);
    if (child.daughter) {
      await dialog
        .getByRole('radiogroup', { name: `Son or daughter: child ${index + 1}` })
        .getByText('Daughter')
        .click();
    }
    // Enter moves on to a new row.
    if (index < children.length - 1) await input.press('Enter');
  }
  const count = children.length;
  await dialog
    .getByRole('button', { name: count === 1 ? 'Add 1 child' : `Add ${count} children` })
    .click();
  await expect(dialog).toBeHidden();
}

/** The selected person's details: beside the tree on desktop, a sheet on phones. */
async function openDetails(page: Page, name: string): Promise<void> {
  await card(page, name).click();
  if (isPhone(page)) await page.getByRole('button', { name: `Details: ${name}` }).click();
}

const undoButton = (page: Page) => page.getByRole('button', { name: /^Undo: / });

/** Waits until the server has every change, as the save status shows (TREE-07). */
async function saved(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible();
}

test.describe('adding relatives', () => {
  test('three children in one step, in order, undone at once (AC REL-04)', async ({ page }) => {
    await newTree(page, 'Abdul Karim');
    await openAddMenu(page, 'Abdul Karim');
    await page.getByRole('dialog').getByRole('button', { name: 'Wife' }).click();
    const wife = page.getByRole('dialog', { name: 'Add a wife' });
    await wife.getByLabel('Name').fill('Fatema Begum');
    await wife.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(card(page, 'Fatema Begum')).toBeVisible();

    await addChildren(page, 'Abdul Karim', [
      { name: 'Karim' },
      { name: 'Rahima', daughter: true },
      { name: 'Salam' },
    ]);
    const names = ['Karim', 'Rahima', 'Salam'];
    for (const name of names) await expect(card(page, name)).toBeVisible();
    // In the typed order, on one row under the couple.
    const boxes = await Promise.all(names.map((name) => card(page, name).boundingBox()));
    const couple = (await card(page, 'Abdul Karim').boundingBox())!;
    const [karim, rahima, salam] = boxes.map((box) => box!);
    expect(karim!.x).toBeLessThan(rahima!.x);
    expect(rahima!.x).toBeLessThan(salam!.x);
    expect(new Set([karim!.y, rahima!.y, salam!.y]).size).toBe(1);
    expect(karim!.y).toBeGreaterThan(couple.y);

    await openDetails(page, 'Rahima');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Woman' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Fatema Begum', exact: true })).toBeVisible();
    if (isPhone(page)) await page.keyboard.press('Escape');

    await undoButton(page).click();
    await expect(page.getByText('Undone: adding 3 children')).toBeVisible();
    for (const name of names) await expect(card(page, name)).toHaveCount(0);
    await expect(card(page, 'Fatema Begum')).toBeVisible();
  });

  test('a grandson cannot become his grandfather’s father (AC REL-10)', async ({ page }) => {
    await newTree(page, 'Abdul Karim');
    await addChildren(page, 'Abdul Karim', [{ name: 'Rafiq' }]);
    await addChildren(page, 'Rafiq', [{ name: 'Tanvir' }]);

    await openAddMenu(page, 'Abdul Karim');
    await page.getByRole('dialog').getByRole('button', { name: 'Father or mother' }).click();
    await page
      .getByRole('dialog', { name: 'Add a father or mother' })
      .getByRole('button', { name: 'Choose someone already in the tree instead' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Link someone already in the tree' });
    await expect(dialog.getByRole('radio', { name: 'Father or mother' })).toBeChecked();
    await dialog.getByPlaceholder('Search by name or nickname').fill('Tanvir');
    await dialog.getByRole('option', { name: /Tanvir/ }).click();
    await expect(
      dialog.getByText("This can't be done: it would make someone their own ancestor."),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    // Nothing changed: Abdul Karim still starts the tree, with no parents above him.
    await expect(page.getByRole('button', { name: 'Show parents' })).toHaveCount(0);
    await expect(undoButton(page)).toHaveAccessibleName('Undo: adding a child');
  });

  test('changes survive a reload; the undo history starts afresh (UX-01)', async ({ page }) => {
    await newTree(page, 'Abdul Karim');
    await addChildren(page, 'Abdul Karim', [{ name: 'Karim' }]);
    await undoButton(page).click();
    await expect(card(page, 'Karim')).toHaveCount(0);
    // Redo: a shortcut on desktop, the menu on phones.
    if (isPhone(page)) {
      await page.getByRole('button', { name: 'Tree menu' }).click();
      await page.getByRole('menuitem', { name: 'Redo: adding a child' }).click();
    } else {
      await page.keyboard.press('ControlOrMeta+Shift+Z');
    }
    await expect(card(page, 'Karim')).toBeVisible();

    await saved(page);
    await page.reload();
    await expect(card(page, 'Karim')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

    // An undone change stays undone after a reload too.
    await addChildren(page, 'Abdul Karim', [{ name: 'Salam' }]);
    await undoButton(page).click();
    await expect(card(page, 'Salam')).toHaveCount(0);
    await saved(page);
    await page.reload();
    await expect(card(page, 'Karim')).toBeVisible();
    await expect(card(page, 'Salam')).toHaveCount(0);
  });
});

test.describe('phones', () => {
  test.skip(({ page }) => !isPhone(page), 'phone layout');

  test('tap a person, tap +, add children (P4-14)', async ({ page }) => {
    await newTree(page, 'Abdul Karim');
    await card(page, 'Abdul Karim').click();
    // The selection bar sits in the thumb zone with its + button.
    const plus = page
      .getByRole('button', { name: 'Add a relative of Abdul Karim' })
      .filter({ visible: true })
      .last();
    const box = (await plus.boundingBox())!;
    expect(box.y).toBeGreaterThan((page.viewportSize()!.height * 2) / 3);
    await plus.click();
    const sheet = page.getByRole('dialog', { name: 'Add a relative' });
    await sheet.getByRole('button', { name: 'Son or daughter' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add children' });
    await dialog.getByRole('textbox', { name: 'Name of child 1' }).fill('Karim');
    await dialog.getByRole('textbox', { name: 'Name of child 1' }).press('Enter');
    await dialog.getByRole('textbox', { name: 'Name of child 2' }).fill('Rahima');
    await dialog.getByRole('button', { name: 'Add 2 children' }).click();
    await expect(card(page, 'Karim')).toBeVisible();
    await expect(card(page, 'Rahima')).toBeVisible();
  });
});

test.describe('keyboard', () => {
  test.skip(({ page }) => isPhone(page), 'desktop layout');

  test('add, move around, find, delete and undo with keys (TV-09)', async ({ page }) => {
    await newTree(page, 'Abdul Karim');
    const root = card(page, 'Abdul Karim');
    await root.focus();

    // C adds children to the focused person; focus comes back to them afterwards.
    await page.keyboard.press('c');
    const dialog = page.getByRole('dialog', { name: 'Add children' });
    await page.keyboard.type('Karim');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Rahima');
    await dialog.getByRole('button', { name: 'Add 2 children' }).click();
    await expect(card(page, 'Rahima')).toBeVisible();
    await expect(root).toBeFocused();

    // Arrows: down to a child, across to the other, back up to the parent.
    await page.keyboard.press('ArrowDown');
    const first = page.getByRole('treeitem', { selected: true });
    await expect(first).toBeFocused();
    const firstName = (await first.getAttribute('aria-label'))!;
    expect(['Karim', 'Rahima']).toContain(firstName);
    await page.keyboard.press(firstName === 'Karim' ? 'ArrowRight' : 'ArrowLeft');
    await expect(card(page, firstName === 'Karim' ? 'Rahima' : 'Karim')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(root).toBeFocused();
    await expect(root).toHaveAttribute('aria-selected', 'true');

    // Ctrl/⌘+K finds someone and moves to them.
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('Rahima');
    await page.keyboard.press('Enter');
    await expect(card(page, 'Rahima')).toBeFocused();
    await expect(card(page, 'Rahima')).toHaveAttribute('aria-selected', 'true');

    // Del asks first; Ctrl/⌘+Z brings her back, Shift undoes the undo.
    await page.keyboard.press('Delete');
    await page
      .getByRole('dialog', { name: 'Delete this person?' })
      .getByRole('button', {
        name: 'Delete',
      })
      .click();
    await expect(card(page, 'Rahima')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(card(page, 'Rahima')).toBeVisible();
    await expect(page.getByText('Undone: deleting a person')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(card(page, 'Rahima')).toHaveCount(0);
  });
});
