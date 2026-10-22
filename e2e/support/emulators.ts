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
