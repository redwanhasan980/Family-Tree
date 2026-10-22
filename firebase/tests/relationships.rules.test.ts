import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EDITOR,
  OUTSIDER,
  OWNER,
  parentLink,
  seedDoc,
  seedTree,
  spouseLink,
  touched,
  VIEWER,
} from './data';
import { startEnv, userDb } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedTree(env);
});
afterAll(async () => {
  await env?.cleanup();
});

const rel = (db: ReturnType<typeof userDb>, id: string) => doc(db, `trees/t1/relationships/${id}`);

describe('parent links', () => {
  it('accepts p_{parent}_{child} with a known kind', async () => {
    const db = userDb(env, EDITOR);
    for (const kind of ['biological', 'adoptive', 'step', 'foster']) {
      await assertSucceeds(
        setDoc(rel(db, `p_dad_${kind}`), parentLink(EDITOR, 'dad', kind, { kind })),
      );
    }
  });

  it('refuses mismatched IDs, self-links, unknown kinds and extra fields', async () => {
    const db = userDb(env, EDITOR);
    const bad: [string, Record<string, unknown>][] = [
      ['p_kid_dad', parentLink(EDITOR, 'dad', 'kid')],
      ['s_dad_kid', parentLink(EDITOR, 'dad', 'kid')],
      ['p_dad_dad', parentLink(EDITOR, 'dad', 'dad')],
      ['p_dad_kid', parentLink(EDITOR, 'dad', 'kid', { kind: 'godparent' })],
      ['p_dad_kid', parentLink(EDITOR, 'dad', 'kid', { note: 'x' })],
      ['p_dad_kid', parentLink(EDITOR, 'dad', 'kid', { type: 'spouse' })],
      ['p_dad_kid', parentLink(EDITOR, 'dad', 'kid', { updatedBy: OWNER })],
    ];
    for (const [id, data] of bad) {
      await expect(
        assertFails(setDoc(rel(db, id), data)),
        `${id} ${JSON.stringify(data)}`,
      ).resolves.toBeDefined();
    }
  });
});

describe('spouse links', () => {
  it('accepts sorted IDs with a status, marriage date and order', async () => {
    const db = userDb(env, OWNER);
    await assertSucceeds(
      setDoc(
        rel(db, 's_amy_zed'),
        spouseLink(OWNER, 'amy', 'zed', { marriageDate: { year: 1950, month: 2 }, sequence: 2 }),
      ),
    );
  });

  it('refuses unsorted or mismatched IDs and bad values', async () => {
    const db = userDb(env, OWNER);
    const bad: [string, Record<string, unknown>][] = [
      ['s_zed_amy', spouseLink(OWNER, 'zed', 'amy')],
      ['s_amy_bob', spouseLink(OWNER, 'amy', 'zed')],
      ['s_amy_amy', spouseLink(OWNER, 'amy', 'amy')],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { personIds: ['amy', 'zed', 'bob'] })],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { status: 'engaged' })],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { marriageDate: { year: 900 } })],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { sequence: 0 })],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { sequence: 51 })],
      ['s_amy_zed', spouseLink(OWNER, 'amy', 'zed', { sequence: 1.5 })],
    ];
    for (const [id, data] of bad) {
      await expect(
        assertFails(setDoc(rel(db, id), data)),
        `${id} ${JSON.stringify(data)}`,
      ).resolves.toBeDefined();
    }
  });
});

describe('relationships — update, delete, read', () => {
  beforeEach(async () => {
    await seedDoc(env, 'trees/t1/relationships/p_dad_kid', parentLink(OWNER, 'dad', 'kid'));
    await seedDoc(env, 'trees/t1/relationships/s_amy_zed', spouseLink(OWNER, 'amy', 'zed'));
  });

  it('lets editors change the kind or status, never the people', async () => {
    const db = userDb(env, EDITOR);
    await assertSucceeds(updateDoc(rel(db, 'p_dad_kid'), { kind: 'adoptive', ...touched(EDITOR) }));
    await assertSucceeds(
      updateDoc(rel(db, 's_amy_zed'), { status: 'divorced', sequence: 1, ...touched(EDITOR) }),
    );
    await assertFails(updateDoc(rel(db, 'p_dad_kid'), { childId: 'other', ...touched(EDITOR) }));
    await assertFails(
      updateDoc(rel(db, 's_amy_zed'), { personIds: ['amy', 'bob'], ...touched(EDITOR) }),
    );
    await assertFails(
      updateDoc(rel(db, 'p_dad_kid'), { createdAt: serverTimestamp(), ...touched(EDITOR) }),
    );
    await assertFails(updateDoc(rel(db, 'p_dad_kid'), { kind: 'step' }));
    await assertFails(
      updateDoc(rel(userDb(env, VIEWER), 'p_dad_kid'), { kind: 'step', ...touched(VIEWER) }),
    );
  });

  it('lets editors delete; viewers and outsiders can’t', async () => {
    await assertFails(deleteDoc(rel(userDb(env, VIEWER), 'p_dad_kid')));
    await assertFails(deleteDoc(rel(userDb(env, OUTSIDER), 'p_dad_kid')));
    await assertSucceeds(deleteDoc(rel(userDb(env, EDITOR), 'p_dad_kid')));
  });

  it('lets members read; outsiders can’t', async () => {
    await assertSucceeds(getDoc(rel(userDb(env, VIEWER), 's_amy_zed')));
    await assertFails(getDoc(rel(userDb(env, OUTSIDER), 's_amy_zed')));
  });
});
