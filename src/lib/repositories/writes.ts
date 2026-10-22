import {
  collection,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

import { isFieldOp, MAX_BATCH_OPS, type WriteOp } from '@/lib/domain/writes';
import { getFirebaseClient } from '@/lib/firebase/client';

const defaultDb = (): Firestore => getFirebaseClient().db;

/** A new document ID made on the device, so writes work offline (DESIGN §11.3). */
export function newId(db: Firestore = defaultDb()): string {
  return doc(collection(db, 'ids')).id;
}

/** Turns plain write values (dates, field operations) into Firestore values. */
export function toFirestoreValue(value: unknown): unknown {
  if (isFieldOp(value)) {
    switch (value.fieldOp) {
      case 'serverTime':
        return serverTimestamp();
      case 'increment':
        return increment(value.by);
      case 'deleteField':
        return deleteField();
      default: {
        const unknown: never = value;
        throw new Error(`Unknown field operation ${JSON.stringify(unknown)}`);
      }
    }
  }
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toFirestoreValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestoreValue(v)]));
  }
  return value;
}

function addToBatch(batch: ReturnType<typeof writeBatch>, db: Firestore, op: WriteOp): void {
  const ref = doc(db, op.path);
  if (op.op === 'delete') batch.delete(ref);
  else if (op.op === 'set') batch.set(ref, toFirestoreValue(op.data) as Record<string, unknown>);
  else batch.update(ref, toFirestoreValue(op.data) as Record<string, unknown>);
}

/**
 * Writes `ops` atomically in one batch. The UI never awaits this: Firestore applies the
 * writes to listeners at once and syncs later, even offline. The promise settles when the
 * server accepts or rejects them.
 */
export function commitBatch(ops: readonly WriteOp[], db: Firestore = defaultDb()): Promise<void> {
  if (ops.length > MAX_BATCH_OPS) {
    return Promise.reject(
      new Error(`A batch holds at most ${MAX_BATCH_OPS} writes; got ${ops.length}.`),
    );
  }
  const batch = writeBatch(db);
  for (const op of ops) addToBatch(batch, db, op);
  return batch.commit();
}

/**
 * Writes `ops` in batches of at most MAX_BATCH_OPS, in order. Not atomic as a whole, so
 * only for imports and server-side bulk work, never for undoable commands.
 */
export async function commitInChunks(
  ops: readonly WriteOp[],
  db: Firestore = defaultDb(),
): Promise<void> {
  for (let start = 0; start < ops.length; start += MAX_BATCH_OPS) {
    await commitBatch(ops.slice(start, start + MAX_BATCH_OPS), db);
  }
}
