'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import type { GenerationBand } from './generations';
import type { Orientation } from './layout';
import type { Camera } from '../shared/useCamera';
import type { CameraTransform } from '../shared/viewport';

/** Below this many screen pixels a generation's row is too thin to label. */
const MIN_BAND_PX = 24;
/** Between a label and the row under it. */
const GAP_PX = 6;

/**
 * "Generation 1", "Generation 2" … along the side of the Tree view (TV-10): at the left,
 * just above each row, or above each column left to right. They follow the camera on
 * every frame without re-rendering, and stay out of the way of taps. Screen readers get
 * the generation from each card's level instead.
 */
export function GenerationLabels({
  bands,
  orientation,
  camera: { current, subscribe },
  className,
}: {
  bands: readonly GenerationBand[];
  orientation: Orientation;
  camera: Pick<Camera, 'current' | 'subscribe'>;
  className?: string;
}) {
  const t = useTranslations('treeView');
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const vertical = orientation === 'vertical';

  useEffect(() => {
    const place = ({ x, y, k }: CameraTransform) => {
      bands.forEach((band, index) => {
        const label = labels.current[index];
        if (!label) return;
        const size = (band.end - band.start) * k;
        const start = (vertical ? y : x) + band.start * k;
        label.style.visibility = size < MIN_BAND_PX ? 'hidden' : 'visible';
        // In the gap just above a row, where only lines pass; centred over a column.
        label.style.transform = vertical
          ? `translateY(${start - GAP_PX}px) translateY(-100%)`
          : `translateX(${start + size / 2}px) translateX(-50%)`;
      });
    };
    place(current());
    return subscribe(place);
  }, [bands, vertical, current, subscribe]);

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {bands.map((band, index) => (
        <span
          key={band.depth}
          ref={(element) => {
            labels.current[index] = element;
          }}
          className={cn('absolute', vertical ? 'top-0 left-2' : 'top-16 left-0')}
          style={{ visibility: 'hidden' }}
        >
          <span className="block rounded-full border bg-background/90 px-2 text-xs whitespace-nowrap text-muted-foreground shadow-xs">
            {t('generation', { number: band.depth + 1 })}
          </span>
        </span>
      ))}
    </div>
  );
}
