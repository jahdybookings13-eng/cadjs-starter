// Interference and clearance checks between placed assembly instances.
//
// When face triangles are available this uses triangle/triangle intersection
// on the actual tessellated BRep faces. Bounds remain as a broad phase and as a
// fallback for bodies whose tessellation is not available. The resulting
// `method` field tells callers which test produced the pair; it is never
// reported as an exact BRep boolean intersection.

import * as THREE from "three";
import type { BrepJSON } from "@vitekk02/cadjs";
import {
  flattenAssembly,
  matMul,
  transformPoint,
  type Assembly,
} from "./model";
import type { BodyBounds, Vec3 } from "./connectors";

export interface WorldBox {
  min: Vec3;
  max: Vec3;
}

export type Triangle = readonly [Vec3, Vec3, Vec3];

export interface BodyMesh {
  triangles: readonly Triangle[];
}

export interface InterferencePair {
  a: string;
  b: string;
  /** Axis-aligned overlap in mm. */
  overlap: Vec3;
  /** Smallest axis penetration; positive when the bodies intersect. */
  penetration: number;
  /** `brep` is an OCCT common-volume test; `face` is tessellated triangles. */
  method: "brep" | "face" | "bounds";
  /** OCCT intersection volume, present for `brep` results. */
  volume?: number;
}

export interface BodyBrepGeometry {
  brepJson: BrepJSON;
  occBrep?: string;
}

export interface ClearancePair {
  a: string;
  b: string;
  /** Positive gap in mm; zero means contact. */
  clearance: number;
  status: "clearance" | "contact";
  method: "bounds";
}

const EPS = 1e-6;
const TRI_EPS = 1e-7;

function corners(bounds: BodyBounds): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) out.push({ x, y, z });
  return out;
}

export function worldBox(
  bounds: BodyBounds,
  transform: readonly number[],
): WorldBox {
  const pts = corners(bounds).map((p) =>
    transformPoint([...transform], [p.x, p.y, p.z]),
  );
  return {
    min: {
      x: Math.min(...pts.map((p) => p[0])),
      y: Math.min(...pts.map((p) => p[1])),
      z: Math.min(...pts.map((p) => p[2])),
    },
    max: {
      x: Math.max(...pts.map((p) => p[0])),
      y: Math.max(...pts.map((p) => p[1])),
      z: Math.max(...pts.map((p) => p[2])),
    },
  };
}

function boxForTriangles(tris: readonly Triangle[]): WorldBox | null {
  if (!tris.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const tri of tris)
    for (const p of tri) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
  return { min, max };
}

function boxesOverlap(a: WorldBox, b: WorldBox, clearance: number): boolean {
  return (
    a.min.x - clearance <= b.max.x &&
    a.max.x + clearance >= b.min.x &&
    a.min.y - clearance <= b.max.y &&
    a.max.y + clearance >= b.min.y &&
    a.min.z - clearance <= b.max.z &&
    a.max.z + clearance >= b.min.z
  );
}

function overlapOf(a: WorldBox, b: WorldBox, clearance: number): Vec3 {
  return {
    x:
      Math.min(a.max.x + clearance, b.max.x) -
      Math.max(a.min.x - clearance, b.min.x),
    y:
      Math.min(a.max.y + clearance, b.max.y) -
      Math.max(a.min.y - clearance, b.min.y),
    z:
      Math.min(a.max.z + clearance, b.max.z) -
      Math.max(a.min.z - clearance, b.min.z),
  };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function segmentTriangle(p0: Vec3, p1: Vec3, tri: Triangle): boolean {
  const [a, b, c] = tri;
  const dir = sub(p1, p0);
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < TRI_EPS) return false;
  const inv = 1 / det;
  const s = sub(p0, a);
  const u = dot(s, h) * inv;
  if (u < -TRI_EPS || u > 1 + TRI_EPS) return false;
  const q = cross(s, e1);
  const v = dot(dir, q) * inv;
  if (v < -TRI_EPS || u + v > 1 + TRI_EPS) return false;
  const t = dot(e2, q) * inv;
  return t >= -TRI_EPS && t <= 1 + TRI_EPS;
}

function pointInTriangle2(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  axis: 0 | 1 | 2,
): boolean {
  const px = axis === 0 ? p.y : p.x;
  const py = axis === 0 ? p.z : axis === 1 ? p.z : p.y;
  const ax = axis === 0 ? a.y : a.x;
  const ay = axis === 0 ? a.z : axis === 1 ? a.z : a.y;
  const bx = axis === 0 ? b.y : b.x;
  const by = axis === 0 ? b.z : axis === 1 ? b.z : b.y;
  const cx = axis === 0 ? c.y : c.x;
  const cy = axis === 0 ? c.z : axis === 1 ? c.z : c.y;
  const sign = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < -TRI_EPS || d2 < -TRI_EPS || d3 < -TRI_EPS;
  const hasPos = d1 > TRI_EPS || d2 > TRI_EPS || d3 > TRI_EPS;
  return !(hasNeg && hasPos);
}

function coplanarTriangles(a: Triangle, b: Triangle): boolean {
  const normal = cross(sub(a[1], a[0]), sub(a[2], a[0]));
  const normalLength = norm(normal);
  if (normalLength < TRI_EPS) return false;
  const d = dot(normal, a[0]);
  const tolerance = TRI_EPS * Math.max(1, normalLength);
  for (const p of b) {
    if (Math.abs(dot(normal, p) - d) > tolerance) return false;
  }
  const axis: 0 | 1 | 2 =
    Math.abs(normal.x) >= Math.abs(normal.y) &&
    Math.abs(normal.x) >= Math.abs(normal.z)
      ? 0
      : Math.abs(normal.y) >= Math.abs(normal.z)
        ? 1
        : 2;
  for (const p of b)
    if (pointInTriangle2(p, a[0], a[1], a[2], axis)) return true;
  for (const p of a)
    if (pointInTriangle2(p, b[0], b[1], b[2], axis)) return true;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (
        segments2DIntersect(
          a[i]!,
          a[(i + 1) % 3]!,
          b[j]!,
          b[(j + 1) % 3]!,
          axis,
        )
      )
        return true;
  return false;
}

function segments2DIntersect(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  axis: 0 | 1 | 2,
): boolean {
  const point = (p: Vec3): [number, number] =>
    axis === 0 ? [p.y, p.z] : axis === 1 ? [p.x, p.z] : [p.x, p.y];
  const [ax, ay] = point(a);
  const [bx, by] = point(b);
  const [cx, cy] = point(c);
  const [dx, dy] = point(d);
  const orient = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 * o2 <= TRI_EPS && o3 * o4 <= TRI_EPS;
}

export function triangleIntersects(a: Triangle, b: Triangle): boolean {
  if (segmentTriangle(a[0], a[1], b)) return true;
  if (segmentTriangle(a[1], a[2], b)) return true;
  if (segmentTriangle(a[2], a[0], b)) return true;
  if (segmentTriangle(b[0], b[1], a)) return true;
  if (segmentTriangle(b[1], b[2], a)) return true;
  if (segmentTriangle(b[2], b[0], a)) return true;
  return coplanarTriangles(a, b);
}

function transformedTriangles(
  mesh: BodyMesh,
  transform: readonly number[],
): Triangle[] {
  return mesh.triangles.map((tri) => [
    (() => {
      const p = transformPoint([...transform], [tri[0].x, tri[0].y, tri[0].z]);
      return { x: p[0], y: p[1], z: p[2] };
    })(),
    (() => {
      const p = transformPoint([...transform], [tri[1].x, tri[1].y, tri[1].z]);
      return { x: p[0], y: p[1], z: p[2] };
    })(),
    (() => {
      const p = transformPoint([...transform], [tri[2].x, tri[2].y, tri[2].z]);
      return { x: p[0], y: p[1], z: p[2] };
    })(),
  ]);
}

function meshIntersects(
  a: readonly Triangle[],
  b: readonly Triangle[],
): boolean {
  for (const ta of a) {
    const ba = boxForTriangles([ta]);
    if (!ba) continue;
    for (const tb of b) {
      const bb = boxForTriangles([tb]);
      if (!bb || !boxesOverlap(ba, bb, 0)) continue;
      if (triangleIntersects(ta, tb)) return true;
    }
  }
  return false;
}

function boxGap(a: WorldBox, b: WorldBox): number {
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
  const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
  const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
  return Math.max(dx, dy, dz);
}

/** Positive clearance/contact report. Overlaps belong to interferencePairs. */
export function clearancePairs(
  asm: Assembly,
  boundsById: Readonly<Record<string, BodyBounds>>,
  maxClearance = 1,
): ClearancePair[] {
  const placed = flattenAssembly(asm)
    .filter((leaf) => leaf.visible)
    .flatMap((leaf) => {
      const key = leaf.bodyId ?? leaf.instanceId;
      const bounds = boundsById[key];
      return bounds
        ? [
            {
              id: leaf.instanceId,
              bodyId: leaf.bodyId ?? leaf.instanceId,
              box: worldBox(bounds, leaf.transform),
            },
          ]
        : [];
    });
  const out: ClearancePair[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (boxesOverlap(a.box, b.box, 0)) continue;
      const gap = boxGap(a.box, b.box);
      if (gap > Math.max(0, maxClearance) + EPS) continue;
      out.push({
        a: a.id,
        b: b.id,
        clearance: gap,
        status: gap <= EPS ? "contact" : "clearance",
        method: "bounds",
      });
    }
  }
  return out.sort((left, right) => left.clearance - right.clearance);
}

export interface CollisionReport {
  /** Positive-volume intersections (penetrating). */
  penetrating: InterferencePair[];
  /** Zero-gap contact, distinct from a clearance value. */
  contacting: ClearancePair[];
  /** Closest positive gap found, in mm; null when nothing was measured. */
  closestClearance: number | null;
}

/** One report that distinguishes touching from penetrating pairs. */
export function collisionReport(
  asm: Assembly,
  boundsById: Readonly<Record<string, BodyBounds>>,
  clearance = 0,
  meshesById: Readonly<Record<string, BodyMesh>> = {},
): CollisionReport {
  const penetrating = interferencePairs(asm, boundsById, 0, meshesById);
  const near = clearancePairs(asm, boundsById, Math.max(0, clearance));
  const contacting = near.filter((pair) => pair.status === "contact");
  const positive = near.filter((pair) => pair.status === "clearance");
  return {
    penetrating,
    contacting,
    closestClearance: positive.length ? positive[0]!.clearance : null,
  };
}

export function interferencePairs(
  asm: Assembly,
  boundsById: Readonly<Record<string, BodyBounds>>,
  clearance = 0,
  meshesById: Readonly<Record<string, BodyMesh>> = {},
): InterferencePair[] {
  const placed = flattenAssembly(asm)
    .filter((leaf) => leaf.visible)
    .flatMap((leaf) => {
      const key = leaf.bodyId ?? leaf.instanceId;
      const bounds = boundsById[key];
      const sourceMesh = meshesById[key];
      if (!bounds) return [];
      const mesh = sourceMesh
        ? transformedTriangles(sourceMesh, leaf.transform)
        : [];
      return [
        {
          id: leaf.instanceId,
          box: worldBox(bounds, leaf.transform),
          ...(mesh.length ? { mesh } : {}),
        },
      ];
    });

  const out: InterferencePair[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (!boxesOverlap(a.box, b.box, clearance)) continue;
      const overlap = overlapOf(a.box, b.box, clearance);
      const penetration = Math.min(overlap.x, overlap.y, overlap.z);
      if (penetration <= EPS) continue;
      const meshA = "mesh" in a ? a.mesh : undefined;
      const meshB = "mesh" in b ? b.mesh : undefined;
      const useFace = Boolean(meshA?.length && meshB?.length);
      if (useFace && !meshIntersects(meshA!, meshB!)) continue;
      out.push({
        a: a.id,
        b: b.id,
        overlap,
        penetration,
        method: useFace ? "face" : "bounds",
      });
    }
  }
  return out;
}

function placementOf(transform: readonly number[]): {
  position: Vec3;
  rotation: { x: number; y: number; z: number; order: string };
} {
  // placeObject feeds the same row-major array to THREE.Matrix4.set.
  const matrix = new THREE.Matrix4().set(
    transform[0] ?? 1,
    transform[1] ?? 0,
    transform[2] ?? 0,
    transform[3] ?? 0,
    transform[4] ?? 0,
    transform[5] ?? 1,
    transform[6] ?? 0,
    transform[7] ?? 0,
    transform[8] ?? 0,
    transform[9] ?? 0,
    transform[10] ?? 1,
    transform[11] ?? 0,
    transform[12] ?? 0,
    transform[13] ?? 0,
    transform[14] ?? 0,
    transform[15] ?? 1,
  );
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, new THREE.Vector3());
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z, order: "XYZ" },
  };
}

/**
 * Exact interference using an OCCT common-volume operation. Pairs without
 * BRep payloads, or whose OCC call fails, keep the honest triangle/bounds
 * result from `interferencePairs`.
 */
export async function exactInterferencePairs(
  asm: Assembly,
  boundsById: Readonly<Record<string, BodyBounds>>,
  clearance: number,
  brepsById: Readonly<Record<string, BodyBrepGeometry>>,
  meshesById: Readonly<Record<string, BodyMesh>> = {},
): Promise<InterferencePair[]> {
  const broad = interferencePairs(asm, boundsById, clearance, meshesById);
  if (!broad.length) return broad;
  const leaves = flattenAssembly(asm);
  const byId = new Map(leaves.map((leaf) => [leaf.instanceId, leaf]));
  const { OccWorkerClient } = await import("@vitekk02/cadjs");
  const client = OccWorkerClient.getInstance();
  return Promise.all(
    broad.map(async (pair) => {
      const a = byId.get(pair.a);
      const b = byId.get(pair.b);
      if (!a || !b) return pair;
      const ga = brepsById[a.bodyId ?? a.instanceId];
      const gb = brepsById[b.bodyId ?? b.instanceId];
      if (!ga || !gb) return pair;
      try {
        const result = await client.send<{ volume: number }>({
          type: "interference",
          payload: {
            a: {
              brepJson: ga.brepJson,
              ...placementOf(a.transform),
              ...(ga.occBrep ? { occBrep: ga.occBrep } : {}),
            },
            b: {
              brepJson: gb.brepJson,
              ...placementOf(b.transform),
              ...(gb.occBrep ? { occBrep: gb.occBrep } : {}),
            },
          },
        });
        if (result.volume > 1e-12)
          return { ...pair, method: "brep" as const, volume: result.volume };
        return null;
      } catch {
        return pair;
      }
    }),
  ).then((pairs) =>
    pairs.filter((pair): pair is InterferencePair => pair !== null),
  );
}

export function worldTransformFor(
  parent: readonly number[],
  child: readonly number[],
): number[] {
  return matMul([...parent], [...child]);
}
