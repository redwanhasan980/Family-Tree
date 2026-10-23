/** A point as [x, y] (or [breadth, depth] inside a layout). */
export type Point = readonly [number, number];

const CORNER = 8;
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * An SVG path through axis-aligned points with rounded corners (connectors, §13.3).
 * Corners shrink when the segments are shorter than twice the radius.
 */
export function orthogonalPath(points: readonly Point[], radius = CORNER): string {
  const pts = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1],
  );
  if (pts.length === 0) return '';
  const [first] = pts as [Point];
  let d = `M${round(first[0])} ${round(first[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const corner = pts[i]!;
    const next = pts[i + 1]!;
    const inLen = Math.hypot(corner[0] - prev[0], corner[1] - prev[1]);
    const outLen = Math.hypot(next[0] - corner[0], next[1] - corner[1]);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const before: Point = [
      corner[0] - ((corner[0] - prev[0]) / inLen) * r,
      corner[1] - ((corner[1] - prev[1]) / inLen) * r,
    ];
    const after: Point = [
      corner[0] + ((next[0] - corner[0]) / outLen) * r,
      corner[1] + ((next[1] - corner[1]) / outLen) * r,
    ];
    d += ` L${round(before[0])} ${round(before[1])} Q${round(corner[0])} ${round(corner[1])} ${round(after[0])} ${round(after[1])}`;
  }
  if (pts.length > 1) {
    const last = pts[pts.length - 1]!;
    d += ` L${round(last[0])} ${round(last[1])}`;
  }
  return d;
}
