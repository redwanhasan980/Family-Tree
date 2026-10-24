import { describe, expect, it } from 'vitest';

import {
  canvasLimits,
  clampScale,
  fitScale,
  MARGIN_MM,
  MM_PER_PX,
  OVERLAP_MM,
  pageSize,
  planTiles,
  printedPt,
  rasterScale,
} from './geometry';

describe('clampScale (EXP-06)', () => {
  it('keeps the wanted scale when the canvas fits', () => {
    expect(clampScale({ w: 1000, h: 800 }, 2, canvasLimits(false))).toBe(2);
  });

  it('stays under 16.7 MP on iOS and 16,384 px a side everywhere', () => {
    const ios = canvasLimits(true);
    const scale = clampScale({ w: 6000, h: 4000 }, 3, ios);
    expect(6000 * scale * 4000 * scale).toBeLessThanOrEqual(ios.maxPixels + 1);
    const wide = clampScale({ w: 20_000, h: 100 }, 2, canvasLimits(false));
    expect(20_000 * wide).toBeLessThanOrEqual(16_384);
    expect(clampScale({ w: 0, h: 0 }, 2, ios)).toBe(2);
  });
});

describe('pageSize', () => {
  it('turns paper for wide scenes when automatic', () => {
    expect(pageSize('a4', 'auto', { w: 2000, h: 900 })).toEqual({ w: 297, h: 210 });
    expect(pageSize('a4', 'auto', { w: 500, h: 900 })).toEqual({ w: 210, h: 297 });
    expect(pageSize('letter', 'landscape', { w: 1, h: 2 })).toEqual({ w: 279.4, h: 215.9 });
    expect(pageSize('a3', 'portrait', { w: 2, h: 1 })).toEqual({ w: 297, h: 420 });
  });

  it('fits everything on one page at natural size, within the PDF limit', () => {
    const page = pageSize('fit', 'auto', { w: 960, h: 480 });
    expect(page.w).toBeCloseTo(960 * MM_PER_PX + 2 * MARGIN_MM);
    expect(page.h).toBeCloseTo(480 * MM_PER_PX + 2 * MARGIN_MM);
    const huge = pageSize('fit', 'auto', { w: 100_000, h: 1000 });
    expect(huge.w).toBeCloseTo(5080);
    expect(huge.h).toBeLessThan(5080);
  });
});

describe('fitting and text size', () => {
  it('shrinks a big tree onto A4, and says how small names get', () => {
    const scene = { w: 4000, h: 1500 };
    const page = pageSize('a4', 'auto', scene);
    const k = fitScale(scene, page);
    expect(scene.w * k).toBeCloseTo(page.w - 2 * MARGIN_MM);
    expect(scene.h * k).toBeLessThan(page.h - 2 * MARGIN_MM);
    // 14 px names at natural size are 10.5 pt; shrunk to fit they are below 6 pt.
    expect(printedPt(14, MM_PER_PX)).toBeCloseTo(10.5);
    expect(printedPt(14, k)).toBeLessThan(6);
  });
});

describe('planTiles (EXP-06)', () => {
  it('uses one page when the scene fits', () => {
    const tiles = planTiles({ w: 500, h: 400 }, { w: 297, h: 210 });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, row: 0, col: 0 });
  });

  it('covers the scene row by row, with overlapping neighbours', () => {
    const page = { w: 297, h: 210 };
    const tileW = (297 - 2 * MARGIN_MM) / MM_PER_PX;
    const tileH = (210 - 2 * MARGIN_MM) / MM_PER_PX;
    const overlap = OVERLAP_MM / MM_PER_PX;
    const scene = { w: tileW * 2.5, h: tileH * 1.2 };
    const tiles = planTiles(scene, page);
    expect(tiles.map((t) => [t.row, t.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    expect(tiles[1]!.x).toBeCloseTo(tileW - overlap);
    const last = tiles.at(-1)!;
    expect(last.x + last.w).toBeGreaterThanOrEqual(scene.w);
    expect(last.y + last.h).toBeGreaterThanOrEqual(scene.h);
  });
});

describe('rasterScale', () => {
  it('aims at the dpi, never above the quality', () => {
    // 200 mm of paper at 150 dpi is about 1181 px; a 4000 px scene needs a 0.3 scale.
    expect(rasterScale(4000, 200, 150, 2)).toBeCloseTo(0.295, 2);
    expect(rasterScale(400, 200, 150, 2)).toBe(2);
  });
});
