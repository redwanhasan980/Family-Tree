import { readFileSync } from 'node:fs';

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { personDoc, relationshipFields } from '@/lib/domain/documents';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildGraph, childrenOf, parentsOf } from '@/lib/domain/graph';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Person } from '@/lib/domain/types';
import { paths } from '@/lib/domain/writes';
import {
  personFromSnapshot,
  relationshipFromSnapshot,
  treeFromSnapshot,
} from '@/lib/firebase/converters';
import { subscribePersons, type DocChange } from '@/lib/repositories/trees';
import { commitBatch, newId } from '@/lib/repositories/writes';
import { createHistoryStore } from '@/stores/historyStore';

import { createExecutor } from './executor';
import {
  addChildren,
  addParent,
  addPerson,
  addSibling,
  addSpouse,
  deletePerson,
  setPersonPhoto,
  updatePerson,
} from './personCommands';
import {
  changeOtherParent,
  linkExisting,
  moveBranch,
  removeRelationship,
  reorderChildren,
  reorderSpouses,
  setParentKind,
  setSpouseStatus,
} from './relationshipCommands';
import { createTreeToucher } from './touch';
import { createTree, setRoot, updateTreeDetails, updateTreeSettings } from './treeCommands';

import type { BuildResult, CommandContext } from './types';

/**
 * P2-11: every command against the Firestore emulator, written through the real batch
 * writer by a signed-in owner, so the security rules check each write. Each one is done,
 * undone (the data must be exactly as before) and redone.
 */

const UID = 'u1';
const TREE = 't1';
let env: RulesTestEnvironment;
let db: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shikor',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  db = env
    .authenticatedContext(UID, {
      email: 'u1@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    })
    .firestore() as unknown as Firestore;
});

afterAll(async () => {
  await env?.cleanup();
});

/** Seeds the shared test family as tree t1, owned by u1, without going through the rules. */
async function seedFamily(): Promise<void> {
  const { persons, relationships } = testFamily();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore() as unknown as Firestore;
    const at = new Date('2026-01-01T00:00:00Z');
    const stamps = {
      createdAt: at,
      createdBy: UID,
      updatedAt: at,
      updatedBy: UID,
      schemaVersion: 1,
    };
    await setDoc(doc(admin, paths.tree(TREE)), {
      name: 'Test',
      ownerId: UID,
      memberIds: [UID],
      roles: { [UID]: 'owner' },
      rootPersonId: 'G',
      personCount: persons.length,
      settings: DEFAULT_TREE_SETTINGS,
      createdAt: at,
      updatedAt: at,
      updatedBy: UID,
      schemaVersion: 1,
    });
    for (const p of persons)
      await setDoc(doc(admin, paths.person(TREE, p.id)), personDoc(p, stamps));
    for (const l of relationships)
      await setDoc(doc(admin, paths.relationship(TREE, l.id)), {
        ...relationshipFields(l),
        ...stamps,
      });
  });
}

async function context(treeId = TREE): Promise<CommandContext> {
  const tree = treeFromSnapshot(await getDoc(doc(db, paths.tree(treeId))));
  if (!tree) throw new Error('tree missing');
  const persons = (await getDocs(collection(db, paths.persons(treeId)))).docs.flatMap(
    (d) => personFromSnapshot(d) ?? [],
  );
  const links = (await getDocs(collection(db, paths.relationships(treeId)))).docs.flatMap(
    (d) => relationshipFromSnapshot(d) ?? [],
  );
  return { treeId, tree, graph: buildGraph(persons, links), actorId: UID, newId: () => newId(db) };
}

/** Everything stored for the tree, without update stamps; timestamps in milliseconds. */
async function content(
  treeId = TREE,
  { ignoreCreated = false } = {},
): Promise<Map<string, unknown>> {
  const canonical = (data: Record<string, unknown>) => {
    const { updatedAt: _ua, updatedBy: _ub, createdAt, ...rest } = data;
    return {
      ...rest,
      ...(!ignoreCreated && createdAt instanceof Timestamp && { createdAt: createdAt.toMillis() }),
    };
  };
  const out = new Map<string, unknown>();
  const tree = await getDoc(doc(db, paths.tree(treeId)));
  if (tree.exists()) out.set(tree.ref.path, canonical(tree.data()));
  for (const path of [paths.persons(treeId), paths.relationships(treeId)]) {
    for (const d of (await getDocs(collection(db, path))).docs)
      out.set(d.ref.path, canonical(d.data()));
  }
  return out;
}

async function roundTrip(result: BuildResult, treeId = TREE): Promise<void> {
  if (!result.ok) throw new Error(`Expected a command, got ${JSON.stringify(result.issues)}`);
  const { command } = result;
  const before = await content(treeId);
  await commitBatch(command.forward, db);
  const after = await content(treeId, { ignoreCreated: true });
  await commitBatch(command.inverse, db);
  expect(await content(treeId)).toEqual(before);
  await commitBatch(command.forward, db);
  expect(await content(treeId, { ignoreCreated: true })).toEqual(after);
}

describe('commands against the emulator and the security rules', () => {
  it('creates a tree with its first person, and adds people to it', async () => {
    const result = createTree(
      { name: 'করিম পরিবার', root: { names: { bn: 'আব্দুল করিম' }, gender: 'male' } },
      { actorId: UID, newId: () => newId(db) },
    );
    if (!result.ok || !result.treeId) throw new Error('createTree failed');
    await commitBatch(result.command.forward, db);
    const treeId = result.treeId;
    expect((await context(treeId)).tree).toMatchObject({ personCount: 1, ownerId: UID });

    await roundTrip(
      addPerson(await context(treeId), { names: { en: 'Unplaced' }, gender: 'female' }),
      treeId,
    );
    const ctx = await context(treeId);
    await roundTrip(
      addSpouse(ctx, ctx.tree.rootPersonId!, { names: { bn: 'রহিমা' }, gender: 'female' }),
      treeId,
    );
    const kids = addChildren(await context(treeId), ctx.tree.rootPersonId!, [
      { names: { en: 'Karim' }, gender: 'male' },
      { names: { en: 'Rahima' }, gender: 'female' },
      { names: { en: 'Salam' }, gender: 'male' },
    ]);
    await roundTrip(kids, treeId);
    const after = await context(treeId);
    expect(
      childrenOf(after.graph, after.tree.rootPersonId!).map(
        (id) => after.graph.persons.get(id)!.names.en,
      ),
    ).toEqual(['Karim', 'Rahima', 'Salam']);
    expect(after.tree.personCount).toBe(6);

    // Undoing the creation deletes the tree and its first person in one batch.
    await commitBatch(result.command.inverse, db);
    // A missing tree reads as "no access", so nobody can probe for tree IDs.
    await expect(getDoc(doc(db, paths.tree(treeId)))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore() as unknown as Firestore;
      expect((await getDoc(doc(admin, paths.tree(treeId)))).exists()).toBe(false);
    });
  });

  it('round-trips every person command', async () => {
    await seedFamily();
    await roundTrip(
      addChildren(await context(), 'G', [{ names: { en: 'New child' }, gender: 'female' }], {
        otherParentId: 'W2',
      }),
    );
    await roundTrip(
      addParent(await context(), 'G', { names: { en: 'Great-grandfather' }, gender: 'male' }),
    );
    await roundTrip(
      addSibling(await context(), 'S2', { names: { bn: 'নতুন বোন' }, gender: 'female' }),
    );
    await roundTrip(
      updatePerson(await context(), 'G', {
        nickname: 'করিম মিয়া',
        profession: 'কৃষক',
        names: { bn: 'আব্দুল করিম' },
        phones: ['+880 1711-000000'],
        birth: { date: { year: 1925, approximate: true }, place: 'শিবগঞ্জ' },
      }),
    );
    await roundTrip(
      updatePerson(await context(), 'G', { nickname: undefined, names: { bn: 'আব্দুল করিম' } }),
    );
    const photo = (suffix: string) => ({
      publicId: `shikor/test/${TREE}/G/${suffix}`,
      version: 2,
      width: 1200,
      height: 1200,
    });
    await roundTrip(setPersonPhoto(await context(), 'G', photo('firstPhoto1')));
    await roundTrip(setPersonPhoto(await context(), 'G', photo('secondPhoto')));
    await roundTrip(setPersonPhoto(await context(), 'G', null));
    await roundTrip(deletePerson(await context(), 'D1'));
    await roundTrip(deletePerson(await context(), 'S1', { withDescendants: true }));
  });

  it('round-trips every relationship and tree command', async () => {
    await seedFamily();
    await roundTrip(
      linkExisting(await context(), {
        type: 'parent',
        parentId: 'O',
        childId: 'A',
        kind: 'adoptive',
      }),
    );
    await roundTrip(
      linkExisting(await context(), { type: 'spouse', personId: 'X', partnerId: 'P' }),
    );
    await roundTrip(setParentKind(await context(), 'p_G_S1', 'adoptive'));
    await roundTrip(
      setSpouseStatus(await context(), 's_G_W1', {
        status: 'widowed',
        marriageDate: { year: 1950, month: 2 },
      }),
    );
    await roundTrip(changeOtherParent(await context(), 'S1', 'W1', 'W2'));
    await roundTrip(moveBranch(await context(), 'X', 'S2'));
    await roundTrip(reorderChildren(await context(), 'G', ['D1', 'S1']));
    await roundTrip(reorderSpouses(await context(), 'G', ['s_G_W2', 's_G_W1']));
    await roundTrip(removeRelationship(await context(), 's_DD_SS'));
    await roundTrip(setRoot(await context(), 'S1'));
    await roundTrip(updateTreeDetails(await context(), { name: 'নতুন নাম', description: 'বিবরণ' }));
    await roundTrip(
      updateTreeSettings(await context(), { colorBy: 'generation', showPhotos: false }),
    );
    const ctx = await context();
    expect(parentsOf(ctx.graph, 'X')).toEqual(['S2']);
    expect(ctx.tree.rootPersonId).toBe('S1');
  });

  it('touches the tree for detail edits, as an editor too (DESIGN §7.3)', async () => {
    await seedFamily();
    const EDITOR = 'u2';
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore() as unknown as Firestore;
      await setDoc(
        doc(admin, paths.tree(TREE)),
        { memberIds: [UID, EDITOR], roles: { [UID]: 'owner', [EDITOR]: 'editor' } },
        { merge: true },
      );
    });
    const editorDb = env
      .authenticatedContext(EDITOR, {
        email: 'u2@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore() as unknown as Firestore;
    const before = (await getDoc(doc(db, paths.tree(TREE)))).data()!;

    const result = updatePerson({ ...(await context()), actorId: EDITOR }, 'S1', {
      nickname: 'Babu',
    });
    if (!result.ok) throw new Error('updatePerson failed');
    const ops = createTreeToucher()(result.command.forward, { treeId: TREE, actorId: EDITOR });
    expect(ops).toHaveLength(result.command.forward.length + 1);
    await commitBatch(ops, editorDb);

    const after = (await getDoc(doc(db, paths.tree(TREE)))).data()!;
    expect(after.updatedBy).toBe(EDITOR);
    expect((after.updatedAt as Timestamp).toMillis()).toBeGreaterThan(
      (before.updatedAt as Timestamp).toMillis(),
    );
    expect(after.personCount).toBe(before.personCount);
  });

  it('runs commands through the executor and the listeners see each step', async () => {
    await seedFamily();
    const seen: DocChange<Person>[][] = [];
    const stop = subscribePersons(
      TREE,
      (changes) => seen.push(changes),
      () => undefined,
      db,
    );
    const executor = createExecutor({
      commit: (ops) => commitBatch(ops, db),
      history: createHistoryStore(),
    });

    const result = addChildren(await context(), 'S2', [
      { names: { en: 'Listener test' }, gender: 'male' },
    ]);
    if (!result.ok) throw new Error('addChildren failed');
    await executor.run(result.command);
    const childId = result.command.createdIds![0]!;
    await expect
      .poll(() => seen.flat().some((c) => c.type === 'added' && c.id === childId))
      .toBe(true);

    await executor.undo();
    await expect
      .poll(() => seen.flat().some((c) => c.type === 'removed' && c.id === childId))
      .toBe(true);
    await executor.redo();
    await expect
      .poll(async () => (await getDoc(doc(db, paths.person(TREE, childId)))).exists())
      .toBe(true);
    stop();
  });
});
