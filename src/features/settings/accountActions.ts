import { callApi } from '@/lib/repositories/api';
import { reauthenticate, signOutUser } from '@/lib/repositories/auth';

/**
 * Deletes the signed-in user's account and everything they own on the server (AUTH-12),
 * or a guest's data (AUTH-10), then signs out. Permanent users confirm it's them first:
 * with their password, or with Google when `password` is undefined.
 */
export async function deleteMyAccount({
  guest,
  password,
}: {
  guest: boolean;
  password?: string;
}): Promise<void> {
  if (!guest) await reauthenticate(password);
  await callApi('/api/account/delete', { body: { confirm: true } });
  await signOutUser();
}
