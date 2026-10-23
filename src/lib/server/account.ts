import 'server-only';

import type { ID } from '@/lib/domain/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

import { leaveSharedTrees, listOwnedTrees, recursiveDeleteTree } from './treeAdmin';

import type { Query } from 'firebase-admin/firestore';

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

async function deleteMatching(query: Query): Promise<void> {
  const snapshot = await query.get();
  const writer = getAdminDb().bulkWriter();
  for (const doc of snapshot.docs) void writer.delete(doc.ref);
  await writer.close();
}

/**
 * Deletes everything stored for a user (AUTH-10/12, NFR-PRIV-03): the trees they own with
 * everything inside, their place in trees others own, their profile, rate-limit counters,
 * merge tickets, and finally the auth user. Safe to run again after a failure.
 *
 * `keepMergeTickets` is for the guest merge, which still needs its ticket afterwards to
 * answer retries.
 */
export async function deleteUserData(
  uid: ID,
  { keepMergeTickets = false }: { keepMergeTickets?: boolean } = {},
): Promise<{ deletedTrees: ID[] }> {
  const db = getAdminDb();
  const owned = await listOwnedTrees(uid);
  for (const tree of owned) await recursiveDeleteTree(tree.id);
  await leaveSharedTrees(uid);
  await deleteMatching(db.collection('rateLimits').where('uid', '==', uid));
  if (!keepMergeTickets) {
    await deleteMatching(db.collection('mergeTickets').where('guestUid', '==', uid));
  }
  await db.recursiveDelete(db.doc(`users/${uid}`));
  // Last, so a failure above can be retried by the same user.
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (error) {
    if (codeOf(error) !== 'auth/user-not-found') throw error;
  }
  return { deletedTrees: owned.map((tree) => tree.id) };
}
