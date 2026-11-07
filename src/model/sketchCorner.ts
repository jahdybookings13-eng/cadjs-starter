import type {
  Sketch,
  SketchArc,
  SketchLine,
  SketchPoint,
  SketchPrimitive,
} from "@vitekk02/cadjs";

const EPS = 1e-9;

export type CornerOperation = "fillet" | "chamfer";

export interface CornerLineUpdate {
  id: string;
  p1Id?: string;
  p2Id?: string;
}

export type CornerResult =
  | {
      ok: true;
      /** New tangent/centre points to add. */
      points: SketchPoint[];
      /** New arc or chamfer line to add. */
      primitives: SketchPrimitive[];
      /** In-place endpoint replacements for the two source lines. */
      lineUpdates: CornerLineUpdate[];
      /** In-place endpoint replacements for a trimmed arc. */
      arcUpdates?: Array<{ id: string; startId?: string; endId?: string }>;
      /** Old corner points that are no longer referenced by any geometry. */
      removePointIds: string[];
    }
  | { ok: false; reason: string };

interface Point2D {
  x: number;
  y: number;
}

function cross(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

function length(v: Point2D): number {
  return Math.hypot(v.x, v.y);
}

function normalize(v: Point2D): Point2D | null {
  const len = length(v);
  if (len < EPS) return null;
  return { x: v.x / len, y: v.y / len };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function referencesPoint(primitive: SketchPrimitive, pointId: string): boolean {
  switch (primitive.type) {
    case "point":
    case "hatch":
      return false;
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
  }
}

function getEndpoints(
  line: SketchLine,
  byId: Map<string, SketchPrimitive>,
): { p1: SketchPoint; p2: SketchPoint } | null {
  const p1 = byId.get(line.p1Id);
  const p2 = byId.get(line.p2Id);
  if (!p1 || p1.type !== "point" || !p2 || p2.type !== "point") return null;
  return { p1, p2 };
}

/**
 * Trim two intersecting lines and insert either a tangent fillet arc or a
 * straight chamfer between the trimmed ends.
 *
 * This is the line-line case. The selected lines must actually meet within
 * their segments; the operation refuses parallel, collinear or non-touching
 * lines instead of producing invalid geometry. The near corner point is
 * removed only when no other primitive still references it.
 */
export function cornerModifyLines(
  sketch: Sketch,
  selectedIds: readonly string[],
  operation: CornerOperation,
  value: number,
  generateId: (prefix: string) => string,
): CornerResult {
  if (!Number.isFinite(value) || value <= EPS) {
    return {
      ok: false,
      reason:
        operation === "fillet"
          ? "Fillet radius must be greater than zero."
          : "Chamfer distance must be greater than zero.",
    };
  }
  if (selectedIds.length !== 2) {
    return {
      ok: false,
      reason: "Select exactly two lines to fillet or chamfer.",
    };
  }

  const byId = new Map(
    sketch.primitives.map((primitive) => [primitive.id, primitive]),
  );
  const selected = selectedIds.map((id) => byId.get(id));
  if (
    selected.some(
      (primitive) =>
        !primitive || primitive.type !== "line" || primitive.origin,
    )
  ) {
    return {
      ok: false,
      reason: "Only two non-origin lines can be filleted or chamfered.",
    };
  }

  const lineA = selected[0] as SketchLine;
  const lineB = selected[1] as SketchLine;
  if (lineA.id === lineB.id) {
    return { ok: false, reason: "Select two different lines." };
  }

  const endpointsA = getEndpoints(lineA, byId);
  const endpointsB = getEndpoints(lineB, byId);
  if (!endpointsA || !endpointsB) {
    return { ok: false, reason: "A selected line is missing an endpoint." };
  }

  const a1 = endpointsA.p1;
  const a2 = endpointsA.p2;
  const b1 = endpointsB.p1;
  const b2 = endpointsB.p2;
  const d1 = { x: a2.x - a1.x, y: a2.y - a1.y };
  const d2 = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denominator = cross(d1, d2);
  if (Math.abs(denominator) < EPS) {
    return { ok: false, reason: "Parallel or collinear lines have no corner." };
  }

  const delta = { x: b1.x - a1.x, y: b1.y - a1.y };
  const tA = cross(delta, d2) / denominator;
  const tB = cross(delta, d1) / denominator;
  if (tA < -EPS || tA > 1 + EPS || tB < -EPS || tB > 1 + EPS) {
    return {
      ok: false,
      reason: "The selected lines do not meet within both segments.",
    };
  }

  const intersection = {
    x: a1.x + d1.x * tA,
    y: a1.y + d1.y * tA,
  };
  const nearA =
    distance(a1, intersection) <= distance(a2, intersection) ? a1 : a2;
  const farA = nearA === a1 ? a2 : a1;
  const nearB =
    distance(b1, intersection) <= distance(b2, intersection) ? b1 : b2;
  const farB = nearB === b1 ? b2 : b1;

  const u1 = normalize({
    x: farA.x - intersection.x,
    y: farA.y - intersection.y,
  });
  const u2 = normalize({
    x: farB.x - intersection.x,
    y: farB.y - intersection.y,
  });
  if (!u1 || !u2) {
    return { ok: false, reason: "A selected line has zero length." };
  }

  const theta = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  if (theta < 1e-6 || Math.PI - theta < 1e-6) {
    return { ok: false, reason: "The selected lines do not form a corner." };
  }

  const farLengthA = distance(intersection, farA);
  const farLengthB = distance(intersection, farB);
  const along = operation === "fillet" ? value / Math.tan(theta / 2) : value;
  if (along > farLengthA + EPS || along > farLengthB + EPS) {
    return {
      ok: false,
      reason:
        operation === "fillet"
          ? "The fillet radius is too large for the selected lines."
          : "The chamfer distance is too long for the selected lines.",
    };
  }

  const tangentA = {
    x: intersection.x + u1.x * along,
    y: intersection.y + u1.y * along,
  };
  const tangentB = {
    x: intersection.x + u2.x * along,
    y: intersection.y + u2.y * along,
  };

  const tangentAId = generateId("pt");
  const tangentBId = generateId("pt");
  const points: SketchPoint[] = [
    { id: tangentAId, type: "point", x: tangentA.x, y: tangentA.y },
    { id: tangentBId, type: "point", x: tangentB.x, y: tangentB.y },
  ];

  let primitive: SketchPrimitive;
  if (operation === "fillet") {
    const centerDistance = value / Math.sin(theta / 2);
    const bisector = normalize({ x: u1.x + u2.x, y: u1.y + u2.y });
    if (!bisector) {
      return { ok: false, reason: "The selected lines do not form a fillet." };
    }
    const center = {
      x: intersection.x + bisector.x * centerDistance,
      y: intersection.y + bisector.y * centerDistance,
    };
    const centerId = generateId("pt");
    points.push({ id: centerId, type: "point", x: center.x, y: center.y });

    // The renderer/OCC arc is CCW from start to end. Pick the order that
    // sweeps the short tangent arc (pi - theta) rather than its complement.
    const ccwShort = cross(u1, u2) > 0;
    const arc: SketchArc = {
      id: generateId("arc"),
      type: "arc",
      centerId,
      startId: ccwShort ? tangentBId : tangentAId,
      endId: ccwShort ? tangentAId : tangentBId,
      radius: value,
      ...(lineA.construction && lineB.construction
        ? { construction: true }
        : {}),
    };
    primitive = arc;
  } else {
    primitive = {
      id: generateId("ln"),
      type: "line",
      p1Id: tangentAId,
      p2Id: tangentBId,
      ...(lineA.construction && lineB.construction
        ? { construction: true }
        : {}),
    };
  }

  const lineUpdates: CornerLineUpdate[] = [
    {
      id: lineA.id,
      ...(lineA.p1Id === nearA.id
        ? { p1Id: tangentAId }
        : { p2Id: tangentAId }),
    },
    {
      id: lineB.id,
      ...(lineB.p1Id === nearB.id
        ? { p1Id: tangentBId }
        : { p2Id: tangentBId }),
    },
  ];

  const modifiedIds = new Set([lineA.id, lineB.id]);
  const stillReferenced = new Set<string>();
  for (const candidate of sketch.primitives) {
    if (modifiedIds.has(candidate.id)) continue;
    if (referencesPoint(candidate, nearA.id)) stillReferenced.add(nearA.id);
    if (referencesPoint(candidate, nearB.id)) stillReferenced.add(nearB.id);
  }
  const removePointIds = [nearA, nearB]
    .filter(
      (point, index, all) =>
        all.findIndex((candidate) => candidate.id === point.id) === index,
    )
    .filter(
      (point) =>
        !stillReferenced.has(point.id) && !point.fixed && !point.origin,
    )
    .map((point) => point.id);

  return {
    ok: true,
    points,
    primitives: [primitive],
    lineUpdates,
    removePointIds,
  };
}

function angleNorm(angle: number): number {
  const tau = Math.PI * 2;
  return ((angle % tau) + tau) % tau;
}

/**
 * Fillet a line and an arc that meet at a shared endpoint. The fillet centre
 * is found by intersecting the line offset by the radius with a circle
 * concentric to the arc at R-r or R+r. The selected line and arc are trimmed
 * to the tangent points; the arc keeps its original centre and radius.
 */
export function cornerModifyLineArc(
  sketch: Sketch,
  selectedIds: readonly string[],
  radius: number,
  generateId: (prefix: string) => string,
): CornerResult {
  if (!Number.isFinite(radius) || radius <= EPS) {
    return { ok: false, reason: "Fillet radius must be greater than zero." };
  }
  if (selectedIds.length !== 2) {
    return {
      ok: false,
      reason: "Select exactly one line and one arc to fillet.",
    };
  }
  const byId = new Map(
    sketch.primitives.map((primitive) => [primitive.id, primitive]),
  );
  const selected = selectedIds.map((id) => byId.get(id));
  const line = selected.find(
    (primitive): primitive is SketchLine =>
      primitive?.type === "line" && !primitive.origin,
  );
  const arc = selected.find(
    (primitive): primitive is SketchArc => primitive?.type === "arc",
  );
  if (!line || !arc || selected.some((primitive) => !primitive)) {
    return {
      ok: false,
      reason: "Curve fillet needs one non-origin line and one arc.",
    };
  }

  const lineP1 = byId.get(line.p1Id);
  const lineP2 = byId.get(line.p2Id);
  const center = byId.get(arc.centerId);
  const arcStart = byId.get(arc.startId);
  const arcEnd = byId.get(arc.endId);
  if (
    !lineP1 ||
    lineP1.type !== "point" ||
    !lineP2 ||
    lineP2.type !== "point" ||
    !center ||
    center.type !== "point" ||
    !arcStart ||
    arcStart.type !== "point" ||
    !arcEnd ||
    arcEnd.type !== "point"
  ) {
    return {
      ok: false,
      reason: "The line or arc is missing a defining point.",
    };
  }
  if (arc.radius <= EPS) {
    return { ok: false, reason: "A zero-radius arc cannot be filleted." };
  }

  const lineEnds = [lineP1, lineP2];
  const arcEnds = [arcStart, arcEnd];
  let lineCorner: SketchPoint | undefined;
  let arcCorner: SketchPoint | undefined;
  for (const candidate of lineEnds) {
    const match = arcEnds.find(
      (end) => end.id === candidate.id || distance(end, candidate) <= 1e-6,
    );
    if (match) {
      lineCorner = candidate;
      arcCorner = match;
      break;
    }
  }
  if (!lineCorner || !arcCorner) {
    return {
      ok: false,
      reason: "Select a line and arc that meet at a shared endpoint.",
    };
  }

  const lineFar =
    lineP1.id === lineCorner.id || distance(lineP1, lineCorner) <= 1e-6
      ? lineP2
      : lineP1;
  const arcFar =
    arcStart.id === arcCorner.id || distance(arcStart, arcCorner) <= 1e-6
      ? arcEnd
      : arcStart;
  const corner = { x: lineCorner.x, y: lineCorner.y };
  const u = normalize({ x: lineFar.x - corner.x, y: lineFar.y - corner.y });
  if (!u) return { ok: false, reason: "The selected line has zero length." };
  const toCenter = { x: center.x - corner.x, y: center.y - corner.y };
  if (Math.abs(length(toCenter) - arc.radius) > 1e-5) {
    return {
      ok: false,
      reason: "The line endpoint does not lie on the selected arc.",
    };
  }

  const baseNormal = { x: -u.y, y: u.x };
  const normals = [baseNormal, { x: -baseNormal.x, y: -baseNormal.y }];

  const startAngle = Math.atan2(arcStart.y - center.y, arcStart.x - center.x);
  const endAngle = Math.atan2(arcEnd.y - center.y, arcEnd.x - center.x);
  const sweep = angleNorm(endAngle - startAngle);
  const cornerOnStart =
    arcStart.id === arcCorner.id || distance(arcStart, arcCorner) <= 1e-6;
  const cornerAngle = Math.atan2(corner.y - center.y, corner.x - center.x);

  interface Candidate {
    center: Point2D;
    lineTangent: Point2D;
    arcTangent: Point2D;
    score: number;
  }
  const candidates: Candidate[] = [];
  const distances = [arc.radius - radius, arc.radius + radius].filter(
    (d) => d > EPS,
  );
  for (const normal of normals) {
    const offsetOrigin = {
      x: corner.x + normal.x * radius,
      y: corner.y + normal.y * radius,
    };
    for (const d of distances) {
      const f = { x: offsetOrigin.x - center.x, y: offsetOrigin.y - center.y };
      const b = dot(f, u);
      const c = dot(f, f) - d * d;
      const discriminant = b * b - c;
      if (discriminant < -EPS) continue;
      const root = Math.sqrt(Math.max(0, discriminant));
      for (const t of [-b - root, -b + root]) {
        const q = { x: offsetOrigin.x + u.x * t, y: offsetOrigin.y + u.y * t };
        const lineTangent = {
          x: q.x - normal.x * radius,
          y: q.y - normal.y * radius,
        };
        const arcTangent = {
          x: center.x + ((q.x - center.x) * arc.radius) / d,
          y: center.y + ((q.y - center.y) * arc.radius) / d,
        };
        // Both tangent points must lie on the retained side of the corner.
        const lineAlong =
          (lineTangent.x - corner.x) * u.x + (lineTangent.y - corner.y) * u.y;
        const lineTotal =
          (lineFar.x - corner.x) * u.x + (lineFar.y - corner.y) * u.y;
        if (lineAlong <= 1e-6 || lineAlong >= lineTotal - 1e-6) continue;

        const tangentAngle = Math.atan2(
          arcTangent.y - center.y,
          arcTangent.x - center.x,
        );
        const local = cornerOnStart
          ? angleNorm(tangentAngle - cornerAngle)
          : angleNorm(cornerAngle - tangentAngle);
        if (local <= 1e-5 || local >= sweep - 1e-5) continue;

        candidates.push({
          center: q,
          lineTangent,
          arcTangent,
          score: distance(corner, lineTangent) + distance(corner, arcTangent),
        });
      }
    }
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "No tangent fillet fits between the selected line and arc.",
    };
  }
  candidates.sort((a, b) => a.score - b.score);
  const chosen = candidates[0]!;

  const tangentLineId = generateId("pt");
  const tangentArcId = generateId("pt");
  const filletCenterId = generateId("pt");
  const points: SketchPoint[] = [
    { id: tangentLineId, type: "point", ...chosen.lineTangent },
    { id: tangentArcId, type: "point", ...chosen.arcTangent },
    { id: filletCenterId, type: "point", ...chosen.center },
  ];

  const lineVector = {
    x: chosen.lineTangent.x - chosen.center.x,
    y: chosen.lineTangent.y - chosen.center.y,
  };
  const arcVector = {
    x: chosen.arcTangent.x - chosen.center.x,
    y: chosen.arcTangent.y - chosen.center.y,
  };
  const ccwShort = cross(lineVector, arcVector) > 0;
  const fillet: SketchArc = {
    id: generateId("arc"),
    type: "arc",
    centerId: filletCenterId,
    startId: ccwShort ? tangentLineId : tangentArcId,
    endId: ccwShort ? tangentArcId : tangentLineId,
    radius,
    ...(line.construction && arc.construction ? { construction: true } : {}),
  };

  const lineCornerIsP1 =
    line.p1Id === lineCorner.id || distance(lineP1, lineCorner) <= 1e-6;
  const arcCornerIsStart =
    arc.startId === arcCorner.id || distance(arcStart, arcCorner) <= 1e-6;
  const lineUpdates: CornerLineUpdate[] = [
    {
      id: line.id,
      ...(lineCornerIsP1 ? { p1Id: tangentLineId } : { p2Id: tangentLineId }),
    },
  ];
  const arcUpdates = [
    {
      id: arc.id,
      ...(arcCornerIsStart
        ? { startId: tangentArcId }
        : { endId: tangentArcId }),
    },
  ];

  const modifiedIds = new Set([line.id, arc.id]);
  const stillReferenced = new Set<string>();
  const cornerIds = new Set([lineCorner.id, arcCorner.id]);
  for (const candidate of sketch.primitives) {
    if (modifiedIds.has(candidate.id)) continue;
    for (const id of cornerIds) {
      if (referencesPoint(candidate, id)) stillReferenced.add(id);
    }
  }
  const removePointIds = [...cornerIds].filter((id) => {
    const point = byId.get(id);
    return (
      !!point &&
      point.type === "point" &&
      !stillReferenced.has(id) &&
      !point.fixed &&
      !point.origin
    );
  });

  return {
    ok: true,
    points,
    primitives: [fillet],
    lineUpdates,
    arcUpdates,
    removePointIds,
  };
}

/** Fillet two arcs that meet at a shared endpoint. */
export function cornerModifyArcArc(
  sketch: Sketch,
  selectedIds: readonly string[],
  radius: number,
  generateId: (prefix: string) => string,
): CornerResult {
  if (!Number.isFinite(radius) || radius <= EPS) {
    return { ok: false, reason: "Fillet radius must be greater than zero." };
  }
  if (selectedIds.length !== 2) {
    return { ok: false, reason: "Select exactly two arcs to fillet." };
  }
  const byId = new Map(
    sketch.primitives.map((primitive) => [primitive.id, primitive]),
  );
  const selected = selectedIds.map((id) => byId.get(id));
  if (selected.some((primitive) => !primitive || primitive.type !== "arc")) {
    return { ok: false, reason: "Arc/arc fillet needs two arcs." };
  }
  const arcA = selected[0] as SketchArc;
  const arcB = selected[1] as SketchArc;
  if (arcA.id === arcB.id) {
    return { ok: false, reason: "Select two different arcs." };
  }

  const aCenter = byId.get(arcA.centerId);
  const aStart = byId.get(arcA.startId);
  const aEnd = byId.get(arcA.endId);
  const bCenter = byId.get(arcB.centerId);
  const bStart = byId.get(arcB.startId);
  const bEnd = byId.get(arcB.endId);
  if (
    !aCenter ||
    aCenter.type !== "point" ||
    !aStart ||
    aStart.type !== "point" ||
    !aEnd ||
    aEnd.type !== "point" ||
    !bCenter ||
    bCenter.type !== "point" ||
    !bStart ||
    bStart.type !== "point" ||
    !bEnd ||
    bEnd.type !== "point"
  ) {
    return { ok: false, reason: "An arc is missing a defining point." };
  }
  if (arcA.radius <= EPS || arcB.radius <= EPS) {
    return { ok: false, reason: "A zero-radius arc cannot be filleted." };
  }

  let aCorner: SketchPoint | undefined;
  let bCorner: SketchPoint | undefined;
  for (const end of [aStart, aEnd]) {
    const match = [bStart, bEnd].find(
      (candidate) =>
        candidate.id === end.id || distance(candidate, end) <= 1e-6,
    );
    if (match) {
      aCorner = end;
      bCorner = match;
      break;
    }
  }
  if (!aCorner || !bCorner) {
    return {
      ok: false,
      reason: "Select two arcs that meet at a shared endpoint.",
    };
  }

  const aFar =
    aStart.id === aCorner.id || distance(aStart, aCorner) <= 1e-6
      ? aEnd
      : aStart;
  const bFar =
    bStart.id === bCorner.id || distance(bStart, bCorner) <= 1e-6
      ? bEnd
      : bStart;
  const corner = { x: aCorner.x, y: aCorner.y };
  const aCornerOnStart =
    arcA.startId === aCorner.id || distance(aStart, aCorner) <= 1e-6;
  const bCornerOnStart =
    arcB.startId === bCorner.id || distance(bStart, bCorner) <= 1e-6;
  const aCornerAngle = Math.atan2(aCorner.y - aCenter.y, aCorner.x - aCenter.x);
  const bCornerAngle = Math.atan2(bCorner.y - bCenter.y, bCorner.x - bCenter.x);
  const aStartAngle = Math.atan2(aStart.y - aCenter.y, aStart.x - aCenter.x);
  const aEndAngle = Math.atan2(aEnd.y - aCenter.y, aEnd.x - aCenter.x);
  const bStartAngle = Math.atan2(bStart.y - bCenter.y, bStart.x - bCenter.x);
  const bEndAngle = Math.atan2(bEnd.y - bCenter.y, bEnd.x - bCenter.x);
  const aSweep = angleNorm(aEndAngle - aStartAngle);
  const bSweep = angleNorm(bEndAngle - bStartAngle);

  const centerDistance = distance(aCenter, bCenter);
  if (centerDistance <= EPS) {
    return { ok: false, reason: "Concentric arcs have no arc/arc fillet." };
  }

  interface Candidate {
    center: Point2D;
    aTangent: Point2D;
    bTangent: Point2D;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (const da of [arcA.radius - radius, arcA.radius + radius]) {
    if (da <= EPS) continue;
    for (const db of [arcB.radius - radius, arcB.radius + radius]) {
      if (db <= EPS) continue;
      if (centerDistance > da + db + 1e-7) continue;
      if (centerDistance < Math.abs(da - db) - 1e-7) continue;
      const along =
        (da * da - db * db + centerDistance * centerDistance) /
        (2 * centerDistance);
      const hSq = da * da - along * along;
      if (hSq < -1e-7) continue;
      const h = Math.sqrt(Math.max(0, hSq));
      const ux = (bCenter.x - aCenter.x) / centerDistance;
      const uy = (bCenter.y - aCenter.y) / centerDistance;
      const mx = aCenter.x + ux * along;
      const my = aCenter.y + uy * along;
      for (const sign of [1, -1]) {
        const q = {
          x: mx - uy * h * sign,
          y: my + ux * h * sign,
        };
        const aTangent = {
          x: aCenter.x + ((q.x - aCenter.x) * arcA.radius) / da,
          y: aCenter.y + ((q.y - aCenter.y) * arcA.radius) / da,
        };
        const bTangent = {
          x: bCenter.x + ((q.x - bCenter.x) * arcB.radius) / db,
          y: bCenter.y + ((q.y - bCenter.y) * arcB.radius) / db,
        };
        const aAngle = Math.atan2(
          aTangent.y - aCenter.y,
          aTangent.x - aCenter.x,
        );
        const bAngle = Math.atan2(
          bTangent.y - bCenter.y,
          bTangent.x - bCenter.x,
        );
        const aLocal = aCornerOnStart
          ? angleNorm(aAngle - aCornerAngle)
          : angleNorm(aCornerAngle - aAngle);
        const bLocal = bCornerOnStart
          ? angleNorm(bAngle - bCornerAngle)
          : angleNorm(bCornerAngle - bAngle);
        if (
          aLocal <= 1e-5 ||
          aLocal >= aSweep - 1e-5 ||
          bLocal <= 1e-5 ||
          bLocal >= bSweep - 1e-5
        ) {
          continue;
        }
        candidates.push({
          center: q,
          aTangent,
          bTangent,
          score: distance(corner, aTangent) + distance(corner, bTangent),
        });
      }
    }
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "No tangent fillet fits between the selected arcs.",
    };
  }
  candidates.sort((a, b) => a.score - b.score);
  const chosen = candidates[0]!;

  const aTangentId = generateId("pt");
  const bTangentId = generateId("pt");
  const centerId = generateId("pt");
  const points: SketchPoint[] = [
    { id: aTangentId, type: "point", ...chosen.aTangent },
    { id: bTangentId, type: "point", ...chosen.bTangent },
    { id: centerId, type: "point", ...chosen.center },
  ];
  const aVector = {
    x: chosen.aTangent.x - chosen.center.x,
    y: chosen.aTangent.y - chosen.center.y,
  };
  const bVector = {
    x: chosen.bTangent.x - chosen.center.x,
    y: chosen.bTangent.y - chosen.center.y,
  };
  const ccwShort = cross(aVector, bVector) > 0;
  const fillet: SketchArc = {
    id: generateId("arc"),
    type: "arc",
    centerId,
    startId: ccwShort ? aTangentId : bTangentId,
    endId: ccwShort ? bTangentId : aTangentId,
    radius,
    ...(arcA.construction && arcB.construction ? { construction: true } : {}),
  };
  const arcUpdates = [
    {
      id: arcA.id,
      ...(aCornerOnStart ? { startId: aTangentId } : { endId: aTangentId }),
    },
    {
      id: arcB.id,
      ...(bCornerOnStart ? { startId: bTangentId } : { endId: bTangentId }),
    },
  ];

  const modifiedIds = new Set([arcA.id, arcB.id]);
  const cornerIds = new Set([aCorner.id, bCorner.id]);
  const stillReferenced = new Set<string>();
  for (const candidate of sketch.primitives) {
    if (modifiedIds.has(candidate.id)) continue;
    for (const id of cornerIds) {
      if (referencesPoint(candidate, id)) stillReferenced.add(id);
    }
  }
  const removePointIds = [...cornerIds].filter((id) => {
    const point = byId.get(id);
    return (
      !!point &&
      point.type === "point" &&
      !stillReferenced.has(id) &&
      !point.fixed &&
      !point.origin
    );
  });

  return {
    ok: true,
    points,
    primitives: [fillet],
    lineUpdates: [],
    arcUpdates,
    removePointIds,
  };
}
