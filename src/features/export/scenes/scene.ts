'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import { clearMeasureCache } from '@/features/views/shared/measureText';

import type { Size } from '../geometry';
import type { ExportOptions } from '../options';

/** What a rendered scene hands to the pipeline. */
export type SceneHandle =
  | {
      kind: 'svg';
      svg: SVGSVGElement;
      size: Size;
      /** The size names are drawn at, for the "too small on paper" check. */
      namePx: number;
    }
  | {
      kind: 'html';
      /** The whole scene as one picture (PNG). */
      whole: HTMLElement;
      /** Page frames for a PDF, each one page; null to fit `whole` on one page. */
      pages: HTMLElement[] | null;
      namePx: number;
    };

export interface SceneProps {
  options: ExportOptions;
  /** Texts around the drawing, already resolved (the title defaults to the tree's name). */
  title: string;
  subtitle: string;
  onReady: (scene: SceneHandle) => void;
}

/** The font stack the app draws with (`--font-sans`), read from the stage. */
export function stageFamily(element: Element | null): string {
  return (element && getComputedStyle(element).fontFamily) || 'sans-serif';
}

/**
 * Waits for the faces a scene uses (Bangla and Latin, regular and semibold) so text is
 * measured with them, not a fallback. Returns the family once they're loaded.
 */
export function useSceneFonts(element: Element | null): string | null {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    if (!element) return;
    const stack = stageFamily(element);
    let active = true;
    const sample = 'অআকখaA১1';
    void Promise.all(
      ['400', '500', '600'].map((weight) =>
        document.fonts.load(`${weight} 16px ${stack}`, sample).catch(() => []),
      ),
    ).then(() => {
      if (!active) return;
      clearMeasureCache();
      setFamily(stack);
    });
    return () => {
      active = false;
    };
  }, [element]);
  return family;
}

/** Hands the scene over once it has rendered with its fonts and painted. */
export function useWhenPainted(
  ready: boolean,
  build: () => SceneHandle | null,
  onReady: (scene: SceneHandle) => void,
): void {
  const report = useEffectEvent(() => {
    const handle = build();
    if (handle) onReady(handle);
    return handle !== null;
  });
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready || done) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (report()) setDone(true);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, done]);
}
