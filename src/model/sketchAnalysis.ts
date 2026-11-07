import type { Sketch, SketchLine, SketchPoint } from "@vitekk02/cadjs";

export interface SketchAnalysis {
  openProfiles: number;
  closedProfiles: number;
  intersections: number;
  maxCurvature: number;
}

function pointsById(sketch: Sketch): Map<string, SketchPoint> {
  return new Map(
    sketch.primitives
      .filter(
        (primitive): primitive is SketchPoint => primitive.type === "point",
      )
      .map((point) => [point.id, point]),
  );
}

function linesOf(sketch: Sketch): SketchLine[] {
  return sketch.primitives.filter(
    (primitive): primitive is SketchLine =>
      primitive.type === "line" && !primitive.construction && !primitive.origin,
  );
}

function segmentIntersection(
  a1: SketchPoint,
  a2: SketchPoint,
  b1: SketchPoint,
  b2: SketchPoint,
): boolean {
  const cross = (ax: number, ay: number, bx: number, by: number) =>
    ax * by - ay * bx;
  const d1 = cross(a2.x - a1.x, a2.y - a1.y, b1.x - a1.x, b1.y - a1.y);
  const d2 = cross(a2.x - a1.x, a2.y - a1.y, b2.x - a1.x, b2.y - a1.y);
  const d3 = cross(b2.x - b1.x, b2.y - b1.y, a1.x - b1.x, a1.y - b1.y);
  const d4 = cross(b2.x - b1.x, b2.y - b1.y, a2.x - b1.x, a2.y - b1.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Pure, renderer-independent sketch diagnostics. */
export function analyzeSketch(sketch: Sketch): SketchAnalysis {
  const points = pointsById(sketch);
  const lines = linesOf(sketch);
  let intersections = 0;

  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    const a1 = points.get(a.p1Id);
    const a2 = points.get(a.p2Id);
    if (!a1 || !a2) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j]!;
      if (
        a.p1Id === b.p1Id ||
        a.p1Id === b.p2Id ||
        a.p2Id === b.p1Id ||
        a.p2Id === b.p2Id
      ) {
        continue;
      }
      const b1 = points.get(b.p1Id);
      const b2 = points.get(b.p2Id);
      if (b1 && b2 && segmentIntersection(a1, a2, b1, b2)) intersections++;
    }
  }

  const degree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  for (const line of lines) {
    const a = line.p1Id;
    const b = line.p2Id;
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
    const an = adjacency.get(a) ?? new Set<string>();
    const bn = adjacency.get(b) ?? new Set<string>();
    an.add(b);
    bn.add(a);
    adjacency.set(a, an);
    adjacency.set(b, bn);
  }

  const visited = new Set<string>();
  let openProfiles = 0;
  let closedProfiles = 0;
  for (const pointId of adjacency.keys()) {
    if (visited.has(pointId)) continue;
    const queue = [pointId];
    visited.add(pointId);
    let allDegreeTwo = true;
    let size = 0;
    while (queue.length) {
      const current = queue.pop()!;
      size++;
      if ((degree.get(current) ?? 0) !== 2) allDegreeTwo = false;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    if (size >= 3 && allDegreeTwo) closedProfiles++;
    else openProfiles++;
  }

  const maxCurvature = sketch.primitives.reduce((max, primitive) => {
    if (primitive.type === "circle" || primitive.type === "arc") {
      return Math.max(max, primitive.radius > 0 ? 1 / primitive.radius : 0);
    }
    return max;
  }, 0);

  return { openProfiles, closedProfiles, intersections, maxCurvature };
}
