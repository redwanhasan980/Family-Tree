/** WCAG 2.x relative luminance and contrast ratio for `#rrggbb` colours. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Expected #rrggbb, got "${hex}"`);
  const n = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads `--name: #hex;` declarations from one CSS rule block (for example `:root` or `.dark`). */
export function readTokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Selector "${selector}" not found`);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (name && value) tokens[name] = value.toLowerCase();
  }
  return tokens;
}
