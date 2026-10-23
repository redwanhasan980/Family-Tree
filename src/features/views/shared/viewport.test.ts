import { describe, expect, it } from 'vitest';

import { centreTransform, fitTransform, initialView, intersects, visibleRect } from './viewport';

const screen = { width: 800, height: 600 };

describe('viewport maths', () => {
  it('turns the camera into the visible layout area, with a margin', () => {
    expect(visibleRect({ x: 0, y: 0, k: 1 }, screen, 0)).toEqual({
      minX: -0,
      minY: -0,
      maxX: 800,
      maxY: 600,
    });
    expect(visibleRect({ x: -100, y: 50, k: 2 }, screen, 0)).toEqual({
      minX: 50,
      minY: -25,
      maxX: 450,
      maxY: 275,
    });
    const rect = visibleRect({ x: 0, y: 0, k: 1 }, screen);
    expect(intersects({ x: 900, y: 0, w: 10, h: 10 }, rect)).toBe(true);
    expect(intersects({ x: 1100, y: 0, w: 10, h: 10 }, rect)).toBe(false);
  });

  it('fits a tree into the screen without zooming past 100%', () => {
    const wide = fitTransform({ minX: 0, minY: 0, maxX: 2000, maxY: 300 }, screen, { padding: 0 });
    expect(wide.k).toBeCloseTo(0.4);
    expect(wide.x + 1000 * wide.k).toBeCloseTo(400);
    const tiny = fitTransform({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, screen);
    expect(tiny.k).toBe(1);
    const huge = fitTransform({ minX: 0, minY: 0, maxX: 1e6, maxY: 10 }, screen);
    expect(huge.k).toBe(0.1);
  });

  it('centres a point', () => {
    expect(centreTransform({ x: 100, y: 100 }, screen, 2)).toEqual({ x: 200, y: 100, k: 2 });
  });

  it('starts big trees at the focus person instead of shrinking them to specks', () => {
    const small = { minX: 0, minY: 0, maxX: 600, maxY: 400 };
    expect(initialView(small, screen, { x: 300, y: 0 }, { minScale: 0.5 })).toEqual(
      fitTransform(small, screen, { maxScale: 1 }),
    );
    const wide = { minX: -5000, minY: 0, maxX: 5000, maxY: 800 };
    expect(initialView(wide, screen, { x: 0, y: 0 }, { minScale: 0.5 })).toEqual({
      k: 0.5,
      x: 400,
      y: 48,
    });
    expect(
      initialView(wide, screen, { x: 0, y: 100 }, { minScale: 0.5, horizontal: true }),
    ).toEqual({ k: 0.5, x: 48, y: 250 });
  });
});
