import { doc, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore';

import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

/** Valid documents for rules tests. Override fields to make them invalid. */

export const EARLIER = Timestamp.fromMillis(Date.UTC(2024, 0, 1));

export const SETTINGS = {
  nameDisplay: 'auto',
  colorBy: 'branch',
  showPhotos: true,
  showDates: true,
  defaultView: 'tree',
  kinshipStyle: 'bd',
};

type Fields = Record<string, unknown>;

/** A new tree written by `uid` (server timestamps). */
export function newTree(uid: string, overrides: Fields = {}): Fields {
  return {
    name: 'করিম পরিবার',
    ownerId: uid,
    memberIds: [uid],
    roles: { [uid]: 'owner' },
    personCount: 0,
    settings: SETTINGS,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    schemaVersion: 1,
    ...overrides,
  };
}

/** Stamps for an update by `uid`. */
export function touched(uid: string): Fields {
  return { updatedAt: serverTimestamp(), updatedBy: uid };
}

/** Stamps for a new person or relationship written by `uid`. */
export function created(uid: string): Fields {
  return {
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    schemaVersion: 1,
  };
}

export function person(uid: string, overrides: Fields = {}): Fields {
  return {
    names: { bn: 'আব্দুল করিম', en: 'Abdul Karim' },
    gender: 'male',
    isLiving: false,
    ...created(uid),
    ...overrides,
  };
}

export function parentLink(
  uid: string,
  parentId: string,
  childId: string,
  overrides: Fields = {},
): Fields {
  return { type: 'parent', parentId, childId, kind: 'biological', ...created(uid), ...overrides };
}

export function spouseLink(uid: string, a: string, b: string, overrides: Fields = {}): Fields {
  return { type: 'spouse', personIds: [a, b], status: 'married', ...created(uid), ...overrides };
}

export const OWNER = 'own';
export const EDITOR = 'ed';
export const VIEWER = 'vw';
export const OUTSIDER = 'out';

/** Seeds trees/{treeId} with an owner, an editor and a viewer, bypassing the rules. */
export async function seedTree(
  env: RulesTestEnvironment,
  treeId = 't1',
  extra: Fields = {},
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `trees/${treeId}`), {
      name: 'করিম পরিবার',
      ownerId: OWNER,
      memberIds: [OWNER, EDITOR, VIEWER],
      roles: { [OWNER]: 'owner', [EDITOR]: 'editor', [VIEWER]: 'viewer' },
      personCount: 0,
      settings: SETTINGS,
      createdAt: EARLIER,
      updatedAt: EARLIER,
      updatedBy: OWNER,
      schemaVersion: 1,
      ...extra,
    });
  });
}

/** Seeds any document, bypassing the rules (stamps default to an earlier time). */
export async function seedDoc(
  env: RulesTestEnvironment,
  path: string,
  data: Fields,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), {
      ...data,
      ...(data.createdAt !== undefined && { createdAt: EARLIER }),
      ...(data.updatedAt !== undefined && { updatedAt: EARLIER }),
    });
  });
}
