'use client';

import { useTranslations } from 'next-intl';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ShownName } from '@/lib/domain/names';
import type { PhotoRef } from '@/lib/domain/types';

import { photoUrl } from './cloudinaryUrl';

/** A person's photo, as large as the screen allows (MED-04). */
export function Lightbox({
  name,
  photo,
  open,
  onOpenChange,
}: {
  name: ShownName;
  photo: PhotoRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('media');
  const url = photoUrl(photo, 'full');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-3xl"
      >
        <DialogTitle lang={name.lang} className="pr-10 text-base">
          {t('lightbox', { name: name.text })}
        </DialogTitle>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sizes and formats it.
          <img
            src={url}
            alt={t('lightbox', { name: name.text })}
            width={photo.width}
            height={photo.height}
            decoding="async"
            className="mx-auto max-h-[80dvh] w-auto rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
