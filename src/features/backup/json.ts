import { photoUrl, photosEnabled } from '@/features/media/cloudinaryUrl';
import { APP_NAME } from '@/lib/brand';
import { buildBackup } from '@/lib/domain/backup';
import type { Person, Relationship, Tree } from '@/lib/domain/types';

import { deliverFile, exportFileName } from '../export/files';

/** The app's version, written into backups so a later import knows what made them. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

/**
 * Saves the whole tree as a JSON backup (BAK-01), guests included. Photos are kept as
 * references with a link to the full image. Resolves the file name, or null if the
 * share sheet was closed.
 */
export async function saveBackup(
  tree: Tree,
  persons: Iterable<Person>,
  relationships: Iterable<Relationship>,
): Promise<string | null> {
  const now = new Date();
  const backup = buildBackup({
    tree,
    persons,
    relationships,
    exportedAt: now,
    app: { name: APP_NAME, version: APP_VERSION },
    ...(photosEnabled() && { photoUrl: (photo) => photoUrl(photo, 'full') }),
  });
  const name = exportFileName(tree.name, 'backup', now, 'json');
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });
  return (await deliverFile(file, tree.name)) ? name : null;
}
