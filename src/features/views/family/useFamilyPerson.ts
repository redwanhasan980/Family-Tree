'use client';

import { useMemo } from 'react';

import type { ID } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { useUi } from '@/stores/uiStore';

import { startingPerson } from '../shared/focus';

/**
 * Whose family the Family card shows: the one opened there, else the person the views
 * start from (FC-02, FC-06). `start` is the tree's start, for the breadcrumb.
 */
export function useFamilyPerson(): { personId: ID | undefined; start: ID | null } {
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const familySetting = useUi((s) => s.familyId);
  const focusSetting = useUi((s) => s.focusId);
  const start = useMemo(() => startingPerson(graph, rootId), [graph, rootId]);
  const personId = [familySetting, focusSetting, start].find(
    (id): id is ID => id !== null && graph.persons.has(id),
  );
  return { personId, start };
}
