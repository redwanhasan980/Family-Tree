'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { errorCode } from '@/lib/domain/auth/errors';
import type { ID } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import {
  readTreeFromCache,
  subscribePersons,
  subscribeRelationships,
  subscribeTree,
} from '@/lib/repositories/trees';
import { historyStore } from '@/stores/historyStore';
import {
  selectSaveStatus,
  treeStore,
  useTree,
  type SaveStatus,
  type TreeStatus,
} from '@/stores/treeStore';

/**
 * Opens a tree for editing (DESIGN §11.2): shows the device's cached copy at once, then
 * keeps people, relationships and the tree document in sync with three listeners. Undo
 * history starts fresh for each tree.
 */
export function useTreeSession(treeId: ID): { status: TreeStatus; errorCode: string | null } {
  useEffect(() => {
    const store = treeStore.getState();
    store.open(treeId);
    historyStore.getState().clear();
    let active = true;

    readTreeFromCache(treeId)
      .then((cached) => {
        if (active && cached) treeStore.getState().hydrate(cached);
      })
      .catch(() => undefined);

    const onError = (error: unknown) => {
      logger.warn('tree.listen', { code: errorCode(error) });
      if (active) treeStore.getState().fail(errorCode(error));
    };
    const stops = [
      subscribeTree(treeId, (tree, meta) => treeStore.getState().applyTree(tree, meta), onError),
      subscribePersons(
        treeId,
        (changes, meta) => treeStore.getState().applyPersons(changes, meta),
        onError,
      ),
      subscribeRelationships(
        treeId,
        (changes, meta) => treeStore.getState().applyRelationships(changes, meta),
        onError,
      ),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
      treeStore.getState().close();
    };
  }, [treeId]);

  const status = useTree((s) => s.status);
  const code = useTree((s) => s.errorCode);
  return { status, errorCode: code };
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser thinks it is online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** "Saving…", "Saved" or "Offline" for the open tree (TREE-07). */
export function useSaveStatus(): SaveStatus {
  const online = useOnline();
  return useTree((state) => selectSaveStatus(state, online));
}
