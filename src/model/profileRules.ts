// Closed-profile rules shared by extrude and revolve. The kernel consumes a
// triangle soup, so this module checks the two failures that otherwise become
// generic OCC errors: zero-area sketches and self-intersecting chains.
import { chainPathLoops, type PathPoint } from "./sweepPath";

interface ProfiledBrep {
  faces: Array<{ vertices: Array<{ x: number; y: number; z: number }> }>;
}

interface ProfileSnapshot {
  plane: {
    origin: number[];
    xAxis: number[];
    yAxis: number[];
  };
  primitives: unknown[];
}

type FeatureName = "extrude" | "revolve";

const EPS = 1e-9;

function triangleArea(a: PathPoint, b: PathPoint, c: PathPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

/** Total triangulated area of a profile in square document units. */
export function profileFaceArea(brep: ProfiledBrep): number {
  let area = 0;
  for (const face of brep.faces) {
    const v = face.vertices;
    for (let i = 1; i + 1 < v.length; i++) {
      area += triangleArea(v[0]!, v[i]!, v[i + 1]!);
    }
  }
  return area;
}

function to2d(p: PathPoint, snap: ProfileSnapshot): { x: number; y: number } {
  const o = snap.plane.origin;
  const ax = snap.plane.xAxis;
  const ay = snap.plane.yAxis;
  const dx = p.x - (o[0] ?? 0);
  const dy = p.y - (o[1] ?? 0);
  const dz = p.z - (o[2] ?? 0);
  return {
    x: dx * (ax[0] ?? 0) + dy * (ax[1] ?? 0) + dz * (ax[2] ?? 0),
    y: dx * (ay[0] ?? 0) + dy * (ay[1] ?? 0) + dz * (ay[2] ?? 0),
  };
}

const cross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function properlyCrosses(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  // Only a proper crossing counts: sharing a vertex (the normal case at every
  // polygon corner) must not be reported as self-intersection.
  const o1 = cross(a, b, c);
  const o2 = cross(a, b, d);
  const o3 = cross(c, d, a);
  const o4 = cross(c, d, b);
  return (
    ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
    ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))
  );
}

function loopSelfIntersects(
  world: PathPoint[],
  snapshot: ProfileSnapshot,
): boolean {
  if (world.length < 4) return false;
  const points = world.map((p) => to2d(p, snapshot));
  // chainPathLoops repeats the start point for circles and closed chains.
  if (
    Math.hypot(
      points[0]!.x - points[points.length - 1]!.x,
      points[0]!.y - points[points.length - 1]!.y,
    ) < 1e-7
  )
    points.pop();
  if (points.length < 4) return false;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges (including the closing edge) meet at a vertex.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = points[j]!;
      const d = points[(j + 1) % n]!;
      if (properlyCrosses(a, b, c, d)) return true;
    }
  }
  return false;
}

/** True when any sampled loop crosses itself away from its vertices. */
export function profileSelfIntersects(snapshot: ProfileSnapshot): boolean {
  return chainPathLoops(snapshot).some((loop) =>
    loopSelfIntersects(loop, snapshot),
  );
}

/**
 * Named failure for a closed profile, or null when it is usable. Open profiles
 * are reported by their callers because thin extrude is a legal open path.
 */
export function profileRuleError(
  feature: FeatureName,
  brep: ProfiledBrep,
  snapshot?: ProfileSnapshot | null,
): string | null {
  if (brep.faces.length === 0) return null;
  if (!(profileFaceArea(brep) > 1e-12))
    return `${feature}: profile has zero area`;
  if (snapshot && profileSelfIntersects(snapshot))
    return `${feature}: profile is self-intersecting`;
  return null;
}
