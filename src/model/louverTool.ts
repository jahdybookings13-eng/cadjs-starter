import {
  Brep,
  Edge as BrepEdge,
  Face as BrepFace,
  Vertex as BrepVertex,
} from "@vitekk02/cadjs";

export interface LouverVec3 {
  x: number;
  y: number;
  z: number;
}

const EPS = 1e-9;

function add(a: LouverVec3, b: LouverVec3): LouverVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: LouverVec3, b: LouverVec3): LouverVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a: LouverVec3, s: number): LouverVec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: LouverVec3, b: LouverVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: LouverVec3, b: LouverVec3): LouverVec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function unit(a: LouverVec3): LouverVec3 | null {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > EPS ? scale(a, 1 / length) : null;
}

export function buildLouverTools(
  bodyVertices: readonly LouverVec3[],
  faceVertices: readonly LouverVec3[],
  length: number,
  width: number,
  depth: number,
  angleRad: number,
  count: number,
  spacing: number,
): { cutters: Brep[]; tabs: Brep[] } {
  if (
    bodyVertices.length < 3 ||
    faceVertices.length < 3 ||
    !(length > 0) ||
    !(width > 0) ||
    !(depth > 0) ||
    !(count >= 1)
  )
    return { cutters: [], tabs: [] };

  const normal = unit(
    cross(
      sub(faceVertices[1]!, faceVertices[0]!),
      sub(faceVertices[2]!, faceVertices[0]!),
    ),
  );
  if (!normal) return { cutters: [], tabs: [] };

  let longest: LouverVec3 | null = null;
  let longestLength = 0;
  for (let i = 0; i < faceVertices.length; i++) {
    const edge = sub(
      faceVertices[(i + 1) % faceVertices.length]!,
      faceVertices[i]!,
    );
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z);
    if (edgeLength > longestLength) {
      longestLength = edgeLength;
      longest = edge;
    }
  }
  const u = longest ? unit(longest) : null;
  if (!u) return { cutters: [], tabs: [] };
  const v = unit(cross(normal, u));
  if (!v) return { cutters: [], tabs: [] };

  const centroid = scale(
    faceVertices.reduce((acc, point) => add(acc, point), { x: 0, y: 0, z: 0 }),
    1 / faceVertices.length,
  );
  let min = Infinity;
  let max = -Infinity;
  for (const vertex of bodyVertices) {
    const projection = dot(vertex, normal);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  const through = max - min;
  if (!(through > EPS)) return { cutters: [], tabs: [] };

  const margin = Math.max(width, depth, through * 0.1, 1e-3);
  const pitch = width + Math.max(0, spacing);
  const tabThickness = Math.max(depth * 0.25, 0.0005);
  const cutters: Brep[] = [];
  const tabs: Brep[] = [];

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * pitch;
    const slotCenter = add(
      add(centroid, scale(u, offset)),
      scale(normal, (min + max) / 2),
    );
    cutters.push(
      boxBrep(slotCenter, u, v, normal, length, width, through + 2 * margin),
    );

    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const tabU = unit(add(scale(u, c), scale(normal, s)));
    const tabN = unit(sub(scale(normal, c), scale(u, s)));
    if (!tabU || !tabN) continue;
    const hinge = add(
      add(centroid, scale(u, offset + length / 2 - tabThickness)),
      scale(normal, depth / 2),
    );
    const tabCenter = add(
      add(hinge, scale(tabU, length / 2)),
      scale(tabN, tabThickness / 2),
    );
    tabs.push(boxBrep(tabCenter, tabU, v, tabN, length, width, tabThickness));
  }
  return { cutters, tabs };
}

function boxBrep(
  center: LouverVec3,
  u: LouverVec3,
  v: LouverVec3,
  w: LouverVec3,
  sizeU: number,
  sizeV: number,
  sizeW: number,
): Brep {
  const hu = sizeU / 2;
  const hv = sizeV / 2;
  const hw = sizeW / 2;
  const point = (a: number, b: number, c: number): LouverVec3 =>
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
