import 'server-only';

import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { treeFromDoc } from '@/lib/domain/documents';
import type { ID, Tree } from '@/lib/domain/types';
import { paths } from '@/lib/domain/writes';
import { getAdminDb } from '@/lib/firebase/admin';

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

/** Deletes a tree with all its people, relationships and activity (TREE-03, account deletion). */
export async function recursiveDeleteTree(treeId: ID): Promise<void> {
  const db = getAdminDb();
  await db.recursiveDelete(db.doc(paths.tree(treeId)));
}
