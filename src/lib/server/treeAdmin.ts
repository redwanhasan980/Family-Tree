import 'server-only';

import { FieldPath, FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { treeFromDoc } from '@/lib/domain/documents';
import type { ID, Tree } from '@/lib/domain/types';
import { paths } from '@/lib/domain/writes';
import { getAdminDb } from '@/lib/firebase/admin';

import { deleteTreePhotos } from './cloudinary';

/**
 * Privileged tree operations for the guest merge and account deletion (P2-09). They run
 * with the Admin SDK, so the security rules don't apply: every caller must check the
 * user's rights first (verifyRequest, ownership).
 */

function plain(data: DocumentData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Timestamp ? value.toDate() : value,
    ]),
  );
}

/** One tree, or null when it doesn't exist. */
export async function readTree(treeId: ID): Promise<Tree | null> {
  const snapshot = await getAdminDb().doc(paths.tree(treeId)).get();
  const data = snapshot.data();
  return data ? treeFromDoc(snapshot.id, plain(data), new Date()) : null;
}

/** Trees the user owns (not ones shared with them). */
export async function listOwnedTrees(uid: ID): Promise<Tree[]> {
  const snapshot = await getAdminDb().collection('trees').where('ownerId', '==', uid).get();
  return snapshot.docs.flatMap((doc) => treeFromDoc(doc.id, plain(doc.data()), new Date()) ?? []);
}

/**
 * Gives `fromUid`'s trees to `toUid` (guest merge, DESIGN §9.4). Idempotent: trees no
 * longer owned by `fromUid` are skipped. Each tree changes in its own transaction.
 * Returns the IDs of the trees moved.
 */
export async function transferTrees(fromUid: ID, toUid: ID, treeIds: readonly ID[]): Promise<ID[]> {
  const db = getAdminDb();
  const moved: ID[] = [];
  for (const treeId of treeIds) {
    const done = await db.runTransaction(async (tx) => {
      const ref = db.doc(paths.tree(treeId));
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      if (!data || data.ownerId !== fromUid) return false;
      const memberIds = [
        ...new Set((data.memberIds as ID[]).map((m) => (m === fromUid ? toUid : m))),
      ];
      const roles = { ...(data.roles as Record<ID, string>) };
      delete roles[fromUid];
      roles[toUid] = 'owner';
      tx.update(ref, {
        ownerId: toUid,
        memberIds,
        roles,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: toUid,
      });
      return true;
    });
    if (done) moved.push(treeId);
  }
  return moved;
}

/**
 * Removes the user from trees someone else owns (account deletion). Returns their IDs.
 * Trees the user owns are left alone: deleting the account deletes those.
 */
export async function leaveSharedTrees(uid: ID): Promise<ID[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('trees').where('memberIds', 'array-contains', uid).get();
  const shared = snapshot.docs.filter((doc) => doc.get('ownerId') !== uid);
  for (const doc of shared) {
    await doc.ref.update(
      'memberIds',
      FieldValue.arrayRemove(uid),
      new FieldPath('roles', uid),
      FieldValue.delete(),
    );
  }
  return shared.map((doc) => doc.id);
}

/**
 * Deletes a tree with all its people, relationships, activity and photos (TREE-03,
 * account deletion, merge discard).
 */
export async function recursiveDeleteTree(treeId: ID): Promise<void> {
  const db = getAdminDb();
  await db.recursiveDelete(db.doc(paths.tree(treeId)));
  await deleteTreePhotos(treeId);
}
