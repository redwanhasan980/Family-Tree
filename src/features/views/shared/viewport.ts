/** The camera: translate (x, y), then scale k, as d3-zoom reports it. */
export interface CameraTransform {
  x: number;
  y: number;
  k: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const IDENTITY: CameraTransform = { x: 0, y: 0, k: 1 };

/** Layout coordinates on screen, plus a margin so cards appear before they scroll in. */
export function visibleRect(
  { x, y, k }: CameraTransform,
  size: { width: number; height: number },
  margin = 200,
): Rect {
  return {
    minX: (-x - margin) / k,
    minY: (-y - margin) / k,
    maxX: (size.width - x + margin) / k,
    maxY: (size.height - y + margin) / k,
  };
}

export function intersects(box: { x: number; y: number; w: number; h: number }, rect: Rect) {
  return (
    box.x + box.w >= rect.minX &&
    box.x <= rect.maxX &&
    box.y + box.h >= rect.minY &&
    box.y <= rect.maxY
  );
}

/**
 * The transform that fits `bounds` into the viewport with padding, never zooming in
 * beyond `maxScale` (a one-person tree shouldn't fill the screen).
 */
export function fitTransform(
  bounds: Rect,
  size: { width: number; height: number },
  { padding = 48, minScale = 0.1, maxScale = 1 } = {},
): CameraTransform {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const k = Math.min(
    maxScale,
    Math.max(minScale, Math.min((size.width - padding * 2) / w, (size.height - padding * 2) / h)),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { x: size.width / 2 - cx * k, y: size.height / 2 - cy * k, k };
}

/** The transform that puts a point in the middle of the viewport at scale k. */
export function centreTransform(
  point: { x: number; y: number },
  size: { width: number; height: number },
  k: number,
): CameraTransform {
  return { x: size.width / 2 - point.x * k, y: size.height / 2 - point.y * k, k };
}

/**
 * Where the camera starts: the whole tree when it is readable at `minScale` or more;
 * otherwise `minScale` with the focus person near the top (or the left, sideways), so a
 * big tree opens at its start rather than as specks.
 */
export function initialView(
  bounds: Rect,
  size: { width: number; height: number },
  anchor: { x: number; y: number },
  {
    minScale,
    horizontal = false,
    padding = 48,
  }: { minScale: number; horizontal?: boolean; padding?: number },
): CameraTransform {
  const fit = fitTransform(bounds, size, { padding, minScale: 0, maxScale: 1 });
  if (fit.k >= minScale) return fit;
  const k = minScale;
  return horizontal
    ? { k, x: padding - anchor.x * k, y: size.height / 2 - anchor.y * k }
    : { k, x: size.width / 2 - anchor.x * k, y: padding - anchor.y * k };
}
