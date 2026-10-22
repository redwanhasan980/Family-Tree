import 'server-only';

import { getAdminAppCheck, getAdminAuth, usesEmulators } from '@/lib/firebase/admin';

import { HttpError } from './http';

import type { DecodedIdToken } from 'firebase-admin/auth';

export interface VerifiedRequest {
  uid: string;
  isGuest: boolean;
  token: DecodedIdToken;
}

function bearerToken(request: Request): string {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match?.[1]) throw new HttpError('unauthenticated', 'Missing bearer token.');
  return match[1];
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

/**
 * App Check (NFR-SEC-05). Skipped with the emulators. Required once the client has a
 * reCAPTCHA site key, because from then on every genuine request carries a token.
 */
async function verifyAppCheck(request: Request): Promise<void> {
  if (usesEmulators()) return;
  const token = request.headers.get('x-firebase-appcheck');
  if (!token) {
    if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
      throw new HttpError('unauthenticated', 'Missing App Check token.');
    }
    return;
  }
  try {
    await getAdminAppCheck().verifyToken(token);
  } catch {
    throw new HttpError('unauthenticated', 'Invalid App Check token.');
  }
}

/**
 * Every Route Handler except /api/health starts here (CLAUDE.md rule 8): checks App Check
 * and the Firebase ID token (including revocation). Guests are refused unless allowed.
 */
export async function verifyRequest(
  request: Request,
  options: { allowGuest?: boolean } = {},
): Promise<VerifiedRequest> {
  const idToken = bearerToken(request);
  await verifyAppCheck(request);

  let token: DecodedIdToken;
  try {
    token = await getAdminAuth().verifyIdToken(idToken, true);
  } catch (error) {
    // Bad, expired or revoked tokens are the caller's problem; anything else is ours.
    const code = codeOf(error);
    if (code.startsWith('auth/') && code !== 'auth/internal-error') {
      throw new HttpError('unauthenticated', 'Invalid or expired ID token.');
    }
    throw error;
  }

  const isGuest = token.firebase.sign_in_provider === 'anonymous';
  if (isGuest && !options.allowGuest) {
    throw new HttpError('guest_not_allowed', 'This action needs a registered account.');
  }
  return { uid: token.uid, isGuest, token };
}
