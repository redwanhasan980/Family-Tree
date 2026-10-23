import { z } from 'zod';

import { isValidId } from './ids';
import { IdSchema } from './schemas';

import type { ID } from './types';

/**
 * Photos (DESIGN §15). The rules for what may be uploaded and where it is stored, shared
 * by the client and the server.
 */

/** MED-01: what a person may pick, before compression. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** MED-03: the long edge after compression in the browser. */
export const PHOTO_EDGE = 1600;
/** Cloudinary caps what it stores at this size, even if a client skips compression. */
export const STORED_EDGE = 2000;
export const PHOTO_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'avif'] as const;
export const ACCEPTED_IMAGE_TYPES =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif';
/** A removed photo is deleted from storage after the undo window (MED-05, PER-06). */
export const PHOTO_DELETE_DELAY_MS = 30_000;
export const MAX_DELETE_IDS = 50;

export type MediaEnv = 'prod' | 'dev' | 'test';

export interface PhotoPath {
  env: string;
  treeId: ID;
  personId: ID;
  /** Random per upload, so a replaced photo never comes back from a CDN cache. */
  suffix: string;
}

const PUBLIC_ID =
  /^shikor\/([a-z]+)\/([A-Za-z0-9]{1,40})\/([A-Za-z0-9]{1,40})\/([A-Za-z0-9_-]{8,64})$/;

/** `shikor/{env}/{treeId}/{personId}/{suffix}`, or null when it isn't one of ours. */
export function parsePhotoId(publicId: string): PhotoPath | null {
  const match = PUBLIC_ID.exec(publicId);
  if (!match) return null;
  const [, env, treeId, personId, suffix] = match as unknown as [string, string, ID, ID, string];
  return { env, treeId, personId, suffix };
}

export function photoFolder(env: string, treeId: ID, personId?: ID): string {
  return personId ? `shikor/${env}/${treeId}/${personId}` : `shikor/${env}/${treeId}`;
}

export function photoId(path: PhotoPath): string {
  if (!isValidId(path.treeId) || !isValidId(path.personId)) throw new Error('Invalid photo path');
  return `${photoFolder(path.env, path.treeId, path.personId)}/${path.suffix}`;
}

export const MediaSignRequestSchema = z.strictObject({ treeId: IdSchema, personId: IdSchema });
export type MediaSignRequest = z.infer<typeof MediaSignRequestSchema>;

export const MediaDeleteRequestSchema = z.strictObject({
  treeId: IdSchema,
  publicIds: z.array(z.string().max(200)).min(1).max(MAX_DELETE_IDS),
});
export type MediaDeleteRequest = z.infer<typeof MediaDeleteRequestSchema>;

/** What `/api/media/sign` returns: everything the browser posts to Cloudinary. */
export interface SignedUpload {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  assetFolder: string;
  allowedFormats: string;
  transformation: string;
}

export interface MediaDeleteResult {
  deleted: string[];
  /** Still someone's photo, so kept (an undo brought it back, for example). */
  inUse: string[];
}
