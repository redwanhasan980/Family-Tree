import type { SignedUpload } from '@/lib/domain/media';
import type { ID, PhotoRef } from '@/lib/domain/types';
import { callApi } from '@/lib/repositories/api';

/** Why an upload stopped: no connection, Cloudinary said no, or the user cancelled. */
export class UploadError extends Error {
  constructor(readonly code: 'network' | 'rejected' | 'aborted') {
    super(code);
    this.name = 'UploadError';
  }
}

export interface UploadOptions {
  /** 0–1 as the file is sent. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface CloudinaryResponse {
  public_id?: unknown;
  version?: unknown;
  width?: unknown;
  height?: unknown;
}

/**
 * Sends a photo straight to Cloudinary with the server's signature (DESIGN §15.2). XHR,
 * not fetch, because only XHR reports upload progress (MED-06).
 */
export function uploadToCloudinary(
  file: Blob,
  signed: SignedUpload,
  { onProgress, signal }: UploadOptions = {},
  Request: typeof XMLHttpRequest = XMLHttpRequest,
): Promise<PhotoRef> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError('aborted'));
    const form = new FormData();
    form.append('file', file, 'photo.jpg');
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    form.append('public_id', signed.publicId);
    form.append('asset_folder', signed.assetFolder);
    form.append('allowed_formats', signed.allowedFormats);
    form.append('transformation', signed.transformation);

    const xhr = new Request();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: CloudinaryResponse = {};
      try {
        body = JSON.parse(String(xhr.responseText)) as CloudinaryResponse;
      } catch {
        // Treated as a refusal below.
      }
      const { public_id: publicId, version, width, height } = body;
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        publicId === signed.publicId &&
        typeof version === 'number' &&
        typeof width === 'number' &&
        typeof height === 'number'
      ) {
        resolve({ publicId, version, width, height });
      } else {
        reject(new UploadError('rejected'));
      }
    };
    xhr.onerror = () => reject(new UploadError('network'));
    xhr.onabort = () => reject(new UploadError('aborted'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.open('POST', signed.uploadUrl);
    xhr.send(form);
  });
}

/** Asks the server for a signature, then uploads (MED-07). */
export async function uploadPhoto(
  treeId: ID,
  personId: ID,
  file: Blob,
  options: UploadOptions = {},
): Promise<PhotoRef> {
  const signed = await callApi<SignedUpload>('/api/media/sign', { body: { treeId, personId } });
  return uploadToCloudinary(file, signed, options);
}
