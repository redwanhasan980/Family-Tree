/**
 * Export geometry (DESIGN §14): canvas limits, paper, fitting and PDF tiling. Pure, so
 * the arithmetic is unit-tested. Scenes are measured in CSS px; paper in mm.
 */

export type Paper = 'a4' | 'a3' | 'letter' | 'fit';
export type Orientation = 'auto' | 'portrait' | 'landscape';

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Portrait paper sizes in mm. */
export const PAPER_MM: Record<Exclude<Paper, 'fit'>, Size> = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  letter: { w: 215.9, h: 279.4 },
};

export const MARGIN_MM = 10;
/** Tiles overlap so a cut through a card can be glued back (DESIGN §14). */
export const OVERLAP_MM = 5;
/** CSS px at their natural print size: 96 per inch. */
export const MM_PER_PX = 25.4 / 96;
const MM_PER_PT = 25.4 / 72;
/** PDF pages can't be larger than 200 inches a side. */
const MAX_PAGE_MM = 5080;
/** Below this, names on paper are hard to read (DESIGN §14). */
export const MIN_READABLE_PT = 6;

export interface CanvasLimits {
  maxPixels: number;
  maxSide: number;
}

/** iOS Safari refuses canvases above 16.7 MP; other browsers allow much more. */
export function canvasLimits(ios: boolean): CanvasLimits {
  return { maxPixels: ios ? 16_777_216 : 100_000_000, maxSide: 16_384 };
}

/** The largest scale up to `wanted` at which a `size` scene fits in one canvas (EXP-06). */
export function clampScale(size: Size, wanted: number, limits: CanvasLimits): number {
  if (size.w <= 0 || size.h <= 0) return wanted;
  const byArea = Math.sqrt(limits.maxPixels / (size.w * size.h));
  const bySide = limits.maxSide / Math.max(size.w, size.h);
  return Math.min(wanted, byArea, bySide);
}

/** The page for a scene: landscape for wide scenes when the orientation is automatic. */
export function pageSize(paper: Paper, orientation: Orientation, scene: Size): Size {
  if (paper === 'fit') {
    // The scene at its natural size, with margins; shrunk if it's beyond what PDF allows.
    const w = scene.w * MM_PER_PX + 2 * MARGIN_MM;
    const h = scene.h * MM_PER_PX + 2 * MARGIN_MM;
    const k = Math.min(1, MAX_PAGE_MM / Math.max(w, h));
    return { w: w * k, h: h * k };
  }
  const { w, h } = PAPER_MM[paper];
  const landscape = orientation === 'auto' ? scene.w > scene.h : orientation === 'landscape';
  return landscape ? { w: h, h: w } : { w, h };
}

/** The printable part of a page, inside the margins. */
export function printableArea(page: Size): Size {
  return { w: page.w - 2 * MARGIN_MM, h: page.h - 2 * MARGIN_MM };
}

/** mm per scene px when the whole scene is fitted into the page's printable area. */
export function fitScale(scene: Size, page: Size): number {
  const area = printableArea(page);
  return Math.min(area.w / scene.w, area.h / scene.h);
}

/** How big text of `px` scene pixels ends up on paper at `mmPerPx`. */
export function printedPt(px: number, mmPerPx: number): number {
  return (px * mmPerPx) / MM_PER_PT;
}

export interface Tile extends Rect {
  row: number;
  col: number;
}

/**
 * Splits a scene into page-sized tiles at its natural print size (EXP-06): each tile is
 * the printable area, and neighbours overlap by OVERLAP_MM. Row by row, top left first.
 */
export function planTiles(scene: Size, page: Size): Tile[] {
  const area = printableArea(page);
  const tileW = area.w / MM_PER_PX;
  const tileH = area.h / MM_PER_PX;
  const overlap = OVERLAP_MM / MM_PER_PX;
  const count = (length: number, tile: number) =>
    length <= tile ? 1 : Math.ceil((length - overlap) / (tile - overlap));
  const cols = count(scene.w, tileW);
  const rows = count(scene.h, tileH);
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        row,
        col,
        x: col * (tileW - overlap),
        y: row * (tileH - overlap),
        w: tileW,
        h: tileH,
      });
    }
  }
  return tiles;
}

/**
 * The pixel scale for rasterizing `mm` of paper showing `px` scene pixels, aiming at
 * `dpi`, never above the scene's own `quality` scale: no point in drawing more pixels than
 * the scene can fill.
 */
export function rasterScale(px: number, mm: number, dpi: number, quality: number): number {
  return Math.min(quality, ((mm / 25.4) * dpi) / px);
}
