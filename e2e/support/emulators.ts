import { expect, type Page } from '@playwright/test';

// Helpers for tests that run against the Auth and Firestore emulators (project demo-shikor).
const PROJECT = 'demo-shikor';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** The signed-in user's ID as Firebase persisted it in this browser (IndexedDB). */
export function readUid(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
          const all = db
            .transaction('firebaseLocalStorage')
            .objectStore('firebaseLocalStorage')
            .getAll();
          all.onerror = () => resolve(null);
          all.onsuccess = () => {
            const rows = all.result as { value?: { uid?: string } }[];
            resolve(rows.map((row) => row.value?.uid).find(Boolean) ?? null);
          };
        };
      }),
  );
}

/** Waits until a user is signed in and returns their ID. */
export async function signedInUid(page: Page): Promise<string> {
  await expect.poll(() => readUid(page), { message: 'a signed-in user' }).not.toBeNull();
  return (await readUid(page))!;
}

type Value = Record<string, unknown>;

function plain(value: Value): unknown {
  const [type, inner] = Object.entries(value)[0] ?? [];
  if (type === 'mapValue') {
    const fields = ((inner as { fields?: Record<string, Value> }).fields ?? {}) as Record<
      string,
      Value
    >;
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, plain(v)]));
  }
  if (type === 'integerValue') return Number(inner);
  return inner;
}

/** users/{uid} read with emulator admin rights, or null when it doesn't exist. */
export async function readProfile(uid: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (response.status === 404) return null;
  const doc = (await response.json()) as { fields?: Record<string, Value> };
  return plain({ mapValue: { fields: doc.fields ?? {} } }) as Record<string, unknown>;
}

/** Opens the email-verification link the Auth emulator "sent" to this address. */
export async function verifyEmailInEmulator(email: string): Promise<void> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
      const { oobCodes } = (await response.json()) as {
        oobCodes: { email: string; requestType: string; oobLink: string }[];
      };
      link = oobCodes.find((c) => c.email === email && c.requestType === 'VERIFY_EMAIL')?.oobLink;
      return link;
    })
    .toBeTruthy();
  const response = await fetch(link!);
  expect(response.ok).toBe(true);
}

function encode(value: unknown): Value {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  const fields = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)]),
  );
  return { mapValue: { fields } };
}

const documents = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Writes a document with emulator admin rights (bypassing the rules). */
export async function writeDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const { mapValue } = encode(data) as { mapValue: { fields: Record<string, Value> } };
  const response = await fetch(`${documents}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: mapValue.fields }),
  });
  expect(response.ok, await response.text()).toBe(true);
}

export async function docExists(path: string): Promise<boolean> {
  const response = await fetch(`${documents}/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  return response.ok;
}

/** A tree owned by `uid`, as `createTree` would write it, without its people. */
export async function seedTree(
  uid: string,
  treeId: string,
  { name, personCount = 0 }: { name: string; personCount?: number },
): Promise<void> {
  const now = new Date();
  await writeDoc(`trees/${treeId}`, {
    name,
    ownerId: uid,
    memberIds: [uid],
    roles: { [uid]: 'owner' },
    personCount,
    settings: {
      nameDisplay: 'auto',
      colorBy: 'branch',
      showPhotos: true,
      showDates: true,
      defaultView: 'tree',
      kinshipStyle: 'bd',
    },
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
    schemaVersion: 1,
  });
}

/** Creates an email/password account in the Auth emulator and returns its ID. */
export async function createAccount(email: string, password: string): Promise<string> {
  const response = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = (await response.json()) as { localId: string };
  expect(response.ok).toBe(true);
  return data.localId;
}

/** Whether the Auth emulator still has this user. */
export async function authUserExists(uid: string): Promise<boolean> {
  const response = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: [uid] }),
    },
  );
  const data = (await response.json()) as { users?: unknown[] };
  return (data.users ?? []).length > 0;
}
