'use client';

import { useEffect, useEffectEvent, useMemo } from 'react';

import { buildDescendantTree, type DescNode, type FamilyGraph } from '@/lib/domain/graph';
import type { ID, ViewKind } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { initialCollapsed } from './collapse';
import { planReveal, startingPerson } from './focus';

export interface DescendantView {
  graph: FamilyGraph;
  /** Where the tree starts (its root). */
  start: ID | null;
  /** Who the view shows descendants of: the focus, else the start. */
  focusId: ID | null;
  collapsed: ReadonlySet<string>;
  descTree: DescNode | null;
}

/**
 * The descendants a view shows (Tree, List, Circle): from the shared focus, with this
 * view's own collapsed branches. Without a saved state, big trees open a few
 * generations deep (DESIGN §13.1).
 */
export function useDescendantView(view: ViewKind): DescendantView {
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const focusSetting = useUi((s) => s.focusId);
  const saved = useUi((s) => s.collapsed[view]);

  const start = useMemo(() => startingPerson(graph, rootId), [graph, rootId]);
  const focusId = focusSetting && graph.persons.has(focusSetting) ? focusSetting : start;
  const collapsed = useMemo(() => {
    if (saved) return new Set(saved);
    const full = focusId ? buildDescendantTree(graph, focusId) : null;
    return new Set(full ? initialCollapsed(full) : []);
  }, [saved, graph, focusId]);
  const descTree = useMemo(
    () => (focusId ? buildDescendantTree(graph, focusId, { collapsed }) : null),
    [graph, focusId, collapsed],
  );
  return { graph, start, focusId, collapsed, descTree };
}

/**
 * Answers "Find someone" (VIS-04) in a descendant view: changes the focus if needed,
 * opens the branches on the way, then calls `onReveal` so the view can bring the person
 * into sight once they are laid out.
 */
export function useRevealRequest(
  view: ViewKind,
  { graph, focusId, start }: Pick<DescendantView, 'graph' | 'focusId' | 'start'>,
  onReveal: (personId: ID) => void,
): void {
  const revealRequest = useUi((s) => s.revealRequest);
  const revealed = useEffectEvent(onReveal);
  useEffect(() => {
    if (!revealRequest) return;
    const ui = uiStore.getState();
    ui.revealDone();
    const plan = planReveal(graph, revealRequest.personId, focusId, start, ui.collapsed[view]);
    if (!plan) return;
    if (plan.from !== focusId) ui.focus(plan.from === start ? null : plan.from);
    if (plan.collapsed) ui.setCollapsed(view, plan.collapsed);
    revealed(revealRequest.personId);
  }, [revealRequest, graph, focusId, start, view]);
}
