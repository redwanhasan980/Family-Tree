'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { treeStatistics } from '@/lib/domain/graph';
import {
  invitesUpgrade,
  isMilestone,
  reachedMilestone,
  type Milestone,
  type TreeSize,
} from '@/lib/domain/milestones';
import type { ID } from '@/lib/domain/types';
import { selectGraph, treeStore, type TreeState } from '@/stores/treeStore';

import { burstConfetti } from './confetti';

const CELEBRATED_KEY = 'shikor:celebrated';

// Which milestones each tree has had, in this browser, so undo and redo don't repeat them.
function readAll(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CELEBRATED_KEY) ?? '{}');
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function celebrated(treeId: ID): Milestone[] {
  const list = readAll()[treeId];
  return Array.isArray(list) ? list.filter(isMilestone) : [];
}

function markCelebrated(treeId: ID, milestone: Milestone): void {
  try {
    const all = readAll();
    all[treeId] = [...celebrated(treeId), milestone];
    window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(all));
  } catch {
    // Without storage a milestone may be celebrated again later; harmless.
  }
}

function measure(state: TreeState): TreeSize {
  const { people, generations } = treeStatistics(selectGraph(state), state.tree?.rootPersonId);
  return { people, generations };
}

/**
 * Watches the open tree grow through this person's own changes: celebrates 10, 50 and
 * 100 people and 5 generations (UX-04), and returns whether a change brought it to five
 * people, which invites a guest to sign up (AUTH-03). Their own changes are the ones
 * that arrive with writes still pending; a collaborator's arrive confirmed.
 */
export function useTreeGrowth(treeId: ID): boolean {
  const t = useTranslations('celebrate');
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    let before: TreeSize | null = null;
    let version = -1;
    const check = (state: TreeState) => {
      if (state.treeId !== treeId || state.status !== 'ready' || state.version === version) return;
      version = state.version;
      const after = measure(state);
      const previous = before;
      before = after;
      if (!previous || !(state.pending.persons || state.pending.relationships)) return;
      if (invitesUpgrade(previous, after)) setGrown(true);
      const milestone = reachedMilestone(previous, after, celebrated(treeId));
      if (!milestone) return;
      markCelebrated(treeId, milestone);
      toast.success(t(milestone));
      burstConfetti();
    };
    check(treeStore.getState());
    return treeStore.subscribe(check);
  }, [treeId, t]);

  return grown;
}
