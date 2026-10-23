import { describe, expect, it } from 'vitest';

import { createTreeToucher, TOUCH_INTERVAL_MS } from './touch';

const ctx = { treeId: 't1', actorId: 'u1' };
const personEdit = [
  { op: 'update' as const, path: 'trees/t1/persons/p1', data: { nickname: 'K' } },
];
const treeEdit = [{ op: 'update' as const, path: 'trees/t1', data: { name: 'N' } }];

describe('tree touch (DESIGN §7.3)', () => {
  it('touches the tree at most once a minute for edits that leave it alone', () => {
    let now = 1_000_000;
    const touch = createTreeToucher(() => now);
    const first = touch(personEdit, ctx);
    expect(first).toHaveLength(2);
    expect(first[1]).toMatchObject({
      op: 'update',
      path: 'trees/t1',
      data: { updatedBy: 'u1' },
    });
    expect(Object.keys(first[1]!.op === 'update' ? first[1]!.data : {})).not.toContain(
      'personCount',
    );

    now += TOUCH_INTERVAL_MS - 1;
    expect(touch(personEdit, ctx)).toHaveLength(1);
    now += 1;
    expect(touch(personEdit, ctx)).toHaveLength(2);
  });

  it('counts batches that write the tree themselves, and keeps trees apart', () => {
    let now = 0;
    const touch = createTreeToucher(() => now);
    expect(touch(treeEdit, ctx)).toEqual(treeEdit);
    now += 1000;
    expect(touch(personEdit, ctx)).toHaveLength(1);
    const other = [{ op: 'delete' as const, path: 'trees/t2/persons/p9' }];
    expect(touch(other, { treeId: 't2', actorId: 'u1' })).toHaveLength(2);
  });
});
