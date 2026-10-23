import { z } from 'zod';

import { IdSchema, LIMITS } from './schemas';

import type { ID } from './types';

/**
 * Shapes shared by the account Route Handlers and the browser (DESIGN §9.4, §9.6, §10.2):
 * request schemas, responses, and the pending merge kept in localStorage.
 */

/** A merge ticket can be redeemed for a day after it was created. */
export const MERGE_TICKET_TTL_MS = 24 * 60 * 60 * 1000;
/** Deleting a permanent account needs a sign-in within the last five minutes. */
export const RECENT_LOGIN_MS = 5 * 60 * 1000;

export type MergeAction = 'move' | 'discard';

export interface MergeDecision {
  treeId: ID;
  action: MergeAction;
}

export const MergeTicketRequestSchema = z.strictObject({});

export const MergeRequestSchema = z.strictObject({
  ticketId: IdSchema,
  decisions: z
    .array(z.strictObject({ treeId: IdSchema, action: z.enum(['move', 'discard']) }))
    .max(LIMITS.treesPerUser),
});

export const DeleteAccountRequestSchema = z.strictObject({ confirm: z.literal(true) });

export interface MergeTicketResponse {
  ticketId: string;
  /** ISO 8601. */
  expiresAt: string;
}

export interface MergeResult {
  moved: ID[];
  discarded: ID[];
}

/** A guest tree as the merge dialog shows it. Read before signing in, while still allowed. */
export interface GuestTreeSummary {
  id: ID;
  name: string;
  personCount: number;
}

/** Remembered between creating a ticket and merging, so a closed tab can resume. */
export interface PendingMerge {
  ticketId: string;
  expiresAt: string;
  /** The guest the ticket belongs to, so a retried sign-in reuses it. */
  guestUid: string;
  trees: GuestTreeSummary[];
}

export const PENDING_MERGE_KEY = 'shikor:pendingMerge';

const PendingMergeSchema = z.object({
  ticketId: IdSchema,
  expiresAt: z.iso.datetime(),
  guestUid: z.string().min(1),
  trees: z
    .array(
      z.object({
        id: IdSchema,
        name: z.string(),
        personCount: z.int().nonnegative(),
      }),
    )
    .min(1),
});

/** The stored pending merge, or null when there is none, it is malformed or it expired. */
export function parsePendingMerge(raw: string | null, now: Date): PendingMerge | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = PendingMergeSchema.safeParse(value);
  if (!parsed.success) return null;
  return new Date(parsed.data.expiresAt) > now ? parsed.data : null;
}

/** Whether a token's `auth_time` (seconds) is recent enough for account deletion. */
export function isRecentLogin(authTimeSeconds: number, now: Date): boolean {
  return now.getTime() - authTimeSeconds * 1000 <= RECENT_LOGIN_MS;
}

/** What happens to a guest tree. Trees without a decision are moved (the AUTH-07 default). */
export function decisionFor(decisions: readonly MergeDecision[], treeId: ID): MergeAction {
  return decisions.find((d) => d.treeId === treeId)?.action ?? 'move';
}
