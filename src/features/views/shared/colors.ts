import type { ColorBy, Gender } from '@/lib/domain/types';

/**
 * The colour-by accent of a card or arc (VIS-06, DESIGN §21.3), as a CSS variable so
 * light and dark themes apply. Only accents use it; text keeps the text tokens.
 */

export const BRANCH_SLOTS = 8;
const GENERATION_STEPS = 9;
export const NEUTRAL = 'var(--data-neutral)';

/** Branch 0 is the first child's. Branches past the eighth are neutral, never a new hue. */
export function branchColor(branch: number | null): string {
  if (branch === null || branch >= BRANCH_SLOTS) return NEUTRAL;
  return `var(--branch-${branch + 1})`;
}

/** Generation 0 is the focus person; the ramp runs light-to-dark and then holds. */
export function generationColor(generation: number): string {
  return `var(--gen-${Math.min(Math.max(generation, 0), GENERATION_STEPS - 1) + 1})`;
}

export function genderColor(gender: Gender): string {
  if (gender === 'male') return 'var(--branch-1)';
  if (gender === 'female') return 'var(--branch-2)';
  return NEUTRAL;
}

export interface ColorFacts {
  branch: number | null;
  generation: number;
  gender: Gender;
}

/** The accent for a card, or null for "no colour". */
export function accentColor(colorBy: ColorBy, facts: ColorFacts): string | null {
  switch (colorBy) {
    case 'branch':
      return branchColor(facts.branch);
    case 'generation':
      return generationColor(facts.generation);
    case 'gender':
      return genderColor(facts.gender);
    case 'none':
      return null;
    default: {
      const unknown: never = colorBy;
      throw new Error(`Unknown colour setting ${String(unknown)}`);
    }
  }
}
