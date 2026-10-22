import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { guestDb, startEnv, userDb } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('server-only and unknown collections', () => {
  it('keeps merge tickets and rate limits away from every client', async () => {
    for (const db of [
      userDb(env, 'alice'),
      guestDb(env, 'guest'),
      env.unauthenticatedContext().firestore(),
    ]) {
      for (const path of ['mergeTickets/m1', 'rateLimits/r1']) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { guestUid: 'guest' }));
      }
    }
  });

  it('denies anything without its own rules', async () => {
    const db = userDb(env, 'alice');
    await assertFails(getDoc(doc(db, 'anything/else')));
    await assertFails(setDoc(doc(db, 'trees/t1/secrets/s1'), { x: 1 }));
  });
});
