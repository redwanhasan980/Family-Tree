'use client';

import { useCallback } from 'react';

import { useSession } from '@/features/auth/SessionProvider';
import { hasUser } from '@/lib/domain/auth/session';
import type { ID } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { setSelfPerson } from '@/lib/repositories/users';
import { useTree } from '@/stores/treeStore';

/**
 * Who the signed-in user is in the open tree ("This is me", PER-10): one person per tree,
 * kept in their profile so it follows them to other devices.
 */
export function useSelfPerson(): { selfId: ID | null; setSelf: (personId: ID | null) => void } {
  const { session, profile } = useSession();
  const treeId = useTree((s) => s.treeId);
  const selfId = (treeId && profile?.selfPersonIds[treeId]) || null;
  const user = hasUser(session) ? session.user : null;
  const isGuest = session.status === 'guest';
  const setSelf = useCallback(
    (personId: ID | null) => {
      if (!user || !treeId) return;
      // Not awaited: the profile listener shows the change at once, even offline.
      setSelfPerson(user.uid, isGuest, treeId, personId).catch((error: unknown) =>
        logger.error('profile.self', error),
      );
    },
    [user, isGuest, treeId],
  );
  return { selfId, setSelf };
}
