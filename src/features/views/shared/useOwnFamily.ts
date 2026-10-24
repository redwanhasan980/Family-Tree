'use client';

import { useMemo } from 'react';

import { goToFamily } from '@/features/views/family/goToFamily';
import type { ID } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { ownFamilyParent, startingPerson } from './focus';

/**
 * "Show [spouse]'s family" (VIS-08): null unless the person married into the family the
 * views show and their parents are in the tree. The Family card opens their family; the
 * other views start from their parent and centre on them.
 */
export function useOwnFamily(personId: ID | null): (() => void) | null {
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const focusId = useUi((s) => s.focusId);
  const parentId = useMemo(() => {
    if (!personId) return null;
    const from = focusId && graph.persons.has(focusId) ? focusId : startingPerson(graph, rootId);
    return ownFamilyParent(graph, personId, from);
  }, [graph, rootId, focusId, personId]);
  if (!personId || !parentId) return null;
  return () => {
    const ui = uiStore.getState();
    if (ui.view === 'family') {
      goToFamily(personId);
      return;
    }
    ui.focus(parentId);
    ui.reveal(personId);
  };
}
