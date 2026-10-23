// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parsePhotoId } from '@/lib/domain/media';

import {
  cloudinaryConfig,
  deleteAssets,
  deleteByPrefix,
  mediaEnv,
  requireCloudinary,
  signParams,
  signUpload,
  uploadSuffix,
  type CloudinaryConfig,
} from './cloudinary';

const config: CloudinaryConfig = {
  cloudName: 'demo-cloud',
  apiKey: 'key123',
  apiSecret: 'secret456',
  env: 'test',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('signing (DESIGN §15.2)', () => {
  it("matches Cloudinary's documented example", () => {
    const params = {
      eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
      public_id: 'sample_image',
      timestamp: 1315060510,
    };
    expect(signParams(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('signs one photo of one person, in its own folder, with a size cap', () => {
    const signed = signUpload(
      config,
      { treeId: 't1', personId: 'p1' },
      1_700_000_000_500,
      'Rand0m_suffix-1',
    );
    expect(signed).toEqual({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
      apiKey: 'key123',
      timestamp: 1_700_000_000,
      signature: signParams(
        {
          allowed_formats: 'jpg,jpeg,png,webp,heic,avif',
          asset_folder: 'shikor/test/t1/p1',
          public_id: 'shikor/test/t1/p1/Rand0m_suffix-1',
          timestamp: 1_700_000_000,
          transformation: 'c_limit,w_2000,h_2000',
        },
        'secret456',
      ),
      publicId: 'shikor/test/t1/p1/Rand0m_suffix-1',
      assetFolder: 'shikor/test/t1/p1',
      allowedFormats: 'jpg,jpeg,png,webp,heic,avif',
      transformation: 'c_limit,w_2000,h_2000',
    });
    // The secret never leaves the server.
    expect(JSON.stringify(signed)).not.toContain('secret456');
    expect(
      parsePhotoId(signUpload(config, { treeId: 't1', personId: 'p1' }).publicId),
    ).toMatchObject({ env: 'test', treeId: 't1', personId: 'p1' });
    expect(uploadSuffix()).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});

describe('configuration', () => {
  it('needs all three settings', () => {
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'c');
    vi.stubEnv('CLOUDINARY_API_KEY', 'k');
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    expect(cloudinaryConfig()).toBeNull();
    expect(() => requireCloudinary()).toThrow(expect.objectContaining({ code: 'unavailable' }));
    vi.stubEnv('CLOUDINARY_API_SECRET', 's');
    vi.stubEnv('APP_ENV', 'prod');
    expect(cloudinaryConfig()).toEqual({
      cloudName: 'c',
      apiKey: 'k',
      apiSecret: 's',
      env: 'prod',
    });
  });

  it('keeps unknown environments in the dev folder', () => {
    vi.stubEnv('APP_ENV', 'staging');
    expect(mediaEnv()).toBe('dev');
    vi.stubEnv('APP_ENV', 'test');
    expect(mediaEnv()).toBe('test');
  });
});

describe('deleting (DESIGN §15.4)', () => {
  function mockFetch(...bodies: object[]) {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const body of bodies) fetch.mockResolvedValueOnce(Response.json(body));
    return fetch;
  }

  it('deletes photos by ID with the Admin API', async () => {
    const fetch = mockFetch({ deleted: { a: 'deleted', b: 'not_found' } });
    expect(await deleteAssets(config, ['a', 'b'])).toEqual(['a']);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.cloudinary.com/v1_1/demo-cloud/resources/image/upload?invalidate=true&public_ids%5B%5D=a&public_ids%5B%5D=b',
    );
    expect(init).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: `Basic ${Buffer.from('key123:secret456').toString('base64')}` },
    });
  });

  it('splits long lists into calls of 100', async () => {
    const fetch = mockFetch({ deleted: {} }, { deleted: {} }, { deleted: {} });
    await deleteAssets(
      config,
      Array.from({ length: 201 }, (_, i) => `id${i}`),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('deletes a whole tree by prefix until nothing is left', async () => {
    const fetch = mockFetch({ partial: true }, { partial: false });
    await deleteByPrefix(config, 'shikor/test/t1/');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]![0])).toContain('prefix=shikor%2Ftest%2Ft1%2F');
    await expect(deleteByPrefix(config, 'shikor/')).rejects.toThrow('Unsafe prefix');
  });

  it('reports a failed call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('no', { status: 420 }));
    await expect(deleteAssets(config, ['a'])).rejects.toThrow('cloudinary.delete 420');
  });
});
