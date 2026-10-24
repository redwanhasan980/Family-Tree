import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrastRatio, readTokens } from './contrast';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

// [foreground token, background token, minimum ratio] — WCAG 2.2 AA (DESIGN §21.2).
const TEXT = 4.5;
const UI = 3;
const PAIRS: [string, string, number][] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'surface', TEXT],
  ['foreground', 'surface-muted', TEXT],
  ['card-foreground', 'card', TEXT],
  ['popover-foreground', 'popover', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'surface', TEXT],
  ['muted-foreground', 'surface-muted', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['secondary-foreground', 'secondary', TEXT],
  ['accent-foreground', 'accent', TEXT],
  ['highlight-foreground', 'highlight', TEXT],
  ['destructive', 'background', TEXT],
  ['success', 'background', TEXT],
  ['warning', 'background', TEXT],
  ['primary', 'background', UI],
  ['ring', 'background', UI],
];

describe.each([
  ['light', '[data-export]'],
  ['dark', '.dark'],
])('%s theme tokens', (_theme, selector) => {
  const tokens = readTokens(css, selector);

  it.each(PAIRS)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(contrastRatio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

describe('contrastRatio', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('red', '#ffffff')).toThrow();
  });
});

describe('readTokens', () => {
  it('fails loudly for an unknown selector', () => {
    expect(() => readTokens(css, '.missing')).toThrow();
  });
});
