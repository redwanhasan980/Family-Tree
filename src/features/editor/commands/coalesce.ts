import type { WriteOp } from '@/lib/domain/writes';

import type { Command } from './types';

type UpdateOp = Extract<WriteOp, { op: 'update' }>;

const singleUpdate = (ops: readonly WriteOp[]): UpdateOp | null =>
  ops.length === 1 && ops[0]!.op === 'update' ? ops[0]! : null;

/** Whether `later` can merge into `earlier` (same field-edit key, same single document). */
export function canCoalesce(earlier: Command, later: Command): boolean {
  if (!earlier.coalesceKey || earlier.coalesceKey !== later.coalesceKey) return false;
  const [a, b] = [singleUpdate(earlier.forward), singleUpdate(later.forward)];
  return (
    a !== null &&
    b !== null &&
    a.path === b.path &&
    singleUpdate(earlier.inverse) !== null &&
    singleUpdate(later.inverse) !== null
  );
}

/**
 * One undo step for two quick edits of the same person (DESIGN §11.3): the later values
 * win going forward, and undo restores the values from before the first edit.
 */
export function coalesce(earlier: Command, later: Command): Command {
  const forward = singleUpdate(earlier.forward)!;
  const inverse = singleUpdate(earlier.inverse)!;
  return {
    ...later,
    id: earlier.id,
    forward: [{ ...forward, data: { ...forward.data, ...singleUpdate(later.forward)!.data } }],
    inverse: [{ ...inverse, data: { ...singleUpdate(later.inverse)!.data, ...inverse.data } }],
  };
}
