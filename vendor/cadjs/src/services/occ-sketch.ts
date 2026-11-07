/** Sketch-domain helpers: build edges from primitives, point lookup map, sketch-to-wire conversion. */
import type {
  OpenCascadeInstance,
  TopoDS_Edge,
  TopoDS_Wire,
} from "opencascade.js";
import { CatmullRomCurve3, Vector3 } from "three";
import type { SketchPlane, SketchPrimitive } from "../types/sketch-types";
import { transformShapeToPlaneHelper } from "./occ-shape-conversion";
import {
  iterSubShapes,
  makeAxis2,
  makeCircle,
  makeDir,
  makeEdgeFromCircle,
  makeEdgeFromEllipse,
  makeEdgeFromEllipticalArc,
  makeEdgeFromPoints,
  makeEdgeFromSpline,
  makeEdgeFromBezier,
  makeEdgeFromConic,
  makePoint,
  makeWireFromEdges,
} from "./occ-facade";
import { POINT_COINCIDENCE_TOL_MM } from "../sketch-tolerances";

interface Pt2 {
  x: number;
  y: number;
}

function sampleSplineRange(points: Pt2[], startT: number, endT: number): Pt2[] {
  if (startT <= 0 && endT >= 1) return points;
  const curve = new CatmullRomCurve3(
    points.map((point) => new Vector3(point.x, point.y, 0)),
    false,
    "catmullrom",
    0.5,
  );
  const steps = Math.max(32, Math.min(192, points.length * 24));
  const sampled: Pt2[] = [];
  for (let i = 0; i <= steps; i++) {
    const point = curve.getPoint(startT + (endT - startT) * (i / steps));
    sampled.push({ x: point.x, y: point.y });
  }
  return sampled;
}

function makeArcEdgeFromCenter(
  oc: OpenCascadeInstance,
  center: Pt2,
  radius: number,
  startAngle: number,
  endAngle: number,
): TopoDS_Edge | null {
  const gpCenter = makePoint(oc, center.x, center.y, 0);
  const dir = makeDir(oc, 0, 0, 1);
  const axis = makeAxis2(oc, gpCenter, dir);
  const circle = makeCircle(oc, axis, radius);
  // BRepBuilderAPI_MakeEdge_9: arc of circle parameterized by angles. Use the
  // explicit `_9` suffix because the un-suffixed alias resolves to a different
  // overload (point-pair) that doesn't accept angles.
  const builder = new oc.BRepBuilderAPI_MakeEdge_9(
    circle,
    startAngle,
    endAngle,
  );
  let edge: TopoDS_Edge | null = null;
  if (builder.IsDone()) edge = builder.Edge();
  gpCenter.delete();
  dir.delete();
  axis.delete();
  circle.delete();
  builder.delete();
  return edge;
}

function makeFullCircleEdge(
  oc: OpenCascadeInstance,
  center: Pt2,
  radius: number,
): TopoDS_Edge | null {
  const gpCenter = makePoint(oc, center.x, center.y, 0);
  const dir = makeDir(oc, 0, 0, 1);
  const axis = makeAxis2(oc, gpCenter, dir);
  const circle = makeCircle(oc, axis, radius);
  let edge: TopoDS_Edge | null = null;
  try {
    edge = makeEdgeFromCircle(oc, circle);
  } catch {
    edge = null;
  }
  gpCenter.delete();
  dir.delete();
  axis.delete();
  circle.delete();
  return edge;
}

function makeEllipseEdge(
  oc: OpenCascadeInstance,
  center: Pt2,
  majorRadius: number,
  minorRadius: number,
  rotation: number,
): TopoDS_Edge | null {
  const gpCenter = makePoint(oc, center.x, center.y, 0);
  const normal = makeDir(oc, 0, 0, 1);
  const xDir = makeDir(oc, Math.cos(rotation), Math.sin(rotation), 0);
  const axis = makeAxis2(oc, gpCenter, normal, xDir);
  let edge: TopoDS_Edge | null = null;
  try {
    edge = makeEdgeFromEllipse(oc, axis, majorRadius, minorRadius);
  } catch {
    edge = null;
  }
  gpCenter.delete();
  normal.delete();
  xDir.delete();
  axis.delete();
  return edge;
}

function makeEllipticalArcEdge(
  oc: OpenCascadeInstance,
  center: Pt2,
  majorRadius: number,
  minorRadius: number,
  rotation: number,
  startAngle: number,
  endAngle: number,
): TopoDS_Edge | null {
  const gpCenter = makePoint(oc, center.x, center.y, 0);
  const normal = makeDir(oc, 0, 0, 1);
  const xDir = makeDir(oc, Math.cos(rotation), Math.sin(rotation), 0);
  const axis = makeAxis2(oc, gpCenter, normal, xDir);
  let edge: TopoDS_Edge | null = null;
  try {
    edge = makeEdgeFromEllipticalArc(
      oc,
      axis,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
    );
  } catch {
    edge = null;
  }
  gpCenter.delete();
  normal.delete();
  xDir.delete();
  axis.delete();
  return edge;
}

function makeSplineEdge(
  oc: OpenCascadeInstance,
  points: Pt2[],
): TopoDS_Edge | null {
  if (points.length < 3) return null;
  try {
    return makeEdgeFromSpline(oc, points);
  } catch {
    return null;
  }
}

function makeBezierEdge(
  oc: OpenCascadeInstance,
  points: Pt2[],
): TopoDS_Edge | null {
  if (points.length !== 4) return null;
  try {
    return makeEdgeFromBezier(oc, points);
  } catch {
    return null;
  }
}

function makeConicEdge(
  oc: OpenCascadeInstance,
  start: Pt2,
  control: Pt2,
  end: Pt2,
  rho: number,
  startWeight = 1,
  endWeight = 1,
): TopoDS_Edge | null {
  try {
    return makeEdgeFromConic(
      oc,
      start,
      control,
      end,
      rho,
      startWeight,
      endWeight,
    );
  } catch {
    return null;
  }
}

function makeLineEdge(
  oc: OpenCascadeInstance,
  p1: Pt2,
  p2: Pt2,
): TopoDS_Edge | null {
  const gp1 = makePoint(oc, p1.x, p1.y, 0);
  const gp2 = makePoint(oc, p2.x, p2.y, 0);
  let edge: TopoDS_Edge | null = null;
  try {
    edge = makeEdgeFromPoints(oc, gp1, gp2);
  } catch {
    edge = null;
  }
  gp1.delete();
  gp2.delete();
  return edge;
}

export function buildSketchEdgesHelper(
  oc: OpenCascadeInstance,
  primitives: SketchPrimitive[],
  pointMap: Map<string, Pt2>,
): { circleEdges: TopoDS_Edge[]; otherEdges: TopoDS_Edge[] } {
  const circleEdges: TopoDS_Edge[] = [];
  const otherEdges: TopoDS_Edge[] = [];

  for (const prim of primitives) {
    if (prim.type === "circle") {
      const center = pointMap.get(prim.centerId);
      if (!center) continue;
      const edge = makeFullCircleEdge(oc, center, prim.radius);
      if (edge) circleEdges.push(edge);
    } else if (prim.type === "ellipse") {
      const center = pointMap.get(prim.centerId);
      if (!center) continue;
      const edge = makeEllipseEdge(
        oc,
        center,
        prim.majorRadius,
        prim.minorRadius,
        prim.rotation,
      );
      if (edge) circleEdges.push(edge);
    } else if (prim.type === "ellipticalArc") {
      const center = pointMap.get(prim.centerId);
      if (!center) continue;
      const edge = makeEllipticalArcEdge(
        oc,
        center,
        prim.majorRadius,
        prim.minorRadius,
        prim.rotation,
        prim.startAngle,
        prim.endAngle,
      );
      if (edge) otherEdges.push(edge);
    } else if (prim.type === "spline") {
      const points = prim.pointIds
        .map((id) => pointMap.get(id))
        .filter((p): p is Pt2 => p !== undefined);
      const edge = makeSplineEdge(
        oc,
        sampleSplineRange(points, prim.startT ?? 0, prim.endT ?? 1),
      );
      if (edge) otherEdges.push(edge);
    } else if (prim.type === "bezier") {
      const points = prim.pointIds
        .map((id) => pointMap.get(id))
        .filter((p): p is Pt2 => p !== undefined);
      const edge = makeBezierEdge(oc, points);
      if (edge) otherEdges.push(edge);
    } else if (prim.type === "conic") {
      const start = pointMap.get(prim.startId);
      const control = pointMap.get(prim.controlId);
      const end = pointMap.get(prim.endId);
      if (!start || !control || !end) continue;
      const edge = makeConicEdge(
        oc,
        start,
        control,
        end,
        prim.rho,
        prim.startWeight ?? 1,
        prim.endWeight ?? 1,
      );
      if (edge) otherEdges.push(edge);
    } else if (prim.type === "line") {
      const p1 = pointMap.get(prim.p1Id);
      const p2 = pointMap.get(prim.p2Id);
      if (!p1 || !p2) continue;
      const edge = makeLineEdge(oc, p1, p2);
      if (edge) otherEdges.push(edge);
    } else if (prim.type === "arc") {
      const center = pointMap.get(prim.centerId);
      const start = pointMap.get(prim.startId);
      const end = pointMap.get(prim.endId);
      if (!center || !start || !end) continue;
      const radius = Math.sqrt(
        (start.x - center.x) ** 2 + (start.y - center.y) ** 2,
      );
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const edge = makeArcEdgeFromCenter(
        oc,
        center,
        radius,
        startAngle,
        endAngle,
      );
      if (edge) otherEdges.push(edge);
    }
  }
  return { circleEdges, otherEdges };
}

export function buildSketchPointMap(
  primitives: SketchPrimitive[],
): Map<string, Pt2> {
  const pointMap = new Map<string, Pt2>();
  for (const prim of primitives) {
    if (prim.type === "point") {
      pointMap.set(prim.id, { x: prim.x, y: prim.y });
    }
  }
  return pointMap;
}

export function sketchToWireHelper(
  oc: OpenCascadeInstance,
  primitives: SketchPrimitive[],
  plane: SketchPlane,
): { points: { x: number; y: number; z: number }[] } | null {
  const pointMap = buildSketchPointMap(primitives);
  // Filter construction/origin out without losing the typed primitive narrowing
  // available on the original union. `as` cast is local and limited.
  const nonConstructionPrimitives = primitives.filter((p) => {
    const meta = p as { construction?: boolean; origin?: boolean };
    return !meta.construction && !meta.origin;
  });

  const EPSILON = 1e-6;
  for (const prim of nonConstructionPrimitives) {
    if (prim.type === "circle" && prim.radius <= EPSILON) return null;
    if (prim.type === "arc" && prim.radius <= EPSILON) return null;
    if (
      (prim.type === "ellipse" || prim.type === "ellipticalArc") &&
      (prim.majorRadius <= EPSILON || prim.minorRadius <= EPSILON)
    )
      return null;
    if (prim.type === "line") {
      const p1 = pointMap.get(prim.p1Id);
      const p2 = pointMap.get(prim.p2Id);
      if (p1 && p2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) < EPSILON)
        return null;
    }
    if (prim.type === "spline" && prim.pointIds.length < 3) return null;
  }

  const edges: TopoDS_Edge[] = [];
  for (const prim of nonConstructionPrimitives) {
    if (prim.type === "line") {
      const p1 = pointMap.get(prim.p1Id);
      const p2 = pointMap.get(prim.p2Id);
      if (!p1 || !p2) continue;
      const edge = makeLineEdge(oc, p1, p2);
      if (edge) edges.push(edge);
    } else if (prim.type === "ellipse") {
      const center = pointMap.get(prim.centerId);
      if (!center) continue;
      const edge = makeEllipseEdge(
        oc,
        center,
        prim.majorRadius,
        prim.minorRadius,
        prim.rotation,
      );
      if (edge) edges.push(edge);
    } else if (prim.type === "ellipticalArc") {
      const center = pointMap.get(prim.centerId);
      if (!center) continue;
      const edge = makeEllipticalArcEdge(
        oc,
        center,
        prim.majorRadius,
        prim.minorRadius,
        prim.rotation,
        prim.startAngle,
        prim.endAngle,
      );
      if (edge) edges.push(edge);
    } else if (prim.type === "spline") {
      const points = prim.pointIds
        .map((id) => pointMap.get(id))
        .filter((p): p is Pt2 => p !== undefined);
      const edge = makeSplineEdge(
        oc,
        sampleSplineRange(points, prim.startT ?? 0, prim.endT ?? 1),
      );
      if (edge) edges.push(edge);
    } else if (prim.type === "bezier") {
      const points = prim.pointIds
        .map((id) => pointMap.get(id))
        .filter((p): p is Pt2 => p !== undefined);
      const edge = makeBezierEdge(oc, points);
      if (edge) edges.push(edge);
    } else if (prim.type === "conic") {
      const start = pointMap.get(prim.startId);
      const control = pointMap.get(prim.controlId);
      const end = pointMap.get(prim.endId);
      if (!start || !control || !end) continue;
      const edge = makeConicEdge(
        oc,
        start,
        control,
        end,
        prim.rho,
        prim.startWeight ?? 1,
        prim.endWeight ?? 1,
      );
      if (edge) edges.push(edge);
    } else if (prim.type === "arc") {
      const center = pointMap.get(prim.centerId);
      const start = pointMap.get(prim.startId);
      const end = pointMap.get(prim.endId);
      if (!center || !start || !end) continue;
      const radius = Math.sqrt(
        (start.x - center.x) ** 2 + (start.y - center.y) ** 2,
      );
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      const edge = makeArcEdgeFromCenter(
        oc,
        center,
        radius,
        startAngle,
        endAngle,
      );
      if (edge) edges.push(edge);
    }
  }

  if (edges.length === 0) return null;

  const getEndpoints = (
    edge: TopoDS_Edge,
  ): {
    start: [number, number, number];
    end: [number, number, number];
  } | null => {
    const vertices: [number, number, number][] = [];
    for (const v of iterSubShapes(
      oc,
      edge,
      oc.TopAbs_ShapeEnum.TopAbs_VERTEX as typeof oc.TopAbs_ShapeEnum,
    )) {
      const vertex = oc.TopoDS.Vertex_1(v);
      const pnt = oc.BRep_Tool.Pnt(vertex);
      vertices.push([pnt.X(), pnt.Y(), pnt.Z()]);
      pnt.delete();
    }
    return vertices.length >= 2
      ? { start: vertices[0]!, end: vertices[1]! }
      : null;
  };

  const ptEq = (
    a: [number, number, number],
    b: [number, number, number],
    tol = POINT_COINCIDENCE_TOL_MM,
  ) =>
    Math.abs(a[0] - b[0]) < tol &&
    Math.abs(a[1] - b[1]) < tol &&
    Math.abs(a[2] - b[2]) < tol;

  const sorted: TopoDS_Edge[] = [edges[0]!];
  const used = new Set<number>([0]);
  const firstEndpoints = getEndpoints(edges[0]!);
  if (!firstEndpoints) return null;
  let currentEnd = firstEndpoints.end;

  while (sorted.length < edges.length) {
    let found = false;
    for (let i = 0; i < edges.length; i++) {
      if (used.has(i)) continue;
      const ep = getEndpoints(edges[i]!);
      if (!ep) continue;
      if (ptEq(currentEnd, ep.start)) {
        sorted.push(edges[i]!);
        used.add(i);
        currentEnd = ep.end;
        found = true;
        break;
      }
      if (ptEq(currentEnd, ep.end)) {
        sorted.push(edges[i]!);
        used.add(i);
        currentEnd = ep.start;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  let wire: TopoDS_Wire;
  try {
    wire = makeWireFromEdges(oc, sorted);
  } catch {
    return null;
  }

  const points: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const ep = getEndpoints(sorted[i]!);
    if (ep) {
      if (i === 0)
        points.push({ x: ep.start[0], y: ep.start[1], z: ep.start[2] });
      points.push({ x: ep.end[0], y: ep.end[1], z: ep.end[2] });
    }
  }

  // Transform wire to sketch plane (consumed by transform helper; no need to keep).
  transformShapeToPlaneHelper(oc, wire, plane);

  const isIdentity =
    plane.type === "XY" &&
    Math.abs(plane.origin.x) < 1e-9 &&
    Math.abs(plane.origin.y) < 1e-9 &&
    Math.abs(plane.origin.z) < 1e-9;
  const transformedPoints = isIdentity
    ? points
    : points.map((p) => ({
        x:
          plane.origin.x +
          p.x * plane.xAxis.x +
          p.y * plane.yAxis.x +
          p.z * plane.normal.x,
        y:
          plane.origin.y +
          p.x * plane.xAxis.y +
          p.y * plane.yAxis.y +
          p.z * plane.normal.y,
        z:
          plane.origin.z +
          p.x * plane.xAxis.z +
          p.y * plane.yAxis.z +
          p.z * plane.normal.z,
      }));

  return { points: transformedPoints };
}
