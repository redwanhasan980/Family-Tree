import { describe, expect, it } from 'vitest';

import { DELETE_FIELD, increment, isFieldOp, paths, SERVER_TIME } from './writes';

describe('write values', () => {
  it('marks field operations so they can’t be confused with data', () => {
    expect(isFieldOp(SERVER_TIME)).toBe(true);
    expect(isFieldOp(DELETE_FIELD)).toBe(true);
    expect(increment(-2)).toEqual({ fieldOp: 'increment', by: -2 });
    expect(isFieldOp({ year: 1990 })).toBe(false);
    expect(isFieldOp(null)).toBe(false);
    expect(Object.isFrozen(SERVER_TIME)).toBe(true);
  });

  it('builds document paths', () => {
    expect(paths.tree('t1')).toBe('trees/t1');
    expect(paths.persons('t1')).toBe('trees/t1/persons');
    expect(paths.person('t1', 'p1')).toBe('trees/t1/persons/p1');
    expect(paths.relationships('t1')).toBe('trees/t1/relationships');
    expect(paths.relationship('t1', 'p_a_b')).toBe('trees/t1/relationships/p_a_b');
  });
});
