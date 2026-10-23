import { describe, expect, it, vi } from 'vitest';

import type { SignedUpload } from '@/lib/domain/media';

import { UploadError, uploadToCloudinary } from './upload';

vi.mock('@/lib/repositories/api', () => ({ callApi: vi.fn() }));

const signed: SignedUpload = {
  uploadUrl: 'https://api.cloudinary.com/v1_1/c/image/upload',
  apiKey: 'key',
  timestamp: 1700000000,
  signature: 'sig',
  publicId: 'shikor/test/t1/p1/abcdefgh1234',
  assetFolder: 'shikor/test/t1/p1',
  allowedFormats: 'jpg,png',
  transformation: 'c_limit,w_2000,h_2000',
};

interface FakeXhrState {
  status: number;
  responseText: string;
  method: string;
  url: string;
  body: FormData | null;
  upload: { onprogress: ((e: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

/** Records what was sent, then answers as told. */
function fakeXhr(answer: (xhr: FakeXhrState) => void) {
  const sent: FakeXhrState[] = [];
  class FakeXhr {
    status = 0;
    responseText = '';
    method = '';
    url = '';
    body: FormData | null = null;
    upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    send(body: FormData) {
      this.body = body;
      sent.push(this);
      answer(this);
    }
    abort() {
      this.onabort?.();
    }
  }
  return { Xhr: FakeXhr as unknown as typeof XMLHttpRequest, sent };
}

describe('uploadToCloudinary (MED-06)', () => {
  it('posts the signed fields with the file and reports progress', async () => {
    const progress: number[] = [];
    const { Xhr, sent } = fakeXhr((xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
      xhr.status = 200;
      xhr.responseText = JSON.stringify({
        public_id: signed.publicId,
        version: 9,
        width: 1200,
        height: 1200,
        secure_url: 'https://…',
      });
      xhr.onload?.();
    });
    const photo = await uploadToCloudinary(
      new Blob(['x'], { type: 'image/jpeg' }),
      signed,
      { onProgress: (f) => progress.push(f) },
      Xhr,
    );
    expect(photo).toEqual({ publicId: signed.publicId, version: 9, width: 1200, height: 1200 });
    expect(progress).toEqual([0.5]);
    const [xhr] = sent;
    expect(xhr).toMatchObject({ method: 'POST', url: signed.uploadUrl });
    const fields = Object.fromEntries([...xhr!.body!.entries()].filter(([key]) => key !== 'file'));
    expect(fields).toEqual({
      api_key: 'key',
      timestamp: '1700000000',
      signature: 'sig',
      public_id: signed.publicId,
      asset_folder: signed.assetFolder,
      allowed_formats: 'jpg,png',
      transformation: 'c_limit,w_2000,h_2000',
    });
    expect(xhr!.body!.get('file')).toBeInstanceOf(Blob);
  });

  it('refuses an answer for another photo, and errors', async () => {
    const wrongId = fakeXhr((xhr) => {
      xhr.status = 200;
      xhr.responseText = JSON.stringify({ public_id: 'other', version: 1, width: 1, height: 1 });
      xhr.onload?.();
    });
    await expect(uploadToCloudinary(new Blob(), signed, {}, wrongId.Xhr)).rejects.toEqual(
      new UploadError('rejected'),
    );
    const bad = fakeXhr((xhr) => {
      xhr.status = 400;
      xhr.responseText = 'not json';
      xhr.onload?.();
    });
    await expect(uploadToCloudinary(new Blob(), signed, {}, bad.Xhr)).rejects.toMatchObject({
      code: 'rejected',
    });
    const offline = fakeXhr((xhr) => xhr.onerror?.());
    await expect(uploadToCloudinary(new Blob(), signed, {}, offline.Xhr)).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const slow = fakeXhr(() => controller.abort());
    await expect(
      uploadToCloudinary(new Blob(), signed, { signal: controller.signal }, slow.Xhr),
    ).rejects.toMatchObject({ code: 'aborted' });
    await expect(
      uploadToCloudinary(new Blob(), signed, { signal: controller.signal }, slow.Xhr),
    ).rejects.toMatchObject({ code: 'aborted' });
  });
});
