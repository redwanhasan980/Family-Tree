import type { PhotoRef } from '@/lib/domain/types';

/**
 * Delivery sizes (DESIGN §15.3). Cloudinary charges for every distinct transformation of
 * every photo, so the set stays small; `thumb` is sized for cards on high-density screens.
 */
export const VARIANTS = {
  /** Cards, avatars, lists (up to 96 CSS px at 2×). */
  thumb: 'c_fill,g_face,w_192,h_192/f_auto,q_auto',
  /** The Family card couple and the Album (P6, R2). */
  card: 'c_fill,g_face,w_320,h_320/f_auto,q_auto',
  /** The lightbox. */
  full: 'c_limit,w_1600,h_1600/f_auto,q_auto',
  /** Chart exports need a canvas-safe format (P7). */
  export: 'c_fill,g_face,w_256,h_256/f_jpg,q_85',
} as const;

export type PhotoVariant = keyof typeof VARIANTS;

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/** The URL of one size of a photo, or null when photos aren't set up. */
export function photoUrl(
  photo: PhotoRef,
  variant: PhotoVariant,
  cloudName: string | undefined = CLOUD_NAME,
): string | null {
  if (!cloudName) return null;
  return `https://res.cloudinary.com/${cloudName}/image/upload/${VARIANTS[variant]}/v${photo.version}/${photo.publicId}`;
}

/** Whether this build can show and upload photos. */
export const photosEnabled = (cloudName: string | undefined = CLOUD_NAME) => Boolean(cloudName);
