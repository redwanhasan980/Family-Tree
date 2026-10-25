import type { Orientation, TreeLayout } from './layout';

/** Where one generation's cards sit along the depth axis (y down, or x across). */
export interface GenerationBand {
  /** 0 for the focus person's generation. */
  depth: number;
  start: number;
  end: number;
}

/** The generations of a laid-out tree, in order, for labels along the side (TV-10). */
export function generationBands(layout: TreeLayout, orientation: Orientation): GenerationBand[] {
  const bands = new Map<number, GenerationBand>();
  for (const card of layout.cards) {
    const start = orientation === 'vertical' ? card.y : card.x;
    const end = start + (orientation === 'vertical' ? card.h : card.w);
    const band = bands.get(card.depth);
    if (!band) bands.set(card.depth, { depth: card.depth, start, end });
    else {
      band.start = Math.min(band.start, start);
      band.end = Math.max(band.end, end);
    }
  }
  return [...bands.values()].sort((a, b) => a.depth - b.depth);
}
