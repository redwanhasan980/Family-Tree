import { describe, expect, it } from 'vitest';

import { isValidId, parentLinkId, parseLinkId, spouseLinkId, spousePair } from './ids';

describe('relationship IDs', () => {
  it('builds parent links as p_{parent}_{child}', () => {
    expect(parentLinkId('dad1', 'kid2')).toBe('p_dad1_kid2');
  });

  it('builds the same spouse link whichever partner comes first', () => {
    expect(spouseLinkId('zed', 'amy')).toBe('s_amy_zed');
    expect(spouseLinkId('amy', 'zed')).toBe('s_amy_zed');
    expect(spousePair('b2', 'B1')).toEqual(['B1', 'b2']);
  });

  it('refuses IDs that could break the format', () => {
    expect(isValidId('Ab3xYz')).toBe(true);
    for (const bad of ['', 'a_b', 'a/b', 'ক', 'x'.repeat(41)]) {
      expect(isValidId(bad)).toBe(false);
      expect(() => parentLinkId(bad, 'kid')).toThrow();
      expect(() => spouseLinkId('kid', bad)).toThrow();
    }
  });

  it('parses IDs back into their parts', () => {
    expect(parseLinkId('p_dad_kid')).toEqual({ type: 'parent', parentId: 'dad', childId: 'kid' });
    expect(parseLinkId('s_amy_zed')).toEqual({ type: 'spouse', personIds: ['amy', 'zed'] });
    expect(parseLinkId('s_zed_amy')).toBeNull();
    expect(parseLinkId('x_a_b')).toBeNull();
    expect(parseLinkId('p_a')).toBeNull();
  });
});
