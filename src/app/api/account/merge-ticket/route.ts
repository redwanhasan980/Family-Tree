import { MergeTicketRequestSchema } from '@/lib/domain/account';
import { verifyRequest } from '@/lib/server/auth';
import { HttpError, json, readJson, route } from '@/lib/server/http';
import { createMergeTicket } from '@/lib/server/merge';
import { enforceRateLimit } from '@/lib/server/rateLimit';

/** A guest about to sign in to an existing account asks for a merge ticket (DESIGN §9.4). */
export const POST = route('account.merge_ticket', async (request) => {
  const { uid, isGuest } = await verifyRequest(request, { allowGuest: true });
  if (!isGuest) throw new HttpError('forbidden', 'Only guests can create a merge ticket.');
  await readJson(request, MergeTicketRequestSchema);
  await enforceRateLimit('mergeTicket', uid);
  return json(await createMergeTicket(uid), { status: 201 });
});
