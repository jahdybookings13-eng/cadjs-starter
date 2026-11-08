// Loft end conditions. This OCC build's BRepOffsetAPI_ThruSections exposes no
// end-tangency input, so the executor enforces an end condition by placing an
// extra copy of the end section along the requested departure direction before
// the ThruSections loft. The extra sections are parallel to the picked end
// section; they steer the end tangent without changing the profile shape.
// Curvature uses two extra sections with a lateral bend term.

export type LoftEndCondition =
  | "NONE"
  | "NORMAL"
  | "TANGENT"
  | "CURVATURE"
  | "DIRECTION";

export interface LoftPoint {
  x: number;
  y: number;
  z: number;
}

export interface LoftSectionFrame {
  centroid: LoftPoint;
  normal: LoftPoint;
}

export type LoftEndPlan =
  | { ok: true; before: LoftPoint[]; after: LoftPoint[] }
  | { ok: false; reason: string };

const sub = (a: LoftPoint, b: LoftPoint): LoftPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const add = (a: LoftPoint, b: LoftPoint): LoftPoint => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const scale = (a: LoftPoint, s: number): LoftPoint => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});
const dot = (a: LoftPoint, b: LoftPoint): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const distance = (a: LoftPoint, b: LoftPoint): number => {
  const d = sub(a, b);
  return Math.hypot(d.x, d.y, d.z);
};
const unit = (a: LoftPoint): LoftPoint | null => {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 1e-12 ? scale(a, 1 / l) : null;
};

/**
 * Centroid and Newell normal of one section. Vertices are local; the section
 * position is added so the result is in world space.
 */
export function loftSectionFrame(
  vertices: readonly LoftPoint[],
  position: LoftPoint,
): LoftSectionFrame | null {
  if (vertices.length < 3) return null;
  const centroidLocal = vertices.reduce(
    (a, v) => ({ x: a.x + v.x, y: a.y + v.y, z: a.z + v.z }),
    { x: 0, y: 0, z: 0 },
  );
  const inv = 1 / vertices.length;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const normal = unit({ x: nx, y: ny, z: nz });
  if (!normal) return null;
  return {
    centroid: {
      x: centroidLocal.x * inv + position.x,
      y: centroidLocal.y * inv + position.y,
      z: centroidLocal.z * inv + position.z,
    },
    normal,
  };
}

/** Parse a JSON vector: `[x, y, z]` or `{ "x": ..., "y": ..., "z": ... }`. */
export function parseLoftDirection(raw: string): LoftPoint | null {
  if (!raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const [x, y, z] = parsed;
      if ([x, y, z].every((n) => typeof n === "number" && Number.isFinite(n)))
        return { x: x as number, y: y as number, z: z as number };
      return null;
    }
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      if (
        typeof p["x"] === "number" &&
        typeof p["y"] === "number" &&
        typeof p["z"] === "number" &&
        [p["x"], p["y"], p["z"]].every(Number.isFinite)
      )
        return { x: p["x"], y: p["y"], z: p["z"] };
    }
  } catch {
    return null;
  }
  return null;
}

function endOffsets(
  condition: LoftEndCondition,
  rawOut: LoftPoint,
  normal: LoftPoint,
  previousSpan: LoftPoint | null,
  direction: LoftPoint | null,
  gap: number,
  endLabel: "start" | "end",
): LoftPoint[] | { error: string } {
  if (condition === "NONE") return [];
  const rawOutUnit = unit(rawOut);
  if (condition === "NORMAL") {
    let dir = normal;
    if (rawOutUnit && dot(dir, rawOutUnit) < 0) dir = scale(dir, -1);
    return [scale(dir, gap)];
  }
  if (condition === "DIRECTION") {
    const dir = direction ? unit(direction) : null;
    if (!dir)
      return {
        error: `loft: ${endLabel} direction needs a non-zero JSON vector`,
      };
    return [scale(dir, gap)];
  }
  if (!rawOutUnit) {
    return {
      error: `loft: ${endLabel} condition needs two distinct sections`,
    };
  }
  if (condition === "TANGENT") return [scale(rawOutUnit, gap)];
  if (condition !== "CURVATURE")
    return { error: `loft: unknown ${endLabel} condition ${condition}` };

  // CURVATURE: one section along the end tangent and a second that also bends
  // toward the change of tangent, so the loft leaves with finite curvature.
  let bend = { x: 0, y: 0, z: 0 };
  const previous = previousSpan ? unit(previousSpan) : null;
  if (previous) {
    const delta = unit(sub(rawOutUnit, previous));
    if (delta) bend = delta;
  }
  return [
    scale(rawOutUnit, gap),
    add(scale(rawOutUnit, gap * 1.8), scale(bend, gap * 0.5)),
  ];
}

/**
 * Plan extra sections outside the first/last section. Offsets are world-space
 * deltas; the executor adds each to the endpoint profile's position.
 */
export function planLoftEndSections(input: {
  sections: readonly LoftSectionFrame[];
  start: LoftEndCondition;
  end: LoftEndCondition;
  startDirection?: LoftPoint | null;
  endDirection?: LoftPoint | null;
}): LoftEndPlan {
  const { sections } = input;
  if (sections.length < 2) {
    return { ok: false, reason: "loft: need >=2 profiles" };
  }
  const first = sections[0]!;
  const second = sections[1]!;
  const last = sections[sections.length - 1]!;
  const penultimate = sections[sections.length - 2]!;

  const startGap = Math.max(
    1e-4,
    distance(first.centroid, second.centroid) * 0.6,
  );
  const endGap = Math.max(
    1e-4,
    distance(last.centroid, penultimate.centroid) * 0.6,
  );

  const startPrevious =
    sections.length >= 3 ? sub(second.centroid, sections[2]!.centroid) : null;
  const endPrevious =
    sections.length >= 3
      ? sub(penultimate.centroid, sections[sections.length - 3]!.centroid)
      : null;

  const startRaw = sub(first.centroid, second.centroid);
  const endRaw = sub(last.centroid, penultimate.centroid);
  const startNormal = {
    x: first.normal.x,
    y: first.normal.y,
    z: first.normal.z,
  };
  const endNormal = {
    x: last.normal.x,
    y: last.normal.y,
    z: last.normal.z,
  };

  const start = endOffsets(
    input.start,
    startRaw,
    startNormal,
    startPrevious,
    input.startDirection ?? null,
    startGap,
    "start",
  );
  if ("error" in start) return { ok: false, reason: start.error };

  const end = endOffsets(
    input.end,
    endRaw,
    endNormal,
    endPrevious,
    input.endDirection ?? null,
    endGap,
    "end",
  );
  if ("error" in end) return { ok: false, reason: end.error };

  return { ok: true, before: [...start].reverse(), after: end };
}
