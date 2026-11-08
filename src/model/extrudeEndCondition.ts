// Extrude end conditions as pure geometry. The executor resolves provenance
// (which body, face or vertex the bound names) and this module derives the
// depth, so no kernel call is involved and every mode is unit-testable.
//
// THROUGH_ALL    farthest world-vertex projection of the bodies the extrusion
//                must pass, plus an optional overshoot.
// UP_TO_FACE     plane intersection with the selected face polygon.
// UP_TO_SURFACE  farthest vertex of the selected polygon: exact for a planar
//                face, a tessellation estimate on a curved one.
// UP_TO_VERTEX   projection of the selected point.
//
// source: ONSHAPE_MAP.md endBound / endBoundEntity wire shape.

export type ExtrudeEndBound =
  | "BLIND"
  | "THROUGH_ALL"
  | "THROUGH_ALL_WITH_OFFSET"
  | "UP_TO_VERTEX"
  | "UP_TO_FACE"
  | "UP_TO_SURFACE";

export interface ExtrudeEndPoint {
  x: number;
  y: number;
  z: number;
}

export interface ExtrudeEndBody {
  /** World-space vertices. */
  vertices: ExtrudeEndPoint[];
  /** World-space face polygons. */
  faces: ExtrudeEndPoint[][];
}

export type EndBoundSolution =
  | { ok: true; depth: number }
  | { ok: false; reason: string };

export interface ExtrudeEndBoundInput {
  endBound: ExtrudeEndBound;
  /** World-space point on the sketch plane the extrusion starts from. */
  origin: ExtrudeEndPoint;
  /** Extrusion direction; normalised here. */
  direction: ExtrudeEndPoint;
  /** Bodies a THROUGH_ALL extrusion must pass. */
  throughBodies?: ExtrudeEndBody[] | undefined;
  /** Polygon of the selected UP_TO_FACE / UP_TO_SURFACE face. */
  face?: ExtrudeEndPoint[] | undefined;
  /** Selected UP_TO_VERTEX point. */
  vertex?: ExtrudeEndPoint | undefined;
  /** Distance past the far end for THROUGH_ALL_WITH_OFFSET. */
  offset?: number | undefined;
}

const EPS = 1e-9;

function dot(a: ExtrudeEndPoint, b: ExtrudeEndPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: ExtrudeEndPoint, b: ExtrudeEndPoint): ExtrudeEndPoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function unit(v: ExtrudeEndPoint): ExtrudeEndPoint | null {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length < EPS) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function project(
  p: ExtrudeEndPoint,
  origin: ExtrudeEndPoint,
  dir: ExtrudeEndPoint,
): number {
  return dot(sub(p, origin), dir);
}

/** Newell's polygon normal, normalised; null for a degenerate polygon. */
function planeNormal(face: ExtrudeEndPoint[]): ExtrudeEndPoint | null {
  if (face.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!;
    const b = face[(i + 1) % face.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return unit({ x: nx, y: ny, z: nz });
}

function farthestAlong(
  points: ExtrudeEndPoint[],
  origin: ExtrudeEndPoint,
  dir: ExtrudeEndPoint,
): number {
  let far = -Infinity;
  for (const p of points) far = Math.max(far, project(p, origin, dir));
  return far;
}

export function solveExtrudeEndBound(
  input: ExtrudeEndBoundInput,
): EndBoundSolution {
  const dir = unit(input.direction);
  if (!dir) {
    return { ok: false, reason: "extrude: extrude direction is degenerate" };
  }

  switch (input.endBound) {
    case "BLIND": {
      return {
        ok: false,
        reason: "extrude: blind end condition needs an explicit depth",
      };
    }
    case "THROUGH_ALL":
    case "THROUGH_ALL_WITH_OFFSET": {
      const offset =
        input.endBound === "THROUGH_ALL_WITH_OFFSET" ? (input.offset ?? 0) : 0;
      if (!(offset >= 0)) {
        return {
          ok: false,
          reason: "extrude: through-all offset must be zero or positive",
        };
      }
      let far = -Infinity;
      for (const body of input.throughBodies ?? []) {
        far = Math.max(far, farthestAlong(body.vertices, input.origin, dir));
      }
      if (!Number.isFinite(far) || far <= EPS) {
        return {
          ok: false,
          reason:
            "extrude: through-all found no body ahead of the sketch plane",
        };
      }
      return { ok: true, depth: far + offset };
    }
    case "UP_TO_VERTEX": {
      if (!input.vertex) {
        return {
          ok: false,
          reason: "extrude: up-to-vertex needs a resolved vertex",
        };
      }
      const t = project(input.vertex, input.origin, dir);
      if (t <= EPS) {
        return {
          ok: false,
          reason: "extrude: end vertex is behind the sketch plane",
        };
      }
      return { ok: true, depth: t };
    }
    case "UP_TO_FACE": {
      const face = input.face;
      const normal = face ? planeNormal(face) : null;
      if (!face || !normal) {
        return {
          ok: false,
          reason: "extrude: up-to-face needs a non-degenerate face polygon",
        };
      }
      const denominator = dot(dir, normal);
      if (Math.abs(denominator) < EPS) {
        return {
          ok: false,
          reason: "extrude: end face is parallel to the extrude direction",
        };
      }
      const t = dot(sub(face[0]!, input.origin), normal) / denominator;
      if (t <= EPS) {
        return {
          ok: false,
          reason: "extrude: end face is behind the sketch plane",
        };
      }
      return { ok: true, depth: t };
    }
    case "UP_TO_SURFACE": {
      const face = input.face;
      if (!face?.length) {
        return {
          ok: false,
          reason: "extrude: up-to-surface needs a resolved face",
        };
      }
      const far = farthestAlong(face, input.origin, dir);
      if (far <= EPS) {
        return {
          ok: false,
          reason: "extrude: end surface is behind the sketch plane",
        };
      }
      return { ok: true, depth: far };
    }
    default: {
      return {
        ok: false,
        reason: `extrude: unknown end condition ${String(input.endBound)}`,
      };
    }
  }
}
