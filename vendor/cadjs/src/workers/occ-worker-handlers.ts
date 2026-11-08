// One handler per operation pipeline; results are plain objects with typed arrays so they
// transfer cleanly across the worker boundary (no THREE.js).
import type {
  gp_Pnt_3,
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Wire,
} from "opencascade.js";
import type { EulerJSON } from "./occ-worker-types";
import type { BrepJSON } from "../geometry";
import type {
  Vec3,
  WorkerGeometryResult,
  WorkerBooleanResult,
  WorkerInterferenceResult,
  WorkerEdgeAnalysisResult,
  WorkerPreviewResult,
  WorkerSketchBrepResult,
  WorkerSketchProfilesResult,
  WorkerProcessProfileResult,
  WorkerImportResult,
  WorkerExportResult,
  WorkerEdgeLengthResult,
  WorkerEdgeDirectionResult,
  WorkerSketchWireResult,
  ExtrudeRequest,
  SweepRequest,
  LoftRequest,
  RevolveRequest,
  FilletRequest,
  ChamferRequest,
  BooleanRequest,
  InterferenceRequest,
  EdgeAnalysisRequest,
  PreviewGeometryRequest,
  SketchToBrepRequest,
  SketchToProfilesRequest,
  ProcessProfileRequest,
  UnifyCompoundRequest,
  ImportFileRequest,
  ExportFileRequest,
  EdgeLengthRequest,
  EdgeDirectionRequest,
  SketchToWireRequest,
  ShellRequest,
  DraftRequest,
  MoveFaceRequest,
  PatternRequest,
  PatternPiecesResult,
  ThreadRequest,
  HemRequest,
  WrapRequest,
  SectionRequest,
  SplitBothResult,
  ProjectCurvesRequest,
  SplitRequest,
  SewRequest,
  SurfaceExtendRequest,
  WorkerSewResult,
  SurfaceOpRequest,
  ThickenRequest,
  DeleteFaceRequest,
  ReplaceFaceRequest,
  TransformRequest,
  HoleRequest,
  FlangeRequest,
} from "./occ-worker-types";
import {
  brepToOCShapeHelper,
  ocShapeToBRepHelper,
  deserializeShapeHelper,
  serializeShapeHelper,
  occBrepToOCShapeHelper,
  buildPlanarFaceFromBoundaryHelper,
  buildWireFromPointsHelper,
  extrudeShapeHelper,
  sweepShapeAdvancedHelper,
  sweepMultiGuideHelper,
  sweepTwistedHelper,
  revolveShapeHelper,
  loftShapesHelper,
  loftAlongCenterlineHelper,
  booleanUnionHelper,
  booleanDifferenceHelper,
  booleanIntersectionHelper,
  filletEdgesHelper,
  chamferEdgesHelper,
  getEdgeLineSegmentsPerEdgeHelper,
  shapeToRawGeometry,
  shapeToRawEdgeSegments,
  shapeToVertexPositionsHelper,
  computeBoundingBoxCenter,
  translateShape,
  buildSketchEdgesHelper,
  buildSketchPointMap,
  transformShapeToPlaneHelper,
  detectProfileRegionsHelper,
  calculateFaceAreaHelper,
  faceToBrepWithCenterHelper,
  readSTLHelper,
  writeSTLHelper,
  readSTEPCAFHelper,
  writeSTEPHelper,
  readIGESHelper,
  writeIGESHelper,
  getEdgeLengthHelper,
  getEdgeDirectionAtMidpointHelper,
  sketchToWireHelper,
} from "../services/occ-helpers";
import { offsetProfileFace } from "../services/occ-extrude";
import {
  applyTransform,
  asEdge,
  asFace,
  asShell,
  asWire,
  collectSubShapes,
  fixShape,
  iterSubShapes,
  mapEdgesIndexed,
  makeAxis1,
  makeAxis2,
  makeCircle,
  makeDir,
  makeEdgeFromPoints,
  makePlanarFace,
  makePoint,
  makeVec,
  makeWireFromEdge,
  makeWireFromEdges,
  withOccScope,
  withProgressRange,
} from "../services/occ-facade";
import { negateVec3 } from "../vectorHelpers";
import { debugLog } from "../config";
import { EDGES_TO_WIRES_TOL, TESSELLATE_LINEAR_EDGE } from "../tolerances";

function tryOptional<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Shared `deserialize-or-fallback` chain used by handleExtrude, handleSweep,
 * handleRevolve, handleProcessProfile, etc.
 */
function restoreCleanFace(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
  sourceOccBrep?: string,
): TopoDS_Shape {
  if (sourceOccBrep) {
    try {
      return deserializeShapeHelper(oc, sourceOccBrep);
    } catch {
      /* fall through to boundary rebuild */
    }
  }
  const fallback = buildPlanarFaceFromBoundaryHelper(oc, brepJson);
  if (!fallback) throw new Error("Could not build clean face from profile");
  return fallback;
}

/**
 * Translate `resultShape` to local space (origin = bbox center), optionally invert
 * a known input rotation, then extract brepJson + occBrep + edge/vertex/face buffers.
 * Caller adds positionOffset (= worldCenter) back to recover world-space placement.
 */
function postProcessShape(
  oc: OpenCascadeInstance,
  resultShape: TopoDS_Shape,
  options?: {
    invertRotation?:
      | { x: number; y: number; z: number; order: string }
      | undefined;
  },
): WorkerGeometryResult {
  const worldCenter = computeBoundingBoxCenter(oc, resultShape);
  let localShape = translateShape(oc, resultShape, negateVec3(worldCenter));

  const rot = options?.invertRotation;
  if (rot && (rot.x !== 0 || rot.y !== 0 || rot.z !== 0)) {
    localShape = applyRotation(oc, localShape, {
      ...negateVec3(rot),
      order: rot.order,
    });
  }

  // localShape is already centered; re-centering would chase tessellation-bbox drift.
  const { brepJson } = ocShapeToBRepHelper(oc, localShape, false);
  const occBrep = tryOptional(() => serializeShapeHelper(oc, localShape));
  const edgePositions = shapeToRawEdgeSegments(
    oc,
    localShape,
    TESSELLATE_LINEAR_EDGE,
  );
  const vertexPositions = shapeToVertexPositionsHelper(oc, localShape);
  const faceGeometry = shapeToRawGeometry(oc, localShape, 0.003, 0.1);

  return {
    brepJson,
    positionOffset: worldCenter,
    occBrep,
    edgePositions,
    vertexPositions,
    faceGeometry,
  };
}

export function handleExtrude(
  oc: OpenCascadeInstance,
  payload: ExtrudeRequest["payload"],
): WorkerGeometryResult {
  const ribbonWire =
    payload.ribbonPoints && payload.ribbonPoints.length >= 3
      ? buildWireFromPointsHelper(oc, payload.ribbonPoints)
      : null;
  if (payload.ribbonPoints?.length && !ribbonWire) {
    throw new Error("extrude: open-profile wall could not build a wire");
  }
  const cleanFace = ribbonWire
    ? makePlanarFace(oc, ribbonWire)
    : restoreCleanFace(oc, payload.brepJson, payload.sourceOccBrep);
  const draft = {
    ...(payload.draftNeutralPoint
      ? { neutralPoint: payload.draftNeutralPoint }
      : {}),
    ...(payload.draftNeutralNormal
      ? { neutralNormal: payload.draftNeutralNormal }
      : {}),
    ...(payload.draftMode ? { mode: payload.draftMode } : {}),
    ...(payload.draftPartingLine
      ? { partingLine: payload.draftPartingLine }
      : {}),
  };
  const buildExtrude = (face: TopoDS_Shape): TopoDS_Shape =>
    extrudeShapeHelper(
      oc,
      face,
      payload.depth,
      payload.direction,
      payload.normalVec,
      payload.symmetric,
      payload.draftAngleDeg,
      draft,
    );
  // A sketch with multiple disjoint regions arrives as a compound. Extrude
  // each region and union the solids instead of silently using only face 0.
  const profileFaces = collectSubShapes(
    oc,
    cleanFace,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  ).map((s) => asFace(oc, s));
  let extrudedShape: TopoDS_Shape;
  if (profileFaces.length > 1) {
    extrudedShape = buildExtrude(profileFaces[0]!);
    for (let i = 1; i < profileFaces.length; i++) {
      const next = buildExtrude(profileFaces[i]!);
      const merged = booleanUnionHelper(oc, extrudedShape, next);
      extrudedShape.delete();
      next.delete();
      extrudedShape = merged;
    }
  } else {
    extrudedShape = buildExtrude(cleanFace);
  }
  if (!ribbonWire && payload.thinWall && payload.thinWall > 0) {
    const buildThin = (profileShape: TopoDS_Shape): TopoDS_Shape => {
      const profileFace = asFace(oc, profileShape);
      const outerWire = (
        oc as unknown as {
          BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
        }
      ).BRepTools.OuterWire(profileFace);
      if (!outerWire)
        throw new Error("extrude: thin wall needs a closed profile");
      const hollow = withOccScope((track) => {
        const off = track(new oc.BRepOffsetAPI_MakeOffset_1());
        const join = oc.GeomAbs_JoinType
          .GeomAbs_Arc as typeof oc.GeomAbs_JoinType;
        off.Init_2(join, false);
        off.AddWire(outerWire);
        off.Perform(-payload.thinWall!, 0);
        if (!off.IsDone()) {
          off.Init_2(join, false);
          off.AddWire(outerWire);
          off.Perform(payload.thinWall!, 0);
        }
        if (!off.IsDone())
          throw new Error(
            "extrude: thin-wall offset failed (open or self-intersecting profile)",
          );
        const innerFace = track(makePlanarFace(oc, asWire(oc, off.Shape())));
        const innerShape = buildExtrude(innerFace);
        const outerShape = buildExtrude(profileShape);
        try {
          return booleanDifferenceHelper(oc, outerShape, innerShape);
        } finally {
          outerShape.delete();
          innerShape.delete();
        }
      });
      return hollow;
    };
    if (profileFaces.length > 1) {
      let hollow = buildThin(profileFaces[0]!);
      for (let i = 1; i < profileFaces.length; i++) {
        const next = buildThin(profileFaces[i]!);
        const merged = booleanUnionHelper(oc, hollow, next);
        hollow.delete();
        next.delete();
        hollow = merged;
      }
      extrudedShape.delete();
      extrudedShape = hollow;
    } else {
      const hollow = buildThin(cleanFace);
      extrudedShape.delete();
      extrudedShape = hollow;
    }
  }
  return postProcessShape(oc, extrudedShape);
}

export function handleSweep(
  oc: OpenCascadeInstance,
  payload: SweepRequest["payload"],
): WorkerGeometryResult {
  const cleanFace = restoreCleanFace(
    oc,
    payload.brepJson,
    payload.sourceOccBrep,
  );

  // Sweep is computed in local space, face stays at origin and the path comes to it.
  const localPathPoints = payload.pathPoints.map((p) => ({
    x: p.x - payload.profilePosition.x,
    y: p.y - payload.profilePosition.y,
    z: p.z - payload.profilePosition.z,
  }));

  const pathWire = buildWireFromPointsHelper(oc, localPathPoints);
  if (!pathWire) throw new Error("Could not build path wire");

  const localGuide = payload.guidePoints?.map((p) => ({
    x: p.x - payload.profilePosition.x,
    y: p.y - payload.profilePosition.y,
    z: p.z - payload.profilePosition.z,
  }));
  const localGuideCurves = (
    payload.guideCurves ?? (localGuide ? [localGuide] : [])
  )
    .filter((curve) => curve.length >= 2)
    .map((curve) =>
      curve.map((p) => ({
        x: p.x - payload.profilePosition.x,
        y: p.y - payload.profilePosition.y,
        z: p.z - payload.profilePosition.z,
      })),
    );
  const guideWire =
    localGuide && localGuide.length >= 2
      ? buildWireFromPointsHelper(oc, localGuide)
      : null;
  if (payload.guidePoints && payload.guidePoints.length > 0 && !guideWire) {
    throw new Error("sweep: guide curve could not build a wire");
  }
  if (
    payload.guideCurves &&
    payload.guideCurves.length !== localGuideCurves.length
  ) {
    throw new Error("sweep: every guide curve needs >=2 points");
  }

  const options = payload.options || {
    orientation: "perpendicular" as const,
    cornerMode: "right" as const,
  };
  const twistRadians = options.twistRadians ?? 0;
  if (twistRadians !== 0 && localGuideCurves.length) {
    throw new Error("sweep: twist cannot combine with guide curves");
  }
  const buildSweep = (face: TopoDS_Shape): TopoDS_Shape =>
    twistRadians !== 0
      ? sweepTwistedHelper(oc, face, localPathPoints, twistRadians, {
          ...(options.chordalTolerance !== undefined
            ? { chordalTolerance: options.chordalTolerance }
            : {}),
          ...(options.cornerMode ? { cornerMode: options.cornerMode } : {}),
        })
      : localGuideCurves.length > 1
        ? sweepMultiGuideHelper(oc, face, localPathPoints, localGuideCurves, {
            ...options,
          })
        : sweepShapeAdvancedHelper(oc, face, pathWire, {
            ...options,
            ...(guideWire ? { guideWire } : {}),
          });
  let sweptShape = buildSweep(cleanFace);
  if (payload.thinWall && payload.thinWall > 0) {
    const innerFace = offsetProfileFace(
      oc,
      asFace(oc, cleanFace),
      payload.thinWall,
    );
    sweptShape = booleanDifferenceHelper(oc, sweptShape, buildSweep(innerFace));
  }

  return postProcessShape(oc, sweptShape);
}

export function handleLoft(
  oc: OpenCascadeInstance,
  payload: LoftRequest["payload"],
): WorkerGeometryResult {
  const worldFaces = payload.profiles.map((profile) => {
    let face = restoreCleanFace(oc, profile.brepJson, profile.occBrep);
    if (
      profile.position.x !== 0 ||
      profile.position.y !== 0 ||
      profile.position.z !== 0
    ) {
      face = translateShape(oc, face, profile.position);
    }
    return face;
  });

  const centerlineWire =
    payload.centerlinePoints && payload.centerlinePoints.length >= 2
      ? buildWireFromPointsHelper(oc, payload.centerlinePoints)
      : null;
  if (
    payload.centerlinePoints &&
    payload.centerlinePoints.length > 0 &&
    !centerlineWire
  ) {
    throw new Error("loft: centerline could not build a wire");
  }

  const buildLoft = (faces: TopoDS_Shape[]): TopoDS_Shape =>
    centerlineWire
      ? loftAlongCenterlineHelper(oc, faces, centerlineWire)
      : loftShapesHelper(
          oc,
          faces,
          true,
          payload.isRuled ?? false,
          payload.isClosed ?? false,
          {
            ...(payload.twistRadians
              ? { twistRadians: payload.twistRadians }
              : {}),
            ...(payload.connectors ? { connectors: payload.connectors } : {}),
          },
        );

  let loftedShape = buildLoft(worldFaces);
  if (payload.thinWall && payload.thinWall > 0) {
    const innerFaces = worldFaces.map((face) =>
      offsetProfileFace(oc, asFace(oc, face), payload.thinWall!),
    );
    loftedShape = booleanDifferenceHelper(
      oc,
      loftedShape,
      buildLoft(innerFaces),
    );
  }
  return postProcessShape(oc, loftedShape);
}

export function handleRevolve(
  oc: OpenCascadeInstance,
  payload: RevolveRequest["payload"],
): WorkerGeometryResult {
  const cleanFace = restoreCleanFace(
    oc,
    payload.brepJson,
    payload.sourceOccBrep,
  );

  // Axis coordinates are in world space, so the face has to follow.
  const positionedFace = translateShape(oc, cleanFace, payload.profilePosition);

  // A symmetric revolve is two half sweeps around the same axis; "two" keeps
  // independent forward/back angles.
  const symmetric = payload.direction === "symmetric";
  const totalAngle = payload.angleRadians ?? Math.PI * 2;
  const forwardAngle = symmetric ? totalAngle / 2 : payload.angleRadians;
  const backAngle = symmetric ? totalAngle / 2 : payload.angleRadians2;
  const needsBack =
    (payload.direction === "two" || symmetric) &&
    backAngle !== undefined &&
    backAngle > 0 &&
    Math.abs(backAngle - Math.PI * 2) > 1e-6;

  const buildRevolve = (face: TopoDS_Shape): TopoDS_Shape => {
    let shape = revolveShapeHelper(
      oc,
      face,
      payload.axisOrigin,
      payload.axisDir,
      forwardAngle,
    );
    if (needsBack) {
      const reverseShape = revolveShapeHelper(
        oc,
        face,
        payload.axisOrigin,
        negateVec3(payload.axisDir),
        backAngle,
      );
      shape = booleanUnionHelper(oc, shape, reverseShape);
    }
    return shape;
  };

  let revolvedShape = buildRevolve(positionedFace);
  if (payload.thinWall && payload.thinWall > 0) {
    const innerLocal = offsetProfileFace(
      oc,
      asFace(oc, cleanFace),
      payload.thinWall,
      payload.cornerType,
    );
    const innerPositioned = translateShape(
      oc,
      innerLocal,
      payload.profilePosition,
    );
    revolvedShape = booleanDifferenceHelper(
      oc,
      revolvedShape,
      buildRevolve(innerPositioned),
    );
  }

  const result = postProcessShape(oc, revolvedShape);
  result.positionOffset = {
    x: result.positionOffset.x - payload.profilePosition.x,
    y: result.positionOffset.y - payload.profilePosition.y,
    z: result.positionOffset.z - payload.profilePosition.z,
  };
  return result;
}

export function handleFillet(
  oc: OpenCascadeInstance,
  payload: FilletRequest["payload"],
): WorkerGeometryResult {
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );

  const skipFix = !!payload.occBrep;
  const filleted = filletEdgesHelper(
    oc,
    worldShape,
    payload.edgeIndices,
    payload.radius,
    skipFix,
    payload.radii,
    payload.section,
    payload.variableRadii,
    payload.cornerRadius,
  );
  const result = postProcessShape(oc, filleted, {
    invertRotation: payload.rotation,
  });
  result.positionOffset = {
    x: result.positionOffset.x - payload.position.x,
    y: result.positionOffset.y - payload.position.y,
    z: result.positionOffset.z - payload.position.z,
  };
  return result;
}

export function handleChamfer(
  oc: OpenCascadeInstance,
  payload: ChamferRequest["payload"],
): WorkerGeometryResult {
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );

  const skipFix = !!payload.occBrep;
  const chamfered = chamferEdgesHelper(
    oc,
    worldShape,
    payload.edgeIndices,
    payload.distance,
    skipFix,
    payload.distances,
    payload.mode,
    payload.angleDeg,
  );
  const result = postProcessShape(oc, chamfered, {
    invertRotation: payload.rotation,
  });
  result.positionOffset = {
    x: result.positionOffset.x - payload.position.x,
    y: result.positionOffset.y - payload.position.y,
    z: result.positionOffset.z - payload.position.z,
  };
  return result;
}

function applyRotation(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  rotation: { x: number; y: number; z: number; order: string },
): TopoDS_Shape {
  // XYZ-ordered Euler → quaternion. Match Three.js's default rotation order.
  const cx = Math.cos(rotation.x / 2),
    sx = Math.sin(rotation.x / 2);
  const cy = Math.cos(rotation.y / 2),
    sy = Math.sin(rotation.y / 2);
  const cz = Math.cos(rotation.z / 2),
    sz = Math.sin(rotation.z / 2);
  const qx = sx * cy * cz + cx * sy * sz;
  const qy = cx * sy * cz - sx * cy * sz;
  const qz = cx * cy * sz + sx * sy * cz;
  const qw = cx * cy * cz - sx * sy * sz;

  const quat = new oc.gp_Quaternion_2(qx, qy, qz, qw);
  const trsf = new oc.gp_Trsf_1();
  trsf.SetRotation_2(quat);
  quat.delete();
  const result = applyTransform(oc, shape, trsf, true);
  trsf.delete();
  return result;
}

export function handleBoolean(
  oc: OpenCascadeInstance,
  payload: BooleanRequest["payload"],
): WorkerBooleanResult {
  const shapes = payload.operands.map((op) => {
    // For compounds, unifiedBRep is the merged result; fall back to the first child if missing.
    let brepJson = op.brepJson;
    type CompoundBrepJSON = BrepJSON & {
      type?: string;
      unifiedBRep?: BrepJSON;
      children?: BrepJSON[];
    };
    const maybeCompound = brepJson as CompoundBrepJSON;
    if (maybeCompound?.type === "compound") {
      brepJson =
        maybeCompound.unifiedBRep ?? maybeCompound.children?.[0] ?? brepJson;
    }
    return buildWorldShape(oc, brepJson, op.position, op.occBrep, op.rotation);
  });

  if (shapes.length < 2)
    throw new Error("Need at least 2 operands for boolean");

  let resultShape = shapes[0]!;
  const booleanFn =
    payload.operation === "union"
      ? booleanUnionHelper
      : payload.operation === "difference"
        ? booleanDifferenceHelper
        : booleanIntersectionHelper;

  for (let i = 1; i < shapes.length; i++) {
    resultShape = booleanFn(oc, resultShape, shapes[i]!);
  }

  // makeSolid=false returns the boolean's faces as a surface compound instead
  // of claiming the result is a closed solid. Callers can thicken/stitch it.
  if (payload.options?.makeSolid === false) {
    const faceShapes = collectSubShapes(
      oc,
      resultShape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
    );
    if (!faceShapes.length)
      throw new Error("boolean: result has no faces (empty result)");
    const builder = new oc.BRep_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    for (const f of faceShapes) builder.Add(compound, f);
    resultShape = compound;
  }

  const solidCount = collectSubShapes(
    oc,
    resultShape,
    oc.TopAbs_ShapeEnum.TopAbs_SOLID as typeof oc.TopAbs_ShapeEnum,
  ).length;
  if (
    payload.options?.makeSolid !== false &&
    payload.operation !== "union" &&
    solidCount === 0
  ) {
    throw new Error(
      "boolean: empty or non-manifold result (no solid produced)",
    );
  }

  const { positionOffset, ...rest } = postProcessShape(oc, resultShape);
  return { ...rest, position: positionOffset, removedNodeIds: [] };
}

export function handleInterference(
  oc: OpenCascadeInstance,
  payload: InterferenceRequest["payload"],
): WorkerInterferenceResult {
  const a = buildWorldShape(
    oc,
    payload.a.brepJson,
    payload.a.position,
    payload.a.occBrep,
    payload.a.rotation,
  );
  const b = buildWorldShape(
    oc,
    payload.b.brepJson,
    payload.b.position,
    payload.b.occBrep,
    payload.b.rotation,
  );
  let common: TopoDS_Shape | null = null;
  try {
    common = booleanIntersectionHelper(oc, a, b);
    const solids = collectSubShapes(
      oc,
      common,
      oc.TopAbs_ShapeEnum.TopAbs_SOLID as typeof oc.TopAbs_ShapeEnum,
    );
    if (!solids.length) return { volume: 0 };
    const props = new oc.GProp_GProps_1();
    try {
      oc.BRepGProp.VolumeProperties_2(common, props, 1e-7, true, false);
      return { volume: Math.abs(props.Mass()) };
    } finally {
      props.delete();
    }
  } catch {
    // Empty common results are reported by OCC as a failed boolean. A zero
    // volume is the useful answer for an interference report, not an error.
    return { volume: 0 };
  } finally {
    common?.delete();
    a.delete();
    b.delete();
  }
}

export function handleEdgeAnalysis(
  oc: OpenCascadeInstance,
  payload: EdgeAnalysisRequest["payload"],
): WorkerEdgeAnalysisResult {
  const shape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );

  const skipFix = !!payload.occBrep;
  const edges = getEdgeLineSegmentsPerEdgeHelper(
    oc,
    shape,
    TESSELLATE_LINEAR_EDGE,
    skipFix,
    payload.allEdges,
  );
  return { edges };
}

export function handlePreviewGeometry(
  oc: OpenCascadeInstance,
  payload: PreviewGeometryRequest["payload"],
): WorkerPreviewResult {
  const cleanFace = restoreCleanFace(
    oc,
    payload.brepJson,
    payload.sourceOccBrep,
  );
  // Caller scales Z at render time, so depth=1 is enough for the preview shape.
  const previewShape = extrudeShapeHelper(
    oc,
    cleanFace,
    1,
    1,
    payload.normalVec,
  );
  const faceGeometry = shapeToRawGeometry(oc, previewShape, 0.1, 0.5);
  return { faceGeometry };
}

/** Build a single closed planar face from one or more edges by wiring them up. */
function tryMakeFaceFromEdges(
  oc: OpenCascadeInstance,
  edges: Array<TopoDS_Shape>,
): TopoDS_Shape | null {
  if (edges.length === 0) return null;
  let wire;
  try {
    wire =
      edges.length === 1
        ? makeWireFromEdge(oc, edges[0]! as TopoDS_Edge)
        : makeWireFromEdges(oc, edges);
  } catch {
    return null;
  }
  if (edges.length > 1 && !wire.Closed_1()) return null;
  try {
    return makePlanarFace(oc, wire);
  } catch {
    return null;
  }
}

interface SketchPrimitiveLike {
  construction?: boolean;
  origin?: boolean;
}

interface SketchLoop {
  wire: TopoDS_Wire;
  face: TopoDS_Face;
  area: number;
  center: { x: number; y: number; z: number };
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Build one or more planar faces from sketch edges, preserving containment:
 * a loop inside another becomes an inner wire (hole), while disjoint loops
 * become separate faces in a compound.
 */
function buildSketchProfileShape(
  oc: OpenCascadeInstance,
  circleEdges: TopoDS_Edge[],
  otherEdges: TopoDS_Edge[],
): TopoDS_Shape | null {
  const edges = [...circleEdges, ...otherEdges];
  if (!edges.length) return null;

  const builder = new oc.BRep_Builder();
  const edgeCompound = new oc.TopoDS_Compound();
  builder.MakeCompound(edgeCompound);
  for (const edge of edges) builder.Add(edgeCompound, edge);
  const wireCompound = new oc.TopoDS_Compound();
  builder.MakeCompound(wireCompound);
  const wireStatus = oc.BOPAlgo_Tools.EdgesToWires(
    edgeCompound,
    wireCompound,
    false,
    EDGES_TO_WIRES_TOL,
  );
  const wires: TopoDS_Wire[] = [];
  if (wireStatus === 0) {
    for (const shape of iterSubShapes(
      oc,
      wireCompound,
      oc.TopAbs_ShapeEnum.TopAbs_WIRE as typeof oc.TopAbs_ShapeEnum,
    ))
      wires.push(asWire(oc, shape));
  }

  const loops: SketchLoop[] = [];
  for (const wire of wires) {
    try {
      const face = makePlanarFace(oc, wire);
      const props = new oc.GProp_GProps_1();
      let area = 0;
      let center = { x: 0, y: 0, z: 0 };
      try {
        oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
        area = Math.abs(props.Mass());
        const c = props.CentreOfMass();
        center = { x: c.X(), y: c.Y(), z: c.Z() };
      } finally {
        props.delete();
      }
      if (!(area > 1e-12)) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const v of iterSubShapes(
        oc,
        wire,
        oc.TopAbs_ShapeEnum.TopAbs_VERTEX as typeof oc.TopAbs_ShapeEnum,
      )) {
        const p = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(v));
        minX = Math.min(minX, p.X());
        minY = Math.min(minY, p.Y());
        maxX = Math.max(maxX, p.X());
        maxY = Math.max(maxY, p.Y());
        p.delete();
      }
      loops.push({ wire, face, area, center, minX, minY, maxX, maxY });
    } catch {
      // An open or degenerate chain is handled by the caller's named error.
    }
  }
  if (!loops.length) return null;

  const contains = (outer: SketchLoop, inner: SketchLoop): boolean => {
    if (!(outer.area > inner.area + 1e-12)) return false;
    const eps = 1e-6;
    if (
      inner.minX < outer.minX - eps ||
      inner.minY < outer.minY - eps ||
      inner.maxX > outer.maxX + eps ||
      inner.maxY > outer.maxY + eps
    )
      return false;
    const point = new oc.gp_Pnt_3(
      inner.center.x,
      inner.center.y,
      inner.center.z,
    );
    const classifier = new oc.BRepClass_FaceClassifier_4(
      outer.face,
      point,
      1e-7,
      true,
      0,
    );
    try {
      const state = classifier.State();
      return (
        state === oc.TopAbs_State.TopAbs_IN ||
        state === oc.TopAbs_State.TopAbs_ON
      );
    } finally {
      classifier.delete();
      point.delete();
    }
  };

  // Parent = the smallest enclosing loop. Depth parity decides material: even
  // depths are outer faces, odd depths are holes, depth-2 islands are new outer
  // faces, and so on.
  const parent: Array<number | null> = loops.map(() => null);
  for (let i = 0; i < loops.length; i++) {
    let best = -1;
    for (let j = 0; j < loops.length; j++) {
      if (i === j || !contains(loops[j]!, loops[i]!)) continue;
      if (best < 0 || loops[j]!.area < loops[best]!.area) best = j;
    }
    parent[i] = best >= 0 ? best : null;
  }
  const depthOf = (i: number): number => {
    let depth = 0;
    let p = parent[i];
    const seen = new Set<number>();
    while (p !== null && p !== undefined && !seen.has(p)) {
      seen.add(p);
      depth++;
      p = parent[p] ?? null;
    }
    return depth;
  };

  const faces: TopoDS_Face[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depthOf(i) % 2 !== 0) continue;
    try {
      const mf = new oc.BRepBuilderAPI_MakeFace_15(loops[i]!.wire, true);
      for (let j = 0; j < loops.length; j++) {
        // EdgesToWires does not orient holes against their parent, and
        // MakeFace::Add keeps the wire orientation it receives. Reverse a
        // direct child so it bounds a void instead of filling a second region.
        if (parent[j] === i) mf.Add(asWire(oc, loops[j]!.wire.Reversed()));
      }
      if (mf.IsDone()) faces.push(mf.Face());
      mf.delete();
    } catch {
      // Leave the loop out; the caller reports a profile error if nothing
      // usable remains.
    }
  }

  builder.delete();
  if (!faces.length) return null;
  if (faces.length === 1) return faces[0]!;
  const out = new oc.TopoDS_Compound();
  const outBuilder = new oc.BRep_Builder();
  outBuilder.MakeCompound(out);
  for (const face of faces) outBuilder.Add(out, face);
  outBuilder.delete();
  return out;
}

export function handleSketchToBrep(
  oc: OpenCascadeInstance,
  payload: SketchToBrepRequest["payload"],
): WorkerSketchBrepResult {
  const nonConstructionPrimitives = payload.primitives.filter((p) => {
    const meta = p as SketchPrimitiveLike;
    return !meta.construction && !meta.origin;
  });
  const pointMap = buildSketchPointMap(payload.primitives);
  const { circleEdges, otherEdges } = buildSketchEdgesHelper(
    oc,
    nonConstructionPrimitives,
    pointMap,
  );

  let resultShape = buildSketchProfileShape(oc, circleEdges, otherEdges);
  if (!resultShape) {
    // Fallback for a single closed chain, including a circle edge. Multi-loop
    // nesting is handled above; this keeps the historical open/degenerate path.
    resultShape = tryMakeFaceFromEdges(oc, [...circleEdges, ...otherEdges]);
    if (!resultShape) {
      resultShape =
        circleEdges.length === 1 ? tryMakeFaceFromEdges(oc, circleEdges) : null;
    }
    if (!resultShape)
      return { brepJson: { vertices: [], edges: [], faces: [] } };
  }

  resultShape = transformShapeToPlaneHelper(oc, resultShape, payload.plane);
  const { brepJson } = ocShapeToBRepHelper(oc, resultShape, false);
  // Preserve the exact OCC face, including inner wires. The JSON is a triangle
  // soup and cannot distinguish a hole from a filled region on its own.
  return {
    brepJson,
    occBrep: tryOptional(() => serializeShapeHelper(oc, resultShape)),
  };
}

export function handleSketchToProfiles(
  oc: OpenCascadeInstance,
  payload: SketchToProfilesRequest["payload"],
): WorkerSketchProfilesResult {
  const nonConstructionPrimitives = payload.primitives.filter((p) => {
    const meta = p as SketchPrimitiveLike;
    return !meta.construction && !meta.origin;
  });
  const pointMap = buildSketchPointMap(payload.primitives);
  const { circleEdges, otherEdges } = buildSketchEdgesHelper(
    oc,
    nonConstructionPrimitives,
    pointMap,
  );

  const allEdges = [...circleEdges, ...otherEdges];
  if (allEdges.length === 0) return { profiles: [], success: false };

  let detectedFaces = detectProfileRegionsHelper(oc, allEdges);

  // Fallback: build faces separately
  if (detectedFaces.length === 0) {
    const faces: TopoDS_Shape[] = [];
    for (const edge of circleEdges) {
      const f = tryMakeFaceFromEdges(oc, [edge]);
      if (f) faces.push(f);
    }
    if (otherEdges.length > 0) {
      const f = tryMakeFaceFromEdges(oc, otherEdges);
      if (f) faces.push(f);
    }
    detectedFaces = faces;
  }

  detectedFaces = detectedFaces.map((face) => {
    const transformed = transformShapeToPlaneHelper(oc, face, payload.plane);
    return asFace(oc, transformed);
  });

  const profiles: WorkerSketchProfilesResult["profiles"] = [];
  for (let i = 0; i < detectedFaces.length; i++) {
    const face = detectedFaces[i]!;
    const area = calculateFaceAreaHelper(oc, face);
    if (Math.abs(area) < 1e-6) continue;

    const { brepJson, center } = faceToBrepWithCenterHelper(oc, face);
    if (brepJson.faces.length === 0) continue;

    const profileOccBrep = tryOptional(() => {
      const centeredFace = translateShape(oc, face, negateVec3(center));
      return serializeShapeHelper(oc, centeredFace);
    });

    profiles.push({
      id: `${payload.sketchId}_profile_${i}`,
      brepJson,
      area: Math.abs(area),
      isOuter: area < 0,
      center,
      occBrep: profileOccBrep,
    });
  }

  return { profiles, success: profiles.length > 0 };
}

export function handleProcessProfile(
  oc: OpenCascadeInstance,
  payload: ProcessProfileRequest["payload"],
): WorkerProcessProfileResult {
  let shape: TopoDS_Shape | null = null;
  if (payload.occBrep) {
    // Silent fallback by design: if the serialized occBrep can't be
    // re-hydrated (e.g. cross-version BRep), reconstruct from brepJson below.
    try {
      shape = deserializeShapeHelper(oc, payload.occBrep);
    } catch {
      shape = null;
    }
  }
  if (!shape) shape = brepToOCShapeHelper(oc, payload.brepJson);

  const edgeAndVertex = tryOptional(() => ({
    edgePositions: shapeToRawEdgeSegments(
      oc,
      shape!,
      TESSELLATE_LINEAR_EDGE,
      true,
    ),
    vertexPositions: shapeToVertexPositionsHelper(oc, shape!, true),
  }));
  const occBrep =
    payload.occBrep ?? tryOptional(() => serializeShapeHelper(oc, shape!));

  return {
    edgePositions: edgeAndVertex?.edgePositions,
    vertexPositions: edgeAndVertex?.vertexPositions,
    occBrep,
  };
}

export function handleUnifyCompound(
  oc: OpenCascadeInstance,
  payload: UnifyCompoundRequest["payload"],
): { brepJson: BrepJSON } {
  const children = payload.childrenBrepJson;
  if (children.length === 0)
    return { brepJson: { vertices: [], edges: [], faces: [] } };
  if (children.length === 1) {
    const { brepJson } = ocShapeToBRepHelper(
      oc,
      brepToOCShapeHelper(oc, children[0]!),
      false,
    );
    return { brepJson };
  }

  let resultShape = brepToOCShapeHelper(oc, children[0]!);
  for (let i = 1; i < children.length; i++) {
    const nextShape = brepToOCShapeHelper(oc, children[i]!);
    resultShape = booleanUnionHelper(oc, resultShape, nextShape);
  }

  const { brepJson } = ocShapeToBRepHelper(oc, resultShape, false);
  return { brepJson };
}

export function handleImportFile(
  oc: OpenCascadeInstance,
  payload: ImportFileRequest["payload"],
): WorkerImportResult {
  const elements: WorkerImportResult["elements"] = [];
  if (payload.format === "step") {
    for (const imported of readSTEPCAFHelper(oc, payload.fileBytes)) {
      for (const decomposed of decomposeShapeForImport(oc, imported.shape)) {
        elements.push({
          ...decomposed,
          ...(imported.name ? { name: imported.name } : {}),
          ...(imported.color ? { color: imported.color } : {}),
        });
      }
    }
    return { elements };
  }
  const shape =
    payload.format === "iges"
      ? readIGESHelper(oc, payload.fileBytes)
      : readSTLHelper(oc, payload.fileBytes);
  for (const decomposed of decomposeShapeForImport(oc, shape)) {
    elements.push(decomposed);
  }
  return { elements };
}

function decomposeShapeForImport(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): WorkerImportResult["elements"] {
  const results: WorkerImportResult["elements"] = [];

  if (shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) {
    // Mesh formats (STL) arrive as one shell per triangle. Decomposing those
    // per-child explodes into thousands of boolean unions downstream — a
    // tessellated import is ONE body. Only split compounds that are small
    // enough to be genuine multi-solid assemblies.
    const iterator = new oc.TopoDS_Iterator_2(shape, true, true);
    let childCount = 0;
    while (iterator.More() && childCount <= 64) {
      childCount++;
      iterator.Next();
    }
    iterator.delete();
    if (childCount > 64) {
      results.push(decomposeChildForImport(oc, shape));
    } else {
      const it2 = new oc.TopoDS_Iterator_2(shape, true, true);
      while (it2.More()) {
        results.push(decomposeChildForImport(oc, it2.Value()));
        it2.Next();
      }
      it2.delete();
      if (results.length === 0)
        results.push(decomposeChildForImport(oc, shape));
    }
  } else {
    results.push(decomposeChildForImport(oc, shape));
  }
  return results;
}

function decomposeChildForImport(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): WorkerImportResult["elements"][0] {
  const position = computeBoundingBoxCenter(oc, shape);
  const { brepJson } = ocShapeToBRepHelper(oc, shape, true);

  const localShape = tryOptional(() =>
    translateShape(oc, shape, negateVec3(position)),
  );
  const occBrep =
    localShape && tryOptional(() => serializeShapeHelper(oc, localShape));
  const edgeAndVertex =
    localShape &&
    tryOptional(() => ({
      edgePositions: shapeToRawEdgeSegments(
        oc,
        localShape,
        TESSELLATE_LINEAR_EDGE,
      ),
      vertexPositions: shapeToVertexPositionsHelper(oc, localShape),
    }));

  return {
    brepJson,
    position,
    occBrep: occBrep || undefined,
    edgePositions: edgeAndVertex ? edgeAndVertex.edgePositions : undefined,
    vertexPositions: edgeAndVertex ? edgeAndVertex.vertexPositions : undefined,
  };
}

export function handleExportFile(
  oc: OpenCascadeInstance,
  payload: ExportFileRequest["payload"],
): WorkerExportResult {
  if (payload.format === "step" || payload.format === "iges") {
    // STEP/IGES: one root per element so downstream tools show separate
    // bodies. STEP gets one Transfer per shape; IGES gets one AddShape each.
    const shapes = payload.elements.map((el) =>
      buildWorldShape(oc, el.brepJson, el.position, el.occBrep, el.rotation),
    );
    return {
      fileBytes:
        payload.format === "step"
          ? writeSTEPHelper(
              oc,
              shapes,
              payload.elements.map((element) => ({
                ...(element.name ? { name: element.name } : {}),
                ...(element.color ? { color: element.color } : {}),
              })),
            )
          : writeIGESHelper(oc, shapes),
    };
  }

  const builder = new oc.BRep_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);

  for (const el of payload.elements) {
    const shape = buildWorldShape(
      oc,
      el.brepJson,
      el.position,
      el.occBrep,
      el.rotation,
    );
    builder.Add(compound, shape);
  }

  return { fileBytes: writeSTLHelper(oc, compound) };
}

export function handleEdgeLength(
  oc: OpenCascadeInstance,
  payload: EdgeLengthRequest["payload"],
): WorkerEdgeLengthResult {
  const hasOccBrep = !!payload.occBrep;
  const shape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const length = getEdgeLengthHelper(oc, shape, payload.edgeIndex, hasOccBrep);
  return { length };
}

export function handleEdgeDirection(
  oc: OpenCascadeInstance,
  payload: EdgeDirectionRequest["payload"],
): WorkerEdgeDirectionResult {
  const hasOccBrep = !!payload.occBrep;
  const shape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const direction = getEdgeDirectionAtMidpointHelper(
    oc,
    shape,
    payload.edgeIndex,
    hasOccBrep,
  );
  return { direction };
}

export function handleSketchToWire(
  oc: OpenCascadeInstance,
  payload: SketchToWireRequest["payload"],
): WorkerSketchWireResult | null {
  return sketchToWireHelper(oc, payload.primitives, payload.plane);
}

function buildWorldShape(
  oc: OpenCascadeInstance,
  brepJson: BrepJSON,
  position: Vec3,
  occBrep?: string,
  rotation?: { x: number; y: number; z: number; order: string },
): TopoDS_Shape {
  const hasRotation =
    rotation &&
    (Math.abs(rotation.x) > 1e-9 ||
      Math.abs(rotation.y) > 1e-9 ||
      Math.abs(rotation.z) > 1e-9);

  if (hasRotation) {
    const localShape = occBrep
      ? deserializeShapeHelper(oc, occBrep)
      : brepToOCShapeHelper(oc, brepJson);

    const rotatedShape = applyRotation(oc, localShape, rotation!);
    const trsf = new oc.gp_Trsf_1();
    const vec = makeVec(oc, position.x, position.y, position.z);
    trsf.SetTranslationPart(vec);
    vec.delete();
    const result = applyTransform(oc, rotatedShape, trsf, true);
    trsf.delete();
    return result;
  }
  return occBrep
    ? occBrepToOCShapeHelper(oc, occBrep, position)
    : brepToOCShapeHelper(oc, brepJson, position);
}

// ── Parity ops: shell, draft, pattern, hole ────────────────────────────────

function facesOf(oc: OpenCascadeInstance, shape: TopoDS_Shape): TopoDS_Face[] {
  return collectSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  ).map((sh) => asFace(oc, sh));
}

function copyResultShape(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Shape {
  const identity = new oc.gp_Trsf_1();
  try {
    return applyTransform(oc, shape, identity, true);
  } finally {
    identity.delete();
  }
}

/** A sewn free face is not wrapped in a shell; make the container explicit. */
function shellFromFaceList(
  oc: OpenCascadeInstance,
  faces: TopoDS_Face[],
): TopoDS_Shape {
  const builder = new oc.BRep_Builder();
  const shell = new oc.TopoDS_Shell();
  try {
    builder.MakeShell(shell);
    for (const face of faces) builder.Add(shell, face);
    if (!faces.length) throw new Error("sew: result has no faces");
    return shell;
  } catch (error) {
    shell.delete();
    throw error;
  } finally {
    builder.delete();
  }
}

function finishWorldResult(
  oc: OpenCascadeInstance,
  worldShape: TopoDS_Shape,
  payload: {
    position: Vec3;
    rotation?: EulerJSON | undefined;
  },
): WorkerGeometryResult {
  const result = postProcessShape(oc, worldShape, {
    invertRotation: payload.rotation,
  });
  result.positionOffset = {
    x: result.positionOffset.x - payload.position.x,
    y: result.positionOffset.y - payload.position.y,
    z: result.positionOffset.z - payload.position.z,
  };
  return result;
}

// BrepJSON tags index the TRIANGULATED serialization; the live shape holds
// merged topological faces. Map json-face i -> live face by corner-set
// containment (each triangle's corners ⊂ its merged face's vertex set).
function qkey(v: { x: number; y: number; z: number }): string {
  return `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
}

function liveFaceForJsonIndex(
  oc: OpenCascadeInstance,
  faces: TopoDS_Face[],
  brepJson: BrepJSON,
  jsonIndex: number,
): TopoDS_Face | null {
  if (!faces.length) return null;
  const jf = brepJson.faces[jsonIndex];
  if (!jf?.vertices?.length) return faces[0] ?? null;
  const tri = new Set(jf.vertices.slice(-3).map(qkey));
  for (const f of faces) {
    const fv = shapeToVertexPositionsHelper(oc, f);
    let hits = 0;
    for (let i = 0; i + 2 < fv.length; i += 3) {
      const k = `${fv[i]!.toFixed(6)},${fv[i + 1]!.toFixed(6)},${fv[i + 2]!.toFixed(6)}`;
      if (tri.has(k)) hits++;
    }
    if (hits >= tri.size) return f;
  }
  return faces[jsonIndex] ?? faces[0] ?? null;
}

/*
 * Shell via the prism recipe: 2D-offset each removed-cap face's outer wire,
 * extrude the inner face straight through the solid, and cut. Correct for
 * prismatic bodies (every extruded profile); non-planar caps throw a clear
 * error. BRepOffsetAPI_MakeThickSolid IS constructible in the current embind
 * build (verified 2026-10-18) but is NOT wired as a fallback: dome shells
 * fail after ~33 s and a full sphere hard-hangs the WASM thread. Revisit
 * with newer OCCT wasm bindings.
 */
export function handleShell(
  oc: OpenCascadeInstance,
  payload: ShellRequest["payload"],
): WorkerGeometryResult {
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const faces = facesOf(oc, worldShape);
  for (const i of payload.faceIndices) {
    if (!payload.brepJson.faces[i])
      throw new Error(
        `shell: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
      );
  }

  if (payload.curvedCap) {
    if (payload.keepType === "KEEP_CORE")
      throw new Error(
        "shell: curved caps do not support KEEP_CORE; use planar caps or KEEP_SHELL",
      );
    if ((payload.thicknesses?.length ?? 0) > 1)
      throw new Error(
        "shell: curved caps support one wall thickness, not per-face thicknesses",
      );
    const thickness = payload.thicknesses?.[0] ?? payload.thickness;
    if (!(thickness > 0))
      throw new Error("shell: curved-cap thickness must be positive");
    let built: TopoDS_Shape | null = null;
    // Fast path: build the open shell (removed faces omitted) and thicken it
    // with the simple offset algorithm. This avoids the expensive face
    // intersection pass in MakeThickSolidByJoin for curved caps.
    try {
      built = withOccScope((track) => {
        const shellBuilder = track(new oc.BRep_Builder());
        const open = track(new oc.TopoDS_Shell());
        shellBuilder.MakeShell(open);
        const removed = new Set(payload.faceIndices);
        for (let i = 0; i < payload.brepJson.faces.length; i++) {
          if (removed.has(i)) continue;
          const f = liveFaceForJsonIndex(oc, faces, payload.brepJson, i);
          if (f) shellBuilder.Add(open, f);
        }
        for (const sign of [-1, 1]) {
          const simple = track(new oc.BRepOffsetAPI_MakeThickSolid());
          simple.MakeThickSolidBySimple(open, sign * thickness);
          withProgressRange(oc, (pr) => simple.Build(pr));
          if (simple.IsDone()) return simple.Shape();
        }
        return null;
      });
    } catch {
      built = null;
    }
    if (!built) {
      for (const sign of [-1, 1]) {
        try {
          built = withOccScope((track) => {
            const closing = track(new oc.TopTools_ListOfShape_1());
            for (const idx of payload.faceIndices) {
              const face = liveFaceForJsonIndex(
                oc,
                faces,
                payload.brepJson,
                idx,
              );
              if (!face) throw new Error(`shell: face ${idx} not found`);
              closing.Append_1(face);
            }
            const thickSolid = track(new oc.BRepOffsetAPI_MakeThickSolid());
            withProgressRange(oc, (pr) =>
              thickSolid.MakeThickSolidByJoin(
                worldShape,
                closing,
                sign * thickness,
                1e-3,
                oc.BRepOffset_Mode.BRepOffset_Skin as typeof oc.BRepOffset_Mode,
                false,
                false,
                oc.GeomAbs_JoinType.GeomAbs_Arc as typeof oc.GeomAbs_JoinType,
                false,
                pr,
              ),
            );
            if (!thickSolid.IsDone()) return null;
            return thickSolid.Shape();
          });
        } catch {
          built = null;
        }
        if (built) break;
      }
    }
    if (!built)
      throw new Error(
        "shell: curved-cap thick-solid failed (try a smaller thickness or planar caps)",
      );
    const result = finishWorldResult(oc, built, payload);
    built.delete();
    worldShape.delete();
    return result;
  }

  const jsonVerts = payload.brepJson.vertices;
  let diag = 0;
  if (jsonVerts.length) {
    let mn = { ...jsonVerts[0]! };
    let mx = { ...jsonVerts[0]! };
    for (const v of jsonVerts) {
      mn = {
        x: Math.min(mn.x, v.x),
        y: Math.min(mn.y, v.y),
        z: Math.min(mn.z, v.z),
      };
      mx = {
        x: Math.max(mx.x, v.x),
        y: Math.max(mx.y, v.y),
        z: Math.max(mx.z, v.z),
      };
    }
    diag = Math.hypot(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z);
  }
  const solidCenter = {
    x: 0,
    y: 0,
    z: 0,
  };
  for (const v of jsonVerts) {
    solidCenter.x += v.x / jsonVerts.length;
    solidCenter.y += v.y / jsonVerts.length;
    solidCenter.z += v.z / jsonVerts.length;
  }

  let host = worldShape;
  let owned = false;
  const cores: TopoDS_Shape[] = [];
  try {
    for (let k = 0; k < payload.faceIndices.length; k++) {
      const idx = payload.faceIndices[k]!;
      const wall = payload.thicknesses?.[k] ?? payload.thickness;
      const face = liveFaceForJsonIndex(oc, faces, payload.brepJson, idx)!;
      const cut = withOccScope((track) => {
        const wire = track(
          (
            oc as unknown as {
              BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
            }
          ).BRepTools.OuterWire(face),
        );
        if (!wire) throw new Error(`shell: face ${idx} has no outer wire`);
        const jsonFace = payload.brepJson.faces[idx];
        if (!jsonFace?.vertices?.length)
          throw new Error(`shell: face ${idx} geometry unavailable`);
        const fc = { x: 0, y: 0, z: 0 };
        for (const v of jsonFace.vertices) {
          fc.x += v.x / jsonFace.vertices.length;
          fc.y += v.y / jsonFace.vertices.length;
          fc.z += v.z / jsonFace.vertices.length;
        }
        const raw = {
          x: fc.x - solidCenter.x,
          y: fc.y - solidCenter.y,
          z: fc.z - solidCenter.z,
        };
        const len = Math.hypot(raw.x, raw.y, raw.z);
        if (len < 1e-9) throw new Error(`shell: degenerate cap ${idx}`);
        const outDir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };

        const offBuilder = track(new oc.BRepOffsetAPI_MakeOffset_1());
        offBuilder.Init_2(
          oc.GeomAbs_JoinType.GeomAbs_Arc as typeof oc.GeomAbs_JoinType,
          false,
        );
        offBuilder.AddWire(wire);
        // Wire orientation is not guaranteed: the inward offset may be either
        // sign. Try one, fall back to the other.
        offBuilder.Perform(-wall, 0);
        if (!offBuilder.IsDone()) {
          offBuilder.Init_2(
            oc.GeomAbs_JoinType.GeomAbs_Arc as typeof oc.GeomAbs_JoinType,
            false,
          );
          offBuilder.AddWire(wire);
          offBuilder.Perform(wall, 0);
        }
        if (!offBuilder.IsDone())
          throw new Error(
            `shell: wire offset failed on face ${idx} (non-planar cap?)`,
          );
        const innerWire = track(asWire(oc, offBuilder.Shape()));
        const innerFace = track(makePlanarFace(oc, innerWire));
        const pushed = translateShape(oc, innerFace, {
          x: -outDir.x * 1,
          y: -outDir.y * 1,
          z: -outDir.z * 1,
        });
        const prism = extrudeShapeHelper(oc, pushed, diag + 2, 1, outDir);
        pushed.delete();
        return prism;
      });
      if (payload.keepType === "KEEP_CORE") {
        cores.push(cut);
      } else {
        const next = booleanDifferenceHelper(oc, host, cut);
        cut.delete();
        if (owned) host.delete();
        host = next;
        owned = true;
      }
    }
    if (payload.keepType === "KEEP_CORE") {
      if (!cores.length)
        throw new Error("shell: keep-core needs at least one removed face");
      let core = cores[0]!;
      for (let i = 1; i < cores.length; i++) {
        const next = booleanUnionHelper(oc, core, cores[i]!);
        if (i > 1) core.delete();
        core = next;
        cores[i]!.delete();
      }
      const result = finishWorldResult(oc, core, payload);
      core.delete();
      worldShape.delete();
      return result;
    }
    const result = finishWorldResult(oc, host, payload);
    if (owned) host.delete();
    return result;
  } catch (e) {
    if (owned) host.delete();
    worldShape.delete();
    throw e;
  }
}

export function handleDraft(
  oc: OpenCascadeInstance,
  payload: DraftRequest["payload"],
): WorkerGeometryResult {
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const faces = facesOf(oc, worldShape);
  for (const i of payload.faceIndices) {
    if (!payload.brepJson.faces[i])
      throw new Error(
        `draft: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
      );
  }
  const drafted = withOccScope((track) => {
    if (payload.mode === "PARTING" && !payload.partingLine)
      throw new Error("draft: parting mode needs a parting edge");
    if (payload.partingLine) {
      const edge = payload.partingLine;
      const dx = edge.end.x - edge.start.x;
      const dy = edge.end.y - edge.start.y;
      const dz = edge.end.z - edge.start.z;
      const dl = Math.hypot(dx, dy, dz);
      const nl = Math.hypot(
        payload.neutralNormal.x,
        payload.neutralNormal.y,
        payload.neutralNormal.z,
      );
      if (!(dl > 1e-12) || !(nl > 1e-12))
        throw new Error("draft: parting edge or neutral normal is degenerate");
      const dot =
        (dx * payload.neutralNormal.x +
          dy * payload.neutralNormal.y +
          dz * payload.neutralNormal.z) /
        (dl * nl);
      if (Math.abs(dot) > 1e-5)
        throw new Error(
          "draft: parting edge must lie in the neutral plane (perpendicular to its normal)",
        );
    }
    const np = payload.partingLine?.start ?? payload.neutralPoint;
    const dir = track(
      makeDir(
        oc,
        payload.neutralNormal.x,
        payload.neutralNormal.y,
        payload.neutralNormal.z,
      ),
    );
    const pln = track(new oc.gp_Pln_3(makePoint(oc, np.x, np.y, np.z), dir));
    const draft = track(new oc.BRepOffsetAPI_DraftAngle_1());
    draft.Init(worldShape);
    const angle = (payload.angleDeg * Math.PI) / 180;
    let added = 0;
    for (const i of payload.faceIndices) {
      const face = liveFaceForJsonIndex(oc, faces, payload.brepJson, i)!;
      let addPlane = pln;
      let addAngle = angle;
      if (payload.mode === "STEP" || payload.mode === "PARTING") {
        const props = track(new oc.GProp_GProps_1());
        oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
        const c = track(props.CentreOfMass());
        const side =
          (c.X() - np.x) * payload.neutralNormal.x +
          (c.Y() - np.y) * payload.neutralNormal.y +
          (c.Z() - np.z) * payload.neutralNormal.z;
        if (payload.mode === "STEP" && side < 0) continue;
        if (payload.mode === "PARTING") {
          // One neutral plane for every face. The side only flips the draft
          // direction; it must not move the neutral plane per face.
          addPlane = pln;
          addAngle = side >= 0 ? angle : -angle;
        }
      }
      try {
        draft.Add(face, dir, addAngle, addPlane, false);
      } catch (e) {
        throw new Error(
          `draft: face ${i} failed in ${payload.mode ?? "NEUTRAL"} mode: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      if (!draft.AddDone()) {
        const bad = draft.ProblematicShape();
        try {
          throw new Error(
            `draft: face ${i} rejected in ${payload.mode ?? "NEUTRAL"} mode (status ${draft.Status()})`,
          );
        } finally {
          bad.delete();
        }
      }
      added++;
    }
    if (!added) throw new Error("draft: no faces selected for this mode");
    withProgressRange(oc, (pr) => draft.Build(pr));
    if (!draft.IsDone()) throw new Error("draft: build did not complete");
    draft.CorrectWires();
    return draft.Shape();
  });
  return finishWorldResult(oc, drafted, payload);
}

function curveCumulativeLengths(pts: Vec3[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return cum;
}

function sampleCurvePath(
  pts: Vec3[],
  cum: number[],
  f: number,
): { point: Vec3; tangent: Vec3 } {
  const total = cum[cum.length - 1]!;
  const target = Math.min(Math.max(f, 0), 1) * total;
  let j = 0;
  while (j + 1 < pts.length - 1 && cum[j + 1]! <= target) j++;
  const a = pts[j]!;
  const b = pts[j + 1] ?? a;
  const segLen = cum[j + 1]! - cum[j]!;
  const t = segLen > 0 ? (target - cum[j]!) / segLen : 0;
  const point = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
  const len = segLen || 1;
  return {
    point,
    tangent: {
      x: (b.x - a.x) / len,
      y: (b.y - a.y) / len,
      z: (b.z - a.z) / len,
    },
  };
}

export function handlePattern(
  oc: OpenCascadeInstance,
  payload: PatternRequest["payload"],
): WorkerGeometryResult | PatternPiecesResult {
  if (payload.count < 2) throw new Error("pattern: count must be >= 2");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const faceSelection = payload.faceIndices ?? [];
  if (payload.kind === "face" && !faceSelection.length)
    throw new Error("pattern: face mode needs selected faces");
  const skip = new Set(payload.skip ?? []);
  const worldFaces = payload.kind === "face" ? facesOf(oc, worldShape) : [];
  const selectedFaces =
    payload.kind === "face"
      ? faceSelection.map((i) => {
          if (!payload.brepJson.faces[i])
            throw new Error(
              `pattern: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
            );
          const f = liveFaceForJsonIndex(oc, worldFaces, payload.brepJson, i);
          if (!f) throw new Error(`pattern: face ${i} has no live geometry`);
          return f;
        })
      : [];
  const parts: TopoDS_Shape[] = [];
  try {
    if (payload.kind === "face") {
      parts.push(...selectedFaces);
      for (let k = 1; k < payload.count; k++) {
        if (skip.has(k)) continue;
        for (const face of selectedFaces) {
          const moved = withOccScope((track) => {
            const tr = track(new oc.gp_Trsf_1());
            if (payload.kind === "circular") {
              // unreachable for face mode, retained for the discriminant
            }
            if (!payload.translation)
              throw new Error("pattern: face needs a translation");
            tr.SetTranslation_1(
              makeVec(
                oc,
                payload.translation.x * k,
                payload.translation.y * k,
                payload.translation.z * k,
              ),
            );
            // Do not track the result: this scope deletes tracked shapes, and
            // the compound below still needs each moved face.
            return applyTransform(oc, face, tr, true);
          });
          parts.push(moved);
        }
      }
      if (payload.separate) {
        const results = parts.map((p) => finishWorldResult(oc, p, payload));
        return { results } as PatternPiecesResult;
      }
      const builder = new oc.BRep_Builder();
      const compound = new oc.TopoDS_Compound();
      builder.MakeCompound(compound);
      for (const p of parts) builder.Add(compound, p);
      return finishWorldResult(oc, compound, payload);
    }
    parts.push(worldShape);
    for (let k = 1; k < payload.count; k++) {
      if (skip.has(k)) continue;
      const moved = withOccScope((track) => {
        if (payload.kind === "circular") {
          if (!payload.axisOrigin || !payload.axisDir || !payload.angleRad)
            throw new Error("pattern: circular requires axis + angle");
          const origin = makePoint(
            oc,
            payload.axisOrigin.x,
            payload.axisOrigin.y,
            payload.axisOrigin.z,
          );
          const back = track(new oc.gp_Trsf_1());
          back.SetTranslation_1(
            makeVec(
              oc,
              -payload.axisOrigin.x,
              -payload.axisOrigin.y,
              -payload.axisOrigin.z,
            ),
          );
          const rotT = track(new oc.gp_Trsf_1());
          const quat = track(
            new oc.gp_Quaternion_5(
              makeVec(
                oc,
                payload.axisDir.x,
                payload.axisDir.y,
                payload.axisDir.z,
              ),
              (payload.angleRad * k) / payload.count,
            ),
          );
          rotT.SetRotation_2(quat);
          const fwd = track(new oc.gp_Trsf_1());
          fwd.SetTranslation_1(
            makeVec(
              oc,
              payload.axisOrigin.x,
              payload.axisOrigin.y,
              payload.axisOrigin.z,
            ),
          );
          const centered = applyTransform(oc, worldShape, back, true);
          const rotated = applyTransform(oc, centered, rotT, true);
          centered.delete();
          const movedShape = applyTransform(oc, rotated, fwd, true);
          rotated.delete();
          origin.delete();
          return movedShape;
        }
        if (payload.kind === "curve") {
          const raw = payload.pathPoints;
          if (!raw || raw.length < 2)
            throw new Error("pattern: curve needs at least 2 path points");
          const cum = curveCumulativeLengths(raw);
          if (!(cum[cum.length - 1]! > 0))
            throw new Error("pattern: curve path has zero length");
          const base = raw[0]!;
          const { point, tangent } = sampleCurvePath(
            raw,
            cum,
            k / (payload.count - 1),
          );
          const tr = track(new oc.gp_Trsf_1());
          tr.SetTranslation_1(
            makeVec(oc, point.x - base.x, point.y - base.y, point.z - base.z),
          );
          let moved = applyTransform(oc, worldShape, tr, true);
          if (payload.align) {
            const start = sampleCurvePath(raw, cum, 0).tangent;
            const ax = start.y * tangent.z - start.z * tangent.y;
            const ay = start.z * tangent.x - start.x * tangent.z;
            const az = start.x * tangent.y - start.y * tangent.x;
            const sin = Math.hypot(ax, ay, az);
            const dot = Math.max(
              -1,
              Math.min(
                1,
                start.x * tangent.x + start.y * tangent.y + start.z * tangent.z,
              ),
            );
            if (sin > 1e-9) {
              const quat = track(
                new oc.gp_Quaternion_5(
                  makeVec(oc, ax / sin, ay / sin, az / sin),
                  Math.atan2(sin, dot),
                ),
              );
              const rotT = track(new oc.gp_Trsf_1());
              rotT.SetRotation_2(quat);
              const back = track(new oc.gp_Trsf_1());
              back.SetTranslation_1(makeVec(oc, -point.x, -point.y, -point.z));
              const fwd = track(new oc.gp_Trsf_1());
              fwd.SetTranslation_1(makeVec(oc, point.x, point.y, point.z));
              const centered = applyTransform(oc, moved, back, true);
              moved.delete();
              const rotated = applyTransform(oc, centered, rotT, true);
              centered.delete();
              const anchored = applyTransform(oc, rotated, fwd, true);
              rotated.delete();
              moved = anchored;
            }
          }
          return moved;
        }
        if (!payload.translation)
          throw new Error("pattern: linear/body needs translation");
        const tr = track(new oc.gp_Trsf_1());
        tr.SetTranslation_1(
          makeVec(
            oc,
            payload.translation.x * k,
            payload.translation.y * k,
            payload.translation.z * k,
          ),
        );
        return applyTransform(oc, worldShape, tr, true);
      });
      parts.push(moved);
    }
    if (payload.separate) {
      const results = parts.map((p) => finishWorldResult(oc, p, payload));
      return { results } as PatternPiecesResult;
    }
    let fused = parts[0]!;
    let owned = false;
    for (let i = 1; i < parts.length; i++) {
      const next = booleanUnionHelper(oc, fused, parts[i]!);
      if (owned) fused.delete();
      fused = next;
      owned = true;
    }
    const result = finishWorldResult(oc, fused, payload);
    if (owned) fused.delete();
    return result;
  } finally {
    if (!payload.separate) {
      for (let i = 1; i < parts.length; i++) parts[i]?.delete();
    }
    worldShape.delete();
  }
}

/*
 * Thicken: turn selected faces into solids of the given thickness by ruling
 * between the face's outer wire offset by +/- half-thickness along the
 * convex cap-normal heuristic (planar faces exact, curved approximate).
 */
export function handleThicken(
  oc: OpenCascadeInstance,
  payload: ThickenRequest["payload"],
): WorkerGeometryResult {
  if (!payload.faceIndices.length)
    throw new Error("thicken: no faces selected");
  if (!(payload.thickness > 0))
    throw new Error("thicken: thickness must be > 0");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const faces = facesOf(oc, worldShape);
  for (const i of payload.faceIndices) {
    if (!payload.brepJson.faces[i])
      throw new Error(
        `thicken: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
      );
  }
  const jsonVerts = payload.brepJson.vertices;
  const solidCenter = { x: 0, y: 0, z: 0 };
  for (const v of jsonVerts) {
    solidCenter.x += v.x / jsonVerts.length;
    solidCenter.y += v.y / jsonVerts.length;
    solidCenter.z += v.z / jsonVerts.length;
  }
  let host: TopoDS_Shape | null = null;
  try {
    for (const idx of payload.faceIndices) {
      const slab = withOccScope((track) => {
        const face = liveFaceForJsonIndex(oc, faces, payload.brepJson, idx)!;
        const BRepTools = (
          oc as unknown as {
            BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
          }
        ).BRepTools;
        const wire = track(BRepTools.OuterWire(face));
        if (!wire) throw new Error(`thicken: face ${idx} has no outer wire`);
        const jsonFace = payload.brepJson.faces[idx];
        if (!jsonFace?.vertices?.length)
          throw new Error(`thicken: face ${idx} geometry unavailable`);
        const fc = { x: 0, y: 0, z: 0 };
        for (const v of jsonFace.vertices) {
          fc.x += v.x / jsonFace.vertices.length;
          fc.y += v.y / jsonFace.vertices.length;
          fc.z += v.z / jsonFace.vertices.length;
        }
        const surf = track(new oc.BRepAdaptor_Surface_2(face, true));
        let nrm: { x: number; y: number; z: number };
        if (surf.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
          // A standalone surface has no body center to orient against; use the
          // plane normal so the slab is built through the face, not in-plane.
          const plane = track(surf.Plane());
          const axis = track(plane.Position());
          const direction = axis.Direction();
          const sign =
            face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED
              ? -1
              : 1;
          nrm = {
            x: direction.X() * sign,
            y: direction.Y() * sign,
            z: direction.Z() * sign,
          };
        } else {
          const raw = {
            x: fc.x - solidCenter.x,
            y: fc.y - solidCenter.y,
            z: fc.z - solidCenter.z,
          };
          const len = Math.hypot(raw.x, raw.y, raw.z);
          if (len < 1e-9) throw new Error(`thicken: degenerate face ${idx}`);
          nrm = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
        }
        const half = payload.thickness / 2;
        const mkSlab = (sign: number) => {
          const tr = track(new oc.gp_Trsf_1());
          tr.SetTranslation_1(
            makeVec(
              oc,
              nrm.x * half * sign,
              nrm.y * half * sign,
              nrm.z * half * sign,
            ),
          );
          return track(asWire(oc, applyTransform(oc, wire, tr, true)));
        };
        const wNeg = mkSlab(-1);
        const wPos = mkSlab(1);
        const ts = track(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
        ts.AddWire(wNeg);
        ts.AddWire(wPos);
        withProgressRange(oc, (pr) => ts.Build(pr));
        if (!ts.IsDone())
          throw new Error(`thicken: slab build failed on face ${idx}`);
        return ts.Shape();
      });
      if (host) {
        const merged = booleanUnionHelper(oc, host, slab);
        host.delete();
        slab.delete();
        host = merged;
      } else {
        host = slab;
      }
    }
    if (!host) throw new Error("thicken: no slabs produced");
    const result = finishWorldResult(oc, host, payload);
    host.delete();
    worldShape.delete();
    return result;
  } catch (e) {
    host?.delete();
    worldShape.delete();
    throw e;
  }
}

/*
 * projectCurves: linear-projects selected edges of the source body onto the
 * target body along a constant direction (BRepProj_Projection). Result is a
 * compound of projected wires (edges + vertices, no faces).
 */
export function handleProjectCurves(
  oc: OpenCascadeInstance,
  payload: ProjectCurvesRequest["payload"],
): WorkerGeometryResult {
  const d = payload.direction;
  const dl = Math.hypot(d.x, d.y, d.z);
  if (!(dl > 1e-12)) throw new Error("projectCurves: direction is zero");
  if (!payload.edgeIndices.length)
    throw new Error("projectCurves: no edge indices");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const targetShape = buildWorldShape(
    oc,
    payload.targetBrepJson,
    payload.targetPosition,
    payload.targetOccBrep,
  );
  try {
    const built = withOccScope((track) => {
      const edgeMap = track(mapEdgesIndexed(oc, worldShape));
      const edges = payload.edgeIndices.map((i) => {
        if (i < 1 || i > edgeMap.size)
          throw new Error(
            `projectCurves: edge index ${i} out of range (${edgeMap.size})`,
          );
        return track(edgeMap.edgeAt(i));
      });
      const wire = track(makeWireFromEdges(oc, edges));
      const dir = track(makeDir(oc, d.x / dl, d.y / dl, d.z / dl));
      const proj = track(new oc.BRepProj_Projection_1(wire, targetShape, dir));
      const builder = track(new oc.BRep_Builder());
      const comp = new oc.TopoDS_Compound();
      builder.MakeCompound(comp);
      let count = 0;
      while (proj.More()) {
        const w = track(proj.Current());
        builder.Add(comp, w);
        count++;
        proj.Next();
      }
      if (!count) throw new Error("projectCurves: projection hit no faces");
      return comp;
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
    targetShape.delete();
  }
}

/*
 * Surface tier v1 (single kernel op, three kinds):
 *  - ruled:  ThruSections(ruled) between two edges (wires) of the source.
 *  - fill:   MakeFilling patch across >= 2 boundary edges.
 *  - offset: parallel planar refill of a face's outer wire, pushed along the
 *    convex cap-normal heuristic (same as draft's neutral face).
 * Outputs are single faces (BrepJSON with face geometry), tree-visible only;
 * not COMMITTABLE until the appearance/surface-body tier.
 */
export function handleSurfaceOp(
  oc: OpenCascadeInstance,
  payload: SurfaceOpRequest["payload"],
): WorkerGeometryResult {
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const built = withOccScope((track) => {
      if (payload.kind === "ruled") {
        const idxs = payload.edgeIndices;
        const edges: TopoDS_Edge[] = [];
        const collect = (
          i: number,
          edgeMap: { size: number; edgeAt: (n: number) => TopoDS_Edge },
        ) => {
          if (i < 1 || i > edgeMap.size)
            throw new Error(
              `surfaceOp ${payload.kind}: edge index ${i} out of range (${edgeMap.size})`,
            );
          edges.push(edgeMap.edgeAt(i));
        };
        if (!idxs || idxs.length < 2)
          throw new Error(`surfaceOp ${payload.kind}: needs >= 2 edges`);
        const edgeMap = track(mapEdgesIndexed(oc, worldShape));
        for (const i of idxs) collect(i, edgeMap);
        const w1 = track(makeWireFromEdge(oc, edges[0]!));
        const w2 = track(makeWireFromEdge(oc, edges[1]!));
        const ts = track(new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6));
        ts.AddWire(w1);
        ts.AddWire(w2);
        withProgressRange(oc, (pr) => ts.Build(pr));
        if (!ts.IsDone())
          throw new Error("surfaceOp ruled: build did not complete");
        return ts.Shape();
      }
      if (payload.kind === "offset") {
        const fi = payload.faceIndex;
        const dist = payload.distance;
        if (fi === undefined || dist === undefined)
          throw new Error("surfaceOp offset: needs faceIndex + distance");
        const faces = facesOf(oc, worldShape);
        if (!payload.brepJson.faces[fi])
          throw new Error(
            `surfaceOp offset: face index ${fi} out of range (${payload.brepJson.faces.length} faces)`,
          );
        const BRepTools = (
          oc as unknown as {
            BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
          }
        ).BRepTools;
        const offFace = liveFaceForJsonIndex(oc, faces, payload.brepJson, fi)!;
        const wire = track(BRepTools.OuterWire(offFace));
        if (!wire) throw new Error(`surfaceOp offset: face ${fi} has no wire`);
        const sc = computeBoundingBoxCenter(oc, worldShape);
        const fc = computeBoundingBoxCenter(oc, offFace);
        const rx = fc.x - sc.x;
        const ry = fc.y - sc.y;
        const rz = fc.z - sc.z;
        const rl = Math.hypot(rx, ry, rz) || 1;
        const tr = track(new oc.gp_Trsf_1());
        tr.SetTranslation_1(
          makeVec(oc, (rx / rl) * dist, (ry / rl) * dist, (rz / rl) * dist),
        );
        const moved = track(asWire(oc, applyTransform(oc, wire, tr, true)));
        return makePlanarFace(oc, moved);
      }
      // fill / boundary / constrained — MakeFilling patch across boundary edges
      const idxs = payload.edgeIndices;
      const edges: TopoDS_Edge[] = [];
      const collect = (
        i: number,
        edgeMap: { size: number; edgeAt: (n: number) => TopoDS_Edge },
      ) => {
        if (i < 1 || i > edgeMap.size)
          throw new Error(
            `surfaceOp ${payload.kind}: edge index ${i} out of range (${edgeMap.size})`,
          );
        edges.push(edgeMap.edgeAt(i));
      };
      const filling = new Set(["fill", "boundary", "constrained"]);
      if (filling.has(payload.kind) && (!idxs || !idxs.length)) {
        if (payload.faceIndex === undefined)
          throw new Error(
            `surfaceOp ${payload.kind}: needs edgeIndices or faceIndex`,
          );
        const faces = facesOf(oc, worldShape);
        if (!payload.brepJson.faces[payload.faceIndex])
          throw new Error(
            `surfaceOp ${payload.kind}: face index ${payload.faceIndex} out of range (${payload.brepJson.faces.length} faces)`,
          );
        const face = liveFaceForJsonIndex(
          oc,
          faces,
          payload.brepJson,
          payload.faceIndex,
        );
        if (!face) throw new Error(`surfaceOp ${payload.kind}: no live face`);
        const BRepTools = (
          oc as unknown as {
            BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
          }
        ).BRepTools;
        const w = asWire(
          oc,
          BRepTools.OuterWire(face) as unknown as TopoDS_Shape,
        );
        const wire = track(w);
        for (const sh of iterSubShapes(
          oc,
          wire,
          oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
        ))
          edges.push(asEdge(oc, sh));
      } else {
        if (!idxs || idxs.length < 2)
          throw new Error(`surfaceOp ${payload.kind}: needs >= 2 edges`);
        const edgeMap = track(mapEdgesIndexed(oc, worldShape));
        for (const i of idxs) collect(i, edgeMap);
      }
      const mf = track(
        new oc.BRepOffsetAPI_MakeFilling(
          5,
          15,
          2,
          false,
          1e-3,
          1e-3,
          0.001,
          0.01,
          15,
          8,
        ),
      );
      for (const e of edges)
        mf.Add_1(
          e,
          oc.GeomAbs_Shape.GeomAbs_C0 as typeof oc.GeomAbs_Shape,
          true,
        );
      if (payload.kind === "constrained") {
        const pts = payload.points;
        if (pts?.length) {
          for (const p of pts) mf.Add_4(new oc.gp_Pnt_3(p.x, p.y, p.z));
        }
      }
      withProgressRange(oc, (pr) => mf.Build(pr));
      if (!mf.IsDone())
        throw new Error(`surfaceOp ${payload.kind}: build did not complete`);
      return mf.Shape();
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * Big planar face centered at `origin` with normal `n`, sized to engulf
 * `worldShape` (+margin) along the in-plane basis. Shared by section/
 * move-face cut.
 */
function planeToolFace(
  oc: OpenCascadeInstance,
  track: <T extends { delete(): void }>(obj: T) => T,
  worldShape: TopoDS_Shape,
  origin: Vec3,
  n: Vec3,
  margin = 1,
): TopoDS_Face {
  const ref = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  let u = {
    x: n.y * ref.z - n.z * ref.y,
    y: n.z * ref.x - n.x * ref.z,
    z: n.x * ref.y - n.y * ref.x,
  };
  const uLen = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen };
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  const wv = shapeToVertexPositionsHelper(oc, worldShape);
  let eu = 1;
  let ev = 1;
  for (let i = 0; i + 2 < wv.length; i += 3) {
    const dx = wv[i]! - origin.x;
    const dy = wv[i + 1]! - origin.y;
    const dz = wv[i + 2]! - origin.z;
    eu = Math.max(eu, Math.abs(dx * u.x + dy * u.y + dz * u.z));
    ev = Math.max(ev, Math.abs(dx * v.x + dy * v.y + dz * v.z));
  }
  eu += margin;
  ev += margin;
  const signs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const corners = signs.map(([sa, sb]) =>
    track(
      new oc.gp_Pnt_3(
        origin.x + u.x * eu * sa + v.x * ev * sb,
        origin.y + u.y * eu * sa + v.y * ev * sb,
        origin.z + u.z * eu * sa + v.z * ev * sb,
      ),
    ),
  );
  const edges = corners.map((p, i) => {
    const eb = track(
      new oc.BRepBuilderAPI_MakeEdge_3(p, corners[(i + 1) % 4]!),
    );
    return track(eb.Edge());
  });
  const wire = track(makeWireFromEdges(oc, edges));
  return track(makePlanarFace(oc, wire));
}

/*
 * move-face v1 (planar faces): distance<0 trims the body flush past the face
 * plane (real move semantics: neighbors get cut by the boolean); distance>0
 * adds a prism boss beyond the face (neighbor EXTENSION deferred — Onshape-
 * true follow-me needs surface extension, noted in menu).
 */
export function handleMoveFace(
  oc: OpenCascadeInstance,
  payload: MoveFaceRequest["payload"],
): WorkerGeometryResult {
  if (!(Math.abs(payload.distance) > 1e-12))
    throw new Error("moveFace: distance is zero");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const faces = facesOf(oc, worldShape);
    if (!payload.brepJson.faces[payload.faceIndex])
      throw new Error(
        `moveFace: face index ${payload.faceIndex} out of range (${payload.brepJson.faces.length} faces)`,
      );
    const face = liveFaceForJsonIndex(
      oc,
      faces,
      payload.brepJson,
      payload.faceIndex,
    )!;
    const jsonVerts = payload.brepJson.vertices;
    const solidCenter = { x: 0, y: 0, z: 0 };
    for (const v of jsonVerts) {
      solidCenter.x += v.x / jsonVerts.length;
      solidCenter.y += v.y / jsonVerts.length;
      solidCenter.z += v.z / jsonVerts.length;
    }
    const jsonFace = payload.brepJson.faces[payload.faceIndex];
    if (!jsonFace?.vertices?.length)
      throw new Error("moveFace: face geometry unavailable");
    const fc = { x: 0, y: 0, z: 0 };
    for (const v of jsonFace.vertices) {
      fc.x += v.x / jsonFace.vertices.length;
      fc.y += v.y / jsonFace.vertices.length;
      fc.z += v.z / jsonFace.vertices.length;
    }
    const raw = {
      x: fc.x - solidCenter.x,
      y: fc.y - solidCenter.y,
      z: fc.z - solidCenter.z,
    };
    const len = Math.hypot(raw.x, raw.y, raw.z);
    if (len < 1e-9) throw new Error("moveFace: degenerate face");
    const n = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const built = withOccScope((track) => {
      if (payload.distance < 0) {
        const origin = {
          x: fc.x + payload.position.x + n.x * payload.distance,
          y: fc.y + payload.position.y + n.y * payload.distance,
          z: fc.z + payload.position.z + n.z * payload.distance,
        };
        const toolFace = planeToolFace(oc, track, worldShape, origin, n, 5);
        const diagVerts = shapeToVertexPositionsHelper(oc, worldShape);
        let mnX = Infinity;
        let mxX = -Infinity;
        for (let i = 0; i < diagVerts.length; i += 3) {
          mnX = Math.min(mnX, diagVerts[i]!);
          mxX = Math.max(mxX, diagVerts[i]!);
        }
        const size = Math.max(mxX - mnX, 1) * 4;
        const halfSpace = extrudeShapeHelper(
          oc,
          track(asFace(oc, toolFace)),
          size,
          1,
          { x: n.x, y: n.y, z: n.z },
        );
        const cut = booleanDifferenceHelper(oc, worldShape, halfSpace);
        halfSpace.delete();
        return cut;
      }
      const BRepTools = (
        oc as unknown as {
          BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
        }
      ).BRepTools;
      const wire = track(BRepTools.OuterWire(face));
      if (!wire) throw new Error("moveFace: face has no outer wire");
      const capFace = track(makePlanarFace(oc, asWire(oc, wire)));
      const prism = extrudeShapeHelper(oc, capFace, payload.distance, 1, {
        x: n.x,
        y: n.y,
        z: n.z,
      });
      const fused = booleanUnionHelper(oc, worldShape, prism);
      prism.delete();
      return fused;
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * thread: ISO/UNIFIED groove cut, one torus ring per pitch (analytic
 * surfaces keep the WASM boolean seconds-fast; the continuous B-spline
 * PipeShell helical variant was built and verified geometrically correct
 * but costs ~300s per cut in wasm — parked in docs until the native-speed
 * kernel rebuild). kind=external cuts a groove downward from the major
 * surface; kind=internal cuts the nut ridge upward from the bore wall.
 * taperPerLength carries NPT-style diameter change along the axis.
 */
/*
 * hem v1: two-stage 90-degree Z-fold (upstand lip + inward flap), each leg a
 * proven right-angle flange fuse. Sharp-radius sheet hems need bend radii
 * (deferred with true helix to the kernel rebuild); this is the classic
 * wire-tuck double fold used on sheet edges.
 */
export function handleHem(
  oc: OpenCascadeInstance,
  payload: HemRequest["payload"],
): WorkerGeometryResult {
  const t = payload.thickness;
  const rawL = [
    payload.bendLineDir.x,
    payload.bendLineDir.y,
    payload.bendLineDir.z,
  ];
  const ll = Math.hypot(...rawL.map((x) => x ?? 0)) || 1;
  const Lv = {
    x: (rawL[0] ?? 0) / ll,
    y: (rawL[1] ?? 0) / ll,
    z: (rawL[2] ?? 0) / ll,
  };
  const rb = {
    x: payload.bendDir.x,
    y: payload.bendDir.y,
    z: payload.bendDir.z,
  };
  const dlb = rb.x * Lv.x + rb.y * Lv.y + rb.z * Lv.z;
  const pbv = {
    x: rb.x - Lv.x * dlb,
    y: rb.y - Lv.y * dlb,
    z: rb.z - Lv.z * dlb,
  };
  const pl = Math.hypot(pbv.x, pbv.y, pbv.z) || 1;
  const Bv = { x: pbv.x / pl, y: pbv.y / pl, z: pbv.z / pl };
  const Nv = {
    x: Lv.y * Bv.z - Lv.z * Bv.y,
    y: Lv.z * Bv.x - Lv.x * Bv.z,
    z: Lv.x * Bv.y - Lv.y * Bv.x,
  };
  const lip = payload.lip ?? t * 6;
  const O = payload.origin;
  const stage1 = handleFlange(oc, {
    brepJson: payload.brepJson,
    position: payload.position,
    occBrep: payload.occBrep,
    rotation: payload.rotation,
    origin: O,
    bendDir: Bv,
    bendLineDir: Lv,
    angle: Math.PI / 2,
    thickness: t,
    relief: payload.relief ?? 0,
    length: lip,
    radius: payload.radius,
  });
  const e2 = {
    x: O.x + Nv.x * lip,
    y: O.y + Nv.y * lip,
    z: O.z + Nv.z * lip,
  };
  return handleFlange(oc, {
    brepJson: stage1.brepJson,
    position: { x: 0, y: 0, z: 0 },
    occBrep: stage1.occBrep,
    origin: e2,
    bendDir: { x: -Nv.x, y: -Nv.y, z: -Nv.z },
    bendLineDir: Lv,
    angle: -Math.PI / 2,
    thickness: t,
    relief: 0,
    length: lip * 0.8,
    radius: payload.radius,
  });
}

/*
 * wrap: CURVE maps unfolded (arcLength, height) polylines onto a cylinder as
 * true on-surface edges. CUT/EMBOSS sweep a circular bead along the wrapped
 * path and difference/union it with the target body. This is a bead/groove
 * wrap, not a filled region emboss; a closed polyline produces a closed bead.
 */
export function handleWrapCurves(
  oc: OpenCascadeInstance,
  payload: WrapRequest["payload"],
): WorkerGeometryResult {
  const ar = payload.axisDir;
  const al = Math.hypot(ar.x, ar.y, ar.z);
  if (!(al > 1e-12)) throw new Error("wrap: axisDir is zero");
  const A = { x: ar.x / al, y: ar.y / al, z: ar.z / al };
  if (!(payload.radius > 1e-12)) throw new Error("wrap: radius must be > 0");
  const polys = payload.polylines.filter(
    (pl) => Array.isArray(pl) && pl.length >= 2,
  );
  if (!polys.length) throw new Error("wrap: no polylines");
  const operation = payload.operation ?? "CURVE";
  const depth = payload.depth ?? 0.0005;
  const width = payload.width ?? 0.001;
  if (operation !== "CURVE" && (!(depth > 0) || !(width > 0)))
    throw new Error("wrap: cut/emboss depth and width must be > 0");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const built = withOccScope((track) => {
      const o = payload.axisOrigin;
      const r0 = Math.abs(A.z) < 0.9 ? 0 : 1;
      const r1 = Math.abs(A.z) < 0.9 ? 0 : 0;
      const r2 = Math.abs(A.z) < 0.9 ? 1 : 0;
      void r1;
      const refx = r0,
        refy = r1,
        refz = r2;
      let Xd = {
        x: A.y * refz - A.z * refy,
        y: A.z * refx - A.x * refz,
        z: A.x * refy - A.y * refx,
      };
      const xl = Math.hypot(Xd.x, Xd.y, Xd.z) || 1;
      Xd = { x: Xd.x / xl, y: Xd.y / xl, z: Xd.z / xl };
      const loc = track(makePoint(oc, o.x, o.y, o.z));
      const dir = track(makeDir(oc, A.x, A.y, A.z));
      const xdir = track(makeDir(oc, Xd.x, Xd.y, Xd.z));
      const ax3 = track(new oc.gp_Ax3_3(loc, dir, xdir));
      const cylG = track(new oc.gp_Cylinder_2(ax3, payload.radius));
      // NOTE: Geom_CylindricalSurface_2.delete() crashes this wasm build
      // (bad destructor); the surface handle adopts the object instead and
      // owns its lifetime.
      const cyl = new oc.Geom_CylindricalSurface_2(cylG);
      const surfH = track(new oc.Handle_Geom_Surface_1());
      surfH.reset(cyl as never);
      void cyl;
      const builder = track(new oc.BRep_Builder());
      const comp = new oc.TopoDS_Compound();
      builder.MakeCompound(comp);
      const R = payload.radius;
      const Yd = {
        x: A.y * Xd.z - A.z * Xd.y,
        y: A.z * Xd.x - A.x * Xd.z,
        z: A.x * Xd.y - A.y * Xd.x,
      };
      const atUV3 = (th: number, hh: number) => {
        const c = Math.cos(th),
          s = Math.sin(th);
        return {
          x: o.x + A.x * hh + (Xd.x * c + Yd.x * s) * R,
          y: o.y + A.y * hh + (Xd.y * c + Yd.y * s) * R,
          z: o.z + A.z * hh + (Xd.z * c + Yd.z * s) * R,
        };
      };
      const atUV = (th: number, hh: number) => {
        const q = atUV3(th, hh);
        return new oc.gp_Pnt_3(q.x, q.y, q.z);
      };
      const ridges: TopoDS_Shape[] = [];
      let edges = 0;
      for (const pl of polys) {
        const pts3: Array<never> = [];
        const plain: Array<{ x: number; y: number; z: number }> = [];
        for (let i = 0; i + 1 < pl.length; i++) {
          const rowA = pl[i] ?? [0, 0];
          const rowB = pl[i + 1] ?? [0, 0];
          const sA = Number(rowA[0] ?? 0),
            vA = Number(rowA[1] ?? 0);
          const sB = Number(rowB[0] ?? 0),
            vB = Number(rowB[1] ?? 0);
          const thA = sA / R,
            thB = sB / R;
          const steps = Math.max(
            2,
            Math.round(
              (16 * Math.hypot(sB - sA, (vB - vA) * R)) / (2 * Math.PI * R),
            ),
          );
          for (let j = 0; j < steps; j++) {
            const f = j / steps;
            const th = thA + (thB - thA) * f;
            const hh = vA + (vB - vA) * f;
            plain.push(atUV3(th, hh));
            pts3.push(track(atUV(th, hh)) as never);
          }
        }
        const last = pl[pl.length - 1] ?? [0, 0];
        const lastTh = Number(last[0] ?? 0) / R;
        const lastH = Number(last[1] ?? 0);
        plain.push(atUV3(lastTh, lastH));
        pts3.push(track(atUV(lastTh, lastH)) as never);
        if (pts3.length < 3) continue;
        const arr = new oc.TColgp_Array1OfPnt_2(1, pts3.length);
        pts3.forEach((q, idx) => {
          arr.SetValue(idx + 1, q as never);
        });
        const fitter = new oc.GeomAPI_PointsToBSpline_1();
        fitter.Init_1(
          arr,
          1,
          6,
          oc.GeomAbs_Shape.GeomAbs_C2 as typeof oc.GeomAbs_Shape,
          1e-6,
        );
        const ch = new oc.Handle_Geom_Curve_1();
        let eb: InstanceType<typeof oc.BRepBuilderAPI_MakeEdge_24> | null =
          null;
        let w: ReturnType<typeof makeWireFromEdge> | null = null;
        try {
          if (!fitter.IsDone()) throw new Error("wrap: polyline fit failed");
          ch.reset(fitter.Curve().get() as never);
          eb = new oc.BRepBuilderAPI_MakeEdge_24(ch as never);
          if (!eb.IsDone()) throw new Error("wrap: edge failed");
          w = makeWireFromEdge(oc, eb.Edge());
          builder.Add(comp, w);
          edges++;
        } finally {
          if (w) w.delete();
          if (eb) eb.delete();
          ch.delete();
          fitter.delete();
          arr.delete();
        }
        if (operation === "CURVE" || plain.length < 2) continue;
        const firstRow = pl[0] ?? [0, 0];
        const lastRow = pl[pl.length - 1] ?? [0, 0];
        const closed =
          Math.hypot(
            Number(firstRow[0] ?? 0) - Number(lastRow[0] ?? 0),
            Number(firstRow[1] ?? 0) - Number(lastRow[1] ?? 0),
          ) < 1e-6;
        if (closed) {
          // A closed polyline is a filled region, not a bead path: make a face
          // on the cylinder from its exact 2D pcurve and thicken that face.
          try {
            const rows = pl.slice();
            if (
              rows.length < 3 ||
              Math.abs(
                Number(rows[0]?.[0] ?? 0) -
                  Number(rows[rows.length - 1]?.[0] ?? 0),
              ) > 1e-9 ||
              Math.abs(
                Number(rows[0]?.[1] ?? 0) -
                  Number(rows[rows.length - 1]?.[1] ?? 0),
              ) > 1e-9
            ) {
              rows.push(firstRow);
            }
            if (rows.length < 3) throw new Error("region needs three points");
            const arr2 = new oc.TColgp_Array1OfPnt2d_2(1, rows.length);
            rows.forEach((row, idx) => {
              arr2.SetValue(
                idx + 1,
                new oc.gp_Pnt2d_3(Number(row[0] ?? 0) / R, Number(row[1] ?? 0)),
              );
            });
            const fit2 = new oc.Geom2dAPI_PointsToBSpline_2(
              arr2,
              1,
              6,
              oc.GeomAbs_Shape.GeomAbs_C2 as typeof oc.GeomAbs_Shape,
              1e-6,
            );
            if (!fit2.IsDone()) throw new Error("pcurve fit failed");
            const h2 = fit2.Curve();
            const eb2 = new oc.BRepBuilderAPI_MakeEdge_30(
              h2 as never,
              surfH as never,
            );
            if (!eb2.IsDone()) throw new Error("pcurve edge failed");
            const w2 = makeWireFromEdge(oc, eb2.Edge());
            const fm = new oc.BRepBuilderAPI_MakeFace_21(
              surfH as never,
              w2,
              true,
            );
            if (!fm.IsDone()) throw new Error("region face failed");
            let region: TopoDS_Shape | null = null;
            for (const off of [
              operation === "EMBOSS" ? depth : -depth,
              operation === "EMBOSS" ? -depth : depth,
            ]) {
              const thick = new oc.BRepOffsetAPI_MakeThickSolid();
              thick.MakeThickSolidBySimple(fm.Face(), off);
              withProgressRange(oc, (pr) => thick.Build(pr));
              if (thick.IsDone()) {
                region = thick.Shape();
                thick.delete();
                break;
              }
              thick.delete();
            }
            if (!region) throw new Error("region thicken failed");
            ridges.push(region);
            w2.delete();
            eb2.delete();
            fm.delete();
            fit2.delete();
            arr2.delete();
          } catch (e) {
            throw new Error(
              `wrap: ${operation.toLowerCase()} region failed: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
          continue;
        }
        const pathWire = buildWireFromPointsHelper(oc, plain);
        if (!pathWire) throw new Error("wrap: path wire failed");
        const p0 = plain[0]!;
        const p1 = plain[1]!;
        const tx = p1.x - p0.x,
          ty = p1.y - p0.y,
          tz = p1.z - p0.z;
        const tl = Math.hypot(tx, ty, tz);
        if (!(tl > 1e-12)) continue;
        const relx = p0.x - o.x,
          rely = p0.y - o.y,
          relz = p0.z - o.z;
        const axial = relx * A.x + rely * A.y + relz * A.z;
        const rx = relx - A.x * axial,
          ry = rely - A.y * axial,
          rz = relz - A.z * axial;
        const rl = Math.hypot(rx, ry, rz);
        if (!(rl > 1e-12)) continue;
        const sign = operation === "EMBOSS" ? 0.5 : -0.5;
        const cx = p0.x + (rx / rl) * depth * sign;
        const cy = p0.y + (ry / rl) * depth * sign;
        const cz = p0.z + (rz / rl) * depth * sign;
        try {
          const ax = track(
            makeAxis2(
              oc,
              track(makePoint(oc, cx, cy, cz)),
              track(makeDir(oc, tx / tl, ty / tl, tz / tl)),
            ),
          );
          const circ = track(makeCircle(oc, ax, Math.max(width * 0.5, 1e-4)));
          const edgeBuilder = track(new oc.BRepBuilderAPI_MakeEdge_8(circ));
          if (!edgeBuilder.IsDone())
            throw new Error("wrap: bead profile edge failed");
          const profileWire = track(makeWireFromEdge(oc, edgeBuilder.Edge()));
          const profileFace = track(makePlanarFace(oc, profileWire));
          ridges.push(
            sweepShapeAdvancedHelper(oc, profileFace, pathWire, {
              orientation: "perpendicular",
              cornerMode: "round",
            }),
          );
        } catch (e) {
          throw new Error(
            `wrap: ${operation.toLowerCase()} bead sweep failed: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
      if (operation === "CURVE") {
        if (!edges) throw new Error("wrap: no edges produced");
        return { shape: comp as TopoDS_Shape, ridges: [] as TopoDS_Shape[] };
      }
      if (!ridges.length) throw new Error("wrap: no bead paths produced");
      return { shape: comp as TopoDS_Shape, ridges };
    });
    let result = operation === "CURVE" ? built.shape : worldShape;
    let owned = false;
    try {
      if (operation !== "CURVE") {
        for (const ridge of built.ridges) {
          const next =
            operation === "EMBOSS"
              ? booleanUnionHelper(oc, result, ridge)
              : booleanDifferenceHelper(oc, result, ridge);
          if (owned) result.delete();
          result = next;
          owned = true;
        }
      }
      return finishWorldResult(oc, result, payload);
    } finally {
      if (owned) result.delete();
      built.shape.delete();
      for (const r of built.ridges) r.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * A 45-degree end chamfer is the corner material outside a cone. Build that
 * corner as a revolved triangle and cut it from the threaded body. External
 * threads remove the crest corner; internal threads open the hole mouth.
 */
function buildThreadEndChamferCutter(
  oc: OpenCascadeInstance,
  payload: ThreadRequest["payload"],
  axis: { x: number; y: number; z: number },
  atEnd: boolean,
): TopoDS_Shape | null {
  const c = payload.endChamfer ?? 0;
  if (!(c > 0) || payload.height <= 2 * c) return null;
  const h0 = atEnd ? payload.height : 0;
  const rAt = payload.radius + (payload.taperPerLength ?? 0) * h0;
  if (!(rAt > 2 * c)) return null;
  const inward = atEnd ? -1 : 1;
  const outer = payload.kind === "external" ? rAt + c * 0.25 : rAt + c;
  const inner = payload.kind === "external" ? rAt - c : rAt;
  const ux0 =
    Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const ux = axis.y * ux0.z - axis.z * ux0.y;
  const uy = axis.z * ux0.x - axis.x * ux0.z;
  const uz = axis.x * ux0.y - axis.y * ux0.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const u = { x: ux / ul, y: uy / ul, z: uz / ul };
  const o = payload.origin;
  const local = [
    [outer, h0],
    [inner, h0],
    [inner, h0 + inward * c],
  ] as const;
  return withOccScope((track) => {
    const pts = local.map(([r, h]) =>
      track(
        makePoint(
          oc,
          o.x + u.x * r + axis.x * h,
          o.y + u.y * r + axis.y * h,
          o.z + u.z * r + axis.z * h,
        ),
      ),
    );
    const edges = pts.map((p, i) =>
      track(makeEdgeFromPoints(oc, p, pts[(i + 1) % 3]!)),
    );
    const wire = track(makeWireFromEdges(oc, edges));
    const face = track(makePlanarFace(oc, wire));
    const loc = track(makePoint(oc, o.x, o.y, o.z));
    const dir = track(makeDir(oc, axis.x, axis.y, axis.z));
    const ax = track(makeAxis1(oc, loc, dir));
    const revol = track(new oc.BRepPrimAPI_MakeRevol_2(face, ax, true));
    withProgressRange(oc, (pr) => revol.Build(pr));
    if (!revol.IsDone()) throw new Error("thread: end chamfer revolve failed");
    return revol.Shape();
  });
}

function applyThreadEndChamfers(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  payload: ThreadRequest["payload"],
  axis: { x: number; y: number; z: number },
): TopoDS_Shape {
  let host = shape;
  let owned = false;
  for (const atEnd of [false, true]) {
    const cutter = buildThreadEndChamferCutter(oc, payload, axis, atEnd);
    if (!cutter) continue;
    try {
      const next = booleanDifferenceHelper(oc, host, cutter);
      if (owned) host.delete();
      host = next;
      owned = true;
    } catch (e) {
      if (owned) host.delete();
      throw new Error(
        `thread: ${atEnd ? "end" : "start"} chamfer cut failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      cutter.delete();
    }
  }
  return host;
}

export function handleThread(
  oc: OpenCascadeInstance,
  payload: ThreadRequest["payload"],
): WorkerGeometryResult {
  const nr = payload.axisDir;
  const nLen = Math.hypot(nr.x, nr.y, nr.z);
  if (!(nLen > 1e-12)) throw new Error("thread: axisDir is zero");
  const n = { x: nr.x / nLen, y: nr.y / nLen, z: nr.z / nLen };
  const { radius: R0, pitch, height, depth: rawDepth } = payload;
  if (!(pitch > 0 && R0 > 0 && height > 0 && rawDepth > 0))
    throw new Error("thread: radius/pitch/height/depth must be > 0");
  // Cosmetic threads are a shallow visual representation; the pitch table is
  // unchanged, but the cut never becomes a structural thread.
  const depth = payload.cosmetic ? Math.min(rawDepth, pitch * 0.06) : rawDepth;
  const taper = payload.taperPerLength ?? 0;
  const sgn = payload.kind === "external" ? 1 : -1;
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    if (payload.helical) {
      const ridge = withOccScope((track) => {
        const o = payload.origin;
        const ux0 =
          Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
        const cross = (a: Vec3, b: Vec3): Vec3 => ({
          x: a.y * b.z - a.z * b.y,
          y: a.z * b.x - a.x * b.z,
          z: a.x * b.y - a.y * b.x,
        });
        const norm = (a: Vec3): Vec3 => {
          const l = Math.hypot(a.x, a.y, a.z) || 1;
          return { x: a.x / l, y: a.y / l, z: a.z / l };
        };
        const u = norm(cross(n, ux0));
        const v = norm(cross(n, u));
        const steps = Math.max(32, Math.ceil((height / pitch) * 24));
        const pts: Vec3[] = [];
        for (let i = 0; i <= steps; i++) {
          const h = (height * i) / steps;
          const ang = (2 * Math.PI * h) / pitch;
          const r = R0 + taper * h;
          pts.push({
            x:
              o.x + n.x * h + u.x * r * Math.cos(ang) + v.x * r * Math.sin(ang),
            y:
              o.y + n.y * h + u.y * r * Math.cos(ang) + v.y * r * Math.sin(ang),
            z:
              o.z + n.z * h + u.z * r * Math.cos(ang) + v.z * r * Math.sin(ang),
          });
        }
        const pathWire = buildWireFromPointsHelper(oc, pts);
        if (!pathWire) throw new Error("thread: helix path wire failed");
        const tangent = norm({
          x: pts[1]!.x - pts[0]!.x,
          y: pts[1]!.y - pts[0]!.y,
          z: pts[1]!.z - pts[0]!.z,
        });
        const ax = track(
          makeAxis2(
            oc,
            track(makePoint(oc, pts[0]!.x, pts[0]!.y, pts[0]!.z)),
            track(makeDir(oc, tangent.x, tangent.y, tangent.z)),
          ),
        );
        const profileRad = Math.max(depth * 0.5, 1e-4);
        const circ = track(makeCircle(oc, ax, profileRad));
        const edgeBuilder = track(new oc.BRepBuilderAPI_MakeEdge_8(circ));
        if (!edgeBuilder.IsDone())
          throw new Error("thread: helix profile edge failed");
        const profileWire = track(makeWireFromEdge(oc, edgeBuilder.Edge()));
        const profileFace = track(makePlanarFace(oc, profileWire));
        return sweepShapeAdvancedHelper(oc, profileFace, pathWire, {
          orientation: "perpendicular",
          cornerMode: "round",
        });
      });
      try {
        let merged =
          payload.kind === "external"
            ? booleanUnionHelper(oc, worldShape, ridge)
            : booleanDifferenceHelper(oc, worldShape, ridge);
        ridge.delete();
        try {
          const chamfered = applyThreadEndChamfers(oc, merged, payload, n);
          if (chamfered !== merged) merged.delete();
          merged = chamfered;
          return finishWorldResult(oc, merged, payload);
        } finally {
          merged.delete();
        }
      } catch (e) {
        ridge.delete();
        throw new Error(
          `thread: helical sweep failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    let built = withOccScope((track) => {
      const o = payload.origin;
      const grooves = Math.max(1, Math.round(height / pitch));
      const aList = track(new oc.TopTools_ListOfShape_1());
      aList.Append_1(worldShape);
      const tList = track(new oc.TopTools_ListOfShape_1());
      for (let i = 0; i < grooves; i++) {
        const h = (i + 0.5) * pitch;
        const rAt = R0 + taper * h;
        const ringR = Math.max(rAt, depth * 1.05);
        const c = track(
          new oc.gp_Pnt_3(o.x + n.x * h, o.y + n.y * h, o.z + n.z * h),
        );
        const d = track(makeDir(oc, n.x, n.y, n.z));
        const ax = track(new oc.gp_Ax2_3(c, d));
        const mkT = track(
          new oc.BRepPrimAPI_MakeTorus_5(
            ax,
            ringR,
            Math.max(depth, 1e-4) * 0.85,
          ),
        );
        withProgressRange(oc, (pr) => mkT.Build(pr));
        if (!mkT.IsDone()) throw new Error("thread: ring build failed");
        tList.Append_1(track(mkT.Shape()));
      }
      void sgn;
      const op = track(new oc.BRepAlgoAPI_Cut_1());
      op.SetFuzzyValue(1e-5);
      op.SetGlue(
        oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift as typeof oc.BOPAlgo_GlueEnum,
      );
      op.SetArguments(aList);
      op.SetTools(tList);
      withProgressRange(oc, (pr) => op.Build(pr));
      if (!op.IsDone()) throw new Error("thread: boolean cut failed");
      return op.Shape();
    });
    try {
      const chamfered = applyThreadEndChamfers(oc, built, payload, n);
      if (chamfered !== built) built.delete();
      built = chamfered;
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

type V3 = [number, number, number];
const fAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const fSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const fScale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const fDot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const fLen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const fNorm = (a: V3): V3 => {
  const l = fLen(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : a;
};

// Project a flat [x,y,z,...] vertex array onto `axis` and return the span.
function extentOnAxis(verts: Float32Array, axis: V3): number {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const d =
      axis[0] * verts[i]! + axis[1] * verts[i + 1]! + axis[2] * verts[i + 2]!;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return mn === Infinity ? 0 : mx - mn;
}

// Build an axis-aligned-in-(B,N) profile rectangle extruded along `dir`.
// Returns a fresh solid owned by the caller (do NOT track the return; its
// internal wires/faces are tracked and disposed at scope exit).
function flangePlateBox(
  oc: OpenCascadeInstance,
  track: <T extends { delete(): void }>(obj: T) => T,
  corners: V3[],
  dir: V3,
  depth: number,
): TopoDS_Shape {
  const pts = corners.map((c) => track(makePoint(oc, c[0], c[1], c[2])));
  const edges = pts.map((p, i) =>
    track(makeEdgeFromPoints(oc, p, pts[(i + 1) % 4]!)),
  );
  const wire = track(makeWireFromEdges(oc, edges));
  const face = track(makePlanarFace(oc, wire));
  return extrudeShapeHelper(oc, face, depth, 1, {
    x: dir[0],
    y: dir[1],
    z: dir[2],
  });
}

/*
 * flange (sheet metal): extrude a second plate from the bend line, rotate it
 * about the bend-line axis via gp_Trsf.SetRotation_1, and fuse to the base.
 * `angle` is RADIANS (0 = coplanar extension, PI/2 = upstanding flange).
 * bendLineDir = rotation axis; bendDir = in-plane fold-out direction (its
 * component along the bend line is stripped); thickness runs along
 * bendLineDir x bendDir. length/width default to the base body's extents
 * along those axes. relief>0 cuts a small corner notch at each bend-line end.
 * gp_Trsf.SetRotation_2 is the gp_Quaternion overload in this binding, NOT
 * axis+angle; the axis form is _1.
 */
export function handleFlange(
  oc: OpenCascadeInstance,
  payload: FlangeRequest["payload"],
): WorkerGeometryResult {
  const rawL: V3 = [
    payload.bendLineDir.x,
    payload.bendLineDir.y,
    payload.bendLineDir.z,
  ];
  if (!(fLen(rawL) > 1e-12)) throw new Error("flange: bendLineDir is zero");
  const L = fNorm(rawL);
  const O: V3 = [payload.origin.x, payload.origin.y, payload.origin.z];
  const rawB: V3 = [payload.bendDir.x, payload.bendDir.y, payload.bendDir.z];
  const perpB = fSub(rawB, fScale(L, fDot(rawB, L)));
  if (!(fLen(perpB) > 1e-9))
    throw new Error("flange: bendDir is parallel to the bend line");
  const B = fNorm(perpB);
  const N = fNorm(fCross(L, B));
  const t = payload.thickness;
  if (!(t > 1e-9)) throw new Error("flange: thickness must be > 0");

  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const verts = shapeToVertexPositionsHelper(oc, worldShape);
    const length =
      payload.length && payload.length > 0
        ? payload.length
        : extentOnAxis(verts, B);
    const width =
      payload.width && payload.width > 0
        ? payload.width
        : extentOnAxis(verts, L) || length;
    if (!(length > 1e-9 && width > 1e-9))
      throw new Error("flange: length/width could not be derived");
    const hw = width / 2;
    const built = withOccScope((track) => {
      const base = fAdd(O, fScale(L, -hw));
      const c0 = fAdd(base, fScale(N, -t / 2));
      const c1 = fAdd(fAdd(base, fScale(B, length)), fScale(N, -t / 2));
      const c2 = fAdd(fAdd(base, fScale(B, length)), fScale(N, t / 2));
      const c3 = fAdd(base, fScale(N, t / 2));
      const plate = track(
        flangePlateBox(oc, track, [c0, c1, c2, c3], L, width),
      );
      const loc = track(makePoint(oc, O[0], O[1], O[2]));
      const ldir = track(makeDir(oc, L[0], L[1], L[2]));
      const ax = track(makeAxis1(oc, loc, ldir));
      const trsf = track(new oc.gp_Trsf_1());
      const rIn = payload.radius ?? 0;
      let out: TopoDS_Shape;
      if (rIn > 1e-9) {
        // Rounded bend: mid-surface arc center C = O + (r + t/2)(B + N) over
        // the fold angle; lofted rectangle sections tangent-continuous with
        // both straight legs. Straight legs trim by the tangent length
        // b = (r + t/2)*tan(theta/2).
        const th = Math.abs(payload.angle);
        const Rm = rIn + t / 2;
        const bTan = Rm * Math.tan(th / 2);
        const trsfLeg = track(new oc.gp_Trsf_1());
        trsfLeg.SetRotation_1(ax, payload.angle);
        const legStart = fAdd(O, fScale(B, Math.min(bTan, length * 0.9)));
        const legLen = Math.max(length - Math.min(bTan, length * 0.9), 1e-4);
        const q0 = fAdd(legStart, fScale(N, -t / 2));
        const q1 = fAdd(fAdd(legStart, fScale(B, legLen)), fScale(N, -t / 2));
        const q2 = fAdd(fAdd(legStart, fScale(B, legLen)), fScale(N, t / 2));
        const q3 = fAdd(legStart, fScale(N, t / 2));
        const legPlate = track(
          flangePlateBox(oc, track, [q0, q1, q2, q3], L, width),
        );
        const rotated = track(applyTransform(oc, legPlate, trsfLeg, true));
        const steps = Math.max(3, Math.round((th / (Math.PI / 2)) * 6));
        const ts = track(new oc.BRepOffsetAPI_ThruSections(true, true, 1e-6));
        for (let j = 0; j <= steps; j++) {
          const psi = (j / steps) * payload.angle;
          const uB = Math.sin(psi),
            uN = Math.cos(psi);
          const cx = O[0] + B[0] * Rm + N[0] * Rm,
            cy = O[1] + B[1] * Rm + N[1] * Rm,
            cz = O[2] + B[2] * Rm + N[2] * Rm;
          const qx = cx - Rm * (B[0] * uB + N[0] * uN);
          const qy = cy - Rm * (B[1] * uB + N[1] * uN);
          const qz = cz - Rm * (B[2] * uB + N[2] * uN);
          const ux = B[0] * uB + N[0] * uN,
            uy = B[1] * uB + N[1] * uN,
            uz = B[2] * uB + N[2] * uN;
          const corner = (s: number, lw: number) =>
            track(
              new oc.gp_Pnt_3(
                qx + ux * s + L[0] * lw,
                qy + uy * s + L[1] * lw,
                qz + uz * s + L[2] * lw,
              ),
            );
          const pts = [
            corner(-t / 2, -hw),
            corner(t / 2, -hw),
            corner(t / 2, hw),
            corner(-t / 2, hw),
          ];
          const es: never[] = [];
          for (let k = 0; k < 4; k++) {
            const eb = track(
              new oc.BRepBuilderAPI_MakeEdge_3(
                pts[k] as never,
                pts[(k + 1) % 4] as never,
              ),
            );
            es.push(track(eb.Edge()) as never);
          }
          ts.AddWire(track(makeWireFromEdges(oc, es)) as never);
        }
        withProgressRange(oc, (pr) => ts.Build(pr));
        if (!ts.IsDone()) throw new Error("flange: bend loft failed");
        const band = ts.Shape();
        const fused = booleanUnionHelper(oc, worldShape, rotated);
        out = booleanUnionHelper(oc, fused, band);
        fused.delete();
        band.delete();
      } else {
        trsf.SetRotation_1(ax, payload.angle);
        const rotated = track(applyTransform(oc, plate, trsf, true));
        out = booleanUnionHelper(oc, worldShape, rotated);
      }
      if (payload.relief > 1e-9) {
        const relief = Math.min(payload.relief, length, hw * 0.5);
        for (const startL of [-hw, hw - relief]) {
          const st = fAdd(O, fScale(L, startL));
          const n0 = fAdd(st, fScale(N, -t * 0.75));
          const n1 = fAdd(fAdd(st, fScale(B, -relief)), fScale(N, -t * 0.75));
          const n2 = fAdd(fAdd(st, fScale(B, -relief)), fScale(N, t * 0.75));
          const n3 = fAdd(st, fScale(N, t * 0.75));
          const notch = track(
            flangePlateBox(oc, track, [n0, n1, n2, n3], L, relief),
          );
          const cut = booleanDifferenceHelper(oc, out, notch);
          out.delete();
          out = cut;
        }
      }
      return out;
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

export function handleSection(
  oc: OpenCascadeInstance,
  payload: SectionRequest["payload"],
): WorkerGeometryResult {
  const o = payload.planeOrigin;
  const nr = payload.planeNormal;
  const nLen = Math.hypot(nr.x, nr.y, nr.z);
  if (!(nLen > 1e-12)) throw new Error("section: planeNormal is zero");
  const n = { x: nr.x / nLen, y: nr.y / nLen, z: nr.z / nLen };
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const built = withOccScope((track) => {
      const face = planeToolFace(oc, track, worldShape, o, n);
      const sec = track(new oc.BRepAlgoAPI_Section_3(worldShape, face, true));
      if (!sec.IsDone()) throw new Error("section: build did not complete");
      const edges = collectSubShapes(
        oc,
        sec.Shape(),
        oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
      );
      edges.forEach((e) => e.delete());
      if (!edges.length)
        throw new Error("section: plane does not cut the body");
      return sec.Shape();
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * Split by an infinite plane: BRepAlgoAPI_Splitter with a large planar tool
 * face. positive/negative keep one half; both returns both halves as separate
 * bodies. A plane that misses the body is rejected by the handlers below.
 */
export function handleSplit(
  oc: OpenCascadeInstance,
  payload: SplitRequest["payload"],
): WorkerGeometryResult | SplitBothResult {
  const o = payload.planeOrigin;
  const nr = payload.planeNormal;
  const nLen = Math.hypot(nr.x, nr.y, nr.z);
  if (!(nLen > 1e-12)) throw new Error("split: planeNormal is zero");
  const n = { x: nr.x / nLen, y: nr.y / nLen, z: nr.z / nLen };
  const ref = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  let u = {
    x: n.y * ref.z - n.z * ref.y,
    y: n.z * ref.x - n.x * ref.z,
    z: n.x * ref.y - n.y * ref.x,
  };
  const uLen = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen };
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const wv = shapeToVertexPositionsHelper(oc, worldShape);
    let eu = 1;
    let ev = 1;
    for (let i = 0; i + 2 < wv.length; i += 3) {
      const dx = wv[i]! - o.x;
      const dy = wv[i + 1]! - o.y;
      const dz = wv[i + 2]! - o.z;
      eu = Math.max(eu, Math.abs(dx * u.x + dy * u.y + dz * u.z));
      ev = Math.max(ev, Math.abs(dx * v.x + dy * v.y + dz * v.z));
    }
    eu += 1;
    ev += 1;
    const picked = withOccScope((track) => {
      const signs: [number, number][] = [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ];
      const corners = signs.map(([sa, sb]) =>
        track(
          new oc.gp_Pnt_3(
            o.x + u.x * eu * sa + v.x * ev * sb,
            o.y + u.y * eu * sa + v.y * ev * sb,
            o.z + u.z * eu * sa + v.z * ev * sb,
          ),
        ),
      );
      const edges = corners.map((p, i) => {
        const eb = track(
          new oc.BRepBuilderAPI_MakeEdge_3(p, corners[(i + 1) % 4]!),
        );
        return track(eb.Edge());
      });
      const wire = track(makeWireFromEdges(oc, edges));
      const planeFace = track(makePlanarFace(oc, wire));
      let toolShape: TopoDS_Shape = planeFace;
      if (payload.splitBy === "surface") {
        if (!payload.toolBrepJson)
          throw new Error("split: surface mode needs a tool body");
        toolShape = buildWorldShape(
          oc,
          payload.toolBrepJson,
          payload.toolPosition ?? { x: 0, y: 0, z: 0 },
          payload.toolOccBrep,
        );
      }
      const splitter = track(new oc.BRepAlgoAPI_Splitter_1());
      const argsList = track(new oc.TopTools_ListOfShape_1());
      argsList.Append_1(worldShape);
      const toolsList = track(new oc.TopTools_ListOfShape_1());
      toolsList.Append_1(toolShape);
      splitter.SetArguments(argsList);
      splitter.SetTools(toolsList);
      withProgressRange(oc, (pr) => splitter.Build(pr));
      if (!splitter.IsDone()) throw new Error("split: build did not complete");
      const result = track(splitter.Shape());
      const solids = collectSubShapes(
        oc,
        result,
        oc.TopAbs_ShapeEnum.TopAbs_SOLID as typeof oc.TopAbs_ShapeEnum,
      );
      const sizeOf = (sh: TopoDS_Shape) => {
        const vs = shapeToVertexPositionsHelper(oc, sh);
        let mnX = Infinity;
        let mnY = Infinity;
        let mnZ = Infinity;
        let mxX = -Infinity;
        let mxY = -Infinity;
        let mxZ = -Infinity;
        for (let i = 0; i + 2 < vs.length; i += 3) {
          mnX = Math.min(mnX, vs[i]!);
          mnY = Math.min(mnY, vs[i + 1]!);
          mnZ = Math.min(mnZ, vs[i + 2]!);
          mxX = Math.max(mxX, vs[i]!);
          mxY = Math.max(mxY, vs[i + 1]!);
          mxZ = Math.max(mxZ, vs[i + 2]!);
        }
        return Math.hypot(mxX - mnX, mxY - mnY, mxZ - mnZ);
      };
      if (payload.splitBy === "surface") {
        const sorted = [...solids].sort((a, b) => sizeOf(b) - sizeOf(a));
        if (payload.keep === "both") {
          if (sorted.length < 2) {
            for (const s of sorted) s.delete();
            throw new Error("split: surface does not divide the body");
          }
          const [a, b, ...rest] = sorted;
          for (const s of rest) s.delete();
          return [a!, b!];
        }
        if (!sorted.length) throw new Error("split: surface missed the body");
        const [best, ...rest] = sorted;
        for (const s of rest) s.delete();
        return best!;
      }
      const wantPos = payload.keep !== "negative";
      const wantNeg = payload.keep === "negative" || payload.keep === "both";
      let pos: TopoDS_Shape | null = null;
      let neg: TopoDS_Shape | null = null;
      for (const s of solids) {
        const c = computeBoundingBoxCenter(oc, s);
        const dot = (c.x - o.x) * n.x + (c.y - o.y) * n.y + (c.z - o.z) * n.z;
        const side: "pos" | "neg" | null =
          dot > 1e-9 ? "pos" : dot < -1e-9 ? "neg" : null;
        const keepSide =
          (side === "pos" && wantPos) || (side === "neg" && wantNeg);
        const cur = side === "pos" ? pos : neg;
        if (keepSide && side && (!cur || sizeOf(s) < sizeOf(cur))) {
          if (cur) cur.delete();
          if (side === "pos") pos = s;
          else neg = s;
        } else {
          s.delete();
        }
      }
      if (payload.keep === "both") {
        if (!pos || !neg) {
          pos?.delete();
          neg?.delete();
          throw new Error("split: plane does not divide the body");
        }
        return [pos, neg];
      }
      const best = payload.keep === "negative" ? neg : pos;
      if (!best) {
        pos?.delete();
        neg?.delete();
        throw new Error("split: body lies on the discarded side of the plane");
      }
      return best;
    });
    if (Array.isArray(picked)) {
      const [a, b] = picked as [TopoDS_Shape, TopoDS_Shape];
      try {
        const primary = finishWorldResult(oc, a, payload);
        const secondary = finishWorldResult(oc, b, payload);
        const both: SplitBothResult = { primary, secondary };
        a.delete();
        b.delete();
        return both;
      } catch (e) {
        a.delete();
        b.delete();
        throw e;
      }
    }
    const single = picked as TopoDS_Shape;
    try {
      return finishWorldResult(oc, single, payload);
    } finally {
      single.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * Knit/stitch: sew every face of every source body into one shell, then
 * optionally turn the closed shell into a solid. The sewing tolerance is in
 * document units and is the knob that closes small gaps between patches.
 */
export function handleSew(
  oc: OpenCascadeInstance,
  payload: SewRequest["payload"],
): WorkerSewResult {
  if (!payload.sources.length)
    throw new Error("sew: at least one source body is required");
  if (payload.sources.length < 2 && !payload.makeSolid && !payload.extractShell)
    throw new Error("sew: knitting needs at least two source bodies");
  const tolerance = payload.tolerance ?? 1e-6;
  if (!(tolerance > 0)) throw new Error("sew: tolerance must be > 0");
  const shapes = payload.sources.map((source) =>
    buildWorldShape(
      oc,
      source.brepJson,
      source.position,
      source.occBrep,
      source.rotation,
    ),
  );
  try {
    let unstitchedEdges = 0;
    let shellCount = 0;
    const sewn = withOccScope((track) => {
      const sewing = track(
        new oc.BRepBuilderAPI_Sewing(
          tolerance,
          payload.mergeFaces !== false,
          payload.sewFreeEdges !== false,
          payload.sewSharedEdges !== false,
          false,
        ),
      );
      const addedFaces: TopoDS_Face[] = [];
      for (let i = 0; i < shapes.length; i++) {
        const source = payload.sources[i]!;
        const sourceFaces = facesOf(oc, shapes[i]!);
        if (!source.faceIndices?.length) {
          for (const face of sourceFaces) {
            sewing.Add(face);
            addedFaces.push(face);
          }
          continue;
        }
        for (const index of source.faceIndices) {
          if (!source.brepJson.faces[index])
            throw new Error(
              `sew: face index ${index} out of range (${source.brepJson.faces.length} faces)`,
            );
          const face = liveFaceForJsonIndex(
            oc,
            sourceFaces,
            source.brepJson,
            index,
          );
          if (!face) throw new Error(`sew: face index ${index} did not map`);
          sewing.Add(face);
          addedFaces.push(face);
        }
      }
      withProgressRange(oc, (pr) => sewing.Perform(pr));
      unstitchedEdges =
        (sewing as unknown as { NbFreeEdges?: () => number }).NbFreeEdges?.() ??
        0;
      const sewedShape = sewing.SewedShape();
      const sewedFaces = facesOf(oc, sewedShape);
      const shells = collectSubShapes(
        oc,
        sewedShape,
        oc.TopAbs_ShapeEnum.TopAbs_SHELL as typeof oc.TopAbs_ShapeEnum,
      );
      shellCount = shells.length;
      const shellShape = sewedFaces.length
        ? shellCount === 1
          ? shells[0]!
          : shellCount > 0
            ? sewedShape
            : shellFromFaceList(oc, sewedFaces)
        : shellFromFaceList(oc, addedFaces);
      if (!shellCount) shellCount = 1;
      if (!payload.makeSolid) return copyResultShape(oc, shellShape);
      if (shellCount !== 1)
        throw new Error(
          `sew: solid conversion needs one closed shell, got ${shellCount}`,
        );
      const shell = asShell(oc, shellShape);
      const maker = track(new oc.BRepBuilderAPI_MakeSolid_3(shell));
      if (!maker.IsDone())
        throw new Error("sew: shell is not closed, cannot make a solid");
      const solid = maker.Solid();
      try {
        oc.BRepLib.OrientClosedSolid(solid);
      } catch {
        // Orientation is a repair pass; the sewn solid remains usable.
      }
      return copyResultShape(oc, solid);
    });
    const result = finishWorldResult(oc, sewn, {
      position: { x: 0, y: 0, z: 0 },
    });
    sewn.delete();
    return { ...result, unstitchedEdges, shellCount };
  } finally {
    for (const shape of shapes) shape.delete();
  }
}

function fillCapFromBoundary(
  oc: OpenCascadeInstance,
  track: <T extends { delete(): void }>(obj: T) => T,
  boundary: TopoDS_Wire,
): TopoDS_Face {
  const mf = track(
    new oc.BRepOffsetAPI_MakeFilling(
      5,
      15,
      2,
      false,
      1e-3,
      1e-3,
      0.001,
      0.01,
      15,
      8,
    ),
  );
  const edges = [
    ...iterSubShapes(
      oc,
      boundary,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
    ),
  ];
  if (!edges.length) throw new Error("deleteFace: boundary has no edges");
  for (const e of edges)
    mf.Add_1(
      asEdge(oc, e),
      oc.GeomAbs_Shape.GeomAbs_C0 as typeof oc.GeomAbs_Shape,
      true,
    );
  withProgressRange(oc, (pr) => mf.Build(pr));
  if (!mf.IsDone())
    throw new Error("deleteFace: fill cap failed (non-planar boundary)");
  return track(asFace(oc, mf.Shape()));
}

/*
 * Extend-surface: build a ruled strip from each selected boundary edge to a
 * translated copy, then sew the strips back onto the source face. This is the
 * linear (G0) construction; natural/curvature-continuous extension is not
 * approximated silently.
 */
export function handleSurfaceExtend(
  oc: OpenCascadeInstance,
  payload: SurfaceExtendRequest["payload"],
): WorkerGeometryResult {
  if (!(payload.distance > 0))
    throw new Error("surfaceExtend: distance must be > 0");
  if (!payload.edgeIndices.length)
    throw new Error("surfaceExtend: no edges selected");
  const mode = payload.mode ?? "linear";
  if (mode !== "linear")
    throw new Error(
      `surfaceExtend: ${mode} extension is not implemented; use linear`,
    );
  const tolerance = payload.tolerance ?? 1e-6;
  if (!(tolerance > 0)) throw new Error("surfaceExtend: tolerance must be > 0");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const built = withOccScope((track) => {
      const faces = facesOf(oc, worldShape);
      if (!faces.length) throw new Error("surfaceExtend: source has no faces");
      const edgeMap = track(mapEdgesIndexed(oc, worldShape));
      const strips: TopoDS_Shape[] = [];
      for (const index of payload.edgeIndices) {
        if (index < 1 || index > edgeMap.size)
          throw new Error(
            `surfaceExtend: edge index ${index} out of range (${edgeMap.size})`,
          );
        const edge = edgeMap.edgeAt(index);
        let host: TopoDS_Face | null = null;
        for (const candidate of faces) {
          for (const sub of iterSubShapes(
            oc,
            candidate,
            oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
          )) {
            if (asEdge(oc, sub).IsSame(edge)) {
              host = candidate;
              break;
            }
          }
          if (host) break;
        }
        if (!host)
          throw new Error(
            `surfaceExtend: edge ${index} is not on a face of the source`,
          );
        const wire = track(makeWireFromEdge(oc, edge));
        const curve = track(new oc.BRepAdaptor_Curve_2(edge));
        const a = curve.Value(curve.FirstParameter());
        const b = curve.Value(curve.LastParameter());
        const ax = a.X(),
          ay = a.Y(),
          az = a.Z();
        const bx = b.X(),
          by = b.Y(),
          bz = b.Z();
        let tx = bx - ax,
          ty = by - ay,
          tz = bz - az;
        const tl = Math.hypot(tx, ty, tz);
        if (!(tl > 1e-12))
          throw new Error(`surfaceExtend: edge ${index} has zero length`);
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const mid = { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 };
        const center = computeBoundingBoxCenter(oc, host);
        let ox = mid.x - center.x,
          oy = mid.y - center.y,
          oz = mid.z - center.z;
        const along = ox * tx + oy * ty + oz * tz;
        ox -= tx * along;
        oy -= ty * along;
        oz -= tz * along;
        let ol = Math.hypot(ox, oy, oz);
        if (!(ol > 1e-12)) {
          // Degenerate face center: pick any vector perpendicular to the edge.
          const gx = Math.abs(tx) < 0.9 ? 1 : 0;
          const gy = gx === 0 ? 1 : 0;
          ox = ty * 0 - tz * gy;
          oy = tz * gx - tx * 0;
          oz = tx * gy - ty * gx;
          ol = Math.hypot(ox, oy, oz);
        }
        const tr = track(new oc.gp_Trsf_1());
        tr.SetTranslation_1(
          makeVec(
            oc,
            (ox / ol) * payload.distance,
            (oy / ol) * payload.distance,
            (oz / ol) * payload.distance,
          ),
        );
        const moved = track(asWire(oc, applyTransform(oc, wire, tr, true)));
        const ts = track(new oc.BRepOffsetAPI_ThruSections(false, true, 1e-6));
        ts.AddWire(wire);
        ts.AddWire(moved);
        withProgressRange(oc, (pr) => ts.Build(pr));
        if (!ts.IsDone())
          throw new Error(`surfaceExtend: ruled strip failed on edge ${index}`);
        strips.push(track(ts.Shape()));
      }
      const sewing = track(
        new oc.BRepBuilderAPI_Sewing(tolerance, false, true, true, false),
      );
      for (const face of faces) sewing.Add(face);
      for (const strip of strips)
        for (const face of facesOf(oc, strip)) sewing.Add(face);
      withProgressRange(oc, (pr) => sewing.Perform(pr));
      const sewed = sewing.SewedShape();
      const sewedFaces = facesOf(oc, sewed);
      const shells = collectSubShapes(
        oc,
        sewed,
        oc.TopAbs_ShapeEnum.TopAbs_SHELL as typeof oc.TopAbs_ShapeEnum,
      );
      return copyResultShape(
        oc,
        sewedFaces.length
          ? shells.length
            ? sewed
            : shellFromFaceList(oc, sewedFaces)
          : shellFromFaceList(oc, [
              ...faces,
              ...strips.flatMap((strip) => facesOf(oc, strip)),
            ]),
      );
    });
    try {
      return finishWorldResult(oc, built, payload);
    } finally {
      built.delete();
    }
  } finally {
    worldShape.delete();
  }
}

/*
 * Delete-face + heal: remove the selected faces, re-cap each planar boundary
 * via sewing the remaining shell plus a planar fill of the hole wire, and
 * rebuild the solid. Non-planar boundaries fail MakeSolid cleanly. Adjacent
 * face merge (Onshape's true heal) deferred.
 */
export function handleDeleteFace(
  oc: OpenCascadeInstance,
  payload: DeleteFaceRequest["payload"],
): WorkerGeometryResult {
  if (!payload.faceIndices.length)
    throw new Error("deleteFace: no faces selected");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const faces = facesOf(oc, worldShape);
  for (const i of payload.faceIndices) {
    if (!payload.brepJson.faces[i])
      throw new Error(
        `deleteFace: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
      );
  }
  if (payload.faceIndices.length >= faces.length)
    throw new Error("deleteFace: cannot delete every face");
  const healed = withOccScope((track) => {
    const del = new Set(payload.faceIndices);
    const BRepTools = (
      oc as unknown as {
        BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
      }
    ).BRepTools;
    const sewing = track(
      new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false),
    );
    const liveFor = new Map<number, TopoDS_Face>();
    for (const i of del) {
      const lf = liveFaceForJsonIndex(oc, faces, payload.brepJson, i);
      if (lf) liveFor.set(i, lf);
    }
    const liveSet = new Set(liveFor.values());
    faces.forEach((f) => {
      if (!liveSet.has(f)) sewing.Add(f);
    });
    for (const i of del) {
      const wire = track(BRepTools.OuterWire(liveFor.get(i) ?? faces[i]!));
      if (!wire) throw new Error(`deleteFace: face ${i} has no outer wire`);
      let cap: TopoDS_Face;
      try {
        cap = track(makePlanarFace(oc, wire));
      } catch {
        cap = track(fillCapFromBoundary(oc, track, wire));
      }
      sewing.Add(cap);
    }
    withProgressRange(oc, (pr) => sewing.Perform(pr));
    const sewed = track(asShell(oc, sewing.SewedShape()));
    const mk = track(new oc.BRepBuilderAPI_MakeSolid_3(sewed));
    if (!mk.IsDone())
      throw new Error(
        "deleteFace: healed shell not closed (non-planar boundary?)",
      );
    let healedSolid: TopoDS_Shape = mk.Solid();
    if (payload.mergeAdjacent !== false) {
      try {
        const Upgrade = (
          oc as unknown as {
            ShapeUpgrade_UnifySameDomain_2: new (
              s: TopoDS_Shape,
              edges: boolean,
              faces: boolean,
              bsplines: boolean,
            ) => { Build(): void; Shape(): TopoDS_Shape; delete(): void };
          }
        ).ShapeUpgrade_UnifySameDomain_2;
        const unify = track(new Upgrade(healedSolid, true, true, true));
        unify.Build();
        healedSolid = unify.Shape();
      } catch {
        // Unification is a cleanup pass; the healed solid is still valid if
        // this OCC build does not expose ShapeUpgrade.
      }
    }
    return fixShape(oc, healedSolid);
  });
  const result = finishWorldResult(oc, healed, payload);
  healed.delete();
  worldShape.delete();
  return result;
}

export function handleReplaceFace(
  oc: OpenCascadeInstance,
  payload: ReplaceFaceRequest["payload"],
): WorkerGeometryResult {
  if (!payload.faceIndices.length)
    throw new Error("replaceFace: no faces selected");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  const replacementShape = buildWorldShape(
    oc,
    payload.replacementBrepJson,
    payload.replacementPosition,
    payload.replacementOccBrep,
    payload.replacementRotation,
  );
  try {
    const faces = facesOf(oc, worldShape);
    const replacementFaces = facesOf(oc, replacementShape);
    for (const i of payload.faceIndices) {
      if (!payload.brepJson.faces[i])
        throw new Error(
          `replaceFace: face index ${i} out of range (${payload.brepJson.faces.length} faces)`,
        );
    }
    const replacement =
      replacementFaces[payload.replacementFaceIndex ?? 0] ??
      replacementFaces[0];
    if (!replacement)
      throw new Error("replaceFace: replacement surface has no faces");
    const targetFaces = new Set(
      payload.faceIndices
        .map((i) => liveFaceForJsonIndex(oc, faces, payload.brepJson, i))
        .filter((face): face is TopoDS_Face => face !== null),
    );
    if (!targetFaces.size)
      throw new Error("replaceFace: target face not resolved");
    const replaced = withOccScope((track) => {
      const sewing = track(
        new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false),
      );
      faces.forEach((face) => {
        if (!targetFaces.has(face)) sewing.Add(face);
      });
      sewing.Add(replacement);
      withProgressRange(oc, (pr) => sewing.Perform(pr));
      const shell = track(asShell(oc, sewing.SewedShape()));
      const mk = track(new oc.BRepBuilderAPI_MakeSolid_3(shell));
      if (!mk.IsDone())
        throw new Error("replaceFace: sewn shell is not closed");
      return fixShape(oc, mk.Solid());
    });
    const result = finishWorldResult(oc, replaced, payload);
    replaced.delete();
    return result;
  } finally {
    worldShape.delete();
    replacementShape.delete();
  }
}

export function handleTransform(
  oc: OpenCascadeInstance,
  payload: TransformRequest["payload"],
): WorkerGeometryResult {
  const m = payload.matrix;
  if (!Array.isArray(m) || m.length !== 16)
    throw new Error("transform: matrix must have 16 elements");
  for (const v of m) {
    if (!Number.isFinite(v)) throw new Error("transform: matrix is not finite");
  }
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  try {
    const moved = withOccScope((track) => {
      const trsf = track(new oc.gp_Trsf_1());
      // three.js Matrix4.elements is column-major; gp_Trsf.SetValues is the
      // 3x4 row-major affine (rotation + translation).
      trsf.SetValues(
        m[0]!,
        m[4]!,
        m[8]!,
        m[12]!,
        m[1]!,
        m[5]!,
        m[9]!,
        m[13]!,
        m[2]!,
        m[6]!,
        m[10]!,
        m[14]!,
      );
      // Do not track the result: withOccScope deletes tracked shapes when it
      // returns, and the caller still needs `moved` for finishWorldResult.
      return applyTransform(oc, worldShape, trsf, true);
    });
    try {
      return finishWorldResult(oc, moved, payload);
    } finally {
      moved.delete();
    }
  } finally {
    worldShape.delete();
  }
}

export function handleHole(
  oc: OpenCascadeInstance,
  payload: HoleRequest["payload"],
): WorkerGeometryResult {
  if (!payload.centers.length) throw new Error("hole: no centers");
  const worldShape = buildWorldShape(
    oc,
    payload.brepJson,
    payload.position,
    payload.occBrep,
    payload.rotation,
  );
  let host = worldShape;
  let owned = false;
  try {
    for (const center of payload.centers) {
      const drill = withOccScope((track) => {
        const start = track(
          new oc.gp_Pnt_3(
            center.x - payload.axisDir.x * payload.overdrive,
            center.y - payload.axisDir.y * payload.overdrive,
            center.z - payload.axisDir.z * payload.overdrive,
          ),
        );
        const ax = track(
          makeAxis2(
            oc,
            start,
            makeDir(
              oc,
              payload.axisDir.x,
              payload.axisDir.y,
              payload.axisDir.z,
            ),
          ),
        );
        const height = payload.length + payload.overdrive;
        if (payload.taperPerLength && payload.taperPerLength > 0) {
          type ConeMaker = {
            Build: (pr: import("opencascade.js").Message_ProgressRange) => void;
            IsDone: () => boolean;
            Shape: () => TopoDS_Shape;
          };
          const ctor = (
            oc as unknown as {
              BRepPrimAPI_MakeCone_1?: new (
                ax: import("opencascade.js").gp_Ax2,
                r1: number,
                r2: number,
                height: number,
              ) => ConeMaker;
            }
          ).BRepPrimAPI_MakeCone_1;
          if (!ctor)
            throw new Error(
              "hole: tapered hole needs BRepPrimAPI_MakeCone; this OCC build lacks it",
            );
          const r2 = Math.max(
            payload.radius - payload.taperPerLength * height,
            1e-5,
          );
          const cone = new ctor(ax, payload.radius, r2, height);
          withProgressRange(oc, (pr) => cone.Build(pr));
          if (!cone.IsDone()) throw new Error("hole: tapered drill failed");
          return cone.Shape();
        }
        const circ = track(makeCircle(oc, ax, payload.radius));
        const edgeBuilder = track(new oc.BRepBuilderAPI_MakeEdge_8(circ));
        if (!edgeBuilder.IsDone()) throw new Error("hole: circle edge failed");
        const wire = track(makeWireFromEdge(oc, edgeBuilder.Edge()));
        const face = track(makePlanarFace(oc, wire));
        return extrudeShapeHelper(oc, face, height, 1);
      });
      let cut = booleanDifferenceHelper(oc, host, drill);
      drill.delete();
      if (payload.holeType === "COUNTERSINK") {
        const half = ((payload.countersinkAngleDeg ?? 90) * Math.PI) / 360;
        const h = Math.max(
          payload.radius / Math.tan(half),
          payload.radius * 0.5,
        );
        const cone = withOccScope((track) => {
          type ConeMaker = {
            Build: (pr: import("opencascade.js").Message_ProgressRange) => void;
            IsDone: () => boolean;
            Shape: () => TopoDS_Shape;
          };
          const ctor = (
            oc as unknown as {
              BRepPrimAPI_MakeCone_1?: new (
                ax: import("opencascade.js").gp_Ax2,
                r1: number,
                r2: number,
                height: number,
              ) => ConeMaker;
            }
          ).BRepPrimAPI_MakeCone_1;
          if (!ctor)
            throw new Error(
              "hole: countersink needs BRepPrimAPI_MakeCone; this OCC build lacks it",
            );
          const ax = track(
            makeAxis2(
              oc,
              track(makePoint(oc, center.x, center.y, center.z)),
              track(
                makeDir(
                  oc,
                  payload.axisDir.x,
                  payload.axisDir.y,
                  payload.axisDir.z,
                ),
              ),
            ),
          );
          const cone = new ctor(
            ax,
            payload.radius + h * Math.tan(half),
            payload.radius,
            h,
          );
          withProgressRange(oc, (pr) => cone.Build(pr));
          if (!cone.IsDone()) throw new Error("hole: countersink cone failed");
          return cone.Shape();
        });
        const withCone = booleanDifferenceHelper(oc, cut, cone);
        cone.delete();
        cut.delete();
        cut = withCone;
      }
      if (owned) host.delete();
      host = cut;
      owned = true;
    }
    const result = finishWorldResult(oc, host, payload);
    if (owned) host.delete();
    worldShape.delete();
    return result;
  } catch (e) {
    if (owned) host.delete();
    worldShape.delete();
    throw e;
  }
}
