import type { ID } from './types';

/**
 * Database writes as plain data (DESIGN §11.3). Commands build them without touching
 * Firebase; `repositories/writes.ts` turns them into a Firestore batch. Values are plain
 * JSON-like data, `Date`s, or the field operations below.
 */

export type FieldOp =
  | { readonly fieldOp: 'serverTime' }
  | { readonly fieldOp: 'increment'; readonly by: number }
  | { readonly fieldOp: 'deleteField' };

/** The server's clock at commit time (Firestore `serverTimestamp()`). */
export const SERVER_TIME: FieldOp = Object.freeze({ fieldOp: 'serverTime' });
/** Removes a field in an update (Firestore `deleteField()`). */
export const DELETE_FIELD: FieldOp = Object.freeze({ fieldOp: 'deleteField' });

export function increment(by: number): FieldOp {
  return Object.freeze({ fieldOp: 'increment', by });
}

export function isFieldOp(value: unknown): value is FieldOp {
  return typeof value === 'object' && value !== null && 'fieldOp' in value;
}

export type WriteData = Record<string, unknown>;

/**
 * `set` replaces a whole document; `update` changes only the given fields, and dotted
 * keys ("names.en") address nested fields, so concurrent edits to different fields both
 * survive (DESIGN §20.4).
 */
export type WriteOp =
  | { op: 'set'; path: string; data: WriteData }
  | { op: 'update'; path: string; data: WriteData }
  | { op: 'delete'; path: string };

/** Firestore paths. Build them only here. */
export const paths = {
  tree: (treeId: ID) => `trees/${treeId}`,
  persons: (treeId: ID) => `trees/${treeId}/persons`,
  person: (treeId: ID, personId: ID) => `trees/${treeId}/persons/${personId}`,
  relationships: (treeId: ID) => `trees/${treeId}/relationships`,
  relationship: (treeId: ID, linkId: string) => `trees/${treeId}/relationships/${linkId}`,
};

/** The largest batch a single command may write; imports are split into batches of this size. */
export const MAX_BATCH_OPS = 450;
