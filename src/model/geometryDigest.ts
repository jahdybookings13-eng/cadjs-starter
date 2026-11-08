/**
 * Deterministic geometry fingerprint for rebuild/save-reload/export checks.
 *
 * The digest is computed from world-space BREP topology, not from vertex array
 * order: vertices are quantized, sorted and re-indexed, edges are canonicalized
 * to (min,max) endpoints, and each face is rotated to its lexicographically
 * smallest cycle. Two bodies with the same shape therefore hash the same even
 * when the kernel returns their vertices/faces in a different order.
 *
 * Tags and feature ids are NOT geometry; pass `includeOwners` to include ids
 * when checking ownership, not shape. STL is a triangle mesh without BREP
 * topology, so use `geometrySummary().bbox` for STL/STEP bbox comparisons.
 */
import type { BodyOutput } from "./executor";
import { stableStringify } from "./stableJson";

export interface GeometryDigestOptions {
  /** Coordinate quantum in metres. Default 1e-7 (0.0001 mm). */
  quantum?: number;
  /** Include feature id and body kind in the fingerprint. Default false. */
  includeOwners?: boolean;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface BrepLike {
  vertices?: Vec3[];
  edges?: { start: Vec3; end: Vec3 }[];
  faces?: { vertices: Vec3[] }[];
}

interface BodyLike {
  featureId?: string;
  kind?: string;
  position?: Partial<Vec3>;
  brep?: BrepLike;
}

type Triple = [number, number, number];

interface CanonicalBody {
  owner: { featureId: string; kind: string } | null;
  vertices: Triple[];
  edges: [number, number][];
  faces: number[][];
}

export interface BodyGeometrySummary {
  featureId: string;
  kind: string;
  vertices: number;
  edges: number;
  faces: number;
  /** Enclosed volume in mm³, or null when the BREP has no faces. */
  volumeMM3: number | null;
  /** World bbox in metres [minX,minY,minZ,maxX,maxY,maxZ], or null. */
  bbox: [number, number, number, number, number, number] | null;
  digest: string;
}

export interface GeometrySummary {
  /** Shape-only digest across all bodies. */
  digest: string;
  bodies: BodyGeometrySummary[];
  totals: { bodies: number; vertices: number; edges: number; faces: number };
  /** Union of body bboxes in metres, or null when no body has vertices. */
  bbox: [number, number, number, number, number, number] | null;
}

const DEFAULT_QUANTUM = 1e-7;

function hash32(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 16-hex-character FNV-1a fingerprint (two seeds, collision-resistant). */
export function hashGeometryText(text: string): string {
  return hash32(text, 0x811c9dc5) + hash32(text, 0x01000193);
}

function compareTriple(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return a.length < b.length;
}

function smallestCycle(ids: number[]): number[] {
  let best = ids;
  for (let i = 1; i < ids.length; i++) {
    const rotated = [...ids.slice(i), ...ids.slice(0, i)];
    if (lexLess(rotated, best)) best = rotated;
  }
  return best;
}

function canonicalBody(
  body: BodyLike,
  quantum: number,
  includeOwner: boolean,
): CanonicalBody {
  const px = body.position?.x ?? 0;
  const py = body.position?.y ?? 0;
  const pz = body.position?.z ?? 0;
  const tick = (n: number): number => {
    const t = Math.round(n / quantum);
    return Object.is(t, -0) ? 0 : t;
  };
  const q = (v: Vec3): Triple => [
    tick(v.x + px),
    tick(v.y + py),
    tick(v.z + pz),
  ];
  const keyOf = (v: Triple): string => `${v[0]},${v[1]},${v[2]}`;

  const pool = new Map<string, Triple>();
  const remember = (v: Vec3): Triple => {
    const t = q(v);
    pool.set(keyOf(t), t);
    return t;
  };

  for (const v of body.brep?.vertices ?? []) remember(v);
  for (const e of body.brep?.edges ?? []) {
    remember(e.start);
    remember(e.end);
  }
  for (const f of body.brep?.faces ?? [])
    for (const v of f.vertices) remember(v);

  const vertices = [...pool.values()].sort(compareTriple);
  const index = new Map<string, number>();
  vertices.forEach((v, i) => index.set(keyOf(v), i));

  const edgeSet = new Set<string>();
  for (const e of body.brep?.edges ?? []) {
    const a = index.get(keyOf(q(e.start)));
    const b = index.get(keyOf(q(e.end)));
    if (a === undefined || b === undefined || a === b) continue;
    edgeSet.add(a < b ? `${a}:${b}` : `${b}:${a}`);
  }
  const edges = [...edgeSet]
    .map((s) => s.split(":").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const faceSet = new Set<string>();
  const faces: number[][] = [];
  for (const f of body.brep?.faces ?? []) {
    const ids: number[] = [];
    for (const v of f.vertices) {
      const i = index.get(keyOf(q(v)));
      if (i === undefined) continue;
      if (ids.length && ids[ids.length - 1] === i) continue;
      ids.push(i);
    }
    if (ids.length > 2 && ids[0] === ids[ids.length - 1]) ids.pop();
    if (!ids.length) continue;
    const cycle = smallestCycle(ids);
    const key = cycle.join(":");
    if (faceSet.has(key)) continue;
    faceSet.add(key);
    faces.push(cycle);
  }
  faces.sort((a, b) => (lexLess(a, b) ? -1 : lexLess(b, a) ? 1 : 0));

  return {
    owner: includeOwner
      ? { featureId: body.featureId ?? "", kind: body.kind ?? "body" }
      : null,
    vertices,
    edges,
    faces,
  };
}

function canonicalBodies(
  bodies: readonly BodyLike[],
  options: GeometryDigestOptions,
): CanonicalBody[] {
  const quantum = options.quantum ?? DEFAULT_QUANTUM;
  if (!(quantum > 0)) throw new Error("geometryDigest: quantum must be > 0");
  return bodies
    .map((b) => canonicalBody(b, quantum, !!options.includeOwners))
    .sort((a, b) => {
      const sa = stableStringify(a);
      const sb = stableStringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
}

/**
 * Shape-only fingerprint. Body order, vertex order, edge direction and face
 * start vertex do not affect the result.
 */
export function geometryDigest(
  bodies: readonly BodyOutput[],
  options: GeometryDigestOptions = {},
): string {
  return hashGeometryText(stableStringify(canonicalBodies(bodies, options)));
}

function bboxOf(body: BodyLike): BodyGeometrySummary["bbox"] {
  const px = body.position?.x ?? 0;
  const py = body.position?.y ?? 0;
  const pz = body.position?.z ?? 0;
  const points = [
    ...(body.brep?.vertices ?? []),
    ...(body.brep?.edges ?? []).flatMap((e) => [e.start, e.end]),
    ...(body.brep?.faces ?? []).flatMap((f) => f.vertices),
  ];
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of points) {
    const x = v.x + px;
    const y = v.y + py;
    const z = v.z + pz;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

/** Signed-volume integral over the BREP face polygons (divergence theorem). */
function volumeOf(body: BodyLike): number | null {
  const px = body.position?.x ?? 0;
  const py = body.position?.y ?? 0;
  const pz = body.position?.z ?? 0;
  let six = 0;
  let found = false;
  for (const face of body.brep?.faces ?? []) {
    const vs = face.vertices;
    if (vs.length < 3) continue;
    const a = { x: vs[0]!.x + px, y: vs[0]!.y + py, z: vs[0]!.z + pz };
    for (let i = 1; i + 1 < vs.length; i++) {
      const b = { x: vs[i]!.x + px, y: vs[i]!.y + py, z: vs[i]!.z + pz };
      const c = {
        x: vs[i + 1]!.x + px,
        y: vs[i + 1]!.y + py,
        z: vs[i + 1]!.z + pz,
      };
      six +=
        a.x * (b.y * c.z - b.z * c.y) -
        a.y * (b.x * c.z - b.z * c.x) +
        a.z * (b.x * c.y - b.y * c.x);
      found = true;
    }
  }
  return found ? Math.abs(six / 6) : null;
}

function unionBbox(
  boxes: Array<BodyGeometrySummary["bbox"]>,
): GeometrySummary["bbox"] {
  const present = boxes.filter(
    (b): b is [number, number, number, number, number, number] => !!b,
  );
  if (!present.length) return null;
  return [
    Math.min(...present.map((b) => b[0])),
    Math.min(...present.map((b) => b[1])),
    Math.min(...present.map((b) => b[2])),
    Math.max(...present.map((b) => b[3])),
    Math.max(...present.map((b) => b[4])),
    Math.max(...present.map((b) => b[5])),
  ];
}

/** Per-body counts/bbox plus the shape digest, for tester evidence. */
export function geometrySummary(
  bodies: readonly BodyOutput[],
  options: GeometryDigestOptions = {},
): GeometrySummary {
  const canonical = canonicalBodies(bodies, options);
  const rows = bodies.map((body, i) => {
    // canonicalBodies sorts, so recompute per body for its own proof.
    const one = canonicalBody(body, options.quantum ?? DEFAULT_QUANTUM, false);
    const volumeM3 = volumeOf(body);
    return {
      featureId: body.featureId,
      kind: body.kind,
      vertices: one.vertices.length,
      edges: one.edges.length,
      faces: one.faces.length,
      volumeMM3: volumeM3 === null ? null : volumeM3 * 1e9,
      bbox: bboxOf(body),
      digest: hashGeometryText(stableStringify(one)),
      _canonical: canonical[i],
    };
  });
  rows.sort((a, b) => a.featureId.localeCompare(b.featureId));
  const summaries = rows.map(({ _canonical, ...row }) => row);
  return {
    digest: hashGeometryText(stableStringify(canonical)),
    bodies: summaries,
    totals: {
      bodies: bodies.length,
      vertices: summaries.reduce((n, b) => n + b.vertices, 0),
      edges: summaries.reduce((n, b) => n + b.edges, 0),
      faces: summaries.reduce((n, b) => n + b.faces, 0),
    },
    bbox: unionBbox(summaries.map((b) => b.bbox)),
  };
}
