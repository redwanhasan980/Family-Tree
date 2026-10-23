import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ID, Person, Relationship, Tree } from '@/lib/domain/types';
import { paths } from '@/lib/domain/writes';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  personFromSnapshot,
  relationshipFromSnapshot,
  treeFromSnapshot,
} from '@/lib/firebase/converters';

const defaultDb = (): Firestore => getFirebaseClient().db;

/** Where a snapshot came from, for the save status (TREE-07). */
export interface SnapshotMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

/** One changed document. `value` is null when it was removed or can't be read. */
export interface DocChange<T> {
  type: 'added' | 'modified' | 'removed';
  id: string;
  value: T | null;
}

const metaOf = (snapshot: DocumentSnapshot | QuerySnapshot): SnapshotMeta => ({
  fromCache: snapshot.metadata.fromCache,
  hasPendingWrites: snapshot.metadata.hasPendingWrites,
});

function subscribeCollection<T>(
  path: string,
  read: (snapshot: DocumentSnapshot) => T | null,
  onChanges: (changes: DocChange<T>[], meta: SnapshotMeta) => void,
  onError: (error: unknown) => void,
  db: Firestore,
): Unsubscribe {
  // Metadata changes are included so "Saving…" turns into "Saved" when the server confirms.
  return onSnapshot(
    collection(db, path),
    { includeMetadataChanges: true },
    (snapshot) => {
      const changes = snapshot.docChanges().map((change) => ({
        type: change.type,
        id: change.doc.id,
        value: change.type === 'removed' ? null : read(change.doc),
      }));
      onChanges(changes, metaOf(snapshot));
    },
    onError,
  );
}

/** The tree document. */
export function subscribeTree(
  treeId: ID,
  onTree: (tree: Tree | null, meta: SnapshotMeta) => void,
  onError: (error: unknown) => void,
  db: Firestore = defaultDb(),
): Unsubscribe {
  return onSnapshot(
    doc(db, paths.tree(treeId)),
    { includeMetadataChanges: true },
    (snapshot) => onTree(treeFromSnapshot(snapshot), metaOf(snapshot)),
    onError,
  );
}

/** All people in a tree, as changes (DESIGN §11.2). */
export function subscribePersons(
  treeId: ID,
  onChanges: (changes: DocChange<Person>[], meta: SnapshotMeta) => void,
  onError: (error: unknown) => void,
  db: Firestore = defaultDb(),
): Unsubscribe {
  return subscribeCollection(paths.persons(treeId), personFromSnapshot, onChanges, onError, db);
}

/** All relationships in a tree, as changes. */
export function subscribeRelationships(
  treeId: ID,
  onChanges: (changes: DocChange<Relationship>[], meta: SnapshotMeta) => void,
  onError: (error: unknown) => void,
  db: Firestore = defaultDb(),
): Unsubscribe {
  return subscribeCollection(
    paths.relationships(treeId),
    relationshipFromSnapshot,
    onChanges,
    onError,
    db,
  );
}

/**
 * The tree as last seen on this device, so it can render before the network answers.
 * Null when nothing is cached.
 */
export async function readTreeFromCache(
  treeId: ID,
  db: Firestore = defaultDb(),
): Promise<{ tree: Tree; persons: Person[]; relationships: Relationship[] } | null> {
  try {
    const tree = treeFromSnapshot(await getDocFromCache(doc(db, paths.tree(treeId))));
    if (!tree) return null;
    const [persons, relationships] = await Promise.all([
      getDocsFromCache(collection(db, paths.persons(treeId))),
      getDocsFromCache(collection(db, paths.relationships(treeId))),
    ]);
    return {
      tree,
      persons: persons.docs.flatMap((d) => personFromSnapshot(d) ?? []),
      relationships: relationships.docs.flatMap((d) => relationshipFromSnapshot(d) ?? []),
    };
  } catch {
    return null; // not cached
  }
}

/**
 * One person, from this device's cache when it has them, otherwise from the server. Null
 * when missing or unreadable. The dashboard uses it for each tree's root person.
 */
export async function readPerson(
  treeId: ID,
  personId: ID,
  db: Firestore = defaultDb(),
): Promise<Person | null> {
  const ref = doc(db, paths.person(treeId, personId));
  try {
    return personFromSnapshot(await getDocFromCache(ref));
  } catch {
    try {
      return personFromSnapshot(await getDoc(ref));
    } catch {
      return null;
    }
  }
}

const myTreesQuery = (db: Firestore, uid: ID) =>
  query(
    collection(db, 'trees'),
    where('memberIds', 'array-contains', uid),
    orderBy('updatedAt', 'desc'),
  );

/** The user's trees once, from the server when online (the guest merge reads them). */
export async function readMyTrees(uid: ID, db: Firestore = defaultDb()): Promise<Tree[]> {
  const snapshot = await getDocs(myTreesQuery(db, uid));
  return snapshot.docs.flatMap((d) => treeFromSnapshot(d) ?? []);
}

/** The user's trees, most recently updated first (dashboard, DESIGN §7.4). */
export function subscribeMyTrees(
  uid: ID,
  onTrees: (trees: Tree[], meta: SnapshotMeta) => void,
  onError: (error: unknown) => void,
  db: Firestore = defaultDb(),
): Unsubscribe {
  return onSnapshot(
    myTreesQuery(db, uid),
    (snapshot) =>
      onTrees(
        snapshot.docs.flatMap((d) => treeFromSnapshot(d) ?? []),
        metaOf(snapshot),
      ),
    onError,
  );
}
