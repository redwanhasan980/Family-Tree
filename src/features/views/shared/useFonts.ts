'use client';

import { useEffect, useState, type RefObject } from 'react';

import { clearMeasureCache } from './measureText';

const FALLBACK = 'ui-sans-serif, system-ui, sans-serif';

/**
 * The font family an SVG view renders with, for measuring text the same way, and a
 * version that changes when web fonts finish loading so names are wrapped again.
 */
export function useFonts(ref: RefObject<Element | null>): { family: string; version: number } {
  const [state, setState] = useState({ family: FALLBACK, version: 0 });

  useEffect(() => {
    const element = ref.current;
    const read = () => {
      const family = element ? getComputedStyle(element).fontFamily || FALLBACK : FALLBACK;
      clearMeasureCache();
      setState((old) => ({ family, version: old.version + 1 }));
    };
    read();
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) read();
    });
    document.fonts.addEventListener('loadingdone', read);
    return () => {
      active = false;
      document.fonts.removeEventListener('loadingdone', read);
    };
  }, [ref]);

  return state;
}
