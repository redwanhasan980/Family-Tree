import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-shikor';

export function startEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(process.cwd(), 'firebase/firestore.rules'), 'utf8') },
  });
}

/** A signed-in guest (anonymous provider). */
export function guestDb(env: RulesTestEnvironment, uid: string) {
  return env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
}

/** A registered user signed in with email and password (or Google). */
export function memberDb(
  env: RulesTestEnvironment,
  uid: string,
  email: string,
  provider: 'password' | 'google.com' = 'password',
  emailVerified = false,
) {
  return env
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
      firebase: { sign_in_provider: provider },
    })
    .firestore();
}

/** A registered user by short name: `${uid}@example.com`, email verified. */
export function userDb(env: RulesTestEnvironment, uid: string) {
  return memberDb(env, uid, `${uid}@example.com`, 'password', true);
}
