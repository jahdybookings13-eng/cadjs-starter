// Thin extrude for an open profile. The sketch pipeline only emits closed
// faces, so an open chain is turned into a closed ribbon polygon here: offset
// the polyline by half the wall thickness to both sides in the sketch plane,
// then join the two sides into one loop. The extrude kernel sees a normal face
// and the wall is the solid itself (no inner subtraction).

export interface RibbonPoint {
  x: number;
  y: number;
  z: number;
}

function dedupe(points: RibbonPoint[]): RibbonPoint[] {
  const out: RibbonPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (
      last &&
      Math.abs(last.x - p.x) < 1e-9 &&
      Math.abs(last.y - p.y) < 1e-9 &&
      Math.abs(last.z - p.z) < 1e-9
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Build the wall cross-section of an open chain: left side forward, right side
 * back. Returns [] when the chain or thickness is unusable.
 */
export function ribbonPolygon(
  points: RibbonPoint[],
  thickness: number,
  normal?: [number, number, number] | undefined,
): RibbonPoint[] {
  const clean = dedupe(points);
  if (clean.length < 2 || !(thickness > 0)) return [];
  const raw = normal ?? [0, 0, 1];
  const nl = Math.hypot(raw[0], raw[1], raw[2]) || 1;
  const nx = raw[0] / nl;
  const ny = raw[1] / nl;
  const nz = raw[2] / nl;
  const half = thickness / 2;
  const left: RibbonPoint[] = [];
  const right: RibbonPoint[] = [];
  for (let i = 0; i < clean.length; i++) {
    const p = clean[i]!;
    const prev = clean[Math.max(0, i - 1)]!;
    const next = clean[Math.min(clean.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tz = next.z - prev.z;
    // In-plane perpendicular = plane normal x tangent.
    let sx = ny * tz - nz * ty;
    let sy = nz * tx - nx * tz;
    let sz = nx * ty - ny * tx;
    const sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-12) continue;
    sx = (sx / sl) * half;
    sy = (sy / sl) * half;
    sz = (sz / sl) * half;
    left.push({ x: p.x + sx, y: p.y + sy, z: p.z + sz });
    right.push({ x: p.x - sx, y: p.y - sy, z: p.z - sz });
  }
  if (left.length < 2) return [];
  // Close the loop across the start cap; the end cap is closed by the two
  // consecutive points at the middle of the list.
  return [...left, ...right.reverse(), left[0]!];
}
