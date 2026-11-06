// manufacture/geometry.ts — pure BREP → measurement extraction.
//
// Everything here is coordinate math over the analytic BRep (vertices/edges/
// faces). No OCC worker round-trip, so it runs in the browser and under vitest.
// Units: 1 scene unit = 1 mm (matches the print pipeline).
//
// A "view" is a third-angle projection defined by a world-space eye direction.
// Projected points are in a 2D frame whose +x is the view's "right" and +y is
// its "up", centered on the body's bbox center.

export type Pt3 = { x: number; y: number; z: number };
export type Pt2 = { x: number; y: number };

export interface Bbox3 {
  min: Pt3;
  max: Pt3;
  /** World-space center. */
  center: Pt3;
  /** (dx,dy,dz) extents in mm. */
  size: Pt3;
}

export interface Edge3 {
  index: number;
  a: Pt3;
  b: Pt3;
  length: number;
  /** Unit direction b−a. */
  dir: Pt3;
  midpoint: Pt3;
}

export interface Face3 {
  index: number;
  vertices: Pt3[];
  /** Unit outward-ish normal (the barycentric fan normal of the 1st 3 verts). */
  normal: Pt3 | null;
  /** Centroid. */
  centroid: Pt3;
  /** Fan-triangulated area. */
  area: number;
  /** Number of unique vertices (planar heuristic helper). */
  cornerCount: number;
  isPlanar: boolean;
}

export interface AxisDim {
  axis: "x" | "y" | "z";
  /** Measured extent along the axis, in mm. */
  value: number;
  /** A pair of endpoints realising the extent (for drawing the dim line). */
  p: Pt3;
  q: Pt3;
}

export interface RectDim {
  /** The face index this 2-D rectangle belongs to. */
  faceIndex: number;
  /** Axis-aligned edge lengths on that face (length of the 2 edge pairs). */
  dims: [number, number];
  /** World-space corner (for placing the dim text). */
  corner: Pt3;
}

export interface CircleDim {
  /** Edge index of the arc. */
  edgeIndex: number;
  center: Pt3;
  radius: number;
  /** Angular span in radians. */
  sweep: number;
}

export interface BodyGeometry {
  bbox: Bbox3;
  edges: Edge3[];
  faces: Face3[];
  /** Full-size dims: one per world axis. */
  axisDims: AxisDim[];
  /** Per-face rectangular (axis-aligned) 2-D dims. */
  rectDims: RectDim[];
  /** Per-edge circular/arc dims (exact circles first). */
  circleDims: CircleDim[];
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
}

const EPS = 1e-3;

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

const sub = (a: Pt3, b: Pt3): Pt3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const add = (a: Pt3, b: Pt3): Pt3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const scale = (a: Pt3, s: number): Pt3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});
const cross = (a: Pt3, b: Pt3): Pt3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: Pt3, b: Pt3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Pt3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: Pt3): Pt3 => {
  const l = len(a) || 1;
  return scale(a, 1 / l);
};
const key3 = (p: Pt3): string =>
  `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
const same = (a: Pt3, b: Pt3): boolean =>
  Math.abs(a.x - b.x) < EPS &&
  Math.abs(a.y - b.y) < EPS &&
  Math.abs(a.z - b.z) < EPS;
const mathClose = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

// ---------------------------------------------------------------------------
// View basis (third-angle projection frame)
// ---------------------------------------------------------------------------

export interface ViewBasis {
  /** Out of the projection plane, toward the viewer (eye). */
  eye: Pt3;
  /** In-plane "right" vector. */
  right: Pt3;
  /** In-plane "up" vector. */
  up: Pt3;
  /** World point → 2-D view point (centered on the body center). */
  to2: (p: Pt3, center: Pt3) => Pt2;
}

/**
 * Build a view basis from an eye direction (unit). The "right" vector is
 * perpendicular to eye, biased away from world +Z so the classic front view
 * keeps +Y up. `up = eye × right` by construction (right-handed).
 */
export function makeViewBasis(eyeDir: Pt3): ViewBasis {
  const eye = norm(eyeDir);
  // Pick a reference "up" that is not parallel to eye.
  const ref: Pt3 =
    Math.abs(eye.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const right = norm(cross(ref, eye));
  const up = cross(eye, right); // = ref-component removed from eye
  const to2 = (p: Pt3, center: Pt3): Pt2 => {
    const d = sub(p, center);
    return { x: dot(d, right), y: dot(d, up) };
  };
  return { eye, right, up, to2 };
}

/** Standard six third-angle orthographic views (eye = direction TO viewer). */
export const VIEWS = {
  front: { x: 0, y: 0, z: 1 },
  top: { x: 0, y: -1, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  left: { x: -1, y: 0, z: 0 },
  back: { x: 0, y: 0, z: -1 },
  bottom: { x: 0, y: 1, z: 0 },
  iso: { x: 1, y: 1, z: 1 },
} as const;

export type ViewName = keyof typeof VIEWS;

export function isViewName(s: string): s is ViewName {
  return s in VIEWS;
}

// ---------------------------------------------------------------------------
// BREP normalisation
// ---------------------------------------------------------------------------

interface RawEdge {
  start: Pt3;
  end: Pt3;
}
interface RawFace {
  vertices: Pt3[];
}

/** Accept either `brep` (live objects) or `brepJson` (serialisable form). */
export function normBrep(brepOrJson: unknown): {
  vertices: Pt3[];
  edges: RawEdge[];
  faces: RawFace[];
} {
  const b = brepOrJson as {
    vertices?: Pt3[];
    edges?: RawEdge[];
    faces?: RawFace[];
  };
  return {
    vertices: (b.vertices ?? []).map((v) => ({ ...v })),
    edges: (b.edges ?? []).map((e) => ({
      start: { ...e.start },
      end: { ...e.end },
    })),
    faces: (b.faces ?? []).map((f) => ({
      vertices: f.vertices.map((v) => ({ ...v })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function bboxOf(points: Pt3[]): Bbox3 {
  let min: Pt3 = { x: Infinity, y: Infinity, z: Infinity };
  let max: Pt3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  if (!Number.isFinite(min.x)) {
    min = { x: 0, y: 0, z: 0 };
    max = { x: 0, y: 0, z: 0 };
  }
  return {
    min,
    max,
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    },
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

function axisDim(bbox: Bbox3, axis: "x" | "y" | "z"): AxisDim {
  const p: Pt3 = { ...bbox.min };
  const q: Pt3 = { ...bbox.max };
  p[axis] = bbox.min[axis];
  q[axis] = bbox.max[axis];
  return { axis, value: bbox.size[axis], p, q };
}

function faceNormal(vertices: Pt3[]): Pt3 | null {
  if (vertices.length < 3) return null;
  const a = vertices[0];
  const b = vertices[1];
  const c = vertices[2];
  if (!a || !b || !c) return null;
  const n = cross(sub(b, a), sub(c, a));
  return len(n) < 1e-12 ? null : norm(n);
}

function faceArea(vertices: Pt3[]): number {
  if (vertices.length < 3) return 0;
  const a = vertices[0];
  if (!a) return 0;
  let area = 0;
  for (let i = 1; i + 1 < vertices.length; i += 1) {
    const b = vertices[i];
    const c = vertices[i + 1];
    if (!b || !c) break;
    area += len(cross(sub(b, a), sub(c, a))) / 2;
  }
  return area;
}

function isPlanarFace(vertices: Pt3[]): boolean {
  const n = faceNormal(vertices);
  if (!n) return false;
  const a = vertices[0];
  if (!a) return false;
  for (let i = 2; i < vertices.length; i += 1) {
    const p = vertices[i];
    if (!p) continue;
    if (Math.abs(dot(sub(p, a), n)) > EPS) return false;
  }
  return true;
}

function centroid(vertices: Pt3[]): Pt3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const v of vertices) {
    x += v.x;
    y += v.y;
    z += v.z;
    n += 1;
  }
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: x / n, y: y / n, z: z / n };
}

/** Unique vertex count (de-duplicated by quantised key). */
function cornerCount(vertices: Pt3[]): number {
  return new Set(vertices.map(key3)).size;
}

/**
 * If the face is a rectangle (vertices axis-aligned or parallel to a 2-D
 * plane, forming a closed 4-ring) return its two edge lengths (sorted) plus
 * the min-corner. Otherwise null.
 *
 * The kernel's `Face` carries planar co-vertices with NO ring/edge ordering
 * (face.vertices may come in any order), so we reconstruct the boundary ring
 * ourselves: start at the lexicographically-min vertex, then greedily chain to
 * the nearest *undecided* vertex each step. Because we define "nearest" in
 * 3-D space and the face is planar, a proper rectangle / square / square-
 * adjacent-to-rectangle chains the actual short-edge → long-edge → short-edge
 * → long-edge ring and never the spatial diagonal. We then validate the
 * result: every consecutive pair must share an axis (or be parallel to the
 * face normal); any failure returns null. A convex-hull test rejects
 * colinear quads.
 */
function rectDimsOfFace(vertices: Pt3[]): {
  dims: [number, number];
  corner: Pt3;
} | null {
  const n = cornerCount(vertices);
  if (n !== 4) return null;

  // -------- 1. order the 4 vertices into a ring (greedy NN chain) -----------
  const vs = [...vertices];
  const startIdx = vs.reduce((best, v, i) => {
    const b = vs[best];
    if (!b) return i;
    if (v.x < b.x) return i;
    if (v.x > b.x) return best;
    if (v.y < b.y) return i;
    if (v.y > b.y) return best;
    if (v.z < b.z) return i;
    return best;
  }, 0);
  const [start] = vs.splice(startIdx, 1);
  if (!start) return null;
  const ring: Pt3[] = [start];
  let cur = start;
  while (vs.length > 0) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < vs.length; i += 1) {
      const v = vs[i];
      if (!v) continue;
      const d = len(sub(v, cur));
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const next = vs.splice(bestI, 1)[0];
    if (!next) break;
    ring.push(next);
    cur = next;
  }
  if (ring.length !== 4) return null;
  const a0 = ring[0]!,
    a1 = ring[1]!,
    a2 = ring[2]!,
    a3 = ring[3]!;

  // -------- 2. convex hull / colinear guard --------------------------------
  // A truly convex quad in planar space has both diagonals INSIDE the quads
  // (sum-of-squares test in the ring). If the diagonals are longer than the
  // ring's perimeter / 2 it is a dart/concave shape — reject.
  const d12 = len(sub(a1, a3));
  const d23 = len(sub(a2, a0));
  const per =
    len(sub(a1, a0)) + len(sub(a2, a1)) + len(sub(a3, a2)) + len(sub(a0, a3));
  if (d12 > per / 2 || d23 > per / 2) return null;
  // All 4 points colinear → reject.
  const v01 = sub(a1, a0);
  const v02 = sub(a2, a0);
  if (
    Math.abs(cross(v01, v02).x) < EPS &&
    Math.abs(cross(v01, v02).y) < EPS &&
    Math.abs(cross(v01, v02).z) < EPS
  ) {
    return null;
  }

  // -------- 3. edge lengths of the ring --------------------------------------
  const e0 = len(sub(a1, a0));
  const e1 = len(sub(a2, a1));
  const e2 = len(sub(a3, a2));
  const e3 = len(sub(a0, a3));
  // Rectangle: opposite edges equal. Tolerance 1e-3 mm (sub-µm).
  if (Math.abs(e0 - e2) > 1e-3) return null;
  if (Math.abs(e1 - e3) > 1e-3) return null;
  // Reject degenerate (one pair ~0) — not a 2-D rectangle.
  if (e0 < EPS || e1 < EPS) return null;
  const dims = ([e0, e1] as [number, number]).sort((p, q) => p - q);
  if (!Number.isFinite(dims[0]) || !Number.isFinite(dims[1])) return null;
  if (dims[0] < EPS) return null;

  const U = (v: Pt3): Pt3 => (len(v) < EPS ? { x: 0, y: 0, z: 0 } : norm(v));
  const ne0 = U(sub(a1, a0));
  const ne1 = U(sub(a2, a1));
  const ne2 = U(sub(a3, a2));
  const ne3 = U(sub(a0, a3));
  // Rectangle: consecutive edges are orthogonal (|dot| ≈ 0) — never parallel.
  // Opposite edges are anti-parallel (dot ≈ -1) since we traverse a closed ring.
  // A diagonal-cross (bowtie) self-intersects: its opposite edges come out
  // parallel (dot ≈ +1) — reject that.
  const tol = 0.05; // ~3°
  if (Math.abs(dot(ne0, ne1)) > tol) return null; // corner 0→1 must turn
  if (Math.abs(dot(ne1, ne2)) > tol) return null; // corner 1→2 must turn
  if (Math.abs(dot(ne2, ne3)) > tol) return null; // corner 2→3 must turn
  if (Math.abs(dot(ne3, ne0)) > tol) return null; // corner 3→0 must turn
  // Opposite edges of a proper rectangle are ANTI-parallel (dot ≈ −1) because
  // we traverse a single closed ring around the perimeter: forward on e0,
  // backward on the parallel e2. A bowtie self-crosses and its opposite edges
  // come out parallel (dot ≈ +1) — reject.
  if (dot(ne0, ne2) > tol) return null; // want ≈ −1
  if (dot(ne1, ne3) > tol) return null;

  let corner: Pt3 = { x: Infinity, y: Infinity, z: Infinity };
  for (const v of ring) {
    if (
      v.x < corner.x ||
      (Math.abs(v.x - corner.x) < EPS && v.y < corner.y) ||
      (Math.abs(v.x - corner.x) < EPS &&
        Math.abs(v.y - corner.y) < EPS &&
        v.z < corner.z)
    ) {
      corner = { ...v };
    }
  }
  return { dims: [Number(dims[0]), Number(dims[1])], corner };
}

/**
 * Detect a circular/arc edge in the *local* BRep (before world transform the
 * caller passes). A circle/arc in this BRep is stored as two diametrically
 * opposed vertices joined by an edge; the true centre is their midpoint. We
 * flag an edge as a circle when it is "closed" (numerator and denominator of
 * the chord are ~zero within tolerance) — i.e. a full circle whose two
 * endpoints coincide after the kernel's arc-splitting. For our analytic box
 * geometry this will correctly return no circles.
 */
function circleDimsOfEdge(edgeIndex: number, a: Pt3, b: Pt3): CircleDim | null {
  // A full circle in this BRep representation encodes both endpoints at the
  // same point (kernel splits arcs); if they differ the edge is a straight
  // chord/line, so reject.
  if (!same(a, b)) return null;
  const r = len(a);
  if (r < EPS) return null;
  return { edgeIndex, center: { x: 0, y: 0, z: 0 }, radius: r, sweep: Math.PI };
}

/**
 * Extract full geometry measurements from a body. The `brep` may be a live
 * BRep object or its JSON form; `position`/`rotation` are optional world
 * transforms (if rotation is provided, vertices are rotated around the origin
 * by that Euler before translation by position).
 */
export function extractGeometry(
  brepOrJson: unknown,
  opts: {
    position?: Pt3;
    rotation?: { x: number; y: number; z: number };
  } = {},
): BodyGeometry {
  const raw = normBrep(brepOrJson);
  const pos = opts.position ?? { x: 0, y: 0, z: 0 };
  const rot = opts.rotation;

  // Apply rotation (XYZ Euler, radians) then translation, in world order.
  const xform = (p: Pt3): Pt3 => {
    let q = { ...p };
    if (rot) {
      const ex = rot.x;
      const ey = rot.y;
      const ez = rot.z;
      // Rx
      q = {
        x: q.x,
        y: q.y * Math.cos(ex) - q.z * Math.sin(ex),
        z: q.y * Math.sin(ex) + q.z * Math.cos(ex),
      };
      // Ry
      q = {
        x: q.x * Math.cos(ey) + q.z * Math.sin(ey),
        y: q.y,
        z: -q.x * Math.sin(ey) + q.z * Math.cos(ey),
      };
      // Rz
      q = {
        x: q.x * Math.cos(ez) - q.y * Math.sin(ez),
        y: q.x * Math.sin(ez) + q.y * Math.cos(ez),
        z: q.z,
      };
    }
    return { x: q.x + pos.x, y: q.y + pos.y, z: q.z + pos.z };
  };

  const vertices = raw.vertices.map(xform);
  const edges: Edge3[] = raw.edges.map((e, i) => {
    const a = xform(e.start);
    const b = xform(e.end);
    const d = sub(b, a);
    const l = len(d);
    return {
      index: i,
      a,
      b,
      length: l,
      dir: l > EPS ? norm(d) : { x: 0, y: 0, z: 0 },
      midpoint: {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
      },
    };
  });
  const faces: Face3[] = raw.faces.map((f, i) => {
    const vs = f.vertices.map(xform);
    return {
      index: i,
      vertices: vs,
      normal: faceNormal(vs),
      centroid: centroid(vs),
      area: faceArea(vs),
      cornerCount: cornerCount(vs),
      isPlanar: isPlanarFace(vs),
    };
  });

  const bbox = bboxOf(
    vertices.length
      ? vertices
      : edges.length
        ? edges.flatMap((e) => [e.a, e.b])
        : [{ x: 0, y: 0, z: 0 }],
  );

  const axisDims: AxisDim[] = (["x", "y", "z"] as const).map((axis) =>
    axisDim(bbox, axis),
  );
  const rectDims: RectDim[] = faces
    .map((f) => {
      if (!f.isPlanar || f.cornerCount < 4) return null;
      const r = rectDimsOfFace(f.vertices);
      return r ? { faceIndex: f.index, ...r } : null;
    })
    .filter((x): x is RectDim => x !== null);
  const circleDims: CircleDim[] = edges
    .map((e) => circleDimsOfEdge(e.index, e.a, e.b))
    .filter((x): x is CircleDim => x !== null);

  return {
    bbox,
    edges,
    faces,
    axisDims,
    rectDims,
    circleDims,
    vertexCount: vertices.length,
    edgeCount: edges.length,
    faceCount: faces.length,
  };
}

// ---------------------------------------------------------------------------
// Projection helpers (used by the DXF / USPTO renderers)
// ---------------------------------------------------------------------------

/** Project all edges of a body into a 2-D view, centered on the body center. */
export function projectEdges(
  g: BodyGeometry,
  view: ViewBasis,
): { a: Pt2; b: Pt2; index: number }[] {
  const c = g.bbox.center;
  return g.edges.map((e) => ({
    a: view.to2(e.a, c),
    b: view.to2(e.b, c),
    index: e.index,
  }));
}

/** Project a set of world points into a 2-D view. */
export function projectPoints(
  pts: Pt3[],
  view: ViewBasis,
  center: Pt3 = { x: 0, y: 0, z: 0 },
): Pt2[] {
  return pts.map((p) => view.to2(p, center));
}

export { dot, cross, sub, add, scale, len, norm, same };
