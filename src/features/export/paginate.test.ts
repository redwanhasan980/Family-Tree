import { describe, expect, it } from 'vitest';

import { paginate } from './paginate';

describe('paginate (P7-04, the List export)', () => {
  it('fills pages in order, with less room on the first', () => {
    expect(paginate([40, 40, 40, 40, 40], 100, 60)).toEqual([[0], [1, 2], [3, 4]]);
  });

  it('never splits a row, and gives an oversized row its own page', () => {
    expect(paginate([30, 250, 30], 100, 100)).toEqual([[0], [1], [2]]);
  });

  it('makes one empty page for an empty list', () => {
    expect(paginate([], 100, 80)).toEqual([[]]);
  });
});
