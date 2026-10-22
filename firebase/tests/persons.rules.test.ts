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
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EARLIER,
  EDITOR,
  OUTSIDER,
  OWNER,
  person,
  seedDoc,
  seedTree,
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
  await seedTree(env);
});
afterAll(async () => {
  await env?.cleanup();
});

const personRef = (db: ReturnType<typeof userDb>, id = 'p1', tree = 't1') =>
  doc(db, `trees/${tree}/persons/${id}`);
const nextYear = new Date().getUTCFullYear() + 1;

describe('persons — who may write', () => {
  it('lets the owner and editors add people; viewers and outsiders can’t', async () => {
    await assertSucceeds(setDoc(personRef(userDb(env, OWNER)), person(OWNER)));
    await assertSucceeds(setDoc(personRef(userDb(env, EDITOR), 'p2'), person(EDITOR)));
    await assertFails(setDoc(personRef(userDb(env, VIEWER), 'p3'), person(VIEWER)));
    await assertFails(setDoc(personRef(userDb(env, OUTSIDER), 'p4'), person(OUTSIDER)));
    await assertFails(
      setDoc(personRef(env.unauthenticatedContext().firestore(), 'p5'), person('anon')),
    );
  });

  it('lets a guest edit their own guest tree', async () => {
    await seedTree(env, 'gt', { ownerId: 'gst', memberIds: ['gst'], roles: { gst: 'owner' } });
    await assertSucceeds(setDoc(personRef(guestDb(env, 'gst'), 'p1', 'gt'), person('gst')));
  });

  it('refuses writes to a tree that doesn’t exist', async () => {
    await assertFails(setDoc(personRef(userDb(env, OWNER), 'p1', 'missing'), person(OWNER)));
  });
});

describe('persons — validation (SRS §6.2)', () => {
  const db = () => userDb(env, EDITOR);

  it('accepts a complete profile', async () => {
    await assertSucceeds(
      setDoc(
        personRef(db()),
        person(EDITOR, {
          nickname: 'করিম মিয়া',
          birth: { date: { year: 1931, approximate: true }, place: 'শিবগঞ্জ' },
          death: { date: { year: 2004, month: 3, day: 12 } },
          profession: 'কৃষক',
          education: 'Class 8',
          addresses: { present: 'Dhaka', permanent: 'Shibganj' },
          phones: ['+880 1711-000000', '(02) 955 1234'],
          email: 'karim@example.com',
          description: 'd'.repeat(2000),
          photo: {
            publicId: 'shikor/prod/t1/p1/a8Fz_x-1',
            version: 1729500000,
            width: 1200,
            height: 1200,
          },
          customFields: [{ id: 'f1', label: 'Blood group', value: 'B+' }],
          childOrder: 1.5,
        }),
      ),
    );
    await assertSucceeds(
      setDoc(
        personRef(db(), 'p2'),
        person(EDITOR, { photo: null, birth: { date: { year: nextYear } } }),
      ),
    );
  });

  it('refuses malformed people', async () => {
    const bad: Record<string, unknown>[] = [
      { names: {} },
      { names: { en: '', bn: '' } },
      { names: { en: 'x', fr: 'y' } },
      { names: { en: 'n'.repeat(121) } },
      { names: 'Karim' },
      { nickname: 'n'.repeat(61) },
      { profession: 'p'.repeat(121) },
      { description: 'd'.repeat(2001) },
      { email: 'e'.repeat(255) },
      { gender: 'other' },
      { isLiving: 'yes' },
      { phones: ['1', '2', '3', '4'] },
      { phones: ['1'.repeat(31)] },
      { phones: [42] },
      { phones: '017' },
      {
        customFields: Array.from({ length: 21 }, (_, i) => ({
          id: `f${i}`,
          label: 'l',
          value: 'v',
        })),
      },
      { birth: { date: { year: 999 } } },
      { birth: { date: { year: nextYear + 1 } } },
      { birth: { date: { year: 1990, month: 13 } } },
      { birth: { date: { year: 1990, day: 3 } } },
      { birth: { date: { year: 1990, month: 2, day: 32 } } },
      { birth: { date: { year: '1990' } } },
      { birth: { date: { year: 1990, era: 'BS' } } },
      { birth: { place: 'p'.repeat(121) } },
      { death: { when: 'long ago' } },
      { addresses: { present: 'a'.repeat(301) } },
      { addresses: { office: 'x' } },
      { childOrder: 'first' },
      { photo: { publicId: 'shikor/prod/OTHER/p1/abc', version: 1, width: 1, height: 1 } },
      { photo: { publicId: 'shikor/prod/t1/OTHER/abc', version: 1, width: 1, height: 1 } },
      { photo: { publicId: 'https://evil.example/x.jpg', version: 1, width: 1, height: 1 } },
      { photo: { publicId: 'shikor/prod/t1/p1/abc', version: 1, width: 1, height: 1, url: 'x' } },
      { schemaVersion: 2 },
      { surprise: true },
    ];
    for (const overrides of bad) {
      await expect(
        assertFails(setDoc(personRef(db()), person(EDITOR, overrides))),
        JSON.stringify(overrides),
      ).resolves.toBeDefined();
    }
  });

  it('requires server stamps by the writer; an earlier creation time is allowed for restores', async () => {
    await assertFails(setDoc(personRef(db()), person(EDITOR, { updatedBy: OWNER })));
    await assertFails(setDoc(personRef(db()), person(EDITOR, { updatedAt: Timestamp.now() })));
    await assertFails(
      setDoc(
        personRef(db()),
        person(EDITOR, { createdAt: Timestamp.fromMillis(Date.now() + 86_400_000) }),
      ),
    );
    await assertFails(setDoc(personRef(db()), person(EDITOR, { createdBy: 7 })));
    await assertSucceeds(
      setDoc(personRef(db()), person(EDITOR, { createdAt: EARLIER, createdBy: OWNER })),
    );
  });
});

describe('persons — update, delete and read', () => {
  beforeEach(async () => {
    await seedDoc(env, 'trees/t1/persons/p1', person(OWNER));
  });

  it('lets editors change fields with fresh stamps, keeping who created it', async () => {
    const ref = personRef(userDb(env, EDITOR));
    await assertSucceeds(
      updateDoc(ref, { 'names.en': 'Karim', nickname: 'Mia', ...touched(EDITOR) }),
    );
    await assertFails(updateDoc(ref, { nickname: 'x' }));
    await assertFails(updateDoc(ref, { nickname: 'x', ...touched(OWNER) }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), ...touched(EDITOR) }));
    await assertFails(updateDoc(ref, { createdBy: EDITOR, ...touched(EDITOR) }));
    await assertFails(updateDoc(ref, { 'names.bn': 'ব'.repeat(121), ...touched(EDITOR) }));
    await assertFails(
      updateDoc(personRef(userDb(env, VIEWER)), { nickname: 'x', ...touched(VIEWER) }),
    );
  });

  it('lets editors delete; viewers and outsiders can’t', async () => {
    await assertFails(deleteDoc(personRef(userDb(env, VIEWER))));
    await assertFails(deleteDoc(personRef(userDb(env, OUTSIDER))));
    await assertSucceeds(deleteDoc(personRef(userDb(env, EDITOR))));
  });

  it('lets members read; outsiders can’t', async () => {
    for (const uid of [OWNER, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(personRef(userDb(env, uid))));
      await assertSucceeds(getDocs(collection(userDb(env, uid), 'trees/t1/persons')));
    }
    await assertFails(getDoc(personRef(userDb(env, OUTSIDER))));
    await assertFails(getDocs(collection(userDb(env, OUTSIDER), 'trees/t1/persons')));
  });
});

describe('batch size', () => {
  it('accepts a full 450-write batch (people plus the tree count)', async () => {
    const db = userDb(env, EDITOR);
    const batch = writeBatch(db);
    for (let i = 0; i < 449; i++) batch.set(personRef(db, `b${i}`), person(EDITOR));
    batch.update(doc(db, 'trees/t1'), { personCount: increment(449), ...touched(EDITOR) });
    await assertSucceeds(batch.commit());
  });
});
