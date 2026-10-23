import { MediaSignRequestSchema } from '@/lib/domain/media';
import { verifyRequest } from '@/lib/server/auth';
import { json, readJson, route } from '@/lib/server/http';
import { signPhotoUpload } from '@/lib/server/media';

/** Signs a photo upload for a person; the browser then uploads to Cloudinary (MED-07). */
export const POST = route('media.sign', async (request) => {
  const { uid } = await verifyRequest(request, { allowGuest: true });
  const body = await readJson(request, MediaSignRequestSchema);
  return json(await signPhotoUpload(uid, body));
});
