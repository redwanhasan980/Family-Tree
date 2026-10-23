import { EMULATOR_PROJECT_ID } from '@/lib/firebase/config';

/**
 * Real ID tokens from the Auth emulator for Route Handler tests (*.emulator.test.ts),
 * through the emulator's REST API. Run under `pnpm test:rules`.
 */

const host = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const identity = (method: string) =>
  `http://${host()}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=emulator`;

export interface TestUser {
  uid: string;
  idToken: string;
}

async function post(method: string, body: Record<string, unknown>): Promise<TestUser> {
  const response = await fetch(identity(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const data = (await response.json()) as { localId: string; idToken: string };
  if (!response.ok) throw new Error(`Auth emulator ${method} failed: ${JSON.stringify(data)}`);
  return { uid: data.localId, idToken: data.idToken };
}

/** A new anonymous (guest) user. */
export const createGuestUser = () => post('signUp', {});

/** A new email/password user. */
export const createEmailUser = (email: string, password = 'password123') =>
  post('signUp', { email, password });

/** Signs in again, which gives a token with a fresh `auth_time`. */
export const signInEmailUser = (email: string, password = 'password123') =>
  post('signInWithPassword', { email, password });

/** Turns a guest into an email account, keeping the uid (AUTH-04). */
export const linkEmail = (idToken: string, email: string, password = 'password123') =>
  post('update', { idToken, email, password });

/** Deletes every user in the Auth emulator. */
export async function clearAuthEmulator(): Promise<void> {
  await fetch(`http://${host()}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
}

/** A request to a Route Handler as `user` (or anonymous when omitted). */
export function apiRequest(
  path: string,
  { user, body, method = 'POST' }: { user?: TestUser; body?: unknown; method?: string } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${user.idToken}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}
