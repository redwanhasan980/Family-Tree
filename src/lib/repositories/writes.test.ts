import {
  deleteField,
  increment as fsIncrement,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import {
  DELETE_FIELD,
  increment,
  MAX_BATCH_OPS,
  SERVER_TIME,
  type WriteOp,
} from '@/lib/domain/writes';

import { commitBatch, toFirestoreValue } from './writes';

describe('toFirestoreValue', () => {
  it('turns field operations, dates and nested values into Firestore values', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const value = toFirestoreValue({
      updatedAt: SERVER_TIME,
      personCount: increment(3),
      nickname: DELETE_FIELD,
      createdAt: at,
      birth: { date: { year: 1931 } },
      phones: ['1'],
      photo: null,
    }) as Record<string, { isEqual?: (other: unknown) => boolean }>;
    expect(value.updatedAt!.isEqual!(serverTimestamp())).toBe(true);
    expect(value.personCount!.isEqual!(fsIncrement(3))).toBe(true);
    expect(value.nickname!.isEqual!(deleteField())).toBe(true);
    expect(value.createdAt).toEqual(Timestamp.fromDate(at));
    expect(value.birth).toEqual({ date: { year: 1931 } });
    expect(value.phones).toEqual(['1']);
    expect(value.photo).toBeNull();
  });
});

describe('commitBatch', () => {
  it('refuses more writes than one batch may hold', async () => {
    const ops: WriteOp[] = Array.from({ length: MAX_BATCH_OPS + 1 }, (_, i) => ({
      op: 'delete',
      path: `x/${i}`,
    }));
    await expect(commitBatch(ops, {} as Firestore)).rejects.toThrow(/at most 450/);
  });
});
