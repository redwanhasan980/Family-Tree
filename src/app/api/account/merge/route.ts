import { MergeRequestSchema } from '@/lib/domain/account';
import { verifyRequest } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { redeemMergeTicket } from '@/lib/server/merge';

/** The account the guest signed in to moves or discards the guest's trees (AUTH-07). */
export const POST = route('account.merge', async (request) => {
  const { uid } = await verifyRequest(request);
  const { ticketId, decisions } = await readJson(request, MergeRequestSchema);
  return json(await redeemMergeTicket(ticketId, uid, decisions));
});
