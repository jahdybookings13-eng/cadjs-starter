import { CatmullRomCurve3, Vector3 } from "three";
import {
  findSketchArc,
  findSketchBezier,
  findSketchCircle,
  findSketchConic,
  findSketchEllipticalArc,
  findSketchLine,
  findSketchPoint,
  findSketchSpline,
  type Sketch,
  type SketchArc,
  type SketchBezier,
  type SketchCircle,
  type SketchConic,
  type SketchEllipticalArc,
  type SketchLine,
  type SketchPoint,
  type SketchSpline,
} from "../../types/sketch-types";

const TAU = Math.PI * 2;

function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function pointAt(
  center: SketchPoint,
  radius: number,
  angle: number,
): SketchPoint {
  return {
    id: "",
    type: "point",
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

function sampleCubicBezier(
  points: [SketchPoint, SketchPoint, SketchPoint, SketchPoint],
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x:
      b0 * points[0].x + b1 * points[1].x + b2 * points[2].x + b3 * points[3].x,
    y:
      b0 * points[0].y + b1 * points[1].y + b2 * points[2].y + b3 * points[3].y,
  };
}

/** Find the closest parameter on a cubic Bezier by sampled projection. */
export function nearestOnBezier(
  sketch: Sketch,
  bezier: SketchBezier,
  point: { x: number; y: number },
): { t: number; x: number; y: number; distance: number } | null {
  const control = bezier.pointIds.map((id) =>
    findSketchPoint(sketch.primitives, id),
  );
  if (control.length !== 4 || control.some((p) => !p)) return null;
  const points = control as [
    SketchPoint,
    SketchPoint,
    SketchPoint,
    SketchPoint,
  ];

  let best = { t: 0, x: points[0].x, y: points[0].y, distance: Infinity };
  for (let i = 0; i <= 128; i++) {
    const t = i / 128;
    const sample = sampleCubicBezier(points, t);
    const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
    if (distance < best.distance) {
      best = { t, ...sample, distance };
    }
  }
  return best.distance < Infinity ? best : null;
}

export type SplitBezierResult =
  | {
      ok: true;
      bezierId: string;
      point: SketchPoint;
      points: SketchPoint[];
      leftPointIds: [string, string, string, string];
      newBezier: SketchBezier;
    }
  | { ok: false; reason: string };

/**
 * Split a cubic Bezier at the closest point to the click using de Casteljau.
 * The original keeps the left half; the right half is a real new Bezier sharing
 * the split point. Both halves retain the original construction state.
 */
export function splitBezierAtPoint(
  sketch: Sketch,
  bezierId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitBezierResult {
  const bezier = findSketchBezier(sketch.primitives, bezierId);
  if (!bezier) return { ok: false, reason: "Select a Bezier to split." };
  if (bezier.pointIds.length !== 4) {
    return { ok: false, reason: "Only cubic Beziers can be split." };
  }
  const control = bezier.pointIds.map((id) =>
    findSketchPoint(sketch.primitives, id),
  );
  if (control.length !== 4 || control.some((p) => !p)) {
    return { ok: false, reason: "The Bezier is missing a control point." };
  }
  const [p0, p1, p2, p3] = control as [
    SketchPoint,
    SketchPoint,
    SketchPoint,
    SketchPoint,
  ];
  const nearest = nearestOnBezier(sketch, bezier, point);
  if (!nearest)
    return { ok: false, reason: "The Bezier could not be evaluated." };
  if (nearest.t <= 0.01 || nearest.t >= 0.99) {
    return { ok: false, reason: "Split away from both Bezier endpoints." };
  }

  const t = nearest.t;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const makePoint = (p: { x: number; y: number }): SketchPoint => ({
    id: generateId("pt"),
    type: "point",
    ...p,
  });

  const p01 = makePoint(lerp(p0, p1));
  const p12 = lerp(p1, p2);
  const p23 = makePoint(lerp(p2, p3));
  const p012 = makePoint(lerp(p01, p12));
  const p123 = makePoint(lerp(p12, p23));
  const split = makePoint(lerp(p012, p123));

  const leftPointIds: [string, string, string, string] = [
    p0.id,
    p01.id,
    p012.id,
    split.id,
  ];
  const newBezier: SketchBezier = {
    id: generateId("bez"),
    type: "bezier",
    pointIds: [split.id, p123.id, p23.id, p3.id],
    ...(bezier.construction ? { construction: true } : {}),
  };
  return {
    ok: true,
    bezierId: bezier.id,
    point: split,
    points: [p01, p23, p012, p123, split],
    leftPointIds,
    newBezier,
  };
}

function sampleRationalConic(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  rho: number,
  startWeight: number,
  endWeight: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const denominator = startWeight * u * u + 2 * rho * u * t + endWeight * t * t;
  return {
    x:
      (startWeight * u * u * start.x +
        2 * rho * u * t * control.x +
        endWeight * t * t * end.x) /
      denominator,
    y:
      (startWeight * u * u * start.y +
        2 * rho * u * t * control.y +
        endWeight * t * t * end.y) /
      denominator,
  };
}

/** Find the closest parameter on a rational conic by sampled projection. */
export function nearestOnConic(
  sketch: Sketch,
  conic: SketchConic,
  point: { x: number; y: number },
): { t: number; x: number; y: number; distance: number } | null {
  const start = findSketchPoint(sketch.primitives, conic.startId);
  const control = findSketchPoint(sketch.primitives, conic.controlId);
  const end = findSketchPoint(sketch.primitives, conic.endId);
  if (!start || !control || !end) return null;
  const w0 = Math.max(0.01, conic.startWeight ?? 1);
  const w2 = Math.max(0.01, conic.endWeight ?? 1);
  let best = { t: 0, x: start.x, y: start.y, distance: Infinity };
  for (let i = 0; i <= 128; i++) {
    const t = i / 128;
    const sample = sampleRationalConic(
      start,
      control,
      end,
      Math.max(0.01, conic.rho),
      w0,
      w2,
      t,
    );
    const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
    if (distance < best.distance) best = { t, ...sample, distance };
  }
  return best.distance < Infinity ? best : null;
}

export type SplitConicResult =
  | {
      ok: true;
      conicId: string;
      point: SketchPoint;
      points: SketchPoint[];
      leftControlId: string;
      leftRho: number;
      leftStartWeight: number;
      leftEndWeight: number;
      newConic: SketchConic;
    }
  | { ok: false; reason: string };

/**
 * Split a rational quadratic conic with homogeneous de Casteljau. Carrying the
 * endpoint weights lets both halves reproduce the original curve exactly.
 * The source keeps the left half; the new conic starts at the split vertex.
 */
export function splitConicAtPoint(
  sketch: Sketch,
  conicId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitConicResult {
  const conic = findSketchConic(sketch.primitives, conicId);
  if (!conic) return { ok: false, reason: "Select a conic to split." };
  const start = findSketchPoint(sketch.primitives, conic.startId);
  const control = findSketchPoint(sketch.primitives, conic.controlId);
  const end = findSketchPoint(sketch.primitives, conic.endId);
  if (!start || !control || !end) {
    return { ok: false, reason: "The conic is missing a defining point." };
  }
  const nearest = nearestOnConic(sketch, conic, point);
  if (!nearest)
    return { ok: false, reason: "The conic could not be evaluated." };
  if (nearest.t <= 0.01 || nearest.t >= 0.99) {
    return { ok: false, reason: "Split away from both conic endpoints." };
  }

  const t = nearest.t;
  const w0 = Math.max(0.01, conic.startWeight ?? 1);
  const w1 = Math.max(0.01, conic.rho);
  const w2 = Math.max(0.01, conic.endWeight ?? 1);
  const mixWeight = (a: number, b: number) => a + (b - a) * t;
  const mix = (
    a: { x: number; y: number },
    wa: number,
    b: { x: number; y: number },
    wb: number,
  ) => {
    const w = mixWeight(wa, wb);
    return {
      x: (a.x * wa * (1 - t) + b.x * wb * t) / w,
      y: (a.y * wa * (1 - t) + b.y * wb * t) / w,
    };
  };
  const makePoint = (p: { x: number; y: number }): SketchPoint => ({
    id: generateId("pt"),
    type: "point",
    ...p,
  });

  const w01 = mixWeight(w0, w1);
  const w12 = mixWeight(w1, w2);
  const h01 = mix(start, w0, control, w1);
  const h12 = mix(control, w1, end, w2);
  const h012 = mix(h01, w01, h12, w12);
  const w012 = mixWeight(w01, w12);
  const leftControl = makePoint(h01);
  const rightControl = makePoint(h12);
  const split = makePoint(h012);

  const newConic: SketchConic = {
    id: generateId("conic"),
    type: "conic",
    startId: split.id,
    controlId: rightControl.id,
    endId: conic.endId,
    rho: w12,
    startWeight: w012,
    endWeight: w2,
    ...(conic.construction ? { construction: true } : {}),
  };
  return {
    ok: true,
    conicId: conic.id,
    point: split,
    points: [leftControl, rightControl, split],
    leftControlId: leftControl.id,
    leftRho: w01,
    leftStartWeight: w0,
    leftEndWeight: w012,
    newConic,
  };
}

/** Find the closest raw Catmull-Rom parameter within a spline range. */
export function nearestOnSpline(
  sketch: Sketch,
  spline: SketchSpline,
  point: { x: number; y: number },
): { t: number; x: number; y: number; distance: number } | null {
  const control = spline.pointIds.map((id) =>
    findSketchPoint(sketch.primitives, id),
  );
  if (control.length < 2 || control.some((p) => !p)) return null;
  const curve = new CatmullRomCurve3(
    control.map((p) => new Vector3(p!.x, p!.y, 0)),
    false,
    "catmullrom",
    0.5,
  );
  const startT = Math.max(0, Math.min(1, spline.startT ?? 0));
  const endT = Math.max(startT, Math.min(1, spline.endT ?? 1));
  let best = { t: startT, x: 0, y: 0, distance: Infinity };
  for (let i = 0; i <= 192; i++) {
    const t = startT + (endT - startT) * (i / 192);
    const sample = curve.getPoint(t);
    const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
    if (distance < best.distance) {
      best = { t, x: sample.x, y: sample.y, distance };
    }
  }
  return best.distance < Infinity ? best : null;
}

export type SplitSplineResult =
  | {
      ok: true;
      splineId: string;
      point: SketchPoint;
      endT: number;
      endId: string;
      newSpline: SketchSpline;
    }
  | { ok: false; reason: string };

/**
 * Split a spline by restricting each half to a raw parameter range of the same
 * Catmull-Rom control polygon. Both halves share the new split vertex, so the
 * two visible curves meet exactly and no sampled polyline is stored.
 */
export function splitSplineAtPoint(
  sketch: Sketch,
  splineId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitSplineResult {
  const spline = findSketchSpline(sketch.primitives, splineId);
  if (!spline) return { ok: false, reason: "Select a spline to split." };
  if (spline.pointIds.length < 3) {
    return { ok: false, reason: "A spline needs at least three points." };
  }
  const nearest = nearestOnSpline(sketch, spline, point);
  if (!nearest)
    return { ok: false, reason: "The spline could not be evaluated." };
  const startT = Math.max(0, Math.min(1, spline.startT ?? 0));
  const endT = Math.max(startT, Math.min(1, spline.endT ?? 1));
  const span = endT - startT;
  if (nearest.t <= startT + span * 0.01 || nearest.t >= endT - span * 0.01) {
    return { ok: false, reason: "Split away from both spline endpoints." };
  }

  const splitPoint: SketchPoint = {
    id: generateId("pt"),
    type: "point",
    x: nearest.x,
    y: nearest.y,
  };
  const originalEndId =
    spline.endId ?? spline.pointIds[spline.pointIds.length - 1]!;
  const newSpline: SketchSpline = {
    id: generateId("spl"),
    type: "spline",
    pointIds: [...spline.pointIds],
    startT: nearest.t,
    endT,
    startId: splitPoint.id,
    endId: originalEndId,
    ...(spline.construction ? { construction: true } : {}),
  };
  return {
    ok: true,
    splineId: spline.id,
    point: splitPoint,
    endT: nearest.t,
    endId: splitPoint.id,
    newSpline,
  };
}

function pointOnEllipticalArc(
  arc: SketchEllipticalArc,
  center: { x: number; y: number },
  angle: number,
): { x: number; y: number } {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosR = Math.cos(arc.rotation);
  const sinR = Math.sin(arc.rotation);
  return {
    x:
      center.x +
      arc.majorRadius * cosA * cosR -
      arc.minorRadius * sinA * sinR,
    y:
      center.y +
      arc.majorRadius * cosA * sinR +
      arc.minorRadius * sinA * cosR,
  };
}

/** Find the closest ellipse parameter inside an elliptical-arc sweep. */
export function nearestOnEllipticalArc(
  sketch: Sketch,
  arc: SketchEllipticalArc,
  point: { x: number; y: number },
): { t: number; x: number; y: number; distance: number } | null {
  const center = findSketchPoint(sketch.primitives, arc.centerId);
  if (!center) return null;
  const sweep = normalizeAngle(arc.endAngle - arc.startAngle);
  if (sweep < 1e-9) return null;
  let best = { t: arc.startAngle, x: 0, y: 0, distance: Infinity };
  for (let i = 0; i <= 160; i++) {
    const t = arc.startAngle + sweep * (i / 160);
    const sample = pointOnEllipticalArc(arc, center, t);
    const distance = Math.hypot(sample.x - point.x, sample.y - point.y);
    if (distance < best.distance) best = { t, ...sample, distance };
  }
  return best.distance < Infinity ? best : null;
}

export type SplitEllipticalArcResult =
  | {
      ok: true;
      ellipticalArcId: string;
      splitAngle: number;
      newArc: SketchEllipticalArc;
    }
  | { ok: false; reason: string };

/** Split an elliptical arc at the closest parameter inside its sweep. */
export function splitEllipticalArcAtPoint(
  sketch: Sketch,
  arcId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitEllipticalArcResult {
  const arc = findSketchEllipticalArc(sketch.primitives, arcId);
  if (!arc) return { ok: false, reason: "Select an elliptical arc to split." };
  const center = findSketchPoint(sketch.primitives, arc.centerId);
  if (!center) {
    return { ok: false, reason: "The elliptical arc is missing its centre." };
  }
  if (arc.majorRadius <= 1e-9 || arc.minorRadius <= 1e-9) {
    return { ok: false, reason: "A zero-radius elliptical arc cannot be split." };
  }
  const nearest = nearestOnEllipticalArc(sketch, arc, point);
  if (!nearest) {
    return { ok: false, reason: "The elliptical arc could not be evaluated." };
  }
  const sweep = normalizeAngle(arc.endAngle - arc.startAngle);
  const local = normalizeAngle(nearest.t - arc.startAngle);
  if (local <= sweep * 0.01 || local >= sweep * 0.99) {
    return { ok: false, reason: "Split away from both elliptical-arc ends." };
  }

  const newArc: SketchEllipticalArc = {
    id: generateId("earc"),
    type: "ellipticalArc",
    centerId: arc.centerId,
    majorRadius: arc.majorRadius,
    minorRadius: arc.minorRadius,
    rotation: arc.rotation,
    startAngle: nearest.t,
    endAngle: arc.endAngle,
    ...(arc.construction ? { construction: true } : {}),
  };
  return {
    ok: true,
    ellipticalArcId: arc.id,
    splitAngle: nearest.t,
    newArc,
  };
}

export type SplitLineResult =
  | {
      ok: true;
      lineId: string;
      point: SketchPoint;
      newLine: SketchLine;
    }
  | { ok: false; reason: string };

/**
 * Split a line at the projection of `point` onto its segment. The source line
 * keeps its p1 endpoint and gets a new p2 at the split; the new line starts at
 * the split and keeps the original far endpoint.
 */
export function splitLineAtPoint(
  sketch: Sketch,
  lineId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitLineResult {
  const line = findSketchLine(sketch.primitives, lineId);
  if (!line) return { ok: false, reason: "Select a line to split." };
  if (line.origin)
    return { ok: false, reason: "Origin lines cannot be split." };

  const p1 = findSketchPoint(sketch.primitives, line.p1Id);
  const p2 = findSketchPoint(sketch.primitives, line.p2Id);
  if (!p1 || !p2) {
    return { ok: false, reason: "The line is missing an endpoint." };
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-18) {
    return { ok: false, reason: "A zero-length line cannot be split." };
  }

  const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
  if (t <= 0.01 || t >= 0.99) {
    return { ok: false, reason: "Split away from both endpoints." };
  }

  const splitPoint: SketchPoint = {
    id: generateId("pt"),
    type: "point",
    x: p1.x + dx * t,
    y: p1.y + dy * t,
  };
  const newLine: SketchLine = {
    id: generateId("line"),
    type: "line",
    p1Id: splitPoint.id,
    p2Id: p2.id,
    ...(line.construction ? { construction: true } : {}),
  };

  return { ok: true, lineId: line.id, point: splitPoint, newLine };
}

export type SplitArcResult =
  | {
      ok: true;
      arcId: string;
      point: SketchPoint;
      newArc: SketchArc;
    }
  | { ok: false; reason: string };

/**
 * Split an arc at the projection of `point` onto its circle. The source arc
 * keeps its start and gets a new end at the split; the new arc starts at the
 * split and keeps the original far end. Both arcs keep the same centre and
 * radius, so the split vertex is shared exactly.
 */
export function splitArcAtPoint(
  sketch: Sketch,
  arcId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitArcResult {
  const arc = findSketchArc(sketch.primitives, arcId);
  if (!arc) return { ok: false, reason: "Select an arc to split." };

  const center = findSketchPoint(sketch.primitives, arc.centerId);
  const start = findSketchPoint(sketch.primitives, arc.startId);
  const end = findSketchPoint(sketch.primitives, arc.endId);
  if (!center || !start || !end) {
    return { ok: false, reason: "The arc is missing a defining point." };
  }
  if (arc.radius <= 1e-9) {
    return { ok: false, reason: "A zero-radius arc cannot be split." };
  }

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const sweep = normalizeAngle(endAngle - startAngle);
  const clickAngle = Math.atan2(point.y - center.y, point.x - center.x);
  const local = normalizeAngle(clickAngle - startAngle);
  if (sweep < 1e-6)
    return { ok: false, reason: "The arc has no sweep to split." };
  if (local <= 1e-3 || local >= sweep - 1e-3) {
    return { ok: false, reason: "Split away from both arc endpoints." };
  }

  const splitPoint = pointAt(center, arc.radius, clickAngle);
  splitPoint.id = generateId("pt");
  const newArc: SketchArc = {
    id: generateId("arc"),
    type: "arc",
    centerId: arc.centerId,
    startId: splitPoint.id,
    endId: arc.endId,
    radius: arc.radius,
    ...(arc.construction ? { construction: true } : {}),
  };

  return { ok: true, arcId: arc.id, point: splitPoint, newArc };
}

export type SplitCircleResult =
  | {
      ok: true;
      circleId: string;
      points: [SketchPoint, SketchPoint];
      arcs: [SketchArc, SketchArc];
    }
  | { ok: false; reason: string };

/**
 * Break a circle into two semicircular arcs at the projection of `point` onto
 * the circle. The original circle is removed; the two arcs share both vertices
 * and the original centre and radius. Construction state is preserved.
 */
export function splitCircleAtPoint(
  sketch: Sketch,
  circleId: string,
  point: { x: number; y: number },
  generateId: (prefix: string) => string,
): SplitCircleResult {
  const circle = findSketchCircle(sketch.primitives, circleId);
  if (!circle) return { ok: false, reason: "Select a circle to break." };

  const center = findSketchPoint(sketch.primitives, circle.centerId);
  if (!center)
    return { ok: false, reason: "The circle is missing its centre." };
  if (circle.radius <= 1e-9) {
    return { ok: false, reason: "A zero-radius circle cannot be broken." };
  }

  const angle = Math.atan2(point.y - center.y, point.x - center.x);
  const p1 = pointAt(center, circle.radius, angle);
  const p2 = pointAt(center, circle.radius, angle + Math.PI);
  p1.id = generateId("pt");
  p2.id = generateId("pt");

  const arc = (startId: string, endId: string): SketchArc => ({
    id: generateId("arc"),
    type: "arc",
    centerId: circle.centerId,
    startId,
    endId,
    radius: circle.radius,
    ...(circle.construction ? { construction: true } : {}),
  });

  return {
    ok: true,
    circleId: circle.id,
    points: [p1, p2],
    arcs: [arc(p1.id, p2.id), arc(p2.id, p1.id)],
  };
}
