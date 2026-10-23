import { describe, expect, it } from 'vitest';

import { accentColor, branchColor, generationColor, NEUTRAL } from './colors';

describe('accent colours (DESIGN §21.3)', () => {
  it('uses eight branch hues in order, then the neutral', () => {
    expect(branchColor(0)).toBe('var(--branch-1)');
    expect(branchColor(7)).toBe('var(--branch-8)');
    expect(branchColor(8)).toBe(NEUTRAL);
    expect(branchColor(null)).toBe(NEUTRAL);
  });

  it('steps through the generation ramp and holds at the end', () => {
    expect(generationColor(0)).toBe('var(--gen-1)');
    expect(generationColor(20)).toBe('var(--gen-9)');
  });

  it('follows the tree setting', () => {
    const facts = { branch: 2, generation: 1, gender: 'female' as const };
    expect(accentColor('branch', facts)).toBe('var(--branch-3)');
    expect(accentColor('generation', facts)).toBe('var(--gen-2)');
    expect(accentColor('gender', facts)).toBe('var(--branch-2)');
    expect(accentColor('gender', { ...facts, gender: 'unknown' })).toBe(NEUTRAL);
    expect(accentColor('none', facts)).toBe(null);
  });
});
