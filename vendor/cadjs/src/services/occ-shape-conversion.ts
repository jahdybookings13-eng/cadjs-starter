/**
 * BRep ↔ OCC shape conversion, bounds, serialization, transforms,
 * face/profile analysis. The foundation other occ-* modules build on.
 */
import type {
  OpenCascadeInstance,
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Shape,
  TopoDS_Wire,
  gp_Pnt,
  BRepBuilderAPI_MakeWire,
} from "opencascade.js";
import type { BrepJSON, VertexJSON } from "../geometry";
import type { Vec3 } from "../workers/occ-worker-types";
import type { SketchPlane } from "../types/sketch-types";
import {
  applyTransform,
  asEdge,
  asFace,
  asWire,
  fixShape,
  iterSubShapes,
  makeAxis2,
  makeCircle,
  makeDir,
  makeEdgeFromCircle,
  makeEdgeFromPoints,
  makePlanarFace,
  makePoint,
  makeTranslation,
  makeWireFromEdge,
  makeWireFromEdges,
  tessellate,
  withOcc,
  withOccScope,
  withProgressRange,
} from "./occ-facade";
import { debugLog } from "../config";
import {
  AXIS_FLATNESS_MM,
  EDGES_TO_WIRES_TOL,
  FREEBOUNDS_TOL,
  PLANE_IDENTITY_TOL,
  POINT_TOL,
  RADIUS_DEV_TOL,
  SHAPEFIX_TOL,
  TESSELLATE_ANGULAR,
  TESSELLATE_LINEAR,
} from "../tolerances";

export interface BrepBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export function calculateBrepBoundsFromJSON(brepJson: BrepJSON): BrepBounds {
  const bounds: BrepBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  for (const v of brepJson.vertices) {
    bounds.minX = Math.min(bounds.minX, v.x);
    bounds.maxX = Math.max(bounds.maxX, v.x);
    bounds.minY = Math.min(bounds.minY, v.y);
    bounds.maxY = Math.max(bounds.maxY, v.y);
    bounds.minZ = Math.min(bounds.minZ, v.z);
    bounds.maxZ = Math.max(bounds.maxZ, v.z);
  }

  return bounds;
}

function createPolygonWireHelper(
  oc: OpenCascadeInstance,
  points: gp_Pnt[],
): TopoDS_Wire {
  if (points.length < 2) throw new Error("Need at least two points for a wire");
  const edges: TopoDS_Edge[] = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;
    try {
      edges.push(makeEdgeFromPoints(oc, p1, p2));
    } catch {
      /* skip malformed edge */
    }
  }
  try {
    return makeWireFromEdges(oc, edges);
  } catch {
    throw new Error("Failed to create wire");
  }
}

/**
 * Detects whether a tessellated face's boundary vertices form a planar circle
 * (axis-aligned only). Used by the BRep→OCC path to recover analytic circle
 * faces lost during tessellation. Returns null if the vertices are not
 * coplanar with an XY/XZ/YZ plane or do not fit a single radius.
 *
 * Tolerances assume input is in mm; see {@link AXIS_FLATNESS_MM} and
 * {@link RADIUS_DEV_TOL}.
 */
function isCircularFaceHelper(
  vertices: VertexJSON[],
): { center: Vec3; radius: number; normal: Vec3 } | null {
  if (vertices.length < 8) return null;

  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const zs = vertices.map((v) => v.z);
  const rangeX = Math.max(...xs) - Math.min(...xs);
  const rangeY = Math.max(...ys) - Math.min(...ys);
  const rangeZ = Math.max(...zs) - Math.min(...zs);

  let u: "x" | "y" | "z", v: "x" | "y" | "z";
  let normal: Vec3;

  if (rangeX < AXIS_FLATNESS_MM) {
    u = "y";
    v = "z";
    normal = { x: 1, y: 0, z: 0 };
  } else if (rangeY < AXIS_FLATNESS_MM) {
    u = "x";
    v = "z";
    normal = { x: 0, y: 1, z: 0 };
  } else if (rangeZ < AXIS_FLATNESS_MM) {
    u = "x";
    v = "y";
    normal = { x: 0, y: 0, z: 1 };
  } else return null;

  const cx = vertices.reduce((s, vert) => s + vert.x, 0) / vertices.length;
  const cy = vertices.reduce((s, vert) => s + vert.y, 0) / vertices.length;
  const cz = vertices.reduce((s, vert) => s + vert.z, 0) / vertices.length;
  const center = { x: cx, y: cy, z: cz };

  const distances = vertices.map((vert) =>
    Math.sqrt((vert[u] - center[u]) ** 2 + (vert[v] - center[v]) ** 2),
  );
  const avgRadius = distances.reduce((s, d) => s + d, 0) / distances.length;
  if (avgRadius < POINT_TOL) return null;
  const allOnCircle = distances.every(
    (d) => Math.abs(d - avgRadius) / avgRadius < RADIUS_DEV_TOL,
  );
  if (!allOnCircle) return null;
  return { center, radius: avgRadius, normal };
}

function createSolidFromBrepJSON(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
): TopoDS_Shape {
  return withOcc(
    () => new oc.BRepBuilderAPI_Sewing(POINT_TOL, true, true, true, false),
    (sewing) => {
      for (const face of brepJson.faces) {
        if (face.vertices.length < 3) continue;
        const ocPoints = face.vertices.map((v) => makePoint(oc, v.x, v.y, v.z));
        try {
          const polygonWire = createPolygonWireHelper(oc, ocPoints);
          try {
            const planarFace = makePlanarFace(oc, polygonWire);
            sewing.Add(planarFace);
          } catch {
            /* skip face that won't planarize */
          }
        } finally {
          ocPoints.forEach((p) => p.delete());
        }
      }
      withProgressRange(oc, (pr) => sewing.Perform(pr));
      const sewnShape = sewing.SewedShape();

      try {
        return withOcc(
          () => new oc.BRepBuilderAPI_MakeSolid_1(),
          (solidMaker) => {
            for (const shellShape of iterSubShapes(
              oc,
              sewnShape,
              oc.TopAbs_ShapeEnum.TopAbs_SHELL as typeof oc.TopAbs_ShapeEnum,
            )) {
              const shell = oc.TopoDS.Shell_1(shellShape);
              solidMaker.Add(shell);
              const solid = solidMaker.Solid();
              try {
                oc.BRepLib.OrientClosedSolid(solid);
              } catch {
                /* not orientable */
              }
              return solid;
            }
            return sewnShape;
          },
        );
      } catch {
        /* fall through */
      }
      return sewnShape;
    },
  );
}

function createShellFromBrepJSON(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
): TopoDS_Shape {
  const builder = new oc.BRep_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  let faceCount = 0;
  let lastFace: TopoDS_Face | null = null;

  const allUniqueVerts = new Map<string, VertexJSON>();
  for (const face of brepJson.faces) {
    for (const v of face.vertices) {
      const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
      allUniqueVerts.set(key, v);
    }
  }
  const circleInfo = isCircularFaceHelper(Array.from(allUniqueVerts.values()));

  if (circleInfo) {
    const centerPnt = makePoint(
      oc,
      circleInfo.center.x,
      circleInfo.center.y,
      circleInfo.center.z,
    );
    const dir = makeDir(
      oc,
      circleInfo.normal.x,
      circleInfo.normal.y,
      circleInfo.normal.z,
    );
    const axis = makeAxis2(oc, centerPnt, dir);
    const circ = makeCircle(oc, axis, circleInfo.radius);
    try {
      const edge = makeEdgeFromCircle(oc, circ);
      const wire = makeWireFromEdge(oc, edge);
      const planarFace = makePlanarFace(oc, wire);
      centerPnt.delete();
      dir.delete();
      axis.delete();
      circ.delete();
      return planarFace;
    } catch {
      /* fall through to polygon path */
    }
    centerPnt.delete();
    dir.delete();
    axis.delete();
    circ.delete();
  }

  for (const face of brepJson.faces) {
    if (face.vertices.length < 3) continue;
    const ocPoints = face.vertices.map((v) => makePoint(oc, v.x, v.y, v.z));
    try {
      const polygonWire = createPolygonWireHelper(oc, ocPoints);
      try {
        const planarFace = makePlanarFace(oc, polygonWire);
        builder.Add(compound, planarFace);
        lastFace = planarFace;
        faceCount++;
      } catch {
        /* skip face that won't planarize */
      }
    } finally {
      ocPoints.forEach((p) => p.delete());
    }
  }
  if (faceCount === 1 && lastFace) return lastFace;
  return compound;
}

// Optional `position` translates the shape so its bounding-box center lands there.
export function brepToOCShapeHelper(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
  position?: Vec3,
): TopoDS_Shape {
  let workingBrepJson = brepJson;

  if (position) {
    const bounds = calculateBrepBoundsFromJSON(brepJson);
    const actualCenterX = (bounds.minX + bounds.maxX) / 2;
    const actualCenterY = (bounds.minY + bounds.maxY) / 2;
    const actualCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const needsTranslation =
      Math.abs(actualCenterX - position.x) > 1e-9 ||
      Math.abs(actualCenterY - position.y) > 1e-9 ||
      Math.abs(actualCenterZ - position.z) > 1e-9;

    if (needsTranslation) {
      const dx = position.x - actualCenterX;
      const dy = position.y - actualCenterY;
      const dz = position.z - actualCenterZ;
      workingBrepJson = {
        ...brepJson,
        vertices: brepJson.vertices.map((v) => ({
          x: v.x + dx,
          y: v.y + dy,
          z: v.z + dz,
        })),
        edges: brepJson.edges.map((e) => ({
          start: { x: e.start.x + dx, y: e.start.y + dy, z: e.start.z + dz },
          end: { x: e.end.x + dx, y: e.end.y + dy, z: e.end.z + dz },
        })),
        faces: brepJson.faces.map((f) => ({
          vertices: f.vertices.map((v) => ({
            x: v.x + dx,
            y: v.y + dy,
            z: v.z + dz,
          })),
        })),
      };
    }
  }

  const xs = workingBrepJson.vertices.map((v) => v.x);
  const ys = workingBrepJson.vertices.map((v) => v.y);
  const zs = workingBrepJson.vertices.map((v) => v.z);
  const rangeX = Math.max(...xs) - Math.min(...xs);
  const rangeY = Math.max(...ys) - Math.min(...ys);
  const rangeZ = Math.max(...zs) - Math.min(...zs);
  const thickAxes =
    (rangeX > AXIS_FLATNESS_MM ? 1 : 0) +
    (rangeY > AXIS_FLATNESS_MM ? 1 : 0) +
    (rangeZ > AXIS_FLATNESS_MM ? 1 : 0);
  const is3D = thickAxes >= 2;

  if (is3D) return createSolidFromBrepJSON(oc, workingBrepJson);
  return createShellFromBrepJSON(oc, workingBrepJson);
}

function getOrCreateVertexHelper(
  vertexMap: Map<string, VertexJSON>,
  x: number,
  y: number,
  z: number,
  allVertices: VertexJSON[],
): VertexJSON {
  const key = `${x.toFixed(7)},${y.toFixed(7)},${z.toFixed(7)}`;
  if (vertexMap.has(key)) return vertexMap.get(key)!;
  const vertex = { x, y, z };
  vertexMap.set(key, vertex);
  allVertices.push(vertex);
  return vertex;
}

export function ocShapeToBRepHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  centerAtOrigin: boolean = true,
): { brepJson: BrepJSON; center: Vec3 } {
  const vertexMap = new Map<string, VertexJSON>();
  interface EdgeJSON_ {
    start: VertexJSON;
    end: VertexJSON;
  }
  interface FaceJSON_ {
    vertices: VertexJSON[];
  }
  const edges: EdgeJSON_[] = [];
  const faces: FaceJSON_[] = [];
  const allVertices: VertexJSON[] = [];

  try {
    oc.BRepTools.Clean(shape, true);
  } catch (e) {
    debugLog("[ocShapeToBRep] BRepTools.Clean failed (best-effort):", e);
  }
  tessellate(oc, shape, TESSELLATE_LINEAR, TESSELLATE_ANGULAR, false);

  for (const edgeShape of iterSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
  )) {
    const edge = asEdge(oc, edgeShape);
    withOcc(
      () => new oc.BRepAdaptor_Curve_2(edge),
      (curve) => {
        const startPnt = curve.Value(curve.FirstParameter());
        const endPnt = curve.Value(curve.LastParameter());
        const v1 = getOrCreateVertexHelper(
          vertexMap,
          startPnt.X(),
          startPnt.Y(),
          startPnt.Z(),
          allVertices,
        );
        const v2 = getOrCreateVertexHelper(
          vertexMap,
          endPnt.X(),
          endPnt.Y(),
          endPnt.Z(),
          allVertices,
        );
        const edgeKey = `${v1.x.toFixed(5)},${v1.y.toFixed(5)},${v1.z.toFixed(5)}-${v2.x.toFixed(5)},${v2.y.toFixed(5)},${v2.z.toFixed(5)}`;
        const reverseKey = `${v2.x.toFixed(5)},${v2.y.toFixed(5)},${v2.z.toFixed(5)}-${v1.x.toFixed(5)},${v1.y.toFixed(5)},${v1.z.toFixed(5)}`;
        const exists = edges.some((e) => {
          const ek = `${e.start.x.toFixed(5)},${e.start.y.toFixed(5)},${e.start.z.toFixed(5)}-${e.end.x.toFixed(5)},${e.end.y.toFixed(5)},${e.end.z.toFixed(5)}`;
          return ek === edgeKey || ek === reverseKey;
        });
        if (!exists) edges.push({ start: v1, end: v2 });
      },
    );
  }

  for (const faceShape of iterSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  )) {
    const face = asFace(oc, faceShape);
    withOcc(
      () => new oc.TopLoc_Location_1(),
      (location) => {
        const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
        if (triangulation.IsNull()) return;
        const transformation = location.Transformation();
        const nbTriangles = triangulation.get().NbTriangles();
        const isReversed =
          face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        for (let i = 1; i <= nbTriangles; i++) {
          const triangle = triangulation.get().Triangle(i);
          const p1 = triangulation
            .get()
            .Node(triangle.Value(1))
            .Transformed(transformation);
          const p2 = triangulation
            .get()
            .Node(triangle.Value(2))
            .Transformed(transformation);
          const p3 = triangulation
            .get()
            .Node(triangle.Value(3))
            .Transformed(transformation);
          const v1 = getOrCreateVertexHelper(
            vertexMap,
            p1.X(),
            p1.Y(),
            p1.Z(),
            allVertices,
          );
          const v2 = getOrCreateVertexHelper(
            vertexMap,
            p2.X(),
            p2.Y(),
            p2.Z(),
            allVertices,
          );
          const v3 = getOrCreateVertexHelper(
            vertexMap,
            p3.X(),
            p3.Y(),
            p3.Z(),
            allVertices,
          );
          if (isReversed) faces.push({ vertices: [v1, v3, v2] });
          else faces.push({ vertices: [v1, v2, v3] });
        }
      },
    );
  }

  let center: Vec3 = { x: 0, y: 0, z: 0 };
  if (centerAtOrigin && allVertices.length > 0) {
    const bounds = calculateBrepBoundsFromJSON({
      vertices: allVertices,
      edges: [],
      faces: [],
    });
    center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
    };
    for (const v of allVertices) {
      v.x -= center.x;
      v.y -= center.y;
      v.z -= center.z;
    }
  }

  return {
    brepJson: { type: "brep", vertices: allVertices, edges, faces },
    center,
  };
}

export function serializeShapeHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): string {
  const filePath = "/tmp/occ_brep_out.brep";
  return withProgressRange(oc, (pr) => {
    try {
      const success = oc.BRepTools.Write_3(shape, filePath, pr);
      if (!success) throw new Error("BRepTools.Write_3 failed");
      return oc.FS.readFile(filePath, { encoding: "utf8" }) as string;
    } finally {
      try {
        oc.FS.unlink(filePath);
      } catch (err) {
        debugLog("occ FS.unlink failed", filePath, err);
      }
    }
  });
}

export function deserializeShapeHelper(
  oc: OpenCascadeInstance,
  brepString: string,
): TopoDS_Shape {
  const filePath = "/tmp/occ_brep_in.brep";
  return withProgressRange(oc, (pr) =>
    withOcc(
      () => new oc.BRep_Builder(),
      (builder) => {
        try {
          oc.FS.writeFile(filePath, brepString);
          const shape = new oc.TopoDS_Shape();
          const success = oc.BRepTools.Read_2(shape, filePath, builder, pr);
          if (!success) {
            shape.delete();
            throw new Error("BRepTools.Read_2 failed");
          }
          return shape;
        } finally {
          try {
            oc.FS.unlink(filePath);
          } catch (err) {
            debugLog("occ FS.unlink failed", filePath, err);
          }
        }
      },
    ),
  );
}

export function occBrepToOCShapeHelper(
  oc: OpenCascadeInstance,
  occBrep: string,
  position?: Vec3,
): TopoDS_Shape {
  const shape = deserializeShapeHelper(oc, occBrep);
  if (position && (position.x !== 0 || position.y !== 0 || position.z !== 0)) {
    return withOcc(
      () => makeTranslation(oc, position.x, position.y, position.z),
      (trsf) => applyTransform(oc, shape, trsf, true),
    );
  }
  return shape;
}

export function buildPlanarFaceFromBoundaryHelper(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
): TopoDS_Shape | null {
  const shape = brepToOCShapeHelper(oc, brepJson);
  if (shape.IsNull()) return null;
  if (shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) return shape;

  return withOcc(
    () =>
      new oc.ShapeAnalysis_FreeBounds_2(shape, FREEBOUNDS_TOL, false, false),
    (analyzer) => {
      const closedWires = analyzer.GetClosedWires();
      if (closedWires.IsNull()) return null;

      let outerWire: TopoDS_Wire | null = null;
      let largestArea = 0;

      for (const wireShape of iterSubShapes(
        oc,
        closedWires,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE as typeof oc.TopAbs_ShapeEnum,
      )) {
        const currentWire = asWire(oc, wireShape);
        withOccScope((track) => {
          try {
            const tempFace = track(makePlanarFace(oc, currentWire));
            const props = track(new oc.GProp_GProps_1());
            oc.BRepGProp.SurfaceProperties_2(tempFace, props, 1e-7, false);
            const area = Math.abs(props.Mass());
            if (area > largestArea) {
              largestArea = area;
              outerWire = currentWire;
            }
          } catch {
            if (!outerWire) outerWire = currentWire;
          }
        });
      }

      if (!outerWire) return null;
      try {
        return makePlanarFace(oc, outerWire);
      } catch {
        return null;
      }
    },
  );
}

export function buildWireFromPointsHelper(
  oc: OpenCascadeInstance,
  points: Vec3[],
): TopoDS_Wire | null {
  if (points.length < 2) return null;
  return withOccScope((track) => {
    const ocPoints = points.map((p) => track(makePoint(oc, p.x, p.y, p.z)));
    const edges: TopoDS_Edge[] = [];
    try {
      for (let i = 0; i < ocPoints.length - 1; i++) {
        try {
          edges.push(makeEdgeFromPoints(oc, ocPoints[i]!, ocPoints[i + 1]!));
        } catch {
          /* skip malformed edge */
        }
      }
      if (edges.length === 0) return null;
      return makeWireFromEdges(oc, edges);
    } catch {
      return null;
    }
  });
}

export function fixAndOrient(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Shape {
  const result = fixShape(oc, shape, SHAPEFIX_TOL);
  try {
    oc.BRepLib.OrientClosedSolid(shape);
  } catch (e) {
    debugLog("[fixAndOrient] OrientClosedSolid failed (best-effort):", e);
  }
  return result;
}

// `wireErrorToString` was used only for `BRepBuilderAPI_MakeWire`-specific
// error decoding; the facade's `makeWireFromEdges` throws with a generic
// message instead. Remove this helper once no caller depends on its detail.
function wireErrorToString(
  oc: OpenCascadeInstance,
  wire: BRepBuilderAPI_MakeWire,
): string {
  try {
    const err = wire.Error();
    if (err === oc.BRepBuilderAPI_WireError.BRepBuilderAPI_EmptyWire)
      return "no edges in wire";
    if (err === oc.BRepBuilderAPI_WireError.BRepBuilderAPI_DisconnectedWire)
      return "edges are disconnected";
    if (err === oc.BRepBuilderAPI_WireError.BRepBuilderAPI_NonManifoldWire)
      return "non-manifold wire";
  } catch (e) {
    debugLog("[wireErrorToString] decoding wire error failed:", e);
  }
  return "unknown reason";
}
// Side-channel reference so the helper isn't pruned while we leave it for
// future use. Remove once formally deleted.
void wireErrorToString;

export function computeBoundingBoxCenter(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): Vec3 {
  return withOcc(
    () => new oc.Bnd_Box_1(),
    (bBox) => {
      oc.BRepBndLib.Add(shape, bBox, false);
      return {
        x: (bBox.CornerMin().X() + bBox.CornerMax().X()) / 2,
        y: (bBox.CornerMin().Y() + bBox.CornerMax().Y()) / 2,
        z: (bBox.CornerMin().Z() + bBox.CornerMax().Z()) / 2,
      };
    },
  );
}

export function translateShape(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  vec: Vec3,
): TopoDS_Shape {
  return withOcc(
    () => makeTranslation(oc, vec.x, vec.y, vec.z),
    (trsf) => applyTransform(oc, shape, trsf, true),
  );
}

export function transformShapeToPlaneHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  plane: SketchPlane,
): TopoDS_Shape {
  const isIdentity =
    plane.type === "XY" &&
    Math.abs(plane.origin.x) < PLANE_IDENTITY_TOL &&
    Math.abs(plane.origin.y) < PLANE_IDENTITY_TOL &&
    Math.abs(plane.origin.z) < PLANE_IDENTITY_TOL;
  if (isIdentity) return shape;

  return withOccScope((track) => {
    // SetValues is a 12-element row-major affine, no facade equivalent for that.
    const trsf = track(new oc.gp_Trsf_1());
    trsf.SetValues(
      plane.xAxis.x,
      plane.yAxis.x,
      plane.normal.x,
      plane.origin.x,
      plane.xAxis.y,
      plane.yAxis.y,
      plane.normal.y,
      plane.origin.y,
      plane.xAxis.z,
      plane.yAxis.z,
      plane.normal.z,
      plane.origin.z,
    );
    const transformer = track(
      new oc.BRepBuilderAPI_Transform_2(shape, trsf, true),
    );
    if (transformer.IsDone()) return transformer.Shape();
    return shape;
  });
}

export function detectProfileRegionsHelper(
  oc: OpenCascadeInstance,
  edges: TopoDS_Edge[],
): TopoDS_Face[] {
  if (edges.length < 1) return [];
  return withOccScope((track) => {
    const builder = track(new oc.BRep_Builder());
    const edgeCompound = track(new oc.TopoDS_Compound());
    builder.MakeCompound(edgeCompound);
    for (const edge of edges) builder.Add(edgeCompound, edge);

    const wireCompound = track(new oc.TopoDS_Compound());
    builder.MakeCompound(wireCompound);
    const wireResult = oc.BOPAlgo_Tools.EdgesToWires(
      edgeCompound,
      wireCompound,
      false,
      EDGES_TO_WIRES_TOL,
    );
    if (wireResult !== 0) return [];

    const faceCompound = track(new oc.TopoDS_Compound());
    builder.MakeCompound(faceCompound);
    const success = oc.BOPAlgo_Tools.WiresToFaces(
      wireCompound,
      faceCompound,
      EDGES_TO_WIRES_TOL,
    );
    if (!success) return [];

    const faces: TopoDS_Face[] = [];
    for (const faceShape of iterSubShapes(
      oc,
      faceCompound,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
    )) {
      faces.push(asFace(oc, faceShape));
    }
    return faces;
  });
}

export function calculateFaceAreaHelper(
  oc: OpenCascadeInstance,
  face: TopoDS_Face,
): number {
  return withOcc(
    () => new oc.GProp_GProps_1(),
    (props) => {
      oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
      return props.Mass();
    },
  );
}

export function faceToBrepWithCenterHelper(
  oc: OpenCascadeInstance,
  face: TopoDS_Face,
): { brepJson: BrepJSON; center: Vec3 } {
  tessellate(oc, face, TESSELLATE_LINEAR, TESSELLATE_ANGULAR, false);
  return withOcc(
    () => new oc.TopLoc_Location_1(),
    (location) => {
      const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
      if (triangulation.IsNull()) {
        return {
          brepJson: { vertices: [], edges: [], faces: [] },
          center: { x: 0, y: 0, z: 0 },
        };
      }

      const vertexMap = new Map<string, VertexJSON>();
      const allVertices: VertexJSON[] = [];
      const jsonFaces: { vertices: VertexJSON[] }[] = [];

      const transformation = location.Transformation();
      const nbTriangles = triangulation.get().NbTriangles();
      const isReversed =
        face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

      for (let i = 1; i <= nbTriangles; i++) {
        const triangle = triangulation.get().Triangle(i);
        const p1 = triangulation
          .get()
          .Node(triangle.Value(1))
          .Transformed(transformation);
        const p2 = triangulation
          .get()
          .Node(triangle.Value(2))
          .Transformed(transformation);
        const p3 = triangulation
          .get()
          .Node(triangle.Value(3))
          .Transformed(transformation);
        const v1 = getOrCreateVertexHelper(
          vertexMap,
          p1.X(),
          p1.Y(),
          p1.Z(),
          allVertices,
        );
        const v2 = getOrCreateVertexHelper(
          vertexMap,
          p2.X(),
          p2.Y(),
          p2.Z(),
          allVertices,
        );
        const v3 = getOrCreateVertexHelper(
          vertexMap,
          p3.X(),
          p3.Y(),
          p3.Z(),
          allVertices,
        );
        if (isReversed) jsonFaces.push({ vertices: [v1, v3, v2] });
        else jsonFaces.push({ vertices: [v1, v2, v3] });
      }

      const absoluteBrepJson: BrepJSON = {
        vertices: allVertices,
        edges: [],
        faces: jsonFaces,
      };
      if (allVertices.length === 0) {
        return { brepJson: absoluteBrepJson, center: { x: 0, y: 0, z: 0 } };
      }

      const bounds = calculateBrepBoundsFromJSON(absoluteBrepJson);
      const center = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        z: (bounds.minZ + bounds.maxZ) / 2,
      };

      for (const v of allVertices) {
        v.x -= center.x;
        v.y -= center.y;
        v.z -= center.z;
      }

      return { brepJson: absoluteBrepJson, center };
    },
  );
}
