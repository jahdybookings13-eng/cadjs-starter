// Query predicates — selections against the JSON mesh. Pure functions over
// the brep JSON used everywhere in the starter: no OCC round trip, so they
// can drive the VR parameter panel without a worker call.
//
// Unimplemented (documented, ~90 predicates remain): curved-surface surface
// type checks, edge-on-surface, equal-length-shape matching beyond the
// exact-axis case, parallel-in-plane, longest/shortest, perpendicular,
// midpoint on plane, distance-to-plane, containment, and the various
// qIncludes/qContainsMatches combinations.
import type { Brep } from "@vitekk02/cadjs";

const TOL = 0.003; // 3 µm — same quantisation used by the OCC layer elsewhere

type V3 = { x: number; y: number; z: number };

const v = (a: unknown): V3 => {
  const o = a as Record<string, number>;
  return { x: Number(o.x), y: Number(o.y), z: Number(o.z) };
};
const sub = (a: V3, b: V3): V3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const add = (a: V3, b: V3): V3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const scale = (a: V3, s: number): V3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return scale(a, 1 / l);
};

const key = (p: V3): string =>
  `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;

export interface FacePredicates {
  faceArea(brep: Brep, faceIdx: number): number;
  faceNormal(brep: Brep, faceIdx: number): V3 | null;
  isPlanarFace(brep: Brep, faceIdx: number): boolean;
  faceVertexCount(brep: Brep, faceIdx: number): number;
  facesAdjacent(brep: Brep, faceIdxA: number, faceIdxB: number): boolean;
}
const facesOf = (brep: Brep): Array<{ vertices: V3[] }> =>
  (brep.faces as unknown as Array<{ vertices: V3[] }>).map((f) => ({
    vertices: f.vertices.map(v),
  }));

export const facePredicates: FacePredicates = {
  faceArea(brep, fi) {
    const f = facesOf(brep)[fi];
    if (!f) return 0;
    // fan from vertex 0 — triangulates convex faces, ok approximation otherwise
    let area = 0;
    const a = f.vertices[0];
    if (!a) return 0;
    for (let i = 1; i + 1 < f.vertices.length; i++) {
      const b = f.vertices[i];
      const c = f.vertices[i + 1];
      if (!b || !c) break;
      area += len(cross(sub(b, a), sub(c, a))) / 2;
    }
    return area;
  },
  faceNormal(brep, fi) {
    const f = facesOf(brep)[fi];
    if (!f) return null;
    const a = f.vertices[0];
    const b = f.vertices[1];
    const c = f.vertices[2];
    if (!a || !b || !c) return null;
    const n = cross(sub(b, a), sub(c, a));
    return len(n) < 1e-12 ? null : norm(n);
  },
  isPlanarFace(brep, fi) {
    const n = facePredicates.faceNormal(brep, fi);
    if (!n) return false;
    const f = facesOf(brep)[fi];
    if (!f) return false;
    const a = f.vertices[0];
    if (!a) return false;
    for (let i = 2; i < f.vertices.length; i++) {
      const p = f.vertices[i];
      if (!p) continue;
      if (Math.abs(dot(sub(p, a), n)) > TOL) return false;
    }
    return true;
  },
  faceVertexCount(brep, fi) {
    const f = facesOf(brep)[fi];
    return f ? new Set(f.vertices.map(key)).size : 0;
  },
  facesAdjacent(brep, fa, fb) {
    if (fa === fb) return false;
    const fs = facesOf(brep);
    const a = fs[fa];
    const b = fs[fb];
    if (!a || !b) return false;
    const sa = new Set(a.vertices.map(key));
    let shared = 0;
    for (const p of b.vertices) if (sa.has(key(p))) shared++;
    return shared >= 2;
  },
};

export type EdgePredicates = {
  edgeLength(brep: Brep, edgeIdx: number): number;
  edgeDirection(brep: Brep, edgeIdx: number): V3 | null;
  edgeMidpoint(brep: Brep, edgeIdx: number): V3 | null;
  edgesParallel(brep: Brep, ea: number, eb: number): boolean;
  edgesEqualLength(brep: Brep, ea: number, eb: number): boolean;
  edgesShareVertex(brep: Brep, ea: number, eb: number): boolean;
};
const edgesOf = (brep: Brep): Array<{ start: V3; end: V3 }> =>
  (brep.edges as unknown as Array<{ start: V3; end: V3 }>).map((e) => ({
    start: v(e.start),
    end: v(e.end),
  }));

export const edgePredicates: EdgePredicates = {
  edgeLength(brep, i) {
    const e = edgesOf(brep)[i];
    return e ? len(sub(e.end, e.start)) : 0;
  },
  edgeDirection(brep, i) {
    const e = edgesOf(brep)[i];
    return e ? norm(sub(e.end, e.start)) : null;
  },
  edgeMidpoint(brep, i) {
    const e = edgesOf(brep)[i];
    return e ? scale(add(e.start, e.end), 0.5) : null;
  },
  edgesParallel(brep, ea, eb) {
    const da = edgePredicates.edgeDirection(brep, ea);
    const db = edgePredicates.edgeDirection(brep, eb);
    if (!da || !db) return false;
    const d = Math.abs(dot(da, db));
    return d > 0.999; // ~2.5°
  },
  edgesEqualLength(brep, ea, eb) {
    const la = edgePredicates.edgeLength(brep, ea);
    const lb = edgePredicates.edgeLength(brep, eb);
    return Math.abs(la - lb) < TOL;
  },
  edgesShareVertex(brep, ea, eb) {
    const a = edgesOf(brep)[ea];
    const b = edgesOf(brep)[eb];
    if (!a || !b) return false;
    const sa = new Set([key(a.start), key(a.end)]);
    return sa.has(key(b.start)) || sa.has(key(b.end));
  },
};

export type FaceQuery =
  | { kind: "planar" }
  | { kind: "area-gt"; value: number }
  | { kind: "at-least-vertices"; count: number }
  | { kind: "normal-alignment"; axis: "x" | "y" | "z"; sign: 1 | -1 };

export function queryFaces(brep: Brep, q: FaceQuery): number[] {
  const n = facesOf(brep).length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    switch (q.kind) {
      case "planar":
        if (facePredicates.isPlanarFace(brep, i)) out.push(i);
        break;
      case "area-gt":
        if (facePredicates.faceArea(brep, i) > q.value) out.push(i);
        break;
      case "at-least-vertices":
        if (facePredicates.faceVertexCount(brep, i) >= q.count) out.push(i);
        break;
      case "normal-alignment": {
        const nx = facePredicates.faceNormal(brep, i);
        if (!nx) break;
        const c = q.axis === "x" ? nx.x : q.axis === "y" ? nx.y : nx.z;
        if (c * q.sign > 0.999) out.push(i);
        break;
      }
    }
  }
  return out;
}

export type EdgeQuery =
  | { kind: "length-gt"; value: number }
  | { kind: "parallel" }
  | { kind: "equal-length"; length: number }
  | { kind: "parallel-axis"; axis: "x" | "y" | "z" };

export function queryEdges(brep: Brep, q: EdgeQuery): number[] {
  const n = edgesOf(brep).length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    switch (q.kind) {
      case "length-gt":
        if (edgePredicates.edgeLength(brep, i) > q.value) out.push(i);
        break;
      case "parallel": {
        // any edge parallel to edge 0? keep symmetric: all edges parallel to each other
        const base = edgesOf(brep)[0];
        if (!base) continue;
        if (edgePredicates.edgesParallel(brep, 0, i)) out.push(i);
        break;
      }
      case "equal-length":
        if (Math.abs(edgePredicates.edgeLength(brep, i) - q.length) < TOL)
          out.push(i);
        break;
      case "parallel-axis": {
        const d = edgePredicates.edgeDirection(brep, i);
        if (!d) break;
        const abs =
          q.axis === "x"
            ? Math.abs(d.x)
            : q.axis === "y"
              ? Math.abs(d.y)
              : Math.abs(d.z);
        if (abs > 0.999) out.push(i);
        break;
      }
    }
  }
  return out;
}
