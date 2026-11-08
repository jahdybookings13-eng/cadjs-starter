/**
 * Phase 3 G inspect core.
 *
 * Measurements are derived from the tessellated BREP the scene already has
 * (`faceGeometry`, falling back to B-Rep face polygons). They are deliberately
 * approximate: radius/curvature come from smooth-edge dihedral angles,
 * thickness from inward rays, and interference/clearance from triangle tests.
 * Analytic OCC queries can replace these later without changing the UI shape.
 */
import * as THREE from "three";
import type { BodyOutput } from "./executor";

export type InspectionUnit = "mm" | "in";

export type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

export interface BodyInspection {
  featureId: string;
  triangles: number;
  volumeMM3: number | null;
  surfaceAreaMM2: number | null;
  massKg: number | null;
  centerOfMassMM: [number, number, number] | null;
  bboxMM: [number, number, number, number, number, number] | null;
  /** Smallest inward/outward ray hit through the body, in mm. */
  thicknessMM: number | null;
  /** Median smooth-edge radius estimate, in mm. */
  radiusMM: number | null;
  diameterMM: number | null;
  /** Largest smooth-edge curvature, in 1/mm. */
  curvatureMaxPerMM: number | null;
  /** Cross-section through the bbox centre on the XY plane. */
  sectionAreaMM2: number | null;
  sectionPerimeterMM: number | null;
  /** Set when the body has no triangles to measure. */
  error: string | null;
}

export interface SelectionInspection {
  bodies: BodyInspection[];
  interference: boolean;
  /** Minimum triangle-to-triangle distance, in mm; 0 when interfering. */
  minClearanceMM: number | null;
}

const MM = 1000;
const IN = 25.4;
const EPS = 1e-9;

/**
 * User-facing accuracy policy. The numbers are mesh-derived, so the display
 * precision is a formatting choice, not a geometric tolerance. Curved radius /
 * curvature fits reject a ring with more than 2% RMS error.
 */
export const INSPECT_TOLERANCE =
  "mesh estimate; curved fit ≤2% RMS; display precision only";

export function bodyTriangles(out: BodyOutput): Triangle[] {
  const geo = out.faceGeometry;
  const pos = geo?.attributes.position;
  const p = out.position;
  const outTris: Triangle[] = [];
  if (pos) {
    const index = geo?.index?.array;
    const count = index ? index.length : pos.count;
    const at = (i: number) =>
      new THREE.Vector3(
        pos.getX(i) + p.x,
        pos.getY(i) + p.y,
        pos.getZ(i) + p.z,
      );
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? Number(index[i]) : i;
      const ib = index ? Number(index[i + 1]) : i + 1;
      const ic = index ? Number(index[i + 2]) : i + 2;
      outTris.push([at(ia), at(ib), at(ic)]);
    }
    if (outTris.length) return outTris;
  }
  const faces =
    (
      out.brep as unknown as {
        faces?: Array<{
          vertices?: Array<{ x: number; y: number; z: number }>;
        }>;
      }
    ).faces ?? [];
  for (const face of faces) {
    const vs = (face.vertices ?? []).map(
      (v) => new THREE.Vector3(v.x + p.x, v.y + p.y, v.z + p.z),
    );
    for (let i = 1; i + 1 < vs.length; i++)
      outTris.push([vs[0]!, vs[i]!, vs[i + 1]!]);
  }
  return outTris;
}

function normalOf(t: Triangle): THREE.Vector3 {
  return new THREE.Vector3()
    .subVectors(t[1], t[0])
    .cross(new THREE.Vector3().subVectors(t[2], t[0]))
    .normalize();
}

function centroidOf(t: Triangle): THREE.Vector3 {
  return new THREE.Vector3()
    .add(t[0])
    .add(t[1])
    .add(t[2])
    .multiplyScalar(1 / 3);
}

function massProperties(tris: Triangle[]): {
  volumeM3: number;
  areaM2: number;
  centroid: THREE.Vector3 | null;
} {
  let volume6 = 0;
  let area2 = 0;
  const moment = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    volume6 += a.dot(new THREE.Vector3().crossVectors(b, c));
    area2 += new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .length();
    const vol = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    moment.addScaledVector(new THREE.Vector3().add(a).add(b).add(c), vol / 4);
  }
  const volume = volume6 / 6;
  if (Math.abs(volume) > EPS) {
    return {
      volumeM3: Math.abs(volume),
      areaM2: area2 / 2,
      centroid: moment.clone().multiplyScalar(1 / volume),
    };
  }
  // Degenerate/open mesh: area-weighted centroid is still useful.
  const areaMoment = new THREE.Vector3();
  let total = 0;
  for (const t of tris) {
    const area = new THREE.Vector3()
      .subVectors(t[1], t[0])
      .cross(new THREE.Vector3().subVectors(t[2], t[0]))
      .length();
    areaMoment.addScaledVector(centroidOf(t), area);
    total += area;
  }
  return {
    volumeM3: Math.abs(volume),
    areaM2: area2 / 2,
    centroid: total > EPS ? areaMoment.multiplyScalar(1 / total) : null,
  };
}

function bboxOf(tris: Triangle[]): BodyInspection["bboxMM"] {
  if (!tris.length) return null;
  const box = new THREE.Box3();
  for (const t of tris) for (const v of t) box.expandByPoint(v);
  return [
    box.min.x * MM,
    box.min.y * MM,
    box.min.z * MM,
    box.max.x * MM,
    box.max.y * MM,
    box.max.z * MM,
  ];
}

function rayHits(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  tris: Triangle[],
  skip: number,
): number | null {
  const ray = new THREE.Ray(origin, dir);
  const hit = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 0; i < tris.length; i++) {
    if (i === skip) continue;
    const t = tris[i]!;
    if (ray.intersectTriangle(t[0], t[1], t[2], false, hit)) {
      const d = origin.distanceTo(hit);
      if (d > 1e-6 && d < nearest) nearest = d;
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function thicknessOf(tris: Triangle[]): number | null {
  if (!tris.length) return null;
  let min = Infinity;
  const step = Math.max(1, Math.ceil(tris.length / 160));
  for (let i = 0; i < tris.length; i += step) {
    const t = tris[i]!;
    const n = normalOf(t);
    if (!Number.isFinite(n.x)) continue;
    const c = centroidOf(t);
    // Both directions: winding is not guaranteed across kernels/imports.
    for (const dir of [n.clone().negate(), n.clone()]) {
      const d = rayHits(c.clone().addScaledVector(dir, -1e-6), dir, tris, i);
      if (d !== null && d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min * MM : null;
}

function edgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const q = (v: number) => Math.round(v * 1e7);
  const ka = `${q(a.x)},${q(a.y)},${q(a.z)}`;
  const kb = `${q(b.x)},${q(b.y)},${q(b.z)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function solve3(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++)
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const d = a[col]![col]!;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const f = a[row]![col]! / d;
      for (let k = col; k < 4; k++) a[row]![k]! -= f * a[col]![k]!;
    }
  }
  return [a[0]![3]! / a[0]![0]!, a[1]![3]! / a[1]![1]!, a[2]![3]! / a[2]![2]!];
}

/** Fit a circle to edge midpoints that share an axis (cylinder/fillet band). */
function fitCircularEdgeRing(
  mids: THREE.Vector3[],
  axis: THREE.Vector3,
): number | null {
  if (mids.length < 6) return null;
  const center = mids
    .reduce((acc, p) => acc.add(p), new THREE.Vector3())
    .multiplyScalar(1 / mids.length);
  const n = axis.clone().normalize();
  const ref =
    Math.abs(n.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, ref).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const pts = mids.map((p) => {
    const d = p.clone().sub(center);
    return new THREE.Vector2(d.dot(u), d.dot(v));
  });
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    sxz = 0,
    syz = 0,
    sz = 0;
  for (const p of pts) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    syy += p.y * p.y;
    sxy += p.x * p.y;
    sxz += p.x * z;
    syz += p.y * z;
    sz += z;
  }
  const count = pts.length;
  const sol = solve3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, count],
    ],
    [-sxz, -syz, -sz],
  );
  if (!sol) return null;
  const [d, e, f] = sol as [number, number, number];
  const cx = -d / 2;
  const cy = -e / 2;
  const r2 = cx * cx + cy * cy - f;
  if (!(r2 > EPS)) return null;
  const r = Math.sqrt(r2);
  let square = 0;
  for (const p of pts)
    square += (p.distanceTo(new THREE.Vector2(cx, cy)) - r) ** 2;
  const rms = Math.sqrt(square / count);
  if (rms > Math.max(1e-6, r * 0.02)) return null;
  return r;
}

function curvatureOf(tris: Triangle[]): {
  radiusMM: number | null;
  curvatureMaxPerMM: number | null;
} {
  if (!tris.length) return { radiusMM: null, curvatureMaxPerMM: null };
  const byEdge = new Map<
    string,
    { ids: number[]; a: THREE.Vector3; b: THREE.Vector3 }
  >();
  const normals = tris.map(normalOf);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const a = t[k]!;
      const b = t[(k + 1) % 3]!;
      const key = edgeKey(a, b);
      const entry = byEdge.get(key);
      if (entry) entry.ids.push(i);
      else byEdge.set(key, { ids: [i], a, b });
    }
  });
  // Group smooth edges by direction and fit a circle to their midpoints.
  // A tessellated cylinder/fillet has a ring of parallel smooth edges lying on
  // the true surface circle; triangle-centroid formulas are off by 1/3 there.
  const buckets: { dir: THREE.Vector3; mids: THREE.Vector3[] }[] = [];
  for (const { ids, a: ea, b: eb } of byEdge.values()) {
    if (ids.length !== 2) continue;
    const [a, b] = ids as [number, number];
    const na = normals[a]!;
    const nb = normals[b]!;
    if (na.lengthSq() < 0.5 || nb.lengthSq() < 0.5) continue;
    const angle = na.angleTo(nb);
    // Sharp edges are topology, not curvature; only smooth transitions count.
    if (!(angle > 1e-4 && angle < Math.PI / 4)) continue;
    const dir = new THREE.Vector3().subVectors(eb, ea).normalize();
    let bucket = buckets.find((c) => Math.abs(c.dir.dot(dir)) > 0.99);
    if (!bucket) {
      bucket = { dir: dir.clone(), mids: [] };
      buckets.push(bucket);
    }
    bucket.mids.push(
      new THREE.Vector3().addVectors(ea, eb).multiplyScalar(0.5),
    );
  }
  const radii: number[] = [];
  for (const bucket of buckets) {
    const r = fitCircularEdgeRing(bucket.mids, bucket.dir);
    if (r !== null) radii.push(r);
  }
  if (!radii.length) return { radiusMM: null, curvatureMaxPerMM: null };
  const min = Math.min(...radii);
  return {
    radiusMM: min * MM,
    curvatureMaxPerMM: 1 / min / MM,
  };
}

/** Area/perimeter of the triangle-plane intersection at `origin`. */
export function sectionMetrics(
  tris: Triangle[],
  origin: THREE.Vector3,
  normal: THREE.Vector3,
): { areaM2: number; perimeterM: number } {
  const n = normal.clone().normalize();
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
  u.crossVectors(n, u).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const q = (value: number) => Math.round(value * 1e7);
  const pointKey = (p: THREE.Vector2) => `${q(p.x)},${q(p.y)}`;
  const pointMap = new Map<string, THREE.Vector2>();
  const to2 = (p: THREE.Vector3) =>
    new THREE.Vector2(
      p.clone().sub(origin).dot(u),
      p.clone().sub(origin).dot(v),
    );
  for (const t of tris) {
    const d = t.map((p) => p.clone().sub(origin).dot(n));
    // Skip a face lying in the plane: it would add a whole coplanar polygon,
    // not a boundary. On-plane edges/vertices of crossing triangles are valid.
    if (d.every((value) => Math.abs(value) <= EPS)) continue;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]!) <= EPS) {
        const p = to2(t[i]!);
        pointMap.set(pointKey(p), p);
      }
      const a = t[i]!;
      const b = t[(i + 1) % 3]!;
      const da = d[i]!;
      const db = d[(i + 1) % 3]!;
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const f = da / (da - db);
        const p = to2(new THREE.Vector3().lerpVectors(a, b, f));
        pointMap.set(pointKey(p), p);
      }
    }
  }
  const points = [...pointMap.values()];
  if (points.length < 3) return { areaM2: 0, perimeterM: 0 };
  // Convex section assumption: the bbox-centre XY cut of a solid is normally
  // one convex loop. Sorting unique intersection points avoids double-counting
  // shared triangle edges and handles planes that pass through vertices.
  const c = points.reduce((acc, p) => acc.add(p), new THREE.Vector2(0, 0));
  c.multiplyScalar(1 / points.length);
  points.sort(
    (a, b) =>
      Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x),
  );
  let area2 = 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area2 += a.x * b.y - b.x * a.y;
    perimeter += a.distanceTo(b);
  }
  return { areaM2: Math.abs(area2) / 2, perimeterM: perimeter };
}

function pointTriangleDistance(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): number {
  const closest = new THREE.Vector3();
  new THREE.Triangle(a, b, c).closestPointToPoint(p, closest);
  return p.distanceTo(closest);
}

function segmentSegmentDistance(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): number {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) return p1.distanceTo(p2);
  if (a <= EPS) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= EPS) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s =
        denom > EPS ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

function segmentTriangleHit(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: Triangle,
): boolean {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < EPS) return pointTriangleDistance(a, t[0], t[1], t[2]) < 1e-6;
  const ray = new THREE.Ray(a, dir.clone().normalize());
  const hit = new THREE.Vector3();
  if (!ray.intersectTriangle(t[0], t[1], t[2], false, hit)) return false;
  return a.distanceTo(hit) <= len + 1e-6;
}

export function trianglesIntersect(a: Triangle, b: Triangle): boolean {
  for (let i = 0; i < 3; i++)
    if (segmentTriangleHit(a[i]!, a[(i + 1) % 3]!, b)) return true;
  for (let i = 0; i < 3; i++)
    if (segmentTriangleHit(b[i]!, b[(i + 1) % 3]!, a)) return true;
  return false;
}

function triangleDistance(a: Triangle, b: Triangle): number {
  if (trianglesIntersect(a, b)) return 0;
  let min = Infinity;
  for (const p of a)
    min = Math.min(min, pointTriangleDistance(p, b[0], b[1], b[2]));
  for (const p of b)
    min = Math.min(min, pointTriangleDistance(p, a[0], a[1], a[2]));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      min = Math.min(
        min,
        segmentSegmentDistance(a[i]!, a[(i + 1) % 3]!, b[j]!, b[(j + 1) % 3]!),
      );
  return min;
}

function sampled(tris: Triangle[], max = 220): Triangle[] {
  if (tris.length <= max) return tris;
  const step = Math.ceil(tris.length / max);
  return tris.filter((_, i) => i % step === 0).slice(0, max);
}

export function bodyPairInspection(
  a: BodyOutput,
  b: BodyOutput,
): { interference: boolean; minClearanceM3: number } {
  const ta = sampled(bodyTriangles(a));
  const tb = sampled(bodyTriangles(b));
  let min = Infinity;
  for (const x of ta)
    for (const y of tb) {
      const d = triangleDistance(x, y);
      if (d === 0) return { interference: true, minClearanceM3: 0 };
      if (d < min) min = d;
    }
  return {
    interference: false,
    minClearanceM3: Number.isFinite(min) ? min : Infinity,
  };
}

function bboxOfTris(tris: Triangle[]): THREE.Box3 | null {
  if (!tris.length) return null;
  const box = new THREE.Box3();
  for (const t of tris) for (const v of t) box.expandByPoint(v);
  return box;
}

export function inspectBody(
  out: BodyOutput,
  opts: { densityKgM3?: number | null } = {},
): BodyInspection {
  const tris = bodyTriangles(out);
  const empty: BodyInspection = {
    featureId: out.featureId,
    triangles: 0,
    volumeMM3: null,
    surfaceAreaMM2: null,
    massKg: null,
    centerOfMassMM: null,
    bboxMM: null,
    thicknessMM: null,
    radiusMM: null,
    diameterMM: null,
    curvatureMaxPerMM: null,
    sectionAreaMM2: null,
    sectionPerimeterMM: null,
    error: tris.length ? null : "inspect: body has no measurable geometry",
  };
  if (!tris.length) return empty;

  const mass = massProperties(tris);
  const bbox = bboxOfTris(tris);
  const center = bbox
    ? bbox.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  const section = sectionMetrics(tris, center, new THREE.Vector3(0, 0, 1));
  const curvature = curvatureOf(tris);
  const density = opts.densityKgM3 ?? null;
  return {
    ...empty,
    triangles: tris.length,
    volumeMM3: mass.volumeM3 * MM ** 3,
    surfaceAreaMM2: mass.areaM2 * MM ** 2,
    massKg:
      density !== null && mass.volumeM3 > EPS ? mass.volumeM3 * density : null,
    centerOfMassMM: mass.centroid
      ? [mass.centroid.x * MM, mass.centroid.y * MM, mass.centroid.z * MM]
      : null,
    bboxMM: bboxOf(tris),
    thicknessMM: thicknessOf(tris),
    radiusMM: curvature.radiusMM,
    diameterMM: curvature.radiusMM === null ? null : curvature.radiusMM * 2,
    curvatureMaxPerMM: curvature.curvatureMaxPerMM,
    sectionAreaMM2: section.areaM2 * MM ** 2,
    sectionPerimeterMM: section.perimeterM * MM,
  };
}

export function inspectBodies(
  outs: readonly BodyOutput[],
  opts: { densityKgM3?: number | null } = {},
): SelectionInspection {
  const bodies = outs.map((out) => inspectBody(out, opts));
  let interference = false;
  let minClearanceM3 = Infinity;
  for (let i = 0; i < outs.length; i++) {
    for (let j = i + 1; j < outs.length; j++) {
      const pair = bodyPairInspection(outs[i]!, outs[j]!);
      if (pair.interference) {
        interference = true;
        minClearanceM3 = 0;
      } else if (pair.minClearanceM3 < minClearanceM3) {
        minClearanceM3 = pair.minClearanceM3;
      }
    }
  }
  return {
    bodies,
    interference,
    minClearanceMM: Number.isFinite(minClearanceM3)
      ? minClearanceM3 * MM
      : null,
  };
}

export function convertLength(valueMM: number, unit: InspectionUnit): number {
  return unit === "in" ? valueMM / IN : valueMM;
}

export function formatLength(
  valueMM: number | null,
  unit: InspectionUnit = "mm",
  precision = 2,
): string {
  if (valueMM === null) return "n/a";
  return `${convertLength(valueMM, unit).toFixed(precision)} ${unit}`;
}

export function convertArea(valueMM2: number, unit: InspectionUnit): number {
  return unit === "in" ? valueMM2 / IN ** 2 : valueMM2;
}

export function convertVolume(valueMM3: number, unit: InspectionUnit): number {
  return unit === "in" ? valueMM3 / IN ** 3 : valueMM3;
}

export function formatArea(
  valueMM2: number | null,
  unit: InspectionUnit = "mm",
  precision = 1,
): string {
  if (valueMM2 === null) return "n/a";
  return `${convertArea(valueMM2, unit).toFixed(precision)} ${unit}²`;
}

export function formatVolume(
  valueMM3: number | null,
  unit: InspectionUnit = "mm",
  precision = 1,
): string {
  if (valueMM3 === null) return "n/a";
  return `${convertVolume(valueMM3, unit).toFixed(precision)} ${unit}³`;
}

export function formatCurvature(
  valuePerMM: number | null,
  unit: InspectionUnit = "mm",
  precision = 4,
): string {
  if (valuePerMM === null) return "n/a";
  const scale = unit === "in" ? IN : 1;
  return `${(valuePerMM * scale).toFixed(precision)} 1/${unit}`;
}
