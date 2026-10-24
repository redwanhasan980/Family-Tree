import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { choose, openExport, save } from './support/export';
import { familyOfFour, newTree, openView } from './support/family';

// Phase 7: pictures, PDFs and the JSON backup (P7-08).

/** Pages in a PDF: jsPDF writes one `/Type /Page` object per page, uncompressed. */
const pdfPages = (bytes: Buffer) => bytes.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

/** A PNG's width and height, from its header. */
const pngSize = (bytes: Buffer) => ({ w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) });

/** A new tree with `count` children under its first person, in the Tree view. */
async function bigFamily(page: Page, count: number) {
  await newTree(page, 'Abdul Karim');
  await page.getByRole('treeitem', { name: /^Abdul Karim/ }).click();
  await page
    .getByRole('button', { name: 'Add a relative of Abdul Karim' })
    .filter({ visible: true })
    .last()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Son or daughter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  for (let index = 0; index < count; index++) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(`Child ${index + 1}`);
    if (index < count - 1) await input.press('Enter');
  }
  await dialog.getByRole('button', { name: `Add ${count} children` }).click();
  await expect(dialog).toBeHidden();
}

// A4 portrait: 190 × 277 mm inside the margins, tiles overlapping by 5 mm (geometry.ts).
const MM_PER_PX = 25.4 / 96;
const tilesFor = (length: number, mm: number) => {
  const tile = mm / MM_PER_PX;
  const overlap = 5 / MM_PER_PX;
  return length <= tile ? 1 : Math.ceil((length - overlap) / (tile - overlap));
};

test('the tree as a picture, and as a PDF across pages (EXP-01, EXP-02, EXP-06)', async ({
  page,
}) => {
  await bigFamily(page, 6);
  await openExport(page);
  const png = await save(page);
  expect(png.download.suggestedFilename()).toMatch(/^Test-family-tree-\d{4}-\d{2}-\d{2}\.png$/);
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  const { w, h } = pngSize(png.bytes);
  expect(w).toBeGreaterThan(h);
  await expect(page.getByText(/^Saved: Test-family-tree-/)).toBeVisible();

  // The same tree on A4 at full size: wider than a page, so it is cut into pages.
  await openExport(page);
  await choose(page, 'File type', 'Document (PDF)');
  await choose(page, 'Orientation', 'Portrait');
  await choose(page, 'Pages', 'Full size, across several pages');
  const pdf = await save(page);
  expect(pdf.download.suggestedFilename()).toMatch(/-tree-.*\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // The picture was drawn at 2× (High quality): the scene is half its size.
  const expected = tilesFor(w / 2, 190) * tilesFor(h / 2, 277);
  expect(expected).toBeGreaterThanOrEqual(2);
  expect(pdfPages(pdf.bytes)).toBe(expected);

  // The choices are remembered.
  await openExport(page);
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'File type' })).toHaveText(
    'Document (PDF)',
  );
});

test('the family sheet and the list as PDFs; the backup as JSON (FC-09, BAK-01)', async ({
  page,
}) => {
  await familyOfFour(page);
  await openView(page, 'Family');
  await openExport(page);
  await expect(page.getByRole('combobox', { name: 'What to save' })).toHaveText('Family card');
  await choose(page, 'File type', 'Document (PDF)');
  const sheet = await save(page);
  expect(sheet.download.suggestedFilename()).toMatch(/-family-.*\.pdf$/);
  expect(pdfPages(sheet.bytes)).toBe(1);

  await openExport(page);
  await choose(page, 'What to save', 'List view');
  const list = await save(page);
  expect(list.download.suggestedFilename()).toMatch(/-list-.*\.pdf$/);
  expect(pdfPages(list.bytes)).toBe(1);

  await openExport(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Backup (JSON file)' }).click();
  const backup = await downloading;
  expect(backup.suggestedFilename()).toMatch(/^Test-family-backup-.*\.json$/);
  const json = JSON.parse(await readFile((await backup.path())!, 'utf8'));
  expect(json).toMatchObject({
    format: 'shikor-backup',
    version: 1,
    tree: { name: 'Test family' },
  });
  expect(json.persons).toHaveLength(4);
  expect(json.relationships).toHaveLength(3);
  expect(JSON.stringify(json)).not.toContain('ownerId');
});

// AC EXP-05: Bangla names keep their conjuncts and vowel signs in exports. The baseline
// is a picture of names that break when shaping is wrong; the owner signs it off.
const BANGLA = ['স্নিগ্ধা', 'জ্যোৎস্না', 'ঋত্বিক', 'অগ্নিস্মিতা দত্ত'];

test('Bangla names come out shaped correctly (AC EXP-05)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'one baseline, from desktop Chrome');
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('ক্ষত্রিয় পরিবার');
  await create.getByLabel('Oldest person you remember (optional)').fill('শ্রীক্ষিতীশচন্দ্র রায়');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await page.getByRole('treeitem', { name: /^শ্রীক্ষিতীশচন্দ্র/ }).click();
  await page
    .getByRole('button', { name: 'Add a relative of শ্রীক্ষিতীশচন্দ্র রায়' })
    .filter({ visible: true })
    .last()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Son or daughter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add children' });
  for (const [index, name] of BANGLA.entries()) {
    const input = dialog.getByRole('textbox', { name: `Name of child ${index + 1}` });
    await input.fill(name);
    if (index < BANGLA.length - 1) await input.press('Enter');
  }
  await dialog.getByRole('button', { name: `Add ${BANGLA.length} children` }).click();
  await expect(dialog).toBeHidden();

  await openExport(page);
  await page.getByRole('switch', { name: "Include today's date" }).click();
  await choose(page, 'Quality', 'Standard');
  const png = await save(page);
  expect(png.bytes).toMatchSnapshot('bangla-names.png', { maxDiffPixelRatio: 0.02 });
});
