import type { Size } from './geometry';
import type { Measure } from '../views/shared/measureText';

/** The texts around an exported drawing (EXP-03, DESIGN §14). Empty strings are left out. */
export interface FrameText {
  title: string;
  subtitle: string;
  /** "Exported on 24 October 2026", or empty. */
  date: string;
  /** "Made with শিকড়". */
  credit: string;
  legend: readonly { key: string; label: string }[];
}

export interface Placed {
  x: number;
  y: number;
}

export interface FrameLayout extends Size {
  /** Where the drawing's top left goes. */
  content: Placed;
  title: Placed | null;
  subtitle: Placed | null;
  legend: (Placed & { key: string })[];
  /** The footer's baseline, and where the credit ends (it is right-aligned). */
  footer: { y: number; dateX: number; creditX: number };
}

export const FRAME = {
  pad: 40,
  minWidth: 480,
  title: { size: 28, line: 40 },
  subtitle: { size: 16, line: 26 },
  legend: { size: 13, line: 24, swatch: 14, gap: 6, between: 22 },
  footer: { size: 12, line: 20 },
  gap: 20,
} as const;

/**
 * Lays out the header (title, subtitle, legend), the drawing and the footer. The frame
 * grows to fit a long title rather than squeezing it, and the legend wraps.
 */
export function layoutFrame(
  content: Size,
  text: FrameText,
  measure: Measure,
  family: string,
): FrameLayout {
  const { pad, gap } = FRAME;
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  const titleW = text.title ? measure(text.title, font(600, FRAME.title.size)) : 0;
  const subtitleW = text.subtitle ? measure(text.subtitle, font(400, FRAME.subtitle.size)) : 0;
  const inner = Math.max(content.w, titleW, subtitleW, FRAME.minWidth);
  const width = inner + 2 * pad;

  let y = pad;
  const title = text.title ? { x: pad, y: y + FRAME.title.size } : null;
  if (title) y += FRAME.title.line;
  const subtitle = text.subtitle ? { x: pad, y: y + FRAME.subtitle.size } : null;
  if (subtitle) y += FRAME.subtitle.line;

  const legend: FrameLayout['legend'] = [];
  if (text.legend.length > 0) {
    if (title || subtitle) y += gap / 2;
    const { size, line, swatch, gap: swatchGap, between } = FRAME.legend;
    let x = pad;
    for (const entry of text.legend) {
      const w = swatch + swatchGap + measure(entry.label, font(400, size));
      if (x > pad && x + w > pad + inner) {
        x = pad;
        y += line;
      }
      legend.push({ key: entry.key, x, y });
      x += w + between;
    }
    y += line;
  }
  if (title || subtitle || legend.length > 0) y += gap;

  const contentAt = { x: pad + (inner - content.w) / 2, y };
  y += content.h + gap;
  const footerY = y + FRAME.footer.size;
  const height = y + FRAME.footer.line + pad / 2;
  return {
    w: width,
    h: height,
    content: contentAt,
    title,
    subtitle,
    legend,
    footer: { y: footerY, dateX: pad, creditX: width - pad },
  };
}
