import {
  Brep,
  Edge as BrepEdge,
  Face as BrepFace,
  Vertex as BrepVertex,
} from "@vitekk02/cadjs";

export interface ReliefVec3 {
  x: number;
  y: number;
  z: number;
}

const EPS = 1e-9;

function add(a: ReliefVec3, b: ReliefVec3): ReliefVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: ReliefVec3, b: ReliefVec3): ReliefVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: ReliefVec3, s: number): ReliefVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: ReliefVec3, b: ReliefVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: ReliefVec3, b: ReliefVec3): ReliefVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function unit(a: ReliefVec3): ReliefVec3 | null {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > EPS ? scale(a, 1 / length) : null;
}

/**
 * Build the solid cutters for a bend-relief feature. The selected edge is the
 * bend line; each cutter starts just outside the sheet at one end of that line
 * and extends `depth` inward, leaving a real notch rather than a no-op.
 */
export function buildReliefToolBreps(
  bodyVertices: readonly ReliefVec3[],
  edgeStart: ReliefVec3,
  edgeEnd: ReliefVec3,
  width: number,
  depth: number,
  placement: "auto" | "corners" | "manual" = "auto",
): Brep[] {
  if (!(width > 0) || !(depth > 0) || bodyVertices.length < 3) return [];
  const u = unit(sub(edgeEnd, edgeStart));
  if (!u) return [];

  const center = scale(
    bodyVertices.reduce((acc, v) => add(acc, v), { x: 0, y: 0, z: 0 }),
    1 / bodyVertices.length,
  );
  const midpoint = scale(add(edgeStart, edgeEnd), 0.5);
  let inward = sub(center, midpoint);
  inward = sub(inward, scale(u, dot(inward, u)));
  const v = unit(inward);
  if (!v) return [];
  const w = unit(cross(u, v));
  if (!w) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const vertex of bodyVertices) {
    const projection = dot(vertex, w);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  const through = max - min;
  if (!(through > EPS)) return [];

  const margin = Math.max(width, depth, through * 0.1, 1e-3);
  const sizeU = width + margin;
  const sizeV = depth + margin;
  const throughSize = through + 2 * margin;
  const centerW = (min + max) / 2;

  // `auto` and `corners` relieve both ends of the bend line. `manual` leaves
  // one cutter at the start so callers can position the edge deliberately.
  const ends = placement === "manual" ? [edgeStart] : [edgeStart, edgeEnd];

  return ends.map((end, index) => {
    const direction = ends.length > 1 && index === 1 ? -1 : 1;
    const centerU = (direction * (width - margin)) / 2;
    const centerV = (depth - margin) / 2;
    const boxCenter = add(
      add(end, scale(u, centerU)),
      add(scale(v, centerV), scale(w, centerW)),
    );
    return boxBrep(boxCenter, u, v, w, sizeU, sizeV, throughSize);
  });
}

function boxBrep(
  center: ReliefVec3,
  u: ReliefVec3,
  v: ReliefVec3,
  w: ReliefVec3,
  sizeU: number,
  sizeV: number,
  sizeW: number,
): Brep {
  const hu = sizeU / 2;
  const hv = sizeV / 2;
  const hw = sizeW / 2;
  const point = (a: number, b: number, c: number): ReliefVec3 =>
    add(center, add(scale(u, a * hu), add(scale(v, b * hv), scale(w, c * hw))));
  const points = [
    point(-1, -1, -1),
    point(1, -1, -1),
    point(1, 1, -1),
    point(-1, 1, -1),
    point(-1, -1, 1),
    point(1, -1, 1),
    point(1, 1, 1),
    point(-1, 1, 1),
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
  ] as const;

  return new Brep(
    points.map((p) => new BrepVertex(p.x, p.y, p.z)),
    edges.map(
      ([a, b]) =>
        new BrepEdge(
          new BrepVertex(points[a]!.x, points[a]!.y, points[a]!.z),
          new BrepVertex(points[b]!.x, points[b]!.y, points[b]!.z),
        ),
    ),
    faces.map(
      (indices) =>
        new BrepFace(
          indices.map(
            (i) => new BrepVertex(points[i]!.x, points[i]!.y, points[i]!.z),
          ),
        ),
    ),
  );
}
