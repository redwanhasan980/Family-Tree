'use client';

import { useSyncExternalStore } from 'react';

import {
  parsePendingMerge,
  PENDING_MERGE_KEY,
  type MergeDecision,
  type MergeResult,
  type MergeTicketResponse,
  type PendingMerge,
} from '@/lib/domain/account';
import { callApi } from '@/lib/repositories/api';
import { currentGuestUid } from '@/lib/repositories/auth';
import { readMyTrees } from '@/lib/repositories/trees';

/**
 * The browser half of the guest merge (AUTH-06/07, DESIGN §9.4). Before an existing
 * account replaces the guest, the guest's trees are listed and a merge ticket is made;
 * both are kept in localStorage so the merge dialog can appear after sign-in, even after
 * a redirect or a closed tab.
 */

/** Preparing the merge failed, so the sign-in was not attempted. */
export class GuestMergeError extends Error {
  constructor(cause: unknown) {
    super('Could not prepare the guest merge.', { cause });
    this.name = 'GuestMergeError';
  }
}

const CHANGE_EVENT = 'shikor:pending-merge';

export function readPendingMerge(now: Date = new Date()): PendingMerge | null {
  try {
    return parsePendingMerge(window.localStorage.getItem(PENDING_MERGE_KEY), now);
  } catch {
    return null;
  }
}

function writePendingMerge(value: PendingMerge | null): void {
  try {
    if (value) window.localStorage.setItem(PENDING_MERGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(PENDING_MERGE_KEY);
  } catch {
    // Storage blocked: the dialog can't resume after a reload, but the merge still works
    // in this tab through the event below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const clearPendingMerge = () => writePendingMerge(null);

/**
 * Call right before signing in to an existing account. Does nothing for registered users
 * or guests without trees. A ticket made for this guest earlier is reused (a mistyped
 * password shouldn't use up the ticket limit).
 */
export async function prepareGuestMerge(): Promise<void> {
  const guestUid = currentGuestUid();
  if (!guestUid) return;
  try {
    const trees = (await readMyTrees(guestUid))
      .filter((tree) => tree.ownerId === guestUid)
      .map(({ id, name, personCount }) => ({ id, name, personCount }));
    if (trees.length === 0) {
      clearPendingMerge();
      return;
    }
    const earlier = readPendingMerge();
    const ticket =
      earlier?.guestUid === guestUid
        ? earlier
        : await callApi<MergeTicketResponse>('/api/account/merge-ticket', { body: {} });
    writePendingMerge({
      ticketId: ticket.ticketId,
      expiresAt: ticket.expiresAt,
      guestUid,
      trees,
    });
  } catch (error) {
    throw new GuestMergeError(error);
  }
}

/** Moves or discards the guest's trees for the signed-in account. */
export function redeemPendingMerge(
  pending: PendingMerge,
  decisions: MergeDecision[],
): Promise<MergeResult> {
  return callApi<MergeResult>('/api/account/merge', {
    body: { ticketId: pending.ticketId, decisions },
  });
}

let cached: { raw: string | null; value: PendingMerge | null } = { raw: null, value: null };

function snapshot(): PendingMerge | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PENDING_MERGE_KEY);
  } catch {
    return null;
  }
  // useSyncExternalStore needs a stable value while nothing changed.
  if (raw !== cached.raw) cached = { raw, value: parsePendingMerge(raw, new Date()) };
  return cached.value;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PENDING_MERGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The pending merge in this browser, kept up to date across tabs. */
export function usePendingMerge(): PendingMerge | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
