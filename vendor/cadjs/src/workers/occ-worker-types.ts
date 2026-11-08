/**
 * Type definitions for OCC Web Worker communication.
 * All THREE.js types are replaced with plain {x,y,z} / typed arrays.
 * All BRep classes are replaced with JSON serialization.
 */

import type { BrepJSON, CompoundBrepJSON } from "../geometry";
import type {
  SketchPrimitive,
  SketchConstraint,
  SketchPlane,
} from "../types/sketch-types";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface EulerJSON {
  x: number;
  y: number;
  z: number;
  order: string;
}

export interface WorkerRequestBase {
  id: string;
  type: string;
}

// Heavy geometry operations
export interface ExtrudeRequest extends WorkerRequestBase {
  type: "extrude";
  payload: {
    brepJson: BrepJSON;
    depth: number;
    direction: number;
    normalVec?: Vec3 | undefined;
    sourceOccBrep?: string | undefined;
    symmetric?: boolean | undefined;
    /** Taper the lateral walls (degrees). 0/undefined = straight. */
    draftAngleDeg?: number | undefined;
    /** Neutral-plane point in profile-local coordinates. */
    draftNeutralPoint?: Vec3 | undefined;
    /** Neutral-plane normal in world coordinates. */
    draftNeutralNormal?: Vec3 | undefined;
    /** NEUTRAL keeps one plane; PARTING flips the angle by face side. */
    draftMode?: "NEUTRAL" | "PARTING" | undefined;
    /** Selected parting edge (profile-local coordinates). */
    draftPartingLine?: { start: Vec3; end: Vec3 } | undefined;
    /** Hollow the extrusion into a constant-wall feature. */
    thinWall?: number | undefined;
    /** Closed wall loop for an open sketch profile (built model-side). */
    ribbonPoints?: Vec3[] | undefined;
  };
}

export interface SweepRequest extends WorkerRequestBase {
  type: "sweep";
  payload: {
    brepJson: BrepJSON;
    profilePosition: Vec3;
    pathPoints: Vec3[];
    /** Path approximation tolerance in document units. */
    chordalTolerance?: number | undefined;
    /** One auxiliary spine (guide curve) in world space. */
    guidePoints?: Vec3[] | undefined;
    /** Two or more guide rails in world space; drives constrained sections. */
    guideCurves?: Vec3[][] | undefined;
    /** Hollow the swept solid into a constant-wall feature. */
    thinWall?: number | undefined;
    options?:
      | {
          orientation: "perpendicular" | "parallel";
          cornerMode: "right" | "round";
          /** Total twist from path start to end, in radians. */
          twistRadians?: number | undefined;
          /** Path approximation tolerance in document units. */
          chordalTolerance?: number | undefined;
        }
      | undefined;
    sourceOccBrep?: string | undefined;
  };
}

export interface LoftRequest extends WorkerRequestBase {
  type: "loft";
  payload: {
    profiles: Array<{
      brepJson: BrepJSON;
      position: Vec3;
      occBrep?: string | undefined;
    }>;
    isRuled?: boolean | undefined;
    /** Close the last section back onto the first (periodic loft). */
    isClosed?: boolean | undefined;
    /** Hollow the loft into a constant-wall feature. */
    thinWall?: number | undefined;
    /** Total twist from first to last section, in radians. */
    twistRadians?: number | undefined;
    /** Per-section seam points (world) that drive connector alignment. */
    connectors?: Array<Vec3 | undefined> | undefined;
    /** Centerline (spine) points in world space; switches to a pipe shell. */
    centerlinePoints?: Vec3[] | undefined;
  };
}

export interface RevolveRequest extends WorkerRequestBase {
  type: "revolve";
  payload: {
    brepJson: BrepJSON;
    profilePosition: Vec3;
    axisOrigin: Vec3;
    axisDir: Vec3;
    angleRadians?: number | undefined;
    sourceOccBrep?: string | undefined;
    direction?: "one" | "two" | "symmetric" | undefined;
    angleRadians2?: number | undefined;
    /** Hollow the revolved solid into a constant-wall feature. */
    thinWall?: number | undefined;
    /** Corner join used by the thin-wall profile offset. */
    cornerType?: "ROUNDED" | "CONICAL" | "TRANSITIONAL" | undefined;
  };
}

export interface FilletRequest extends WorkerRequestBase {
  type: "fillet";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    edgeIndices: number[];
    radius: number;
    radii?: number[] | undefined;
    /** RATIONAL (circular), QUASI_ANGULAR or POLYNOMIAL blend section. */
    section?: "RATIONAL" | "QUASI_ANGULAR" | "POLYNOMIAL" | undefined;
    /** Per-edge start/end radius; overrides `radius`/`radii` when present. */
    variableRadii?: Array<{ start: number; end: number }> | undefined;
    /** Smaller radius applied at contour vertices for corner treatment. */
    cornerRadius?: number | undefined;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
  };
}

export interface ChamferRequest extends WorkerRequestBase {
  type: "chamfer";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    edgeIndices: number[];
    distance: number;
    distances?: number[] | undefined;
    mode?: "DIST_DISTS" | "DIST_ANG" | "ANG_DISTS" | "SYM_DISTS" | undefined;
    angleDeg?: number | undefined;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
  };
}

export interface BooleanRequest extends WorkerRequestBase {
  type: "boolean";
  payload: {
    operation: "union" | "difference" | "intersection";
    operands: Array<{
      brepJson: BrepJSON;
      position: Vec3;
      occBrep?: string | undefined;
      isCompound?: boolean | undefined;
      compoundBrepJson?: CompoundBrepJSON | undefined;
      rotation?: EulerJSON | undefined;
    }>;
    options?:
      | {
          targetId?: string | undefined;
          toolIds?: string[] | undefined;
          keepTools?: boolean | undefined;
          makeSolid?: boolean | undefined;
        }
      | undefined;
  };
}

export interface InterferenceRequest extends WorkerRequestBase {
  type: "interference";
  payload: {
    a: {
      brepJson: BrepJSON;
      position: Vec3;
      occBrep?: string | undefined;
      rotation?: EulerJSON | undefined;
    };
    b: {
      brepJson: BrepJSON;
      position: Vec3;
      occBrep?: string | undefined;
      rotation?: EulerJSON | undefined;
    };
  };
}

// Edge analysis (for fillet/revolve/measure overlays)
export interface EdgeAnalysisRequest extends WorkerRequestBase {
  type: "edgeAnalysis";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    allEdges?: boolean | undefined;
  };
}

// Preview geometry (extrude preview)
export interface PreviewGeometryRequest extends WorkerRequestBase {
  type: "previewGeometry";
  payload: {
    brepJson: BrepJSON;
    sourceOccBrep?: string | undefined;
    normalVec?: Vec3 | undefined;
  };
}

// Sketch conversion
export interface SketchToBrepRequest extends WorkerRequestBase {
  type: "sketchToBrep";
  payload: {
    primitives: SketchPrimitive[];
    plane: SketchPlane;
  };
}

export interface SketchToProfilesRequest extends WorkerRequestBase {
  type: "sketchToProfiles";
  payload: {
    primitives: SketchPrimitive[];
    plane: SketchPlane;
    sketchId: string;
  };
}

// Profile processing (edge/vertex extraction for visualization)
export interface ProcessProfileRequest extends WorkerRequestBase {
  type: "processProfile";
  payload: {
    brepJson: BrepJSON;
    occBrep?: string | undefined;
  };
}

// Compound unification
export interface UnifyCompoundRequest extends WorkerRequestBase {
  type: "unifyCompound";
  payload: {
    childrenBrepJson: BrepJSON[];
  };
}

// Import/Export
export type FileFormat = "stl" | "step" | "iges";

export interface ImportFileRequest extends WorkerRequestBase {
  type: "importFile";
  payload: {
    fileBytes: Uint8Array;
    format: FileFormat;
    fileName?: string | undefined;
  };
}

export interface ExportFileRequest extends WorkerRequestBase {
  type: "exportFile";
  payload: {
    elements: Array<{
      brepJson: BrepJSON;
      position: Vec3;
      occBrep?: string | undefined;
      rotation?: EulerJSON | undefined;
      name?: string | undefined;
      color?: string | undefined;
    }>;
    format: FileFormat;
  };
}

// Measure operations
export interface EdgeLengthRequest extends WorkerRequestBase {
  type: "edgeLength";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    edgeIndex: number;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
  };
}

export interface EdgeDirectionRequest extends WorkerRequestBase {
  type: "edgeDirection";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    edgeIndex: number;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
  };
}

// Sketch wire (for sweep path)
export interface SketchToWireRequest extends WorkerRequestBase {
  type: "sketchToWire";
  payload: {
    primitives: SketchPrimitive[];
    plane: SketchPlane;
  };
}

// Control messages
export interface CancelRequest extends WorkerRequestBase {
  type: "__cancel";
  payload: { targetId: string };
}

export interface InitRequest extends WorkerRequestBase {
  type: "__init";
  payload?:
    | {
        /** URL/path to opencascade.full.wasm. Required: the worker has no static reference. */
        wasmUrl?: string | undefined;
      }
    | undefined;
}

export interface ShellRequest extends WorkerRequestBase {
  type: "shell";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndices: number[];
    thickness: number;
    thicknesses?: number[] | undefined;
    keepType?: "KEEP_SHELL" | "KEEP_CORE" | undefined;
    /** Use MakeThickSolid for non-planar caps (slow in wasm). */
    curvedCap?: boolean | undefined;
  };
}

export interface DraftRequest extends WorkerRequestBase {
  type: "draft";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndices: number[];
    angleDeg: number;
    neutralNormal: Vec3;
    neutralPoint: Vec3;
    /** Selected parting edge; its start point overrides neutralPoint. */
    partingLine?: { start: Vec3; end: Vec3 } | undefined;
    mode?: "NEUTRAL" | "STEP" | "PARTING" | undefined;
  };
}

export interface PatternRequest extends WorkerRequestBase {
  type: "pattern";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    kind: "circular" | "linear" | "curve" | "body" | "face";
    count: number;
    faceIndices?: number[] | undefined;
    /** Instance ordinals (1-based) suppressed by the user. */
    skip?: number[] | undefined;
    axisOrigin?: Vec3 | undefined;
    axisDir?: Vec3 | undefined;
    angleRad?: number | undefined;
    translation?: Vec3 | undefined;
    pathPoints?: Vec3[] | undefined;
    align?: boolean | undefined;
    separate?: boolean | undefined;
  };
}

export interface PatternPiecesResult {
  results: WorkerGeometryResult[];
}

export interface ProjectCurvesRequest extends WorkerRequestBase {
  type: "projectCurves";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    targetBrepJson: BrepJSON;
    targetPosition: Vec3;
    targetOccBrep?: string | undefined;
    edgeIndices: number[];
    direction: Vec3;
  };
}

export interface SurfaceOpRequest extends WorkerRequestBase {
  type: "surfaceOp";
  payload: {
    kind:
      | "ruled"
      | "fill"
      | "offset"
      | "boundary"
      | "constrained"
      | "fitSpline"
      | "enclose";
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    edgeIndices?: number[] | undefined;
    faceIndex?: number | undefined;
    distance?: number | undefined;
    points?: Vec3[] | undefined;
  };
}

export interface SplitRequest extends WorkerRequestBase {
  type: "split";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    planeOrigin: Vec3;
    planeNormal: Vec3;
    keep?: "positive" | "negative" | "both" | undefined;
    splitBy?: "plane" | "surface" | undefined;
    toolBrepJson?: BrepJSON | undefined;
    toolPosition?: Vec3 | undefined;
    toolOccBrep?: string | undefined;
  };
}

export interface SplitBothResult {
  primary: WorkerGeometryResult;
  secondary: WorkerGeometryResult;
}

export interface ThickenRequest extends WorkerRequestBase {
  type: "thicken";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndices: number[];
    thickness: number;
  };
}

export interface SewSource {
  brepJson: BrepJSON;
  position: Vec3;
  occBrep?: string | undefined;
  rotation?: EulerJSON | undefined;
  /** Selected faces to include; omitted means every face of the source. */
  faceIndices?: number[] | undefined;
}

export interface SewRequest extends WorkerRequestBase {
  type: "sew";
  payload: {
    sources: SewSource[];
    tolerance?: number | undefined;
    makeSolid?: boolean | undefined;
    mergeFaces?: boolean | undefined;
    sewFreeEdges?: boolean | undefined;
    sewSharedEdges?: boolean | undefined;
    /** Allow a single source and return its sewn shell (solid-to-surface). */
    extractShell?: boolean | undefined;
  };
}

export interface SurfaceExtendRequest extends WorkerRequestBase {
  type: "surfaceExtend";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    /** One-based edge indices into the source body. */
    edgeIndices: number[];
    distance: number;
    mode?: "linear" | "natural" | undefined;
    tolerance?: number | undefined;
  };
}

export interface MoveFaceRequest extends WorkerRequestBase {
  type: "moveFace";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndex: number;
    faceIndices?: number[] | undefined;
    distance: number;
    extendNeighbors?: boolean | undefined;
  };
}

export interface HemRequest extends WorkerRequestBase {
  type: "hem";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    origin: Vec3;
    bendDir: Vec3;
    bendLineDir: Vec3;
    thickness: number;
    lip?: number | undefined;
    relief?: number | undefined;
    radius?: number | undefined;
  };
}

export interface WrapRequest extends WorkerRequestBase {
  type: "wrapCurves";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    axisOrigin: Vec3;
    axisDir: Vec3;
    radius: number;
    polylines: number[][][];
    /** CURVE projects wires; CUT/EMBOSS sweep a bead and boolean it. */
    operation?: "CURVE" | "CUT" | "EMBOSS" | undefined;
    depth?: number | undefined;
    width?: number | undefined;
  };
}

export interface ThreadRequest extends WorkerRequestBase {
  type: "thread";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    origin: Vec3;
    axisDir: Vec3;
    radius: number;
    pitch: number;
    height: number;
    depth: number;
    kind: "external" | "internal";
    crown?: number | undefined;
    taperPerLength?: number | undefined;
    /** Sweep a true helical ridge instead of stacked torus grooves. */
    helical?: boolean | undefined;
    /** Axial length of the 45-degree chamfer at each thread end. */
    endChamfer?: number | undefined;
    /** Shallow visual thread instead of a full-depth modeled thread. */
    cosmetic?: boolean | undefined;
  };
}

export interface SectionRequest extends WorkerRequestBase {
  type: "section";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    planeOrigin: Vec3;
    planeNormal: Vec3;
  };
}

export interface DeleteFaceRequest extends WorkerRequestBase {
  type: "deleteFace";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndices: number[];
    mergeAdjacent?: boolean | undefined;
  };
}

export interface ReplaceFaceRequest extends WorkerRequestBase {
  type: "replaceFace";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndices: number[];
    replacementBrepJson: BrepJSON;
    replacementPosition: Vec3;
    replacementOccBrep?: string | undefined;
    replacementRotation?: EulerJSON | undefined;
    replacementFaceIndex?: number | undefined;
  };
}

export interface TransformRequest extends WorkerRequestBase {
  type: "transform";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    /** 4x4 column-major transform (three.js Matrix4.elements). */
    matrix: number[];
  };
}

export interface HoleRequest extends WorkerRequestBase {
  type: "hole";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    centers: Vec3[];
    axisDir: Vec3;
    radius: number;
    length: number;
    overdrive: number;
    holeType?: "SIMPLE" | "COUNTERBORE" | "COUNTERSINK" | undefined;
    countersinkAngleDeg?: number | undefined;
    taperPerLength?: number | undefined;
  };
}

export interface FlangeRequest extends WorkerRequestBase {
  type: "flange";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    origin: Vec3;
    bendDir: Vec3;
    bendLineDir: Vec3;
    angle: number;
    thickness: number;
    relief: number;
    length?: number | undefined;
    width?: number | undefined;
    radius?: number | undefined;
  };
}

export type WorkerRequest =
  | ExtrudeRequest
  | SweepRequest
  | LoftRequest
  | RevolveRequest
  | FilletRequest
  | ChamferRequest
  | BooleanRequest
  | InterferenceRequest
  | EdgeAnalysisRequest
  | PreviewGeometryRequest
  | SketchToBrepRequest
  | SketchToProfilesRequest
  | ProcessProfileRequest
  | UnifyCompoundRequest
  | ImportFileRequest
  | ExportFileRequest
  | EdgeLengthRequest
  | EdgeDirectionRequest
  | SketchToWireRequest
  | ShellRequest
  | DraftRequest
  | PatternRequest
  | ProjectCurvesRequest
  | SurfaceOpRequest
  | ThreadRequest
  | HemRequest
  | WrapRequest
  | MoveFaceRequest
  | SectionRequest
  | ThickenRequest
  | SewRequest
  | SurfaceExtendRequest
  | SplitRequest
  | TransformRequest
  | DeleteFaceRequest
  | ReplaceFaceRequest
  | FlangeRequest
  | HoleRequest
  | CancelRequest
  | InitRequest;

export interface WorkerResponse {
  id: string;
  status: "success" | "error" | "cancelled";
  result?: unknown;
  error?: string | undefined;
}

export interface WorkerSewResult extends WorkerGeometryResult {
  /** Edges the sewing operation could not join at the requested tolerance. */
  unstitchedEdges: number;
  /** Shells produced by the sew; a solid conversion requires exactly one. */
  shellCount: number;
}

export interface WorkerGeometryResult {
  brepJson: BrepJSON;
  positionOffset: Vec3;
  occBrep?: string | undefined;
  edgePositions?: Float32Array | undefined;
  vertexPositions?: Float32Array | undefined;
  faceGeometry?:
    | { positions: Float32Array; indices: Uint32Array; normals: Float32Array }
    | undefined;
}

export interface WorkerInterferenceResult {
  /** Intersection volume in model units. Zero means no solid intersection. */
  volume: number;
}

export interface WorkerBooleanResult {
  brepJson: BrepJSON;
  position: Vec3;
  occBrep?: string | undefined;
  edgePositions?: Float32Array | undefined;
  vertexPositions?: Float32Array | undefined;
  faceGeometry?:
    | { positions: Float32Array; indices: Uint32Array; normals: Float32Array }
    | undefined;
  compoundBrepJson?: CompoundBrepJSON | undefined;
  removedNodeIds: string[];
}

export interface WorkerEdgeAnalysisResult {
  edges: Array<{
    edgeIndex: number;
    segments: Float32Array;
    midpoint: Vec3;
  }>;
}

export interface WorkerPreviewResult {
  faceGeometry: {
    positions: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
  };
}

export interface WorkerSketchBrepResult {
  brepJson: BrepJSON;
  /** Exact OCC shape for the sketch, preserving inner wires/holes. */
  occBrep?: string | undefined;
}

export interface WorkerSketchProfilesResult {
  profiles: Array<{
    id: string;
    brepJson: BrepJSON;
    area: number;
    isOuter: boolean;
    center: Vec3;
    occBrep?: string | undefined;
  }>;
  success: boolean;
}

export interface WorkerProcessProfileResult {
  edgePositions?: Float32Array | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
}

export interface WorkerImportResult {
  elements: Array<{
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    edgePositions?: Float32Array | undefined;
    vertexPositions?: Float32Array | undefined;
    name?: string | undefined;
    color?: string | undefined;
  }>;
}

export interface WorkerExportResult {
  fileBytes: Uint8Array;
}

export interface WorkerEdgeLengthResult {
  length: number;
}

export interface WorkerEdgeDirectionResult {
  direction: Vec3;
}

export interface WorkerSketchWireResult {
  points: Vec3[];
}
