import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// Phase 5: a photo from upload to the tree, the panel and the dashboard (P5-07).
// Cloudinary is mocked: uploads answer with what was sent, and delivery serves a test image.

const PHOTO = path.join(__dirname, 'fixtures', 'photo.jpg');
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;
const card = (page: Page, name: string) =>
  page.getByRole('treeitem', { name: new RegExp(`^${name}`) });

async function mockCloudinary(page: Page): Promise<string[]> {
  const uploads: string[] = [];
  await page.route('https://api.cloudinary.com/v1_1/*/image/upload', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const publicId = /name="public_id"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? '';
    uploads.push(publicId);
    await route.fulfill({ json: { public_id: publicId, version: 3, width: 900, height: 900 } });
  });
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ path: PHOTO, contentType: 'image/jpeg' }),
  );
  return uploads;
}

async function openDetails(page: Page, name: string) {
  await card(page, name).click();
  if (isPhone(page)) await page.getByRole('button', { name: `Details: ${name}` }).click();
}

test('a photo shows in the tree, the panel and on the dashboard (P5)', async ({ page }) => {
  const uploads = await mockCloudinary(page);
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Photo family');
  await create.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await expect(card(page, 'Abdul Karim')).toBeVisible();

  await openDetails(page, 'Abdul Karim');
  const addPhoto = page.getByRole('button', { name: 'Add a photo' });
  test.skip(
    (await addPhoto.count()) === 0,
    'Photos need a build with NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (CI sets it).',
  );
  await addPhoto.click();
  await page.getByTestId('photo-file').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByText('Photo saved.')).toBeVisible();
  const photoDialog = page.getByRole('dialog', { name: 'Photo of Abdul Karim' });
  await expect(photoDialog).toBeHidden();

  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatch(/^shikor\/test\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/);
  const thumb = new RegExp(`/c_fill,g_face,w_192,h_192/f_auto,q_auto/v3/${uploads[0]}$`);
  // Phones show details in a sheet that hides the tree while it's open.
  if (isPhone(page)) await page.keyboard.press('Escape');
  await expect(card(page, 'Abdul Karim').locator('image')).toHaveAttribute('href', thumb);
  await openDetails(page, 'Abdul Karim');

  // The lightbox shows the large version.
  await page.getByRole('button', { name: 'View the photo of Abdul Karim' }).click();
  await expect(page.getByRole('img', { name: 'Photo of Abdul Karim' })).toHaveAttribute(
    'src',
    /\/c_limit,w_1600,h_1600\//,
  );
  await page.keyboard.press('Escape');

  // Removing it can be undone; the stored photo is only deleted once nothing can bring it back.
  await page.getByRole('button', { name: 'Change photo' }).click();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(photoDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  if (isPhone(page)) await page.keyboard.press('Escape');
  await expect(card(page, 'Abdul Karim').locator('image')).toHaveAttribute('href', thumb);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible();

  // The dashboard cover is the root person's photo.
  await page.getByRole('link', { name: 'All my trees' }).first().click();
  const cover = page.getByRole('listitem').filter({ hasText: 'Photo family' }).locator('img');
  await expect(cover).toHaveAttribute('src', thumb);
});
