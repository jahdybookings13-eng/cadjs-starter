// Pure 2D geometry for PCB layout, DRC and fabrication. Millimetres, y-up.
// No allocation-heavy libraries: these run in the browser on every edit.

import type { Pt } from "./types";

export function rotatePt(p: Pt, deg: number, cx = 0, cy = 0): Pt {
  if (!deg) return { x: cx + p.x, y: cy + p.y };
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineSegments(points: readonly Pt[]): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) out.push([a, b]);
  }
  return out;
}

export function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (const [a, b] of polylineSegments(points)) total += dist(a, b);
  return total;
}

/** Distance from a point to a segment. */
export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSeg(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a.x, b.x) - 1e-9 <= p.x &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= p.y &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

export function segsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (
    ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
    ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
  )
    return true;
  if (Math.abs(o1) < 1e-9 && onSeg(a, b, c)) return true;
  if (Math.abs(o2) < 1e-9 && onSeg(a, b, d)) return true;
  if (Math.abs(o3) < 1e-9 && onSeg(c, d, a)) return true;
  if (Math.abs(o4) < 1e-9 && onSeg(c, d, b)) return true;
  return false;
}

/** Minimum distance between two segments (0 when they cross). */
export function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegDist(a, c, d),
    pointSegDist(b, c, d),
    pointSegDist(c, a, b),
    pointSegDist(d, a, b),
  );
}

export function pointInPoly(p: Pt, poly: readonly Pt[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function rectCorners(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotationDeg = 0,
): Pt[] {
  const hw = w / 2;
  const hh = h / 2;
  const local: Pt[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => rotatePt(p, rotationDeg, -cx, -cy));
}

/** Distance between two convex polygons (0 when they overlap/touch). */
export function polyPolyDist(a: readonly Pt[], b: readonly Pt[]): number {
  if (a.length < 3 || b.length < 3) return Infinity;
  if (a.some((p) => pointInPoly(p, b)) || b.some((p) => pointInPoly(p, a)))
    return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      const d = segSegDist(a1, a2, b1, b2);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

export function segPolyDist(a: Pt, b: Pt, poly: readonly Pt[]): number {
  if (poly.length < 3) return Infinity;
  if (pointInPoly(a, poly) || pointInPoly(b, poly)) return 0;
  for (let i = 0; i < poly.length; i += 1) {
    const c = poly[i]!;
    const d = poly[(i + 1) % poly.length]!;
    if (segsIntersect(a, b, c, d)) return 0;
  }
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const c = poly[i]!;
    const d = poly[(i + 1) % poly.length]!;
    best = Math.min(best, segSegDist(a, b, c, d));
  }
  return best;
}

export function bboxOfPoints(points: readonly Pt[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function aabbOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
  );
}

/** Drop collinear interior points so traces stay compact. */
export function simplifyPoints(points: readonly Pt[], eps = 1e-6): Pt[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Pt[] = [{ x: points[0]!.x, y: points[0]!.y }];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const cross =
      (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) > eps) out.push({ x: cur.x, y: cur.y });
  }
  const last = points[points.length - 1]!;
  out.push({ x: last.x, y: last.y });
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatMM(value: number, digits = 3): string {
  return value.toFixed(digits);
}
