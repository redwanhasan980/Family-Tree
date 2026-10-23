import { DeleteAccountRequestSchema, isRecentLogin } from '@/lib/domain/account';
import { deleteUserData } from '@/lib/server/account';
import { verifyRequest } from '@/lib/server/auth';
import { HttpError, json, readJson, route } from '@/lib/server/http';

/**
 * Deletes the caller's account and everything they own (AUTH-12), or a guest's data
 * (AUTH-10). Permanent accounts must have signed in within the last five minutes.
 */
export const POST = route('account.delete', async (request) => {
  const { uid, isGuest, token } = await verifyRequest(request, { allowGuest: true });
  await readJson(request, DeleteAccountRequestSchema);
  if (!isGuest && !isRecentLogin(token.auth_time, new Date())) {
    throw new HttpError('reauth_required', 'Sign in again to delete the account.');
  }
  await deleteUserData(uid);
  return json({ ok: true });
});
