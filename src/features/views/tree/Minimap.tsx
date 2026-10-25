'use client';

import { useEffect, useMemo, useRef, type PointerEvent } from 'react';

import { cn } from '@/lib/utils';

import {
  centreTransform,
  fitTransform,
  visibleRect,
  type CameraTransform,
} from '../shared/viewport';

import type { TreeLayout } from './layout';
import type { Camera } from '../shared/useCamera';

const MAX_W = 200;
const MAX_H = 140;
const PAD = 4;

/**
 * Whether a tree is big enough for a minimap: fitting all of it on screen would shrink
 * it below half size (TV-07).
 */
export function wantsMinimap(layout: TreeLayout, size: { width: number; height: number }) {
  return size.width > 0 && fitTransform(layout.bounds, size).k < 0.5;
}

/**
 * The whole tree in miniature with the part on screen outlined (TV-07, desktop). Press or
 * drag in it to move there. A pointer shortcut only: keyboard users move between people
 * with the arrow keys, so it is hidden from screen readers.
 */
export function Minimap({
  layout,
  size,
  selectedKey,
  camera: { current, subscribe, moveTo, markInteracted },
  className,
}: {
  layout: TreeLayout;
  size: { width: number; height: number };
  selectedKey: string | null;
  camera: Pick<Camera, 'current' | 'subscribe' | 'moveTo' | 'markInteracted'>;
  className?: string;
}) {
  const frame = useRef<SVGRectElement>(null);
  const { bounds } = layout;
  const scale = Math.min(
    (MAX_W - 2 * PAD) / Math.max(bounds.maxX - bounds.minX, 1),
    (MAX_H - 2 * PAD) / Math.max(bounds.maxY - bounds.minY, 1),
  );
  const width = (bounds.maxX - bounds.minX) * scale + 2 * PAD;
  const height = (bounds.maxY - bounds.minY) * scale + 2 * PAD;
  const toMapX = (x: number) => (x - bounds.minX) * scale + PAD;
  const toMapY = (y: number) => (y - bounds.minY) * scale + PAD;

  // Memoized: thousands of small rectangles, redrawn only when the tree changes.
  const cards = useMemo(
    () =>
      layout.cards.map((card) => (
        <rect
          key={card.key}
          x={(card.x - layout.bounds.minX) * scale + PAD}
          y={(card.y - layout.bounds.minY) * scale + PAD}
          width={Math.max(card.w * scale, 1)}
          height={Math.max(card.h * scale, 1)}
          rx={1}
          fill={card.key === selectedKey ? 'var(--primary)' : 'var(--muted-foreground)'}
          opacity={card.key === selectedKey ? 1 : 0.45}
        />
      )),
    [layout, scale, selectedKey],
  );

  useEffect(() => {
    const place = (transform: CameraTransform) => {
      const rect = visibleRect(transform, size, 0);
      const element = frame.current;
      if (!element) return;
      element.setAttribute('x', String((rect.minX - bounds.minX) * scale + PAD));
      element.setAttribute('y', String((rect.minY - bounds.minY) * scale + PAD));
      element.setAttribute('width', String(Math.max((rect.maxX - rect.minX) * scale, 2)));
      element.setAttribute('height', String(Math.max((rect.maxY - rect.minY) * scale, 2)));
    };
    place(current());
    return subscribe(place);
  }, [bounds, scale, size, current, subscribe]);

  const go = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - box.left - PAD) / scale + bounds.minX,
      y: (event.clientY - box.top - PAD) / scale + bounds.minY,
    };
    markInteracted();
    moveTo(centreTransform(point, size, current().k), false);
  };

  return (
    <div
      aria-hidden
      className={cn(
        'overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur',
        className,
      )}
    >
      <svg
        width={width}
        height={height}
        data-minimap=""
        className="block cursor-pointer touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          go(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons) go(event);
        }}
      >
        <g>{cards}</g>
        <rect
          ref={frame}
          x={toMapX(bounds.minX)}
          y={toMapY(bounds.minY)}
          width={0}
          height={0}
          rx={2}
          fill="var(--primary)"
          fillOpacity={0.1}
          stroke="var(--primary)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
