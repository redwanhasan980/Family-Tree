import { paths, type WriteOp } from '@/lib/domain/writes';

import { touchTree } from './build';

import type { CommandContext } from './types';

/** How often edits that leave the tree document alone still move its "last change". */
export const TOUCH_INTERVAL_MS = 60_000;

/**
 * Adds a tree "touch" to batches that don't write the tree document, at most once a
 * minute per tree (DESIGN §7.3), so the dashboard's "last change" follows detail edits
 * without a tree write for every keystroke. Batches that already touch the tree reset
 * the clock.
 */
export function createTreeToucher(now: () => number = Date.now) {
  const last = new Map<string, number>();
  return (ops: readonly WriteOp[], ctx: Pick<CommandContext, 'treeId' | 'actorId'>): WriteOp[] => {
    const time = now();
    const writesTree = ops.some((op) => op.path === paths.tree(ctx.treeId));
    if (!writesTree && time - (last.get(ctx.treeId) ?? -Infinity) < TOUCH_INTERVAL_MS) {
      return [...ops];
    }
    last.set(ctx.treeId, time);
    return writesTree ? [...ops] : [...ops, touchTree(ctx)];
  };
}
