'use client';

import { useCallback, useEffect, useState } from 'react';

import { errorCode } from '@/lib/domain/auth/errors';
import type { ID, Person, Tree } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { readPerson, subscribeMyTrees } from '@/lib/repositories/trees';

export type MyTrees =
  { status: 'loading' } | { status: 'ready'; trees: Tree[] } | { status: 'error'; code: string };

/** The user's trees, live, most recently updated first (TREE-02). */
export function useMyTrees(uid: ID | null): MyTrees & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; value: MyTrees } | null>(null);
  const key = `${uid ?? ''}:${attempt}`;

  useEffect(() => {
    if (!uid) return;
    return subscribeMyTrees(
      uid,
      (trees) => setState({ key, value: { status: 'ready', trees } }),
      (error) => {
        logger.warn('trees.list', { code: errorCode(error) });
        setState({ key, value: { status: 'error', code: errorCode(error) } });
      },
    );
  }, [uid, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value: MyTrees = state?.key === key ? state.value : { status: 'loading' };
  return { ...value, retry };
}

/** A tree's root person for its dashboard card, read from the device cache when possible. */
export function useRootPerson(tree: Tree): Person | null {
  const [loaded, setLoaded] = useState<{ key: string; person: Person | null } | null>(null);
  const key = `${tree.id}/${tree.rootPersonId ?? ''}/${tree.updatedAt.getTime()}`;
  const { id, rootPersonId } = tree;

  useEffect(() => {
    if (!rootPersonId) return;
    let active = true;
    void readPerson(id, rootPersonId).then((person) => {
      if (active) setLoaded({ key, person });
    });
    return () => {
      active = false;
    };
  }, [id, rootPersonId, key]);

  // Keep showing the last person while a newer copy loads.
  if (!rootPersonId) return null;
  return loaded?.person?.id === rootPersonId ? loaded.person : null;
}
