'use client';

import { useSyncExternalStore } from 'react';

/** The editor's desktop layout: tabs and a side panel from 1024 px (DESIGN §21.6). */
const QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
