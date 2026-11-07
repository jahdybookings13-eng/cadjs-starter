// Pure 2D intersection math (line-line, line-arc, arc-arc).
// No Result<T>: math returns null/empty for "no intersection"; that's not a
// recoverable error, just a result. See ./result.ts for the policy.
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchPrimitive,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
  findSketchLine,
  findSketchArc,
} from "../types/sketch-types";
import {
  ANGLE_TOL_RAD,
  LINEAR_TOL,
  PARAM_BOUNDS_TOL,
  TANGENT_DISCRIMINANT_TOL,
} from "../tolerances";
import { SKETCH_ANGLE_DEDUP_RAD } from "../sketch-tolerances";

export interface IntersectionResult {
  point: { x: number; y: number };
  // tSource/tOther: 0..1 along a line, angle (radians) on circles/arcs.
  tSource: number;
  tOther: number;
  otherPrimId: string;
}

// Returns null if the lines are parallel.
export function lineLineIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): { point: { x: number; y: number }; t: number; u: number } | null {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < LINEAR_TOL) return null;

  const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom;
  const u = ((p3.x - p1.x) * dy1 - (p3.y - p1.y) * dx1) / denom;

  return {
    point: { x: p1.x + t * dx1, y: p1.y + t * dy1 },
    t,
    u,
  };
}

export function lineCircleIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
): { point: { x: number; y: number }; t: number; angle: number }[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -LINEAR_TOL) return [];

  const results: {
    point: { x: number; y: number };
    t: number;
    angle: number;
  }[] = [];
  const sqrtD = Math.sqrt(Math.max(0, discriminant));

  for (const sign of [-1, 1]) {
    const t = (-b + sign * sqrtD) / (2 * a);
    const x = p1.x + t * dx;
    const y = p1.y + t * dy;
    const angle = Math.atan2(y - center.y, x - center.x);
    results.push({ point: { x, y }, t, angle });
  }

  // Near-zero discriminant means tangent, collapse the duplicate root.
  if (discriminant < TANGENT_DISCRIMINANT_TOL && results.length === 2) {
    return [results[0]!];
  }

  return results;
}

export function circleCircleIntersect(
  c1: { x: number; y: number },
  r1: number,
  c2: { x: number; y: number },
  r2: number,
): { point: { x: number; y: number }; angle1: number; angle2: number }[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (
    d > r1 + r2 + LINEAR_TOL ||
    d < Math.abs(r1 - r2) - LINEAR_TOL ||
    d < LINEAR_TOL
  ) {
    return [];
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

  const mx = c1.x + (a * dx) / d;
  const my = c1.y + (a * dy) / d;

  const results: {
    point: { x: number; y: number };
    angle1: number;
    angle2: number;
  }[] = [];

  for (const sign of [-1, 1]) {
    const x = mx + (sign * h * dy) / d;
    const y = my - (sign * h * dx) / d;
    results.push({
      point: { x, y },
      angle1: Math.atan2(y - c1.y, x - c1.x),
      angle2: Math.atan2(y - c2.y, x - c2.x),
    });
  }

  if (h < TANGENT_DISCRIMINANT_TOL && results.length === 2) {
    return [results[0]!];
  }

  return results;
}

export function normalizeAngle(a: number): number {
  while (a < 0) a += 2 * Math.PI;
  while (a >= 2 * Math.PI) a -= 2 * Math.PI;
  return a;
}

export function isAngleInArcRange(
  angle: number,
  startAngle: number,
  endAngle: number,
): boolean {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(startAngle);
  const e = normalizeAngle(endAngle);

  if (s <= e) {
    return a >= s - ANGLE_TOL_RAD && a <= e + ANGLE_TOL_RAD;
  } else {
    return a >= s - ANGLE_TOL_RAD || a <= e + ANGLE_TOL_RAD;
  }
}

function getPointById(sketch: Sketch, id: string): SketchPoint | null {
  return findSketchPoint(sketch.primitives, id) ?? null;
}

function getLineEndpoints(
  sketch: Sketch,
  line: SketchLine,
): { p1: { x: number; y: number }; p2: { x: number; y: number } } | null {
  const pt1 = getPointById(sketch, line.p1Id);
  const pt2 = getPointById(sketch, line.p2Id);
  if (!pt1 || !pt2) return null;
  return { p1: { x: pt1.x, y: pt1.y }, p2: { x: pt2.x, y: pt2.y } };
}

function getCircleCenter(
  sketch: Sketch,
  prim: SketchCircle | SketchArc,
): { x: number; y: number } | null {
  const center = getPointById(sketch, prim.centerId);
  return center ? { x: center.x, y: center.y } : null;
}

export function getArcAngles(
  sketch: Sketch,
  arc: SketchArc,
): { startAngle: number; endAngle: number } | null {
  const center = getPointById(sketch, arc.centerId);
  const startPt = getPointById(sketch, arc.startId);
  const endPt = getPointById(sketch, arc.endId);
  if (!center || !startPt || !endPt) return null;
  return {
    startAngle: Math.atan2(startPt.y - center.y, startPt.x - center.x),
    endAngle: Math.atan2(endPt.y - center.y, endPt.x - center.x),
  };
}

// Returned intersections must lie on both primitives within their bounds.
export function findAllIntersections(
  sketch: Sketch,
  sourcePrimId: string,
): IntersectionResult[] {
  const sourcePrim = sketch.primitives.find((p) => p.id === sourcePrimId);
  if (!sourcePrim) return [];

  const results: IntersectionResult[] = [];

  for (const otherPrim of sketch.primitives) {
    if (otherPrim.id === sourcePrimId) continue;
    if (isSketchPoint(otherPrim)) continue;

    const intersections = findPrimitivePairIntersections(
      sketch,
      sourcePrim,
      otherPrim,
    );
    for (const ix of intersections) {
      results.push({ ...ix, otherPrimId: otherPrim.id });
    }
  }

  return results;
}

function findPrimitivePairIntersections(
  sketch: Sketch,
  source: SketchPrimitive,
  other: SketchPrimitive,
): Omit<IntersectionResult, "otherPrimId">[] {
  if (isSketchLine(source) && isSketchLine(other)) {
    return intersectLineLine(sketch, source, other);
  }
  if (isSketchLine(source) && isSketchCircle(other)) {
    return intersectLineCircle(sketch, source, other);
  }
  if (isSketchLine(source) && isSketchArc(other)) {
    return intersectLineArc(sketch, source, other);
  }
  if (isSketchCircle(source) && isSketchLine(other)) {
    return intersectLineCircle(sketch, other, source).map((r) => ({
      point: r.point,
      tSource: r.tOther,
      tOther: r.tSource,
    }));
  }
  if (isSketchCircle(source) && isSketchCircle(other)) {
    return intersectCircleCircle(sketch, source, other);
  }
  if (isSketchCircle(source) && isSketchArc(other)) {
    return intersectCircleArc(sketch, source, other);
  }
  if (isSketchArc(source) && isSketchLine(other)) {
    return intersectLineArc(sketch, other, source).map((r) => ({
      point: r.point,
      tSource: r.tOther,
      tOther: r.tSource,
    }));
  }
  if (isSketchArc(source) && isSketchCircle(other)) {
    return intersectCircleArc(sketch, other, source).map((r) => ({
      point: r.point,
      tSource: r.tOther,
      tOther: r.tSource,
    }));
  }
  if (isSketchArc(source) && isSketchArc(other)) {
    return intersectArcArc(sketch, source, other);
  }
  return [];
}

function intersectLineLine(
  sketch: Sketch,
  l1: SketchLine,
  l2: SketchLine,
): Omit<IntersectionResult, "otherPrimId">[] {
  // Lines sharing an endpoint don't count as intersections.
  if (
    l1.p1Id === l2.p1Id ||
    l1.p1Id === l2.p2Id ||
    l1.p2Id === l2.p1Id ||
    l1.p2Id === l2.p2Id
  ) {
    return [];
  }

  const e1 = getLineEndpoints(sketch, l1);
  const e2 = getLineEndpoints(sketch, l2);
  if (!e1 || !e2) return [];

  const result = lineLineIntersect(e1.p1, e1.p2, e2.p1, e2.p2);
  if (!result) return [];

  if (
    result.t < -PARAM_BOUNDS_TOL ||
    result.t > 1 + PARAM_BOUNDS_TOL ||
    result.u < -PARAM_BOUNDS_TOL ||
    result.u > 1 + PARAM_BOUNDS_TOL
  ) {
    return [];
  }

  return [{ point: result.point, tSource: result.t, tOther: result.u }];
}

function intersectLineCircle(
  sketch: Sketch,
  line: SketchLine,
  circle: SketchCircle,
): Omit<IntersectionResult, "otherPrimId">[] {
  const ends = getLineEndpoints(sketch, line);
  const center = getCircleCenter(sketch, circle);
  if (!ends || !center) return [];

  const ixs = lineCircleIntersect(ends.p1, ends.p2, center, circle.radius);
  return ixs
    .filter((ix) => ix.t >= -PARAM_BOUNDS_TOL && ix.t <= 1 + PARAM_BOUNDS_TOL)
    .map((ix) => ({ point: ix.point, tSource: ix.t, tOther: ix.angle }));
}

function intersectLineArc(
  sketch: Sketch,
  line: SketchLine,
  arc: SketchArc,
): Omit<IntersectionResult, "otherPrimId">[] {
  const ends = getLineEndpoints(sketch, line);
  const center = getCircleCenter(sketch, arc);
  const angles = getArcAngles(sketch, arc);
  if (!ends || !center || !angles) return [];

  const ixs = lineCircleIntersect(ends.p1, ends.p2, center, arc.radius);
  return ixs
    .filter(
      (ix) =>
        ix.t >= -PARAM_BOUNDS_TOL &&
        ix.t <= 1 + PARAM_BOUNDS_TOL &&
        isAngleInArcRange(ix.angle, angles.startAngle, angles.endAngle),
    )
    .map((ix) => ({ point: ix.point, tSource: ix.t, tOther: ix.angle }));
}

function intersectCircleCircle(
  sketch: Sketch,
  c1: SketchCircle,
  c2: SketchCircle,
): Omit<IntersectionResult, "otherPrimId">[] {
  const center1 = getCircleCenter(sketch, c1);
  const center2 = getCircleCenter(sketch, c2);
  if (!center1 || !center2) return [];

  return circleCircleIntersect(center1, c1.radius, center2, c2.radius).map(
    (ix) => ({ point: ix.point, tSource: ix.angle1, tOther: ix.angle2 }),
  );
}

function intersectCircleArc(
  sketch: Sketch,
  circle: SketchCircle,
  arc: SketchArc,
): Omit<IntersectionResult, "otherPrimId">[] {
  const center1 = getCircleCenter(sketch, circle);
  const center2 = getCircleCenter(sketch, arc);
  const angles = getArcAngles(sketch, arc);
  if (!center1 || !center2 || !angles) return [];

  return circleCircleIntersect(center1, circle.radius, center2, arc.radius)
    .filter((ix) =>
      isAngleInArcRange(ix.angle2, angles.startAngle, angles.endAngle),
    )
    .map((ix) => ({ point: ix.point, tSource: ix.angle1, tOther: ix.angle2 }));
}

function intersectArcArc(
  sketch: Sketch,
  arc1: SketchArc,
  arc2: SketchArc,
): Omit<IntersectionResult, "otherPrimId">[] {
  const center1 = getCircleCenter(sketch, arc1);
  const center2 = getCircleCenter(sketch, arc2);
  const angles1 = getArcAngles(sketch, arc1);
  const angles2 = getArcAngles(sketch, arc2);
  if (!center1 || !center2 || !angles1 || !angles2) return [];

  return circleCircleIntersect(center1, arc1.radius, center2, arc2.radius)
    .filter(
      (ix) =>
        isAngleInArcRange(ix.angle1, angles1.startAngle, angles1.endAngle) &&
        isAngleInArcRange(ix.angle2, angles2.startAngle, angles2.endAngle),
    )
    .map((ix) => ({ point: ix.point, tSource: ix.angle1, tOther: ix.angle2 }));
}

// Locates the trim span containing the cursor. Returns [startParam, endParam] in line t (0..1)
// or arc/circle angle units.
export function identifyTrimSegment(
  sketch: Sketch,
  primId: string,
  intersections: IntersectionResult[],
  cursorPoint: { x: number; y: number },
): { startParam: number; endParam: number } | null {
  const prim = sketch.primitives.find((p) => p.id === primId);
  if (!prim || isSketchPoint(prim)) return null;

  if (intersections.length === 0) return null;

  if (isSketchLine(prim)) {
    return identifyLineTrimSegment(sketch, prim, intersections, cursorPoint);
  }

  if (isSketchCircle(prim)) {
    return identifyCircleTrimSegment(sketch, prim, intersections, cursorPoint);
  }

  if (isSketchArc(prim)) {
    return identifyArcTrimSegment(sketch, prim, intersections, cursorPoint);
  }

  return null;
}

function identifyLineTrimSegment(
  sketch: Sketch,
  line: SketchLine,
  intersections: IntersectionResult[],
  cursorPoint: { x: number; y: number },
): { startParam: number; endParam: number } | null {
  const ends = getLineEndpoints(sketch, line);
  if (!ends) return null;

  const dx = ends.p2.x - ends.p1.x;
  const dy = ends.p2.y - ends.p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < LINEAR_TOL) return null;

  const cursorT =
    ((cursorPoint.x - ends.p1.x) * dx + (cursorPoint.y - ends.p1.y) * dy) /
    len2;

  // Cap the parameter list with the line endpoints so the cursor can fall in the first/last span.
  const tValues = [
    0,
    ...intersections.map((ix) => ix.tSource).sort((a, b) => a - b),
    1,
  ];

  for (let i = 0; i < tValues.length - 1; i++) {
    if (
      cursorT >= tValues[i]! - PARAM_BOUNDS_TOL &&
      cursorT <= tValues[i + 1]! + PARAM_BOUNDS_TOL
    ) {
      return { startParam: tValues[i]!, endParam: tValues[i + 1]! };
    }
  }

  return null;
}

function identifyCircleTrimSegment(
  sketch: Sketch,
  circle: SketchCircle,
  intersections: IntersectionResult[],
  cursorPoint: { x: number; y: number },
): { startParam: number; endParam: number } | null {
  const center = getCircleCenter(sketch, circle);
  if (!center) return null;

  if (intersections.length < 2) return null;

  const cursorAngle = normalizeAngle(
    Math.atan2(cursorPoint.y - center.y, cursorPoint.x - center.x),
  );

  const rawAngles = intersections
    .map((ix) => normalizeAngle(ix.tSource))
    .sort((a, b) => a - b);
  const angles: number[] = [];
  for (const a of rawAngles) {
    if (
      angles.length === 0 ||
      a - angles[angles.length - 1]! > SKETCH_ANGLE_DEDUP_RAD
    ) {
      angles.push(a);
    }
  }
  // Wrap-around: an angle near 2π collapses with one near 0.
  if (
    angles.length >= 2 &&
    angles[0]! + 2 * Math.PI - angles[angles.length - 1]! <
      SKETCH_ANGLE_DEDUP_RAD
  ) {
    angles.pop();
  }

  if (angles.length < 2) return null;

  for (let i = 0; i < angles.length; i++) {
    const start = angles[i]!;
    const end = angles[(i + 1) % angles.length]!;
    if (isAngleInArcRange(cursorAngle, start, end)) {
      return { startParam: start, endParam: end };
    }
  }

  return null;
}

function identifyArcTrimSegment(
  sketch: Sketch,
  arc: SketchArc,
  intersections: IntersectionResult[],
  cursorPoint: { x: number; y: number },
): { startParam: number; endParam: number } | null {
  const center = getCircleCenter(sketch, arc);
  const arcAngles = getArcAngles(sketch, arc);
  if (!center || !arcAngles) return null;

  const cursorAngle = Math.atan2(
    cursorPoint.y - center.y,
    cursorPoint.x - center.x,
  );

  // Drop intersections at the arc's own endpoints, those are connections, not cuts.
  const BOUNDARY_TOL = 0.03;
  const sA = normalizeAngle(arcAngles.startAngle);
  const eA = normalizeAngle(arcAngles.endAngle);
  const filteredIx = intersections.filter((ix) => {
    const ixAngle = normalizeAngle(ix.tSource);
    const dStart = Math.min(
      Math.abs(ixAngle - sA),
      2 * Math.PI - Math.abs(ixAngle - sA),
    );
    const dEnd = Math.min(
      Math.abs(ixAngle - eA),
      2 * Math.PI - Math.abs(ixAngle - eA),
    );
    return dStart > BOUNDARY_TOL && dEnd > BOUNDARY_TOL;
  });

  if (filteredIx.length === 0) {
    const arcStart = normalizeAngle(arcAngles.startAngle);
    const arcEnd = normalizeAngle(arcAngles.endAngle);
    if (isAngleInArcRange(cursorAngle, arcStart, arcEnd)) {
      return { startParam: arcStart, endParam: arcEnd };
    }
    return null;
  }

  const arcStart = normalizeAngle(arcAngles.startAngle);
  const ixAngles = filteredIx
    .map((ix) => normalizeAngle(ix.tSource))
    .filter((a) =>
      isAngleInArcRange(a, arcAngles.startAngle, arcAngles.endAngle),
    )
    .sort(
      (a, b) => normalizeAngle(a - arcStart) - normalizeAngle(b - arcStart),
    );

  const tValues = [arcStart, ...ixAngles, normalizeAngle(arcAngles.endAngle)];

  for (let i = 0; i < tValues.length - 1; i++) {
    if (isAngleInArcRange(cursorAngle, tValues[i]!, tValues[i + 1]!)) {
      return { startParam: tValues[i]!, endParam: tValues[i + 1]! };
    }
  }

  return null;
}

export function findClosestEndpoint(
  sketch: Sketch,
  cursorPoint: { x: number; y: number },
  snapDist: number,
): { primitiveId: string; pointId: string; isStart: boolean } | null {
  let bestDist = snapDist;
  let best: { primitiveId: string; pointId: string; isStart: boolean } | null =
    null;

  for (const prim of sketch.primitives) {
    if (isSketchLine(prim)) {
      const pt1 = getPointById(sketch, prim.p1Id);
      const pt2 = getPointById(sketch, prim.p2Id);
      if (pt1) {
        const d = Math.hypot(pt1.x - cursorPoint.x, pt1.y - cursorPoint.y);
        if (d < bestDist) {
          bestDist = d;
          best = { primitiveId: prim.id, pointId: prim.p1Id, isStart: true };
        }
      }
      if (pt2) {
        const d = Math.hypot(pt2.x - cursorPoint.x, pt2.y - cursorPoint.y);
        if (d < bestDist) {
          bestDist = d;
          best = { primitiveId: prim.id, pointId: prim.p2Id, isStart: false };
        }
      }
    }
    if (isSketchArc(prim)) {
      const startPt = getPointById(sketch, prim.startId);
      const endPt = getPointById(sketch, prim.endId);
      if (startPt) {
        const d = Math.hypot(
          startPt.x - cursorPoint.x,
          startPt.y - cursorPoint.y,
        );
        if (d < bestDist) {
          bestDist = d;
          best = { primitiveId: prim.id, pointId: prim.startId, isStart: true };
        }
      }
      if (endPt) {
        const d = Math.hypot(endPt.x - cursorPoint.x, endPt.y - cursorPoint.y);
        if (d < bestDist) {
          bestDist = d;
          best = { primitiveId: prim.id, pointId: prim.endId, isStart: false };
        }
      }
    }
  }

  return best;
}

// Extends the line infinitely from `isStart`-side endpoint and returns the closest hit.
export function findNearestExtendTarget(
  sketch: Sketch,
  lineId: string,
  isStart: boolean,
): { point: { x: number; y: number }; targetPrimId: string } | null {
  const line = findSketchLine(sketch.primitives, lineId);
  if (!line) return null;

  const ends = getLineEndpoints(sketch, line);
  if (!ends) return null;

  const extendFrom = isStart ? ends.p1 : ends.p2;
  const extendTo = isStart ? ends.p2 : ends.p1;

  const dx = extendFrom.x - extendTo.x;
  const dy = extendFrom.y - extendTo.y;

  const farPoint = {
    x: extendFrom.x + dx * 1000,
    y: extendFrom.y + dy * 1000,
  };

  let bestDist = Infinity;
  let bestResult: {
    point: { x: number; y: number };
    targetPrimId: string;
  } | null = null;

  for (const otherPrim of sketch.primitives) {
    if (otherPrim.id === lineId) continue;
    if (isSketchPoint(otherPrim)) continue;

    let intersections: { point: { x: number; y: number }; t: number }[] = [];

    if (isSketchLine(otherPrim)) {
      const otherEnds = getLineEndpoints(sketch, otherPrim);
      if (!otherEnds) continue;
      const ix = lineLineIntersect(
        extendFrom,
        farPoint,
        otherEnds.p1,
        otherEnds.p2,
      );
      if (
        ix &&
        ix.t > PARAM_BOUNDS_TOL &&
        ix.u >= -PARAM_BOUNDS_TOL &&
        ix.u <= 1 + PARAM_BOUNDS_TOL
      ) {
        intersections.push({ point: ix.point, t: ix.t });
      }
    } else if (isSketchCircle(otherPrim)) {
      const center = getCircleCenter(sketch, otherPrim);
      if (!center) continue;
      const ixs = lineCircleIntersect(
        extendFrom,
        farPoint,
        center,
        otherPrim.radius,
      );
      intersections = ixs.filter((ix) => ix.t > PARAM_BOUNDS_TOL);
    } else if (isSketchArc(otherPrim)) {
      const center = getCircleCenter(sketch, otherPrim);
      const angles = getArcAngles(sketch, otherPrim);
      if (!center || !angles) continue;
      const ixs = lineCircleIntersect(
        extendFrom,
        farPoint,
        center,
        otherPrim.radius,
      );
      intersections = ixs.filter(
        (ix) =>
          ix.t > PARAM_BOUNDS_TOL &&
          isAngleInArcRange(ix.angle, angles.startAngle, angles.endAngle),
      );
    }

    for (const ix of intersections) {
      const dist = Math.hypot(
        ix.point.x - extendFrom.x,
        ix.point.y - extendFrom.y,
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestResult = { point: ix.point, targetPrimId: otherPrim.id };
      }
    }
  }

  return bestResult;
}

// Sweeps the arc's underlying circle past `isStart`-side endpoint and returns the closest hit.
export function findNearestArcExtendTarget(
  sketch: Sketch,
  arcId: string,
  isStart: boolean,
): { point: { x: number; y: number }; targetPrimId: string } | null {
  const arc = findSketchArc(sketch.primitives, arcId);
  if (!arc) return null;

  const center = getCircleCenter(sketch, arc);
  const angles = getArcAngles(sketch, arc);
  if (!center || !angles) return null;

  const { startAngle, endAngle } = angles;

  // Start-side extends clockwise (decreasing angle); end-side extends counter-clockwise.
  const extendAngle = isStart ? startAngle : endAngle;

  let bestAngularDist = Infinity;
  let bestResult: {
    point: { x: number; y: number };
    targetPrimId: string;
  } | null = null;

  for (const otherPrim of sketch.primitives) {
    if (otherPrim.id === arcId) continue;
    if (isSketchPoint(otherPrim)) continue;

    let intersectionAngles: {
      angle: number;
      point: { x: number; y: number };
      primId: string;
    }[] = [];

    if (isSketchLine(otherPrim)) {
      const otherEnds = getLineEndpoints(sketch, otherPrim);
      if (!otherEnds) continue;
      const ixs = lineCircleIntersect(
        otherEnds.p1,
        otherEnds.p2,
        center,
        arc.radius,
      );
      for (const ix of ixs) {
        if (ix.t >= -PARAM_BOUNDS_TOL && ix.t <= 1 + PARAM_BOUNDS_TOL) {
          intersectionAngles.push({
            angle: ix.angle,
            point: ix.point,
            primId: otherPrim.id,
          });
        }
      }
    } else if (isSketchCircle(otherPrim)) {
      const otherCenter = getCircleCenter(sketch, otherPrim);
      if (!otherCenter) continue;
      const ixs = circleCircleIntersect(
        center,
        arc.radius,
        otherCenter,
        otherPrim.radius,
      );
      for (const ix of ixs) {
        intersectionAngles.push({
          angle: ix.angle1,
          point: ix.point,
          primId: otherPrim.id,
        });
      }
    } else if (isSketchArc(otherPrim)) {
      const otherCenter = getCircleCenter(sketch, otherPrim);
      const otherAngles = getArcAngles(sketch, otherPrim);
      if (!otherCenter || !otherAngles) continue;
      const ixs = circleCircleIntersect(
        center,
        arc.radius,
        otherCenter,
        otherPrim.radius,
      );
      for (const ix of ixs) {
        if (
          isAngleInArcRange(
            ix.angle2,
            otherAngles.startAngle,
            otherAngles.endAngle,
          )
        ) {
          intersectionAngles.push({
            angle: ix.angle1,
            point: ix.point,
            primId: otherPrim.id,
          });
        }
      }
    }

    for (const ix of intersectionAngles) {
      // Hits already on the arc don't count as extension targets.
      if (isAngleInArcRange(ix.angle, startAngle, endAngle)) continue;

      // Angular distance from extendAngle along the extension direction (CW for start, CCW for end).
      const angDist = isStart
        ? normalizeAngle(extendAngle - ix.angle)
        : normalizeAngle(ix.angle - extendAngle);

      if (angDist > ANGLE_TOL_RAD && angDist < bestAngularDist) {
        bestAngularDist = angDist;
        bestResult = { point: ix.point, targetPrimId: ix.primId };
      }
    }
  }

  return bestResult;
}
