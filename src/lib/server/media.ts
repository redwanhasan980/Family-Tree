import 'server-only';

import {
  parsePhotoId,
  type MediaDeleteRequest,
  type MediaDeleteResult,
  type MediaSignRequest,
  type SignedUpload,
} from '@/lib/domain/media';
import type { ID } from '@/lib/domain/types';
import { paths } from '@/lib/domain/writes';
import { getAdminDb } from '@/lib/firebase/admin';

import { deleteAssets, requireCloudinary, signUpload } from './cloudinary';
import { HttpError } from './http';
import { enforceRateLimit } from './rateLimit';
import { readTree } from './treeAdmin';

/** Owners and editors may change photos (MED-07). A tree they can't see reads as missing. */
async function requireEditor(uid: ID, treeId: ID): Promise<void> {
  const tree = await readTree(treeId);
  if (!tree || !tree.memberIds.includes(uid)) throw new HttpError('not_found', 'No such tree.');
  const role = tree.roles[uid];
  if (role !== 'owner' && role !== 'editor') {
    throw new HttpError('forbidden', 'Only owners and editors can change photos.');
  }
}

/** Signs one upload for a person who exists in a tree the user can edit. */
export async function signPhotoUpload(
  uid: ID,
  { treeId, personId }: MediaSignRequest,
): Promise<SignedUpload> {
  const config = requireCloudinary();
  await requireEditor(uid, treeId);
  const person = await getAdminDb().doc(paths.person(treeId, personId)).get();
  if (!person.exists) throw new HttpError('not_found', 'No such person.');
  await enforceRateLimit('mediaSign', uid);
  return signUpload(config, { treeId, personId });
}

/**
 * Deletes photos of a tree the user can edit. Every ID must belong to that tree, and a
 * photo that is someone's current photo again (an undo brought it back) is kept.
 */
export async function deletePhotos(
  uid: ID,
  { treeId, publicIds }: MediaDeleteRequest,
): Promise<MediaDeleteResult> {
  const config = requireCloudinary();
  await requireEditor(uid, treeId);
  const unique = [...new Set(publicIds)];
  const parsed = unique.map(parsePhotoId);
  if (parsed.some((path) => !path || path.env !== config.env || path.treeId !== treeId)) {
    throw new HttpError('invalid_request', 'Photo IDs must belong to this tree.');
  }
  await enforceRateLimit('mediaDelete', uid);
  const db = getAdminDb();
  const personIds = [...new Set(parsed.map((path) => path!.personId))];
  const persons = await db.getAll(...personIds.map((id) => db.doc(paths.person(treeId, id))));
  const current = new Set(persons.map((doc) => doc.get('photo.publicId') as unknown));
  const inUse = unique.filter((id) => current.has(id));
  const unused = unique.filter((id) => !current.has(id));
  return { deleted: unused.length > 0 ? await deleteAssets(config, unused) : [], inUse };
}
