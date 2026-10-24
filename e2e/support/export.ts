import { readFile } from 'node:fs/promises';

import { expect, type Download, type Page } from '@playwright/test';

import { isPhone } from './family';

// Helpers for the export dialog (Phase 7).

/** Opens "Save a picture or PDF": a header button on desktop, the menu on phones. */
export async function openExport(page: Page) {
  if (isPhone(page)) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Save or share' }).click();
  } else {
    await page.getByRole('button', { name: 'Save or share' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Save a picture or PDF' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function choose(page: Page, label: string, option: string) {
  await page.getByRole('dialog').getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

export async function save(page: Page): Promise<{ download: Download; bytes: Buffer }> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloading;
  const bytes = await readFile((await download.path())!);
  return { download, bytes };
}
