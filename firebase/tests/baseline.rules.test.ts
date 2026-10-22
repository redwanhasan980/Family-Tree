import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { guestDb, memberDb, startEnv } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('collections without rules yet (trees arrive in P2-05)', () => {
  it('denies unauthenticated reads and writes', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'trees/t1')));
    await assertFails(setDoc(doc(db, 'trees/t1'), { name: 'x' }));
  });

  it('denies registered users', async () => {
    const db = memberDb(env, 'alice', 'alice@example.com');
    await assertFails(getDoc(doc(db, 'trees/t1')));
    await assertFails(setDoc(doc(db, 'trees/t1'), { name: 'x' }));
  });

  it('denies guests', async () => {
    const db = guestDb(env, 'guest');
    await assertFails(setDoc(doc(db, 'trees/t2'), { name: 'guest tree' }));
    await assertFails(getDoc(doc(db, 'anything/else')));
  });
});
