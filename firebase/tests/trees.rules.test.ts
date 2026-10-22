import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  EDITOR,
  newTree,
  OUTSIDER,
  OWNER,
  person,
  seedTree,
  SETTINGS,
  touched,
  VIEWER,
} from './data';
import { guestDb, startEnv, userDb } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env?.cleanup();
});

const tree = (db: ReturnType<typeof userDb>, id = 't1') => doc(db, `trees/${id}`);

describe('trees — create', () => {
  it('lets a registered user or a guest create their own tree', async () => {
    await assertSucceeds(setDoc(tree(userDb(env, 'alice')), newTree('alice')));
    await assertSucceeds(setDoc(tree(guestDb(env, 'gst'), 't2'), newTree('gst')));
  });

  it('creates a tree and its first person in one batch', async () => {
    const db = userDb(env, 'alice');
    const batch = writeBatch(db);
    batch.set(tree(db), newTree('alice', { personCount: 1, rootPersonId: 'p1' }));
    batch.set(doc(db, 'trees/t1/persons/p1'), person('alice'));
    await assertSucceeds(batch.commit());
  });

  it('refuses ownership tricks', async () => {
    const db = userDb(env, 'alice');
    await assertFails(setDoc(tree(db), newTree('bob')));
    await assertFails(
      setDoc(
        tree(db),
        newTree('alice', { memberIds: ['alice', 'bob'], roles: { alice: 'owner', bob: 'editor' } }),
      ),
    );
    await assertFails(setDoc(tree(db), newTree('alice', { roles: { alice: 'editor' } })));
    await assertFails(setDoc(tree(db), newTree('alice', { memberIds: ['bob'] })));
    await assertFails(setDoc(tree(env.unauthenticatedContext().firestore()), newTree('alice')));
  });

  it('refuses client timestamps and someone else’s stamp', async () => {
    const db = userDb(env, 'alice');
    await assertFails(setDoc(tree(db), newTree('alice', { createdAt: Timestamp.now() })));
    await assertFails(setDoc(tree(db), newTree('alice', { updatedAt: Timestamp.now() })));
    await assertFails(setDoc(tree(db), newTree('alice', { updatedBy: 'bob' })));
  });

  it('validates the name, counts, settings and fields', async () => {
    const db = userDb(env, 'alice');
    const bad: Record<string, unknown>[] = [
      { name: '' },
      { name: 'n'.repeat(81) },
      { name: 7 },
      { description: 'd'.repeat(501) },
      { personCount: -1 },
      { personCount: 5001 },
      { personCount: 1.5 },
      { settings: { ...SETTINGS, colorBy: 'rainbow' } },
      { settings: { ...SETTINGS, extra: true } },
      { settings: { nameDisplay: 'auto' } },
      { settings: { ...SETTINGS, showPhotos: 'yes' } },
      { rootPersonId: 'r'.repeat(41) },
      { schemaVersion: 2 },
      { surprise: true },
    ];
    for (const overrides of bad) await assertFails(setDoc(tree(db), newTree('alice', overrides)));
    await assertSucceeds(
      setDoc(tree(db), newTree('alice', { description: 'আমাদের পরিবার', rootPersonId: 'p1' })),
    );
  });
});

describe('trees — read', () => {
  beforeEach(async () => {
    await seedTree(env);
    await seedTree(env, 't9', {
      ownerId: OUTSIDER,
      memberIds: [OUTSIDER],
      roles: { [OUTSIDER]: 'owner' },
    });
  });

  it('lets members read the tree, nobody else', async () => {
    for (const uid of [OWNER, EDITOR, VIEWER]) await assertSucceeds(getDoc(tree(userDb(env, uid))));
    await assertFails(getDoc(tree(userDb(env, OUTSIDER))));
    await assertFails(getDoc(tree(env.unauthenticatedContext().firestore())));
  });

  it('lists only the trees a user belongs to', async () => {
    const db = userDb(env, VIEWER);
    await assertSucceeds(
      getDocs(query(collection(db, 'trees'), where('memberIds', 'array-contains', VIEWER))),
    );
    await assertFails(getDocs(collection(db, 'trees')));
    await assertFails(
      getDocs(query(collection(db, 'trees'), where('memberIds', 'array-contains', OUTSIDER))),
    );
  });
});

describe('trees — update', () => {
  beforeEach(async () => {
    await seedTree(env);
  });

  it('lets the owner rename, change settings and manage existing members', async () => {
    const db = userDb(env, OWNER);
    await assertSucceeds(
      updateDoc(tree(db), {
        name: 'নতুন নাম',
        settings: { ...SETTINGS, colorBy: 'none' },
        ...touched(OWNER),
      }),
    );
    await assertSucceeds(updateDoc(tree(db), { [`roles.${EDITOR}`]: 'viewer', ...touched(OWNER) }));
    await assertSucceeds(
      updateDoc(tree(db), {
        memberIds: [OWNER, EDITOR],
        roles: { [OWNER]: 'owner', [EDITOR]: 'viewer' },
        ...touched(OWNER),
      }),
    );
  });

  it('never lets the owner add members, hand over ownership or rewrite history', async () => {
    const db = userDb(env, OWNER);
    await assertFails(
      updateDoc(tree(db), {
        memberIds: [OWNER, EDITOR, VIEWER, OUTSIDER],
        [`roles.${OUTSIDER}`]: 'editor',
        ...touched(OWNER),
      }),
    );
    await assertFails(updateDoc(tree(db), { ownerId: EDITOR, ...touched(OWNER) }));
    await assertFails(updateDoc(tree(db), { createdAt: serverTimestamp(), ...touched(OWNER) }));
    await assertFails(updateDoc(tree(db), { [`roles.${OWNER}`]: 'editor', ...touched(OWNER) }));
    await assertFails(updateDoc(tree(db), { [`roles.${EDITOR}`]: 'admin', ...touched(OWNER) }));
    // roles and memberIds must stay in step
    await assertFails(updateDoc(tree(db), { memberIds: [OWNER, EDITOR], ...touched(OWNER) }));
  });

  it('lets editors change the name, settings, root and count — nothing else', async () => {
    const db = userDb(env, EDITOR);
    await assertSucceeds(
      updateDoc(tree(db), { name: 'x', rootPersonId: 'p1', personCount: 3, ...touched(EDITOR) }),
    );
    await assertFails(updateDoc(tree(db), { [`roles.${EDITOR}`]: 'owner', ...touched(EDITOR) }));
    await assertFails(updateDoc(tree(db), { ownerId: EDITOR, ...touched(EDITOR) }));
    await assertFails(
      updateDoc(tree(db), {
        memberIds: [OWNER, EDITOR, VIEWER, OUTSIDER],
        [`roles.${OUTSIDER}`]: 'viewer',
        ...touched(EDITOR),
      }),
    );
  });

  it('refuses viewers, outsiders and unstamped writes', async () => {
    await assertFails(updateDoc(tree(userDb(env, VIEWER)), { name: 'x', ...touched(VIEWER) }));
    await assertFails(updateDoc(tree(userDb(env, OUTSIDER)), { name: 'x', ...touched(OUTSIDER) }));
    await assertFails(updateDoc(tree(userDb(env, OWNER)), { name: 'x' }));
    await assertFails(
      updateDoc(tree(userDb(env, OWNER)), {
        name: 'x',
        updatedAt: Timestamp.now(),
        updatedBy: OWNER,
      }),
    );
    await assertFails(updateDoc(tree(userDb(env, EDITOR)), { name: 'x', ...touched(OWNER) }));
  });

  it('lets editors and viewers leave, but not remove others; the owner can’t leave', async () => {
    const leave = (uid: string, remaining: string[]) =>
      updateDoc(tree(userDb(env, uid)), {
        memberIds: remaining,
        roles: Object.fromEntries(
          remaining.map((m) => [m, m === OWNER ? 'owner' : m === EDITOR ? 'editor' : 'viewer']),
        ),
        ...touched(uid),
      });
    await assertFails(leave(EDITOR, [OWNER, EDITOR]));
    await assertFails(leave(OWNER, [EDITOR, VIEWER]));
    await assertSucceeds(leave(VIEWER, [OWNER, EDITOR]));
    await assertSucceeds(leave(EDITOR, [OWNER]));
  });
});

describe('trees — delete', () => {
  beforeEach(async () => {
    await seedTree(env);
  });

  it('is for the owner only', async () => {
    for (const uid of [EDITOR, VIEWER, OUTSIDER])
      await assertFails(deleteDoc(tree(userDb(env, uid))));
    await assertSucceeds(deleteDoc(tree(userDb(env, OWNER))));
  });
});
