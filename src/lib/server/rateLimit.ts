import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import type { ID } from '@/lib/domain/types';
import { getAdminDb } from '@/lib/firebase/admin';

import { HttpError } from './http';

export interface RateLimit {
  limit: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

/** Only endpoints that cost money or are sensitive are limited (DESIGN §10.3). */
export const RATE_LIMITS = {
  mergeTicket: { limit: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>;

/**
 * Counts a request in `rateLimits/{name}:{uid}:{windowStart}` and refuses it with
 * `rate_limited` once the window's limit is reached. The cron purges old windows (R2).
 */
export async function enforceRateLimit(
  name: keyof typeof RATE_LIMITS,
  uid: ID,
  { limit, windowMs }: RateLimit = RATE_LIMITS[name],
  now: number = Date.now(),
): Promise<void> {
  const db = getAdminDb();
  const windowStart = now - (now % windowMs);
  const ref = db.collection('rateLimits').doc(`${name}:${uid}:${windowStart}`);
  const allowed = await db.runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).get('count') as number | undefined) ?? 0;
    if (count >= limit) return false;
    tx.set(
      ref,
      {
        uid,
        count: FieldValue.increment(1),
        expiresAt: Timestamp.fromMillis(windowStart + windowMs),
      },
      { merge: true },
    );
    return true;
  });
  if (!allowed) throw new HttpError('rate_limited', 'Too many requests. Try again later.');
}
