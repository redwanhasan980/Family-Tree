'use client';

import { useState, type ReactNode } from 'react';

import { initials, type ShownName } from '@/lib/domain/names';
import type { PhotoRef } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';

import { photoUrl } from './cloudinaryUrl';

const SIZES = {
  xs: 'size-8 text-xs',
  sm: 'size-9 text-sm',
  md: 'size-14 text-xl',
  lg: 'size-20 text-2xl',
} as const;

/**
 * A round photo thumbnail (MED-04), or the person's initials when there is no photo,
 * photos are off, or the image fails to load. Decorative: the name is always shown next
 * to it.
 */
export function Avatar({
  name,
  photo,
  size = 'sm',
  className,
  children,
}: {
  name: ShownName;
  photo?: PhotoRef | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** Badges drawn over the avatar, such as the "This is me" star. */
  children?: ReactNode;
}) {
  const url = photo ? photoUrl(photo, 'thumb') : null;
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = url !== null && failed !== url;
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary',
        SIZES[size],
        className,
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sizes and formats it.
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full rounded-full object-cover"
          onError={() => setFailed(url)}
        />
      ) : (
        <span lang={name.lang}>{initials(name.text, name.lang)}</span>
      )}
      {children}
    </span>
  );
}

/** A person's photo where the tree shows photos (TREE-06), else nothing. */
export function useShownPhoto(photo: PhotoRef | null | undefined): PhotoRef | null {
  const show = useTree((s) => s.tree?.settings.showPhotos ?? true);
  return show ? (photo ?? null) : null;
}
