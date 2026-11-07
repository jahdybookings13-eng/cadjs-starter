import * as THREE from "three";
import {
  findSketchPoint,
  isSketchPoint,
  type Sketch,
  type SketchBezier,
  type SketchConic,
  type SketchEllipse,
  type SketchEllipticalArc,
  type SketchLine,
  type SketchPoint,
  type SketchPrimitive,
  type SketchSpline,
} from "@vitekk02/cadjs";

export type MoveCopyMode = "move" | "copy";

export interface PointUpdate {
  id: string;
  x: number;
  y: number;
}

export interface PrimitiveUpdate {
  id: string;
  updates: Record<string, number>;
}

export type MoveCopyResult =
  | {
      ok: true;
      pointUpdates: PointUpdate[];
      primitiveUpdates: PrimitiveUpdate[];
      points: SketchPoint[];
      primitives: SketchPrimitive[];
    }
  | { ok: false; reason: string };

function pointIdsFor(primitive: SketchPrimitive): string[] {
  switch (primitive.type) {
    case "point":
      return [primitive.id];
    case "hatch":
      return [];
    case "line":
      return [primitive.p1Id, primitive.p2Id];
    case "circle":
    case "ellipse":
    case "ellipticalArc":
      return [primitive.centerId];
    case "arc":
      return [primitive.centerId, primitive.startId, primitive.endId];
    case "spline":
      return [
        ...new Set([
          ...primitive.pointIds,
          ...(primitive.startId ? [primitive.startId] : []),
          ...(primitive.endId ? [primitive.endId] : []),
        ]),
      ];
    case "bezier":
      return primitive.pointIds;
    case "conic":
      return [primitive.startId, primitive.controlId, primitive.endId];
  }
}

function pointIdsForCopy(
  primitive: SketchPrimitive,
  map: Map<string, string>,
): SketchPrimitive {
  switch (primitive.type) {
    case "point":
      return primitive;
    case "hatch":
      return primitive;
    case "line":
      return {
        ...primitive,
        p1Id: map.get(primitive.p1Id) ?? primitive.p1Id,
        p2Id: map.get(primitive.p2Id) ?? primitive.p2Id,
      } as SketchLine;
    case "circle":
      return {
        ...primitive,
        centerId: map.get(primitive.centerId) ?? primitive.centerId,
      };
    case "arc":
      return {
        ...primitive,
        centerId: map.get(primitive.centerId) ?? primitive.centerId,
        startId: map.get(primitive.startId) ?? primitive.startId,
        endId: map.get(primitive.endId) ?? primitive.endId,
      };
    case "ellipse":
      return {
        ...primitive,
        centerId: map.get(primitive.centerId) ?? primitive.centerId,
      } as SketchEllipse;
    case "ellipticalArc":
      return {
        ...primitive,
        centerId: map.get(primitive.centerId) ?? primitive.centerId,
      } as SketchEllipticalArc;
    case "spline":
      return {
        ...primitive,
        pointIds: primitive.pointIds.map((id) => map.get(id) ?? id),
        ...(primitive.startId
          ? { startId: map.get(primitive.startId) ?? primitive.startId }
          : {}),
        ...(primitive.endId
          ? { endId: map.get(primitive.endId) ?? primitive.endId }
          : {}),
      } as SketchSpline;
    case "bezier":
      return {
        ...primitive,
        pointIds: primitive.pointIds.map((id) => map.get(id) ?? id),
      } as SketchBezier;
    case "conic":
      return {
        ...primitive,
        startId: map.get(primitive.startId) ?? primitive.startId,
        controlId: map.get(primitive.controlId) ?? primitive.controlId,
        endId: map.get(primitive.endId) ?? primitive.endId,
      } as SketchConic;
  }
}

/**
 * Move or copy the selected sketch entities by a vector. Move updates the
 * original defining points; copy creates new points and primitives, preserving
 * construction flags and sharing each cloned point once.
 */
export function moveOrCopySelected(
  sketch: Sketch,
  selectedIds: string[],
  mode: MoveCopyMode,
  dx: number,
  dy: number,
  generateId: (prefix: string) => string,
): MoveCopyResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { ok: false, reason: "Move vector must be finite." };
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { ok: false, reason: "Move vector must be non-zero." };
  }

  const uniqueIds = [...new Set(selectedIds)];
  const selected: SketchPrimitive[] = [];
  for (const id of uniqueIds) {
    const primitive = sketch.primitives.find((p) => p.id === id);
    if (!primitive)
      return { ok: false, reason: "Selection contains missing geometry." };
    selected.push(primitive);
  }
  if (selected.length === 0) {
    return { ok: false, reason: "Select geometry to move or copy." };
  }
  if (
    selected.some((p) => (p.type === "line" || p.type === "point") && p.origin)
  ) {
    return { ok: false, reason: "Origin geometry cannot be moved or copied." };
  }

  const sourcePointIds = [...new Set(selected.flatMap(pointIdsFor))];
  const sourcePoints: SketchPoint[] = [];
  for (const id of sourcePointIds) {
    const point = findSketchPoint(sketch.primitives, id);
    if (!point)
      return { ok: false, reason: "Selection is missing a defining point." };
    if (point.origin) {
      return {
        ok: false,
        reason: "Geometry using an origin point cannot be moved.",
      };
    }
    sourcePoints.push(point);
  }
  if (sourcePoints.length === 0) {
    return { ok: false, reason: "Selection has no movable points." };
  }

  if (mode === "move") {
    return {
      ok: true,
      pointUpdates: sourcePoints.map((p) => ({
        id: p.id,
        x: p.x + dx,
        y: p.y + dy,
      })),
      primitiveUpdates: [],
      points: [],
      primitives: [],
    };
  }

  const pointMap = new Map<string, string>();
  const points: SketchPoint[] = [];
  for (const source of sourcePoints) {
    const clone: SketchPoint = {
      ...source,
      id: generateId("pt"),
      x: source.x + dx,
      y: source.y + dy,
    };
    pointMap.set(source.id, clone.id);
    points.push(clone);
  }

  const primitives: SketchPrimitive[] = [];
  for (const primitive of selected) {
    if (isSketchPoint(primitive)) continue;
    const remapped = pointIdsForCopy(primitive, pointMap);
    primitives.push({
      ...remapped,
      id: generateId(primitive.type),
    } as SketchPrimitive);
  }

  return {
    ok: true,
    pointUpdates: [],
    primitiveUpdates: [],
    points,
    primitives,
  };
}

interface PreparedTransform {
  ok: true;
  selected: SketchPrimitive[];
  sourcePoints: SketchPoint[];
  center: { x: number; y: number };
  centerPointId: string | undefined;
}

function prepareTransform(
  sketch: Sketch,
  selectedIds: string[],
): PreparedTransform | { ok: false; reason: string } {
  const uniqueIds = [...new Set(selectedIds)];
  const selected: SketchPrimitive[] = [];
  for (const id of uniqueIds) {
    const primitive = sketch.primitives.find((p) => p.id === id);
    if (!primitive) {
      return { ok: false, reason: "Selection contains missing geometry." };
    }
    selected.push(primitive);
  }
  if (selected.length === 0) {
    return { ok: false, reason: "Select geometry to rotate or scale." };
  }
  if (
    selected.some((p) => (p.type === "line" || p.type === "point") && p.origin)
  ) {
    return { ok: false, reason: "Origin geometry cannot be transformed." };
  }

  const sourcePointIds = [...new Set(selected.flatMap(pointIdsFor))];
  const sourcePoints: SketchPoint[] = [];
  for (const id of sourcePointIds) {
    const point = findSketchPoint(sketch.primitives, id);
    if (!point) {
      return { ok: false, reason: "Selection is missing a defining point." };
    }
    if (point.origin) {
      return {
        ok: false,
        reason: "Geometry using an origin point cannot be transformed.",
      };
    }
    sourcePoints.push(point);
  }
  if (sourcePoints.length === 0) {
    return { ok: false, reason: "Selection has no transformable points." };
  }

  const selectedCenters = selected.filter(isSketchPoint);
  if (selectedCenters.length > 1) {
    return {
      ok: false,
      reason: "Select at most one point as the transform centre.",
    };
  }
  const centerPoint = selectedCenters[0];
  const center = centerPoint
    ? { x: centerPoint.x, y: centerPoint.y }
    : {
        x: sourcePoints.reduce((sum, p) => sum + p.x, 0) / sourcePoints.length,
        y: sourcePoints.reduce((sum, p) => sum + p.y, 0) / sourcePoints.length,
      };

  return {
    ok: true,
    selected,
    sourcePoints,
    center,
    centerPointId: centerPoint?.id,
  };
}

function cloneTransformed(
  prepared: PreparedTransform,
  transform: (p: SketchPoint) => { x: number; y: number },
  rotationDelta: number,
  generateId: (prefix: string) => string,
): { points: SketchPoint[]; primitives: SketchPrimitive[] } {
  const pointMap = new Map<string, string>();
  const points: SketchPoint[] = [];
  for (const source of prepared.sourcePoints) {
    const transformed = transform(source);
    const clone: SketchPoint = {
      ...source,
      id: generateId("pt"),
      x: transformed.x,
      y: transformed.y,
    };
    pointMap.set(source.id, clone.id);
    points.push(clone);
  }

  const primitives: SketchPrimitive[] = [];
  for (const primitive of prepared.selected) {
    if (isSketchPoint(primitive)) continue;
    const clone = {
      ...pointIdsForCopy(primitive, pointMap),
      id: generateId(primitive.type),
    } as SketchPrimitive;
    if (
      (clone.type === "ellipse" || clone.type === "ellipticalArc") &&
      rotationDelta !== 0
    ) {
      clone.rotation += rotationDelta;
    }
    primitives.push(clone);
  }
  return { points, primitives };
}

export function circularPatternSelected(
  sketch: Sketch,
  selectedIds: string[],
  count: number,
  angleRadians: number,
  generateId: (prefix: string) => string,
): MoveCopyResult {
  if (!Number.isInteger(count) || count < 2 || count > 50) {
    return {
      ok: false,
      reason: "Pattern count must be an integer from 2 to 50.",
    };
  }
  if (!Number.isFinite(angleRadians) || Math.abs(angleRadians) < 1e-9) {
    return { ok: false, reason: "Pattern angle must be non-zero." };
  }
  const prepared = prepareTransform(sketch, selectedIds);
  if (!prepared.ok) return prepared;

  const step = angleRadians / count;
  const points: SketchPoint[] = [];
  const primitives: SketchPrimitive[] = [];
  for (let index = 1; index < count; index++) {
    const angle = step * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const copy = cloneTransformed(
      prepared,
      (point) => {
        const dx = point.x - prepared.center.x;
        const dy = point.y - prepared.center.y;
        return {
          x: prepared.center.x + dx * cos - dy * sin,
          y: prepared.center.y + dx * sin + dy * cos,
        };
      },
      angle,
      generateId,
    );
    points.push(...copy.points);
    primitives.push(...copy.primitives);
  }

  return {
    ok: true,
    pointUpdates: [],
    primitiveUpdates: [],
    points,
    primitives,
  };
}

export function rotateSelectedGeometry(
  sketch: Sketch,
  selectedIds: string[],
  angleRadians: number,
): MoveCopyResult {
  if (!Number.isFinite(angleRadians) || Math.abs(angleRadians) < 1e-9) {
    return { ok: false, reason: "Rotation angle must be non-zero." };
  }
  const prepared = prepareTransform(sketch, selectedIds);
  if (!prepared.ok) return prepared;

  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const pointUpdates: PointUpdate[] = [];
  for (const point of prepared.sourcePoints) {
    if (point.id === prepared.centerPointId) continue;
    const dx = point.x - prepared.center.x;
    const dy = point.y - prepared.center.y;
    const x = prepared.center.x + dx * cos - dy * sin;
    const y = prepared.center.y + dx * sin + dy * cos;
    if (Math.abs(x - point.x) < 1e-12 && Math.abs(y - point.y) < 1e-12) {
      continue;
    }
    pointUpdates.push({ id: point.id, x, y });
  }

  const primitiveUpdates: PrimitiveUpdate[] = [];
  for (const primitive of prepared.selected) {
    if (primitive.type === "ellipse" || primitive.type === "ellipticalArc") {
      primitiveUpdates.push({
        id: primitive.id,
        updates: { rotation: primitive.rotation + angleRadians },
      });
    }
  }

  if (pointUpdates.length === 0 && primitiveUpdates.length === 0) {
    return { ok: false, reason: "Rotation does not change this selection." };
  }
  return {
    ok: true,
    pointUpdates,
    primitiveUpdates,
    points: [],
    primitives: [],
  };
}

export function scaleSelectedGeometry(
  sketch: Sketch,
  selectedIds: string[],
  factor: number,
): MoveCopyResult {
  if (!Number.isFinite(factor) || factor <= 0) {
    return { ok: false, reason: "Scale factor must be positive." };
  }
  if (Math.abs(factor - 1) < 1e-9) {
    return { ok: false, reason: "Scale factor must differ from 1." };
  }
  const prepared = prepareTransform(sketch, selectedIds);
  if (!prepared.ok) return prepared;

  const pointUpdates: PointUpdate[] = [];
  for (const point of prepared.sourcePoints) {
    if (point.id === prepared.centerPointId) continue;
    const x = prepared.center.x + (point.x - prepared.center.x) * factor;
    const y = prepared.center.y + (point.y - prepared.center.y) * factor;
    if (Math.abs(x - point.x) < 1e-12 && Math.abs(y - point.y) < 1e-12) {
      continue;
    }
    pointUpdates.push({ id: point.id, x, y });
  }

  const primitiveUpdates: PrimitiveUpdate[] = [];
  for (const primitive of prepared.selected) {
    if (primitive.type === "circle" || primitive.type === "arc") {
      primitiveUpdates.push({
        id: primitive.id,
        updates: { radius: primitive.radius * factor },
      });
    } else if (
      primitive.type === "ellipse" ||
      primitive.type === "ellipticalArc"
    ) {
      primitiveUpdates.push({
        id: primitive.id,
        updates: {
          majorRadius: primitive.majorRadius * factor,
          minorRadius: primitive.minorRadius * factor,
        },
      });
    }
  }

  if (pointUpdates.length === 0 && primitiveUpdates.length === 0) {
    return { ok: false, reason: "Scale does not change this selection." };
  }
  return {
    ok: true,
    pointUpdates,
    primitiveUpdates,
    points: [],
    primitives: [],
  };
}

export type { SketchPoint };

export interface PathPatternOptions {
  count: number;
  pathId: string;
  align: boolean;
}

/**
 * Copy the selected geometry onto evenly-spaced stations along one selected
 * sketch curve. Sampling is by accumulated chord length, so a spline, conic
 * or elliptical path distributes copies evenly instead of bunching by
 * parameter. When `align` is on, each copy rotates with the path tangent.
 *
 * The path itself is excluded from the copied geometry. Open paths produce
 * `count - 1` copies (the first station is the path start); closed paths
 * produce `count` copies around the loop.
 */
export function pathPatternSelected(
  sketch: Sketch,
  selectedIds: string[],
  options: PathPatternOptions,
  generateId: (prefix: string) => string,
): MoveCopyResult {
  const { count, pathId, align } = options;
  if (!Number.isInteger(count) || count < 2 || count > 50) {
    return {
      ok: false,
      reason: "Pattern count must be an integer from 2 to 50.",
    };
  }

  const path = sketch.primitives.find((primitive) => primitive.id === pathId);
  if (!path || path.type === "point") {
    return { ok: false, reason: "Select a line or curve as the pattern path." };
  }
  if (path.type === "line" && path.origin) {
    return { ok: false, reason: "An origin axis cannot be used as a path." };
  }

  const geometryIds = [...new Set(selectedIds)].filter((id) => id !== pathId);
  if (geometryIds.length === 0) {
    return {
      ok: false,
      reason: "Select geometry to copy as well as the path curve.",
    };
  }

  const prepared = prepareTransform(sketch, geometryIds);
  if (!prepared.ok) return prepared;
  const samples = sampleSketchPath(sketch, path);
  if (!samples || samples.totalLength < 1e-9) {
    return { ok: false, reason: "The pattern path has no measurable length." };
  }

  const closed = isClosedPath(path);
  const stations = closed ? count : count - 1;
  const denominator = closed ? count : Math.max(1, count - 1);
  const points: SketchPoint[] = [];
  const primitives: SketchPrimitive[] = [];
  for (let index = 0; index < stations; index++) {
    const distance = (samples.totalLength * index) / denominator;
    const station = samplePathAtDistance(samples, distance);
    if (!station) continue;
    const rotation = align ? Math.atan2(station.ty, station.tx) : 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const copy = cloneTransformed(
      prepared,
      (point) => {
        const dx = point.x - prepared.center.x;
        const dy = point.y - prepared.center.y;
        return {
          x: station.x + dx * cos - dy * sin,
          y: station.y + dx * sin + dy * cos,
        };
      },
      rotation,
      generateId,
    );
    points.push(...copy.points);
    primitives.push(...copy.primitives);
  }

  if (primitives.length === 0) {
    return { ok: false, reason: "The pattern produced no geometry." };
  }

  return {
    ok: true,
    pointUpdates: [],
    primitiveUpdates: [],
    points,
    primitives,
  };
}

interface PathSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

interface PathSamples {
  /** Cumulative chord length at each sample, ending at totalLength. */
  cumulative: number[];
  samples: PathSample[];
  totalLength: number;
  closed: boolean;
}

function isClosedPath(primitive: SketchPrimitive): boolean {
  return primitive.type === "circle" || primitive.type === "ellipse";
}

function pointFor(sketch: Sketch, id: string): SketchPoint | undefined {
  return findSketchPoint(sketch.primitives, id);
}

/** Return points on a primitive in its natural parameter order. */
function pathPoints(
  sketch: Sketch,
  primitive: SketchPrimitive,
): { x: number; y: number }[] | null {
  switch (primitive.type) {
    case "line": {
      const a = pointFor(sketch, primitive.p1Id);
      const b = pointFor(sketch, primitive.p2Id);
      return a && b ? [a, b] : null;
    }
    case "circle": {
      const center = pointFor(sketch, primitive.centerId);
      if (!center || primitive.radius <= 1e-9) return null;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= 96; i++) {
        const angle = (Math.PI * 2 * i) / 96;
        points.push({
          x: center.x + primitive.radius * Math.cos(angle),
          y: center.y + primitive.radius * Math.sin(angle),
        });
      }
      return points;
    }
    case "arc": {
      const center = pointFor(sketch, primitive.centerId);
      const start = pointFor(sketch, primitive.startId);
      const end = pointFor(sketch, primitive.endId);
      if (!center || !start || !end || primitive.radius <= 1e-9) return null;
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const sweep =
        (((endAngle - startAngle) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2);
      const points: { x: number; y: number }[] = [];
      const steps = Math.max(2, Math.ceil((sweep / (Math.PI * 2)) * 96));
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (sweep * i) / steps;
        points.push({
          x: center.x + primitive.radius * Math.cos(angle),
          y: center.y + primitive.radius * Math.sin(angle),
        });
      }
      return points;
    }
    case "ellipse":
    case "ellipticalArc": {
      const center = pointFor(sketch, primitive.centerId);
      if (!center) return null;
      const isArc = primitive.type === "ellipticalArc";
      const start = isArc ? primitive.startAngle : 0;
      const end = isArc ? primitive.endAngle : Math.PI * 2;
      const sweep = isArc ? end - start : Math.PI * 2;
      const steps = Math.max(
        2,
        Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 128),
      );
      const cosR = Math.cos(primitive.rotation);
      const sinR = Math.sin(primitive.rotation);
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const angle = start + (sweep * i) / steps;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        points.push({
          x:
            center.x +
            primitive.majorRadius * cosA * cosR -
            primitive.minorRadius * sinA * sinR,
          y:
            center.y +
            primitive.majorRadius * cosA * sinR +
            primitive.minorRadius * sinA * cosR,
        });
      }
      return points;
    }
    case "spline": {
      const control = primitive.pointIds.map((id) => pointFor(sketch, id));
      if (control.some((point) => !point) || control.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(
        control.map((point) => new THREE.Vector3(point!.x, point!.y, 0)),
        false,
        "catmullrom",
        0.5,
      );
      const steps = Math.max(24, Math.min(256, control.length * 24));
      const startT = Math.max(0, Math.min(1, primitive.startT ?? 0));
      const endT = Math.max(startT, Math.min(1, primitive.endT ?? 1));
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const point = curve.getPoint(startT + (endT - startT) * (i / steps));
        points.push({ x: point.x, y: point.y });
      }
      return points;
    }
    case "bezier": {
      const control = primitive.pointIds.map((id) => pointFor(sketch, id));
      if (control.length !== 4 || control.some((point) => !point)) return null;
      const [p0, p1, p2, p3] = control as [
        SketchPoint,
        SketchPoint,
        SketchPoint,
        SketchPoint,
      ];
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96;
        const u = 1 - t;
        points.push({
          x:
            u * u * u * p0.x +
            3 * u * u * t * p1.x +
            3 * u * t * t * p2.x +
            t * t * t * p3.x,
          y:
            u * u * u * p0.y +
            3 * u * u * t * p1.y +
            3 * u * t * t * p2.y +
            t * t * t * p3.y,
        });
      }
      return points;
    }
    case "conic": {
      const start = pointFor(sketch, primitive.startId);
      const control = pointFor(sketch, primitive.controlId);
      const end = pointFor(sketch, primitive.endId);
      if (!start || !control || !end) return null;
      const w = Math.max(0.01, primitive.rho);
      const w0 = Math.max(0.01, primitive.startWeight ?? 1);
      const w2 = Math.max(0.01, primitive.endWeight ?? 1);
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96;
        const u = 1 - t;
        const denominator = w0 * u * u + 2 * w * u * t + w2 * t * t;
        points.push({
          x:
            (w0 * u * u * start.x +
              2 * w * u * t * control.x +
              w2 * t * t * end.x) /
            denominator,
          y:
            (w0 * u * u * start.y +
              2 * w * u * t * control.y +
              w2 * t * t * end.y) /
            denominator,
        });
      }
      return points;
    }
    default:
      return null;
  }
}

function sampleSketchPath(
  sketch: Sketch,
  primitive: SketchPrimitive,
): PathSamples | null {
  const points = pathPoints(sketch, primitive);
  if (!points || points.length < 2) return null;
  const samples: PathSample[] = [];
  const cumulative: number[] = [0];
  let total = 0;
  const at = (index: number) =>
    points[Math.max(0, Math.min(points.length - 1, index))]!;
  for (let i = 0; i < points.length; i++) {
    const previous = at(i - 1);
    const current = at(i);
    const next = at(i + 1);
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const length = Math.hypot(tx, ty);
    if (length < 1e-9) {
      tx = 1;
      ty = 0;
    } else {
      tx /= length;
      ty /= length;
    }
    if (i > 0) {
      total += Math.hypot(current.x - previous.x, current.y - previous.y);
      cumulative.push(total);
    }
    samples.push({ x: current.x, y: current.y, tx, ty });
  }
  return {
    cumulative,
    samples,
    totalLength: total,
    closed: isClosedPath(primitive),
  };
}

function samplePathAtDistance(
  path: PathSamples,
  distance: number,
): PathSample | null {
  if (path.samples.length === 0) return null;
  if (distance <= 0) return path.samples[0]!;
  if (distance >= path.totalLength)
    return path.samples[path.samples.length - 1]!;
  let low = 0;
  let high = path.cumulative.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (path.cumulative[mid]! < distance) low = mid + 1;
    else high = mid;
  }
  const index = Math.max(1, low);
  const before = path.cumulative[index - 1]!;
  const after = path.cumulative[index]!;
  const span = after - before;
  const t = span <= 1e-12 ? 0 : (distance - before) / span;
  const a = path.samples[index - 1]!;
  const b = path.samples[index]!;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    tx: a.tx + (b.tx - a.tx) * t,
    ty: a.ty + (b.ty - a.ty) * t,
  };
}
