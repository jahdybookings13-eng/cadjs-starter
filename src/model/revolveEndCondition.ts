// Revolve end-condition solver — the angle at which a rotating profile first
// meets a reference face plane or vertex, measured around the revolve axis.
//
// source: onshapeHistory.ts endBound/endBoundEntity wire shape; the same query
// list the extrude end-reference picker writes.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type RevolveEndBound = "UP_TO_FACE" | "UP_TO_VERTEX";

export interface RevolveEndInput {
  endBound: RevolveEndBound;
  /** Profile vertices in world space. */
  profilePoints: Vec3[];
  /** Unit axis direction; the caller has already applied reverse direction. */
  axisDir: Vec3;
  axisOrigin: Vec3;
  /** Reference face polygon (world, ordered) for UP_TO_FACE. */
  face?: Vec3[] | undefined;
  /** Reference vertex (world) for UP_TO_VERTEX. */
  vertex?: Vec3 | undefined;
}

export type RevolveEndResult =
  | { ok: true; angle: number }
  | { ok: false; reason: string };

const EPS = 1e-9;
const TWO_PI = Math.PI * 2;

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));

function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n > EPS
    ? { x: a.x / n, y: a.y / n, z: a.z / n }
    : { x: 0, y: 0, z: 0 };
}

function projectOnPlane(v: Vec3, k: Vec3): Vec3 {
  const kv = dot(k, v);
  return { x: v.x - k.x * kv, y: v.y - k.y * kv, z: v.z - k.z * kv };
}

/** Rotate a point around an axis through the origin by `theta` (Rodrigues). */
function rotate(point: Vec3, k: Vec3, theta: number): Vec3 {
  const v = sub(point, { x: 0, y: 0, z: 0 });
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kv = dot(k, v);
  const kxv = cross(k, v);
  return {
    x: v.x * c + kxv.x * s + k.x * kv * (1 - c),
    y: v.y * c + kxv.y * s + k.y * kv * (1 - c),
    z: v.z * c + kxv.z * s + k.z * kv * (1 - c),
  };
}

function planeNormal(polygon: Vec3[]): Vec3 | null {
  if (polygon.length < 3) return null;
  const a = polygon[0]!;
  for (let i = 1; i < polygon.length - 1; i++) {
    const n = cross(sub(polygon[i]!, a), sub(polygon[i + 1]!, a));
    if (norm(n) > 1e-12) return normalize(n);
  }
  return null;
}

/** Is `point` inside the planar polygon? Projected 2D winding test. */
function pointInPolygon(point: Vec3, polygon: Vec3[], normal: Vec3): boolean {
  if (polygon.length < 3) return false;
  // Build an in-plane basis from the polygon plane.
  const u = normalize(sub(polygon[1]!, polygon[0]!));
  const v = cross(normal, u);
  const to2d = (p: Vec3) => {
    const d = sub(p, polygon[0]!);
    return { x: dot(d, u), y: dot(d, v) };
  };
  const p = to2d(point);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = to2d(polygon[i]!);
    const b = to2d(polygon[j]!);
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Smallest positive angle in (0, 2π] at which point rotates into the plane. */
function faceAngles(
  point: Vec3,
  axis: Vec3,
  normal: Vec3,
  d: number,
): number[] {
  const v = sub(point, { x: 0, y: 0, z: 0 });
  const nk = dot(normal, axis);
  const kv = dot(axis, v);
  const A = dot(normal, v) - nk * kv;
  const B = dot(normal, cross(axis, v));
  const C = d - nk * kv;
  const R = Math.hypot(A, B);
  if (R < EPS || Math.abs(C) > R + 1e-9) return [];
  const base = Math.atan2(B, A);
  const delta = Math.acos(Math.max(-1, Math.min(1, C / R)));
  const raw = [base + delta, base - delta];
  const out: number[] = [];
  for (const t of raw) {
    let angle = t;
    while (angle <= EPS) angle += TWO_PI;
    while (angle > TWO_PI + EPS) angle -= TWO_PI;
    if (angle > EPS && angle <= TWO_PI + EPS) out.push(Math.min(angle, TWO_PI));
  }
  return out;
}

export function solveRevolveEndAngle(input: RevolveEndInput): RevolveEndResult {
  const k = normalize(input.axisDir);
  if (norm(k) < 0.5)
    return { ok: false, reason: "revolve: axis direction is zero" };
  const points = input.profilePoints.filter((p) => {
    const radial = projectOnPlane(sub(p, input.axisOrigin), k);
    return norm(radial) > 1e-8;
  });
  if (!points.length) {
    return {
      ok: false,
      reason: "revolve: profile lies on the axis, no end condition to solve",
    };
  }

  if (input.endBound === "UP_TO_VERTEX") {
    if (!input.vertex) {
      return {
        ok: false,
        reason: "revolve: up-to-vertex needs a reference vertex",
      };
    }
    const target = projectOnPlane(sub(input.vertex, input.axisOrigin), k);
    if (norm(target) < 1e-9) {
      return {
        ok: false,
        reason: "revolve: reference vertex lies on the axis",
      };
    }
    let best = Number.POSITIVE_INFINITY;
    for (const p of points) {
      const radial = projectOnPlane(sub(p, input.axisOrigin), k);
      if (norm(radial) < 1e-9) continue;
      let angle = Math.atan2(
        dot(k, cross(radial, target)),
        dot(radial, target),
      );
      while (angle <= EPS) angle += TWO_PI;
      while (angle > TWO_PI + EPS) angle -= TWO_PI;
      if (angle <= TWO_PI && angle < best) best = angle;
    }
    if (!Number.isFinite(best)) {
      return {
        ok: false,
        reason: "revolve: no profile point rotates onto the reference vertex",
      };
    }
    return { ok: true, angle: Math.min(best, TWO_PI) };
  }

  const polygon = input.face;
  if (!polygon?.length) {
    return { ok: false, reason: "revolve: up-to-face needs a reference face" };
  }
  const normal = planeNormal(polygon);
  if (!normal) {
    return { ok: false, reason: "revolve: reference face is degenerate" };
  }
  const d = dot(normal, polygon[0]!);
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) {
    for (const angle of faceAngles(p, k, normal, d)) {
      const hit = rotate(p, k, angle);
      if (pointInPolygon(hit, polygon, normal) && angle < best) best = angle;
    }
  }
  if (!Number.isFinite(best)) {
    return {
      ok: false,
      reason: "revolve: the revolved profile never reaches the reference face",
    };
  }
  return { ok: true, angle: Math.min(best, TWO_PI) };
}
