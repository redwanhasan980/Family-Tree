import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  decisionFor,
  MERGE_TICKET_TTL_MS,
  type MergeDecision,
  type MergeResult,
  type MergeTicketResponse,
} from '@/lib/domain/account';
import type { ID } from '@/lib/domain/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

import { deleteUserData } from './account';
import { HttpError } from './http';
import { listOwnedTrees, readTree, recursiveDeleteTree, transferTrees } from './treeAdmin';

/**
 * Guest merge (AUTH-06/07, DESIGN §9.4). A guest creates a ticket before signing in to an
 * existing account; that account then redeems it to move or discard the guest's trees.
 */

interface TicketDoc {
  guestUid: ID;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  used: boolean;
  /** Set when the merge starts: only this account can finish it. */
  claimedBy?: ID;
  /** The guest's trees and the decisions when the merge started, reused by retries. */
  treeIds?: ID[];
  decisions?: MergeDecision[];
  result?: MergeResult;
}

const tickets = () => getAdminDb().collection('mergeTickets');

export async function createMergeTicket(
  guestUid: ID,
  now: Date = new Date(),
): Promise<MergeTicketResponse> {
  const ref = tickets().doc();
  const expiresAt = new Date(now.getTime() + MERGE_TICKET_TTL_MS);
  const ticket: TicketDoc = {
    guestUid,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    used: false,
  };
  await ref.set(ticket);
  return { ticketId: ref.id, expiresAt: expiresAt.toISOString() };
}

/** The guest must still be anonymous: a guest that became an account is never merged away. */
async function assertStillGuest(guestUid: ID): Promise<void> {
  try {
    const user = await getAdminAuth().getUser(guestUid);
    if (user.providerData.length > 0) {
      throw new HttpError('conflict', 'The guest has since become a registered account.');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    // An already deleted guest counts as merged: finish whatever is left.
    if (code !== 'auth/user-not-found') throw error;
  }
}

/**
 * Moves or discards the guest's trees for account `uid`, then deletes the guest.
 * Idempotent: a finished ticket returns its result again, and an interrupted merge picks
 * up where it stopped with the decisions it started with.
 */
export async function redeemMergeTicket(
  ticketId: ID,
  uid: ID,
  decisions: readonly MergeDecision[],
  now: Date = new Date(),
): Promise<MergeResult> {
  const db = getAdminDb();
  const ref = tickets().doc(ticketId);
  const first = (await ref.get()).data() as TicketDoc | undefined;
  if (!first) throw new HttpError('not_found', 'Unknown merge ticket.');
  if (first.guestUid === uid) throw new HttpError('conflict', 'A guest cannot merge into itself.');
  if (!first.claimedBy) await assertStillGuest(first.guestUid);
  const ownedNow = first.claimedBy ? [] : await listOwnedTrees(first.guestUid);

  type Claim = { result: MergeResult } | { treeIds: ID[]; decisions: MergeDecision[] };
  const claim = await db.runTransaction(async (tx): Promise<Claim> => {
    const ticket = (await tx.get(ref)).data() as TicketDoc | undefined;
    if (!ticket) throw new HttpError('not_found', 'Unknown merge ticket.');
    if (ticket.claimedBy && ticket.claimedBy !== uid) {
      throw new HttpError('conflict', 'The ticket was used by another account.');
    }
    if (ticket.result) return { result: ticket.result };
    if (ticket.claimedBy) {
      return { treeIds: ticket.treeIds ?? [], decisions: ticket.decisions ?? [] };
    }
    if (ticket.expiresAt.toMillis() <= now.getTime()) {
      throw new HttpError('expired', 'The merge ticket has expired.');
    }
    const treeIds = ownedNow.map((tree) => tree.id);
    const kept = decisions.map(({ treeId, action }) => ({ treeId, action }));
    tx.update(ref, { claimedBy: uid, treeIds, decisions: kept });
    return { treeIds, decisions: kept };
  });
  if ('result' in claim) return claim.result;

  const result: MergeResult = { moved: [], discarded: [] };
  for (const treeId of claim.treeIds) {
    if (decisionFor(claim.decisions, treeId) === 'discard') {
      await recursiveDeleteTree(treeId);
      result.discarded.push(treeId);
      continue;
    }
    const moved =
      (await transferTrees(first.guestUid, uid, [treeId])).length > 0 ||
      // A retry finds trees an earlier attempt already moved.
      (await readTree(treeId))?.ownerId === uid;
    if (moved) result.moved.push(treeId);
  }
  await deleteUserData(first.guestUid, { keepMergeTickets: true });
  await ref.update({ used: true, result });
  return result;
}
