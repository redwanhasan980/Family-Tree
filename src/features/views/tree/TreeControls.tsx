'use client';

import {
  ChevronsDownUpIcon,
  CrosshairIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  RotateCwSquareIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uiStore, useUi } from '@/stores/uiStore';

/** Zoom, fit, centre, direction and expand-all buttons over the Tree view (TV-02/03). */
export function TreeControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onCentre,
  onExpandAll,
  className,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onCentre?: () => void;
  onExpandAll?: () => void;
  className?: string;
}) {
  const t = useTranslations('treeView');
  const horizontal = useUi((s) => s.orientation === 'horizontal');
  const button = 'size-11 rounded-none first:rounded-t-xl last:rounded-b-xl lg:size-10';
  return (
    <div
      role="toolbar"
      aria-label={t('cardControls')}
      aria-orientation="vertical"
      className={cn(
        'absolute bottom-3 left-3 flex flex-col divide-y overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={button}
        onClick={onZoomIn}
        aria-label={t('zoomIn')}
      >
        <PlusIcon aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={button}
        onClick={onZoomOut}
        aria-label={t('zoomOut')}
      >
        <MinusIcon aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className={button} onClick={onFit} aria-label={t('fit')}>
        <MaximizeIcon aria-hidden />
      </Button>
      {onCentre && (
        <Button
          variant="ghost"
          size="icon"
          className={button}
          onClick={onCentre}
          aria-label={t('centre')}
        >
          <CrosshairIcon aria-hidden />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn(button, horizontal && 'bg-accent')}
        aria-pressed={horizontal}
        aria-label={t('leftToRight')}
        onClick={() => uiStore.getState().setOrientation(horizontal ? 'vertical' : 'horizontal')}
      >
        <RotateCwSquareIcon aria-hidden />
      </Button>
      {onExpandAll && (
        <Button
          variant="ghost"
          size="icon"
          className={button}
          onClick={onExpandAll}
          aria-label={t('expandAll')}
        >
          <ChevronsDownUpIcon className="rotate-180" aria-hidden />
        </Button>
      )}
    </div>
  );
}
