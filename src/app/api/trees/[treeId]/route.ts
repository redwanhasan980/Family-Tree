import { isValidId } from '@/lib/domain/ids';
import { verifyRequest } from '@/lib/server/auth';
import { HttpError, json, route } from '@/lib/server/http';
import { readTree, recursiveDeleteTree } from '@/lib/server/treeAdmin';

interface Context {
  params: Promise<{ treeId: string }>;
}

/**
 * Deletes a tree with everything inside it (TREE-03). Only the owner may. A tree the
 * caller can't see reads as missing, as in the security rules.
 */
export const DELETE = route('trees.delete', async (request, { params }: Context) => {
  const { uid } = await verifyRequest(request, { allowGuest: true });
  const { treeId } = await params;
  if (!isValidId(treeId)) throw new HttpError('invalid_request', 'Invalid tree ID.');
  const tree = await readTree(treeId);
  if (!tree || !tree.memberIds.includes(uid)) throw new HttpError('not_found', 'No such tree.');
  if (tree.ownerId !== uid) throw new HttpError('forbidden', 'Only the owner can delete a tree.');
  await recursiveDeleteTree(treeId);
  return json({ ok: true });
});
