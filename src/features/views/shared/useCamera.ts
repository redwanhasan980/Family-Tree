'use client';

import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { IDENTITY, type CameraTransform } from './viewport';

/** TV-03: 10%–300%. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3;
const DURATION = 400;

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface Camera {
  /** The transform after the last pan or zoom ended (for culling); not updated per frame. */
  transform: CameraTransform;
  /** Moves the camera, animated unless reduced motion is on. */
  moveTo: (next: CameraTransform, animate?: boolean) => void;
  zoomBy: (factor: number) => void;
  /** The live transform, read without waiting for a render. */
  current: () => CameraTransform;
  /** Whether the user has moved the camera or changed the view since `resetInteraction`. */
  interacted: () => boolean;
  markInteracted: () => void;
  resetInteraction: () => void;
}

/**
 * Pan and zoom with d3-zoom (DESIGN §13.1). The transform goes straight onto `layerRef`
 * on every frame, so React doesn't re-render while panning; `transform` follows when the
 * gesture ends.
 */
export function useCamera(
  svgRef: RefObject<SVGSVGElement | null>,
  layerRef: RefObject<SVGGElement | null>,
): Camera {
  const [transform, setTransform] = useState<CameraTransform>(IDENTITY);
  const live = useRef<CameraTransform>(IDENTITY);
  const touched = useRef(false);
  const behavior = useMemo<ZoomBehavior<SVGSVGElement, unknown>>(
    () => zoom<SVGSVGElement, unknown>().scaleExtent([MIN_SCALE, MAX_SCALE]).clickDistance(6),
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    behavior
      .on(
        'zoom',
        (event: { transform: CameraTransform & { toString(): string }; sourceEvent: unknown }) => {
          // Gestures have a source event; programmatic moves (fit, centre) don't.
          if (event.sourceEvent) touched.current = true;
          live.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
          layerRef.current?.setAttribute('transform', event.transform.toString());
        },
      )
      .on('end', () =>
        setTransform((old) => {
          const next = live.current;
          return old.x === next.x && old.y === next.y && old.k === next.k ? old : next;
        }),
      );
    const selection = select(svg);
    selection.call(behavior).on('dblclick.zoom', null);
    return () => {
      selection.on('.zoom', null);
    };
  }, [behavior, svgRef, layerRef]);

  const moveTo = useCallback(
    (next: CameraTransform, animate = true) => {
      const svg = svgRef.current;
      if (!svg) return;
      const target = zoomIdentity.translate(next.x, next.y).scale(next.k);
      const selection = select(svg);
      if (animate && !reducedMotion()) {
        selection.transition().duration(DURATION).call(behavior.transform, target);
      } else {
        selection.call(behavior.transform, target);
      }
    },
    [behavior, svgRef],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const selection = select(svg);
      if (reducedMotion()) selection.call(behavior.scaleBy, factor);
      else selection.transition().duration(200).call(behavior.scaleBy, factor);
    },
    [behavior, svgRef],
  );

  const current = useCallback(() => live.current, []);
  const interacted = useCallback(() => touched.current, []);
  const markInteracted = useCallback(() => {
    touched.current = true;
  }, []);
  const resetInteraction = useCallback(() => {
    touched.current = false;
  }, []);
  return useMemo(
    () => ({ transform, moveTo, zoomBy, current, interacted, markInteracted, resetInteraction }),
    [transform, moveTo, zoomBy, current, interacted, markInteracted, resetInteraction],
  );
}
