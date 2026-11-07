import type {
  Sketch,
  SketchArc,
  SketchCircle,
  SketchEllipse,
  SketchEllipticalArc,
  SketchSpline,
  SketchBezier,
  SketchConic,
  SketchLine,
  SketchPoint,
  SketchPrimitive,
} from "@vitekk02/cadjs";

const COINCIDENT_TOL = 1e-9;

export type MirrorSketchResult =
  | {
      ok: true;
      /** New points and primitives to append to the sketch. */
      primitives: SketchPrimitive[];
      /** Ids of the newly created primitives. */
      mirroredIds: string[];
    }
  | { ok: false; reason: string };

interface Point2D {
  x: number;
  y: number;
}

/**
 * Reflect a point across the infinite line through `axisStart` and `axisEnd`.
 * The axis is not clamped to the segment, matching Onshape's mirror-line tool.
 */
function reflectPoint(
  point: Point2D,
  axisStart: Point2D,
  axisEnd: Point2D,
): Point2D {
  const dx = axisEnd.x - axisStart.x;
  const dy = axisEnd.y - axisStart.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    ((point.x - axisStart.x) * dx + (point.y - axisStart.y) * dy) /
    lengthSquared;
  const closest = {
    x: axisStart.x + t * dx,
    y: axisStart.y + t * dy,
  };
  return {
    x: 2 * closest.x - point.x,
    y: 2 * closest.y - point.y,
  };
}

function constructionProps(
  primitive:
    | SketchLine
    | SketchCircle
    | SketchArc
    | SketchEllipse
    | SketchEllipticalArc
    | SketchSpline
    | SketchBezier
    | SketchConic,
): {
  construction?: true;
} {
  return primitive.construction ? { construction: true } : {};
}

function fixedProps(point: SketchPoint): { fixed?: true } {
  return point.fixed ? { fixed: true } : {};
}

/**
 * Mirror selected sketch geometry about one selected line.
 *
 * This is a one-shot geometric mirror: it creates new points and primitives,
 * preserving construction flags and sharing points that lie on the axis. It
 * does not add symmetric constraints, because the current sketch model has no
 * symmetric constraint type.
 */
export function mirrorSelectedPrimitives(
  sketch: Sketch,
  selectedIds: readonly string[],
  axisLineId: string,
  generateId: (prefix: string) => string,
): MirrorSketchResult {
  const byId = new Map(
    sketch.primitives.map((primitive) => [primitive.id, primitive]),
  );
  const axis = byId.get(axisLineId);

  if (!axis || axis.type !== "line") {
    return {
      ok: false,
      reason: "Select exactly one line to use as the mirror axis.",
    };
  }
  if (axis.origin) {
    return {
      ok: false,
      reason: "An origin axis cannot be used as the mirror axis.",
    };
  }

  const axisStart = byId.get(axis.p1Id);
  const axisEnd = byId.get(axis.p2Id);
  if (
    !axisStart ||
    axisStart.type !== "point" ||
    !axisEnd ||
    axisEnd.type !== "point"
  ) {
    return { ok: false, reason: "The mirror axis is missing an endpoint." };
  }

  const axisDx = axisEnd.x - axisStart.x;
  const axisDy = axisEnd.y - axisStart.y;
  if (axisDx * axisDx + axisDy * axisDy <= COINCIDENT_TOL) {
    return { ok: false, reason: "The mirror axis has zero length." };
  }

  const sourceIds = selectedIds.filter((id) => id !== axis.id);
  const sourcePrimitives = sourceIds
    .map((id) => byId.get(id))
    .filter((primitive): primitive is SketchPrimitive => Boolean(primitive));

  if (sourcePrimitives.length === 0) {
    return {
      ok: false,
      reason: "Select the mirror axis line plus the geometry to mirror.",
    };
  }

  const mirroredPointIds = new Map<string, string>();
  const output: SketchPrimitive[] = [];
  const mirroredIds: string[] = [];

  const reflected = (point: SketchPoint): Point2D =>
    reflectPoint(point, axisStart, axisEnd);

  const liesOnAxis = (point: SketchPoint): boolean => {
    const reflectedPoint = reflected(point);
    return (
      Math.hypot(reflectedPoint.x - point.x, reflectedPoint.y - point.y) <=
      COINCIDENT_TOL
    );
  };

  const ensureMirroredPoint = (pointId: string): string | null => {
    const existing = mirroredPointIds.get(pointId);
    if (existing) return existing;

    const point = byId.get(pointId);
    if (!point || point.type !== "point") return null;

    // A point on the mirror line is shared with the mirrored geometry instead
    // of producing a coincident duplicate.
    if (liesOnAxis(point)) {
      mirroredPointIds.set(pointId, point.id);
      return point.id;
    }

    const reflectedPoint = reflected(point);
    const id = generateId("pt");
    const mirroredPoint: SketchPoint = {
      id,
      type: "point",
      x: reflectedPoint.x,
      y: reflectedPoint.y,
      ...fixedProps(point),
    };
    mirroredPointIds.set(pointId, id);
    output.push(mirroredPoint);
    mirroredIds.push(id);
    return id;
  };

  for (const primitive of sourcePrimitives) {
    if (primitive.id === axis.id) continue;
    if (primitive.type === "line" && primitive.origin) continue;

    if (primitive.type === "point") {
      // Points on the axis have no distinct mirrored copy.
      ensureMirroredPoint(primitive.id);
      continue;
    }

    if (primitive.type === "line") {
      const start = byId.get(primitive.p1Id);
      const end = byId.get(primitive.p2Id);
      if (!start || start.type !== "point" || !end || end.type !== "point") {
        return { ok: false, reason: "A selected line is missing an endpoint." };
      }
      // A line lying on the axis is already its own mirror.
      if (liesOnAxis(start) && liesOnAxis(end)) continue;

      const p1Id = ensureMirroredPoint(primitive.p1Id);
      const p2Id = ensureMirroredPoint(primitive.p2Id);
      if (!p1Id || !p2Id) {
        return { ok: false, reason: "A selected line is missing an endpoint." };
      }

      const id = generateId("ln");
      const mirroredLine: SketchLine = {
        id,
        type: "line",
        p1Id,
        p2Id,
        ...constructionProps(primitive),
      };
      output.push(mirroredLine);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "circle") {
      const center = byId.get(primitive.centerId);
      if (!center || center.type !== "point") {
        return {
          ok: false,
          reason: "A selected circle is missing its centre.",
        };
      }
      // A circle centred on the axis maps onto itself.
      if (liesOnAxis(center)) continue;

      const centerId = ensureMirroredPoint(primitive.centerId);
      if (!centerId) {
        return {
          ok: false,
          reason: "A selected circle is missing its centre.",
        };
      }

      const id = generateId("cir");
      const mirroredCircle: SketchCircle = {
        id,
        type: "circle",
        centerId,
        radius: primitive.radius,
        ...constructionProps(primitive),
      };
      output.push(mirroredCircle);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "ellipse") {
      const center = byId.get(primitive.centerId);
      if (!center || center.type !== "point") {
        return {
          ok: false,
          reason: "A selected ellipse is missing its centre.",
        };
      }

      const centerId = ensureMirroredPoint(primitive.centerId);
      if (!centerId) {
        return {
          ok: false,
          reason: "A selected ellipse is missing its centre.",
        };
      }

      const axisAngle = Math.atan2(
        axisEnd.y - axisStart.y,
        axisEnd.x - axisStart.x,
      );
      const id = generateId("ell");
      const mirroredEllipse: SketchEllipse = {
        id,
        type: "ellipse",
        centerId,
        majorRadius: primitive.majorRadius,
        minorRadius: primitive.minorRadius,
        rotation: 2 * axisAngle - primitive.rotation,
        ...constructionProps(primitive),
      };
      output.push(mirroredEllipse);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "ellipticalArc") {
      const center = byId.get(primitive.centerId);
      if (!center || center.type !== "point") {
        return {
          ok: false,
          reason: "A selected elliptical arc is missing its centre.",
        };
      }

      const centerId = ensureMirroredPoint(primitive.centerId);
      if (!centerId) {
        return {
          ok: false,
          reason: "A selected elliptical arc is missing its centre.",
        };
      }

      const axisAngle = Math.atan2(
        axisEnd.y - axisStart.y,
        axisEnd.x - axisStart.x,
      );
      const twoPi = Math.PI * 2;
      const normalize = (angle: number) => ((angle % twoPi) + twoPi) % twoPi;
      const startAngle = normalize(-primitive.endAngle);
      let endAngle = normalize(-primitive.startAngle);
      if (endAngle <= startAngle) endAngle += twoPi;

      const id = generateId("earc");
      const mirroredArc: SketchEllipticalArc = {
        id,
        type: "ellipticalArc",
        centerId,
        majorRadius: primitive.majorRadius,
        minorRadius: primitive.minorRadius,
        rotation: 2 * axisAngle - primitive.rotation,
        startAngle,
        endAngle,
        ...constructionProps(primitive),
      };
      output.push(mirroredArc);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "spline") {
      const referenceIds = [
        ...new Set([
          ...primitive.pointIds,
          ...(primitive.startId ? [primitive.startId] : []),
          ...(primitive.endId ? [primitive.endId] : []),
        ]),
      ];
      const splinePoints = referenceIds.map((id) => byId.get(id));
      if (splinePoints.some((p) => !p || p.type !== "point")) {
        return {
          ok: false,
          reason: "A selected spline is missing a defining point.",
        };
      }
      if (
        splinePoints.every(
          (p) => p !== undefined && p.type === "point" && liesOnAxis(p),
        )
      ) {
        continue;
      }

      const mappedIds = new Map<string, string>();
      for (const id of referenceIds) {
        const mirroredId = ensureMirroredPoint(id);
        if (!mirroredId) {
          return {
            ok: false,
            reason: "A selected spline is missing a defining point.",
          };
        }
        mappedIds.set(id, mirroredId);
      }

      const id = generateId("spl");
      const mirroredSpline: SketchSpline = {
        id,
        type: "spline",
        pointIds: primitive.pointIds.map((pointId) => mappedIds.get(pointId)!),
        ...(primitive.startT !== undefined ? { startT: primitive.startT } : {}),
        ...(primitive.endT !== undefined ? { endT: primitive.endT } : {}),
        ...(primitive.startId
          ? { startId: mappedIds.get(primitive.startId)! }
          : {}),
        ...(primitive.endId ? { endId: mappedIds.get(primitive.endId)! } : {}),
        ...constructionProps(primitive),
      };
      output.push(mirroredSpline);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "bezier") {
      const controlPoints = primitive.pointIds.map((id) => byId.get(id));
      if (controlPoints.some((p) => !p || p.type !== "point")) {
        return {
          ok: false,
          reason: "A selected Bezier is missing a control point.",
        };
      }
      if (
        controlPoints.every(
          (p) => p !== undefined && p.type === "point" && liesOnAxis(p),
        )
      ) {
        continue;
      }
      const pointIds = primitive.pointIds.map((id) => ensureMirroredPoint(id));
      if (pointIds.some((id) => id === null)) {
        return {
          ok: false,
          reason: "A selected Bezier is missing a control point.",
        };
      }
      const id = generateId("bez");
      const mirroredBezier: SketchBezier = {
        id,
        type: "bezier",
        pointIds: pointIds as string[],
        ...constructionProps(primitive),
      };
      output.push(mirroredBezier);
      mirroredIds.push(id);
      continue;
    }

    if (primitive.type === "conic") {
      const start = byId.get(primitive.startId);
      const control = byId.get(primitive.controlId);
      const end = byId.get(primitive.endId);
      if (
        !start ||
        start.type !== "point" ||
        !control ||
        control.type !== "point" ||
        !end ||
        end.type !== "point"
      ) {
        return {
          ok: false,
          reason: "A selected conic is missing a defining point.",
        };
      }
      if (liesOnAxis(start) && liesOnAxis(control) && liesOnAxis(end)) {
        continue;
      }
      const startId = ensureMirroredPoint(primitive.startId);
      const controlId = ensureMirroredPoint(primitive.controlId);
      const endId = ensureMirroredPoint(primitive.endId);
      if (!startId || !controlId || !endId) {
        return {
          ok: false,
          reason: "A selected conic is missing a defining point.",
        };
      }
      const id = generateId("conic");
      const mirroredConic: SketchConic = {
        id,
        type: "conic",
        startId,
        controlId,
        endId,
        rho: primitive.rho,
        ...(primitive.startWeight !== undefined
          ? { startWeight: primitive.startWeight }
          : {}),
        ...(primitive.endWeight !== undefined
          ? { endWeight: primitive.endWeight }
          : {}),
        ...constructionProps(primitive),
      };
      output.push(mirroredConic);
      mirroredIds.push(id);
      continue;
    }

    // Arc: reflection reverses orientation, so the mirrored start/end swap.
    if (primitive.type !== "arc") continue;
    const center = byId.get(primitive.centerId);
    const start = byId.get(primitive.startId);
    const end = byId.get(primitive.endId);
    if (
      !center ||
      center.type !== "point" ||
      !start ||
      start.type !== "point" ||
      !end ||
      end.type !== "point"
    ) {
      return {
        ok: false,
        reason: "A selected arc is missing a defining point.",
      };
    }
    if (liesOnAxis(center) && liesOnAxis(start) && liesOnAxis(end)) continue;

    const centerId = ensureMirroredPoint(primitive.centerId);
    const startId = ensureMirroredPoint(primitive.endId);
    const endId = ensureMirroredPoint(primitive.startId);
    if (!centerId || !startId || !endId) {
      return {
        ok: false,
        reason: "A selected arc is missing a defining point.",
      };
    }

    const id = generateId("arc");
    const mirroredArc: SketchArc = {
      id,
      type: "arc",
      centerId,
      startId,
      endId,
      radius: primitive.radius,
      ...constructionProps(primitive),
    };
    output.push(mirroredArc);
    mirroredIds.push(id);
  }

  if (output.length === 0) {
    return {
      ok: false,
      reason: "Nothing to mirror: the selected geometry lies on the axis.",
    };
  }

  return { ok: true, primitives: output, mirroredIds };
}
