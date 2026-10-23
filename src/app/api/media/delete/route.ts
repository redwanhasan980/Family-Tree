import { MediaDeleteRequestSchema } from '@/lib/domain/media';
import { verifyRequest } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { deletePhotos } from '@/lib/server/media';

/** Deletes replaced or removed photos once the undo window has passed (MED-05). */
export const POST = route('media.delete', async (request) => {
  const { uid } = await verifyRequest(request, { allowGuest: true });
  const body = await readJson(request, MediaDeleteRequestSchema);
  return json(await deletePhotos(uid, body));
});
