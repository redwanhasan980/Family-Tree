import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shikor',
    firestore: { rules: readFileSync(join(process.cwd(), 'firebase/firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('baseline rules (deny all)', () => {
  it('denies unauthenticated reads and writes', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'trees/t1')));
    await assertFails(setDoc(doc(db, 'trees/t1'), { name: 'x' }));
  });

  it('denies signed-in users until the real rules ship (P2-05)', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(setDoc(doc(db, 'users/alice'), { locale: 'bn' }));
  });

  it('denies guests (anonymous sign-in)', async () => {
    const db = env
      .authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore();
    await assertFails(setDoc(doc(db, 'trees/t2'), { name: 'guest tree' }));
  });
});
