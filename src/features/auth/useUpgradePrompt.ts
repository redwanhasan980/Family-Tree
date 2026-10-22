'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { isSnoozed } from '@/lib/domain/auth/prompts';

import { useSession } from './SessionProvider';

/** Milestones that invite a guest to create an account (AUTH-03); wired up in P8-03. */
export type UpgradePromptId = 'fifthPerson' | 'firstExport' | 'thirdVisit';

const storageKey = (id: UpgradePromptId) => `shikor:prompt:${id}:dismissedAt`;
const CHANGE_EVENT = 'shikor:prompts';

// Dismissals are a per-browser convenience, so storage may be missing or blocked.
function readDismissedAt(id: UpgradePromptId): number | null {
  try {
    const value = window.localStorage.getItem(storageKey(id));
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Whether a guest should see an upgrade prompt now. Dismissing hides it for 7 days in
 * this browser. Registered users never see one.
 */
export function useUpgradePrompt(id: UpgradePromptId): { visible: boolean; dismiss: () => void } {
  const { session } = useSession();
  // On the server and during hydration the prompt counts as snoozed, so it never flashes.
  const snoozed = useSyncExternalStore(
    subscribe,
    () => isSnoozed(readDismissedAt(id), Date.now()),
    () => true,
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey(id), String(Date.now()));
    } catch {
      // Without storage the prompt simply comes back on the next visit.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [id]);

  return { visible: session.status === 'guest' && !snoozed, dismiss };
}
