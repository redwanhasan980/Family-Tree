import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { openExport, save } from './support/export';

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
  // Cloudinary sends CORS headers, so exports can draw the photos (P7-03).
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({
      path: PHOTO,
      contentType: 'image/jpeg',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  return uploads;
}

async function openDetails(page: Page, name: string) {
  await card(page, name).click();
  if (isPhone(page)) await page.getByRole('button', { name: `Details: ${name}` }).click();
}

/** The byte length of the "file" part of a Cloudinary upload's multipart body. */
function uploadedFileBytes(route: Parameters<Parameters<Page['route']>[1]>[0]): number {
  const contentType = route.request().headers()['content-type'] ?? '';
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  const buffer = route.request().postDataBuffer();
  if (!boundary || !buffer) return -1;
  const body = buffer.toString('latin1');
  const marker = `\r\n--${boundary}`;
  const fileAt = body.indexOf('name="file"');
  const headerEnd = body.indexOf('\r\n\r\n', fileAt) + 4;
  if (fileAt < 0 || headerEnd < 4) return -1;
  return body.indexOf(marker, headerEnd) - headerEnd;
}

/** A large, high-entropy (hard to compress) square JPEG, generated in the browser. */
async function bigNoisyPhoto(page: Page): Promise<{ buffer: Buffer; sourceBytes: number }> {
  const { base64, sourceBytes } = await page.evaluate(async () => {
    const size = 2000;
    const el = document.createElement('canvas');
    el.width = size;
    el.height = size;
    const ctx = el.getContext('2d')!;
    const data = ctx.createImageData(size, size);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = Math.random() * 255;
      data.data[i + 1] = Math.random() * 255;
      data.data[i + 2] = Math.random() * 255;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      el.toBlob((b) => resolve(b!), 'image/jpeg', 0.95),
    );
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    return { base64: dataUrl.split(',')[1]!, sourceBytes: blob.size };
  });
  return { buffer: Buffer.from(base64, 'base64'), sourceBytes };
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

test('a large, hard-to-compress photo still lands under the size target (MED-03)', async ({
  page,
}) => {
  const uploadedBytes: number[] = [];
  await page.route('https://api.cloudinary.com/v1_1/*/image/upload', async (route) => {
    uploadedBytes.push(uploadedFileBytes(route));
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const publicId = /name="public_id"\r\n\r\n([^\r]+)/.exec(body)?.[1] ?? '';
    await route.fulfill({ json: { public_id: publicId, version: 1, width: 900, height: 900 } });
  });
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Photo family');
  await create.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await openDetails(page, 'Abdul Karim');
  const addPhoto = page.getByRole('button', { name: 'Add a photo' });
  test.skip((await addPhoto.count()) === 0, 'Photos need NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  await addPhoto.click();

  const { buffer, sourceBytes } = await bigNoisyPhoto(page);
  // Random pixels barely compress, so a photo this size proves the target isn't just
  // luckily met by an easy, smooth photo.
  expect(sourceBytes).toBeGreaterThan(500 * 1024);

  await page.getByTestId('photo-file').setInputFiles({
    name: 'big.jpg',
    mimeType: 'image/jpeg',
    buffer,
  });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByText('Photo saved.')).toBeVisible();

  expect(uploadedBytes).toHaveLength(1);
  expect(uploadedBytes[0]).toBeGreaterThan(0);
  expect(uploadedBytes[0]).toBeLessThanOrEqual(500 * 1024);
});

test('exports draw the photo, fetched in the export size (P7-03)', async ({ page }) => {
  await mockCloudinary(page);
  await page.goto('/en/trees');
  await page.getByRole('button', { name: 'Create a family tree' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Tree name').fill('Photo family');
  await create.getByLabel('Oldest person you remember (optional)').fill('Abdul Karim');
  await create.getByText('Man', { exact: true }).click();
  await create.getByRole('button', { name: 'Create tree' }).click();
  await openDetails(page, 'Abdul Karim');
  const addPhoto = page.getByRole('button', { name: 'Add a photo' });
  test.skip((await addPhoto.count()) === 0, 'Photos need NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.');
  await addPhoto.click();
  await page.getByTestId('photo-file').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByText('Photo saved.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Photo of Abdul Karim' })).toBeHidden();
  // Phones: close the details sheet, which hides the header.
  if (isPhone(page)) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const exported = page.waitForRequest(
    /res\.cloudinary\.com\/.*\/c_fill,g_face,w_256,h_256\/f_jpg/,
  );
  await openExport(page);
  const { bytes } = await save(page);
  await exported;
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});
