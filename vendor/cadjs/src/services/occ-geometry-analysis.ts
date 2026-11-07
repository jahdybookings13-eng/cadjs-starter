/** Geometry analysis: sharp edges, raw triangulation/edge segments, vertex extraction, edge length and direction. */
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Edge,
  TopTools_IndexedMapOfShape,
} from "opencascade.js";
import type { Vec3 } from "../workers/occ-worker-types";
import {
  asEdge,
  asFace,
  fixShape,
  iterSubShapes,
  mapEdgesIndexed,
  tessellate,
} from "./occ-facade";
import { debugLog } from "../config";
import { TESSELLATE_LINEAR_EDGE } from "../tolerances";

function getSharpEdgeIndicesHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeMap: TopTools_IndexedMapOfShape,
  count: number,
): Set<number> {
  const sharpIndices = new Set<number>();
  const edgeFaceMap = new oc.TopTools_IndexedDataMapOfShapeListOfShape_1();
  oc.TopExp.MapShapesAndAncestors(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
    edgeFaceMap,
  );

  for (let i = 1; i <= count; i++) {
    try {
      const edgeShape = edgeMap.FindKey(i);
      const edge = asEdge(oc, edgeShape);
      if (oc.BRep_Tool.Degenerated(edge)) continue;
      const adjIdx = edgeFaceMap.FindIndex(edgeShape);
      if (adjIdx === 0) continue;
      const faceList = edgeFaceMap.FindFromIndex(adjIdx);
      if (faceList.Size() !== 2) continue;
      const face1 = asFace(oc, faceList.First_1());
      if (oc.BRep_Tool.IsClosed_2(edge, face1)) continue;
      const face2 = asFace(oc, faceList.Last_1());
      const continuity = oc.BRep_Tool.Continuity_1(edge, face1, face2);
      if (continuity !== oc.GeomAbs_Shape.GeomAbs_C0) continue;
      sharpIndices.add(i);
    } catch {
      continue;
    }
  }
  edgeFaceMap.delete();
  return sharpIndices;
}

/** Walk a curve adapter and emit polyline samples (line: 2 endpoints; otherwise UniformDeflection). */
function curveToSegmentPositions(
  oc: OpenCascadeInstance,
  edge: TopoDS_Edge,
  linearDeflection: number,
  out: number[],
): void {
  const curve = new oc.BRepAdaptor_Curve_2(edge);
  const curveType = curve.GetType();
  const first = curve.FirstParameter();
  const last = curve.LastParameter();

  if (curveType === oc.GeomAbs_CurveType.GeomAbs_Line) {
    const p1 = curve.Value(first);
    const p2 = curve.Value(last);
    out.push(p1.X(), p1.Y(), p1.Z(), p2.X(), p2.Y(), p2.Z());
    return;
  }

  const gcpu = new oc.GCPnts_UniformDeflection_4(
    curve,
    linearDeflection,
    first,
    last,
    false,
  );
  if (gcpu.IsDone()) {
    const nbPoints = gcpu.NbPoints();
    for (let j = 1; j < nbPoints; j++) {
      const p1 = gcpu.Value(j);
      const p2 = gcpu.Value(j + 1);
      out.push(p1.X(), p1.Y(), p1.Z(), p2.X(), p2.Y(), p2.Z());
    }
  } else {
    const numSegments = 32;
    const step = (last - first) / numSegments;
    for (let j = 0; j < numSegments; j++) {
      const p1 = curve.Value(first + j * step);
      const p2 = curve.Value(first + (j + 1) * step);
      out.push(p1.X(), p1.Y(), p1.Z(), p2.X(), p2.Y(), p2.Z());
    }
  }
}

export function getEdgeLineSegmentsPerEdgeHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  linearDeflection: number = TESSELLATE_LINEAR_EDGE,
  skipFix: boolean = false,
  allEdges: boolean = false,
): Array<{ edgeIndex: number; segments: Float32Array; midpoint: Vec3 }> {
  const fixedShape = skipFix ? shape : fixShape(oc, shape);
  const edgeMap = mapEdgesIndexed(oc, fixedShape);
  try {
    const count = edgeMap.size;
    const sharpIndices = allEdges
      ? null
      : getSharpEdgeIndicesHelper(oc, fixedShape, edgeMap.raw, count);
    const result: Array<{
      edgeIndex: number;
      segments: Float32Array;
      midpoint: Vec3;
    }> = [];

    for (let i = 1; i <= count; i++) {
      if (sharpIndices && !sharpIndices.has(i)) continue;
      const edge = edgeMap.edgeAt(i);
      if (oc.BRep_Tool.Degenerated(edge)) continue;

      const positions: number[] = [];
      curveToSegmentPositions(oc, edge, linearDeflection, positions);

      const curve = new oc.BRepAdaptor_Curve_2(edge);
      const midPt = curve.Value(
        (curve.FirstParameter() + curve.LastParameter()) / 2,
      );
      result.push({
        edgeIndex: i,
        segments: new Float32Array(positions),
        midpoint: { x: midPt.X(), y: midPt.Y(), z: midPt.Z() },
      });
    }
    return result;
  } finally {
    edgeMap.delete();
  }
}

/** Tessellate shape and return raw positions + indices + normals. */
export function shapeToRawGeometry(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  linearDeflection: number = 0.003,
  angularDeflection: number = 0.1,
): { positions: Float32Array; indices: Uint32Array; normals: Float32Array } {
  try {
    oc.BRepTools.Clean(shape, true);
  } catch (err) {
    debugLog("occ BRepTools.Clean failed", err);
  }
  tessellate(oc, shape, linearDeflection, angularDeflection);

  const vertices: number[] = [];
  const indices: number[] = [];
  let indexOffset = 0;

  for (const f of iterSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  )) {
    const face = asFace(oc, f);
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
    if (!triangulation.IsNull()) {
      const transformation = location.Transformation();
      const nbNodes = triangulation.get().NbNodes();
      const nbTriangles = triangulation.get().NbTriangles();
      const isReversed =
        face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
      for (let i = 1; i <= nbNodes; i++) {
        const node = triangulation.get().Node(i).Transformed(transformation);
        vertices.push(node.X(), node.Y(), node.Z());
      }
      for (let i = 1; i <= nbTriangles; i++) {
        const triangle = triangulation.get().Triangle(i);
        const n1 = triangle.Value(1) - 1 + indexOffset;
        const n2 = triangle.Value(2) - 1 + indexOffset;
        const n3 = triangle.Value(3) - 1 + indexOffset;
        if (isReversed) indices.push(n1, n3, n2);
        else indices.push(n1, n2, n3);
      }
      indexOffset += nbNodes;
    }
  }

  const positionsArr = new Float32Array(vertices);
  const indicesArr = new Uint32Array(indices);

  const normals = new Float32Array(vertices.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indicesArr[i]! * 3,
      i1 = indicesArr[i + 1]! * 3,
      i2 = indicesArr[i + 2]! * 3;
    const ax = positionsArr[i1]! - positionsArr[i0]!,
      ay = positionsArr[i1 + 1]! - positionsArr[i0 + 1]!,
      az = positionsArr[i1 + 2]! - positionsArr[i0 + 2]!;
    const bx = positionsArr[i2]! - positionsArr[i0]!,
      by = positionsArr[i2 + 1]! - positionsArr[i0 + 1]!,
      bz = positionsArr[i2 + 2]! - positionsArr[i0 + 2]!;
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    normals[i0]! += nx;
    normals[i0 + 1]! += ny;
    normals[i0 + 2]! += nz;
    normals[i1]! += nx;
    normals[i1 + 1]! += ny;
    normals[i1 + 2]! += nz;
    normals[i2]! += nx;
    normals[i2 + 1]! += ny;
    normals[i2 + 2]! += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i]! ** 2 + normals[i + 1]! ** 2 + normals[i + 2]! ** 2,
    );
    if (len > 0) {
      normals[i]! /= len;
      normals[i + 1]! /= len;
      normals[i + 2]! /= len;
    }
  }

  return { positions: positionsArr, indices: indicesArr, normals };
}

/** Extract sharp (or all) edge line segments as a flat Float32Array. */
export function shapeToRawEdgeSegments(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  linearDeflection: number = TESSELLATE_LINEAR_EDGE,
  allEdges: boolean = false,
): Float32Array {
  const edgeMap = mapEdgesIndexed(oc, shape);
  try {
    const count = edgeMap.size;
    const sharpIndices = allEdges
      ? null
      : getSharpEdgeIndicesHelper(oc, shape, edgeMap.raw, count);
    const positions: number[] = [];

    for (let i = 1; i <= count; i++) {
      if (sharpIndices && !sharpIndices.has(i)) continue;
      const edge = edgeMap.edgeAt(i);
      if (!sharpIndices && oc.BRep_Tool.Degenerated(edge)) continue;
      curveToSegmentPositions(oc, edge, linearDeflection, positions);
    }
    return new Float32Array(positions);
  } finally {
    edgeMap.delete();
  }
}

/** Extract vertex positions at sharp edge junctions. */
export function shapeToVertexPositionsHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  allEdges: boolean = false,
): Float32Array {
  const edgeMap = mapEdgesIndexed(oc, shape);
  try {
    const count = edgeMap.size;
    const sharpIndices = allEdges
      ? null
      : getSharpEdgeIndicesHelper(oc, shape, edgeMap.raw, count);

    const vertexEdgeSet = new Map<
      string,
      { x: number; y: number; z: number; edges: Set<number> }
    >();
    const toKey = (x: number, y: number, z: number) =>
      `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;

    const edgeIndices =
      sharpIndices ?? Array.from({ length: count }, (_, k) => k + 1);
    for (const i of edgeIndices) {
      const edge = edgeMap.edgeAt(i);
      if (!sharpIndices && oc.BRep_Tool.Degenerated(edge)) continue;
      const curve = new oc.BRepAdaptor_Curve_2(edge);
      const p1 = curve.Value(curve.FirstParameter());
      const p2 = curve.Value(curve.LastParameter());
      for (const pt of [
        { x: p1.X(), y: p1.Y(), z: p1.Z() },
        { x: p2.X(), y: p2.Y(), z: p2.Z() },
      ]) {
        const key = toKey(pt.x, pt.y, pt.z);
        const existing = vertexEdgeSet.get(key);
        if (existing) existing.edges.add(i);
        else vertexEdgeSet.set(key, { ...pt, edges: new Set([i]) });
      }
    }

    const positions: number[] = [];
    for (const [, info] of vertexEdgeSet) {
      if (info.edges.size >= 2) positions.push(info.x, info.y, info.z);
    }
    return new Float32Array(positions);
  } finally {
    edgeMap.delete();
  }
}

export function getEdgeLengthHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndex: number,
  skipFix: boolean = false,
): number {
  const fixedShape = skipFix ? shape : fixShape(oc, shape);
  const edgeMap = mapEdgesIndexed(oc, fixedShape);
  try {
    if (edgeIndex < 1 || edgeIndex > edgeMap.size) {
      throw new Error(
        `getEdgeLengthHelper: edgeIndex ${edgeIndex} out of range [1, ${edgeMap.size}]`,
      );
    }
    const edge = edgeMap.edgeAt(edgeIndex);
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.LinearProperties(edge, props, false, false);
    const length = props.Mass();
    props.delete();
    return length;
  } finally {
    edgeMap.delete();
  }
}

export function getEdgeDirectionAtMidpointHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndex: number,
  skipFix: boolean = false,
): { x: number; y: number; z: number } {
  const fixedShape = skipFix ? shape : fixShape(oc, shape);
  const edgeMap = mapEdgesIndexed(oc, fixedShape);
  try {
    if (edgeIndex < 1 || edgeIndex > edgeMap.size) {
      throw new Error(
        `getEdgeDirectionAtMidpointHelper: edgeIndex ${edgeIndex} out of range [1, ${edgeMap.size}]`,
      );
    }
    const edge = edgeMap.edgeAt(edgeIndex);
    const curve = new oc.BRepAdaptor_Curve_2(edge);
    const first = curve.FirstParameter();
    const last = curve.LastParameter();
    const midParam = (first + last) / 2;

    const tangent = curve.DN(midParam, 1);
    const mag = tangent.Magnitude();

    let result: { x: number; y: number; z: number };
    if (mag < 1e-12) {
      const p1 = curve.Value(first);
      const p2 = curve.Value(last);
      const dx = p2.X() - p1.X();
      const dy = p2.Y() - p1.Y();
      const dz = p2.Z() - p1.Z();
      const chordLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      result =
        chordLen < 1e-12
          ? { x: 0, y: 0, z: 1 }
          : { x: dx / chordLen, y: dy / chordLen, z: dz / chordLen };
      p1.delete();
      p2.delete();
    } else {
      const normalized = tangent.Normalized();
      result = { x: normalized.X(), y: normalized.Y(), z: normalized.Z() };
      normalized.delete();
    }

    tangent.delete();
    curve.delete();
    return result;
  } finally {
    edgeMap.delete();
  }
}
