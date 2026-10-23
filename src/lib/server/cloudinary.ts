import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import {
  PHOTO_FORMATS,
  photoFolder,
  STORED_EDGE,
  type MediaEnv,
  type SignedUpload,
} from '@/lib/domain/media';
import type { ID } from '@/lib/domain/types';
import { logger } from '@/lib/logger';

import { HttpError } from './http';

/**
 * Cloudinary on the server (DESIGN §15, MED-07). Uploads are signed here so the API
 * secret never reaches the browser; deletions use the Admin API. Both follow Cloudinary's
 * documented REST protocol with `fetch`, so no SDK is bundled.
 */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  env: MediaEnv;
}

const API = 'https://api.cloudinary.com/v1_1';

/** `APP_ENV` picks the folder: prod, dev (the default) or test. */
export function mediaEnv(): MediaEnv {
  const env = process.env.APP_ENV;
  return env === 'prod' || env === 'test' ? env : 'dev';
}

/** The account settings, or null when photos aren't set up on this server. */
export function cloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, env: mediaEnv() };
}

export function requireCloudinary(): CloudinaryConfig {
  const config = cloudinaryConfig();
  if (!config) throw new HttpError('unavailable', 'Photos are not set up on this server.');
  return config;
}

/**
 * Cloudinary's request signature: the parameters sorted by name and joined as
 * `a=1&b=2`, followed directly by the API secret, hashed with SHA-1.
 */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const joined = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${joined}${apiSecret}`).digest('hex');
}

/** A random, URL-safe suffix for each upload (96 bits). */
export function uploadSuffix(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * The signed parameters for one photo of one person: where it goes, which formats are
 * accepted, and a size cap applied as it arrives.
 */
export function signUpload(
  config: CloudinaryConfig,
  { treeId, personId }: { treeId: ID; personId: ID },
  now: number = Date.now(),
  suffix: string = uploadSuffix(),
): SignedUpload {
  const assetFolder = photoFolder(config.env, treeId, personId);
  const params = {
    allowed_formats: PHOTO_FORMATS.join(','),
    asset_folder: assetFolder,
    public_id: `${assetFolder}/${suffix}`,
    timestamp: Math.floor(now / 1000),
    transformation: `c_limit,w_${STORED_EDGE},h_${STORED_EDGE}`,
  };
  return {
    uploadUrl: `${API}/${config.cloudName}/image/upload`,
    apiKey: config.apiKey,
    timestamp: params.timestamp,
    signature: signParams(params, config.apiSecret),
    publicId: params.public_id,
    assetFolder,
    allowedFormats: params.allowed_formats,
    transformation: params.transformation,
  };
}

interface DeleteResponse {
  deleted?: Record<string, string>;
  partial?: boolean;
  next_cursor?: string;
}

async function adminDelete(config: CloudinaryConfig, query: URLSearchParams) {
  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  const response = await fetch(
    `${API}/${config.cloudName}/resources/image/upload?${query.toString()}`,
    { method: 'DELETE', headers: { Authorization: `Basic ${auth}` } },
  );
  if (!response.ok) throw new Error(`cloudinary.delete ${response.status}`);
  return (await response.json()) as DeleteResponse;
}

/** Deletes photos with their derived sizes; returns the IDs Cloudinary deleted. */
export async function deleteAssets(
  config: CloudinaryConfig,
  publicIds: readonly string[],
): Promise<string[]> {
  const deleted: string[] = [];
  // The Admin API takes up to 100 IDs per call.
  for (let i = 0; i < publicIds.length; i += 100) {
    const query = new URLSearchParams({ invalidate: 'true' });
    for (const id of publicIds.slice(i, i + 100)) query.append('public_ids[]', id);
    const result = await adminDelete(config, query);
    for (const [id, status] of Object.entries(result.deleted ?? {})) {
      if (status === 'deleted') deleted.push(id);
    }
  }
  return deleted;
}

/** Deletes every photo under `prefix` (a tree, when it or its owner is deleted). */
export async function deleteByPrefix(config: CloudinaryConfig, prefix: string): Promise<void> {
  if (!/^shikor\/[a-z]+\/[A-Za-z0-9]+\//.test(prefix)) throw new Error('Unsafe prefix');
  // Cloudinary deletes up to 1,000 at a time and says when there is more.
  for (let round = 0; round < 50; round++) {
    const result = await adminDelete(config, new URLSearchParams({ prefix, invalidate: 'true' }));
    if (!result.partial) return;
  }
}

/**
 * Deletes every photo of a tree (tree or account deletion, merge discard). A failure is
 * logged, not thrown: the data is already gone, and the orphan sweep (R2) retries.
 */
export async function deleteTreePhotos(treeId: ID): Promise<void> {
  const config = cloudinaryConfig();
  if (!config) return;
  try {
    await deleteByPrefix(config, `${photoFolder(config.env, treeId)}/`);
  } catch (error) {
    logger.error('media.delete_tree', error);
  }
}
