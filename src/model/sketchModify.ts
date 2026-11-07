import {
  findSketchLine,
  findSketchPoint,
  type Sketch,
  type SketchArc,
  type SketchCircle,
  type SketchLine,
  type SketchPoint,
  type SketchPrimitive,
} from "@vitekk02/cadjs";

export type SketchModifyResult =
  | {
      ok: true;
      points: SketchPoint[];
      primitives: SketchPrimitive[];
    }
  | { ok: false; reason: string };

interface OffsetLine {
  id: string;
  p1Id?: string;
  p2Id?: string;
}

export type JoinLinesResult =
  | {
      ok: true;
      update: OffsetLine;
      removeLineId: string;
      removePointId?: string | undefined;
    }
  | { ok: false; reason: string };

const EPSILON = 1e-9;

function usesPoint(primitive: SketchPrimitive, pointId: string): boolean {
  switch (primitive.type) {
    case "line":
      return primitive.p1Id === pointId || primitive.p2Id === pointId;
    case "circle":
    case "ellipse":
    case "ellipticalArc":
      return primitive.centerId === pointId;
    case "arc":
      return (
        primitive.centerId === pointId ||
        primitive.startId === pointId ||
        primitive.endId === pointId
      );
    case "spline":
      return (
        primitive.pointIds.includes(pointId) ||
        primitive.startId === pointId ||
        primitive.endId === pointId
      );
    case "bezier":
      return primitive.pointIds.includes(pointId);
    case "conic":
      return (
        primitive.startId === pointId ||
        primitive.controlId === pointId ||
        primitive.endId === pointId
      );
    case "point":
      return false;
  }
}

function pointOnLine(
  point: SketchPoint,
  dx: number,
  dy: number,
  distance: number,
): SketchPoint {
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * distance;
  const ny = (dx / length) * distance;
  return {
    id: "",
    type: "point",
    x: point.x + nx,
    y: point.y + ny,
  };
}

/**
 * Create an offset copy of one line, circle or arc. Positive distance is to the
 * left of a line's direction, and outward for circles/arcs. Returns new points
 * and primitives; the source geometry is untouched.
 */
export function offsetSketchPrimitive(
  sketch: Sketch,
  primitiveId: string,
  distance: number,
  generateId: (prefix: string) => string,
): SketchModifyResult {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPSILON) {
    return { ok: false, reason: "Offset distance must be non-zero." };
  }

  const primitive = sketch.primitives.find((p) => p.id === primitiveId);
  if (!primitive) {
    return { ok: false, reason: "Select a line, circle or arc to offset." };
  }
  if (primitive.type === "line") {
    if (primitive.origin) {
      return { ok: false, reason: "Origin lines cannot be offset." };
    }
    const p1 = findSketchPoint(sketch.primitives, primitive.p1Id);
    const p2 = findSketchPoint(sketch.primitives, primitive.p2Id);
    if (!p1 || !p2) {
      return { ok: false, reason: "The line is missing an endpoint." };
    }
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.hypot(dx, dy) < EPSILON) {
      return { ok: false, reason: "A zero-length line cannot be offset." };
    }
    const first = pointOnLine(p1, dx, dy, distance);
    const second = pointOnLine(p2, dx, dy, distance);
    first.id = generateId("pt");
    second.id = generateId("pt");
    const line: SketchLine = {
      id: generateId("line"),
      type: "line",
      p1Id: first.id,
      p2Id: second.id,
      ...(primitive.construction ? { construction: true } : {}),
    };
    return { ok: true, points: [first, second], primitives: [line] };
  }

  if (primitive.type === "circle") {
    const radius = primitive.radius + distance;
    if (radius <= EPSILON) {
      return { ok: false, reason: "Offset would collapse the circle." };
    }
    const circle: SketchCircle = {
      ...primitive,
      id: generateId("circle"),
      radius,
    };
    return { ok: true, points: [], primitives: [circle] };
  }

  if (primitive.type === "arc") {
    const center = findSketchPoint(sketch.primitives, primitive.centerId);
    const start = findSketchPoint(sketch.primitives, primitive.startId);
    const end = findSketchPoint(sketch.primitives, primitive.endId);
    if (!center || !start || !end) {
      return { ok: false, reason: "The arc is missing a defining point." };
    }
    const radius = primitive.radius + distance;
    if (radius <= EPSILON) {
      return { ok: false, reason: "Offset would collapse the arc." };
    }
    const startVector = {
      x: start.x - center.x,
      y: start.y - center.y,
    };
    const endVector = {
      x: end.x - center.x,
      y: end.y - center.y,
    };
    const startLength = Math.hypot(startVector.x, startVector.y);
    const endLength = Math.hypot(endVector.x, endVector.y);
    if (startLength < EPSILON || endLength < EPSILON) {
      return { ok: false, reason: "The arc has a zero-radius endpoint." };
    }
    const newStart: SketchPoint = {
      id: generateId("pt"),
      type: "point",
      x: center.x + (startVector.x / startLength) * radius,
      y: center.y + (startVector.y / startLength) * radius,
    };
    const newEnd: SketchPoint = {
      id: generateId("pt"),
      type: "point",
      x: center.x + (endVector.x / endLength) * radius,
      y: center.y + (endVector.y / endLength) * radius,
    };
    const arc: SketchArc = {
      ...primitive,
      id: generateId("arc"),
      startId: newStart.id,
      endId: newEnd.id,
      radius,
    };
    return {
      ok: true,
      points: [newStart, newEnd],
      primitives: [arc],
    };
  }

  return {
    ok: false,
    reason: "Offset supports lines, circles and arcs.",
  };
}

/**
 * Join two selected lines that share exactly one endpoint and lie on the same
 * line. The kept line absorbs the other line's far endpoint; the other line is
 * removed. Returns an update for the kept line and the id to remove.
 */
export function joinSketchLines(
  sketch: Sketch,
  primitiveIds: string[],
): JoinLinesResult {
  const uniqueIds = [...new Set(primitiveIds)];
  if (uniqueIds.length !== 2) {
    return { ok: false, reason: "Select exactly two lines to join." };
  }

  const first = findSketchLine(sketch.primitives, uniqueIds[0]!);
  const second = findSketchLine(sketch.primitives, uniqueIds[1]!);
  if (!first || !second) {
    return { ok: false, reason: "Join only works on lines." };
  }
  if (first.origin || second.origin) {
    return { ok: false, reason: "Origin lines cannot be joined." };
  }
  if (first.id === second.id) {
    return { ok: false, reason: "Select two different lines." };
  }
  if (Boolean(first.construction) !== Boolean(second.construction)) {
    return {
      ok: false,
      reason: "Join requires both lines to have the same construction state.",
    };
  }

  const shared = [first.p1Id, first.p2Id].find(
    (id) => id === second.p1Id || id === second.p2Id,
  );
  if (!shared) {
    return { ok: false, reason: "The two lines do not share an endpoint." };
  }

  const firstFar = first.p1Id === shared ? first.p2Id : first.p1Id;
  const secondFar = second.p1Id === shared ? second.p2Id : second.p1Id;
  if (firstFar === secondFar) {
    return { ok: false, reason: "The two lines are identical." };
  }

  const sharedPoint = findSketchPoint(sketch.primitives, shared);
  const firstFarPoint = findSketchPoint(sketch.primitives, firstFar);
  const secondFarPoint = findSketchPoint(sketch.primitives, secondFar);
  if (!sharedPoint || !firstFarPoint || !secondFarPoint) {
    return { ok: false, reason: "A line is missing an endpoint." };
  }

  const v1 = {
    x: firstFarPoint.x - sharedPoint.x,
    y: firstFarPoint.y - sharedPoint.y,
  };
  const v2 = {
    x: secondFarPoint.x - sharedPoint.x,
    y: secondFarPoint.y - sharedPoint.y,
  };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 < EPSILON || len2 < EPSILON) {
    return { ok: false, reason: "A zero-length line cannot be joined." };
  }
  const cross = Math.abs(v1.x * v2.y - v1.y * v2.x) / (len1 * len2);
  const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
  if (cross > 1e-6 || dot >= 0) {
    return {
      ok: false,
      reason: "The lines must be collinear and extend in opposite directions.",
    };
  }

  const update: OffsetLine =
    first.p1Id === shared
      ? { id: first.id, p1Id: secondFar }
      : { id: first.id, p2Id: secondFar };
  const pointStillUsed =
    sketch.primitives.some(
      (primitive) =>
        primitive.id !== first.id &&
        primitive.id !== second.id &&
        usesPoint(primitive, shared),
    ) ||
    sketch.constraints.some((constraint) =>
      constraint.primitiveIds.includes(shared),
    );
  return {
    ok: true,
    update,
    removeLineId: second.id,
    ...(pointStillUsed ? {} : { removePointId: shared }),
  };
}
