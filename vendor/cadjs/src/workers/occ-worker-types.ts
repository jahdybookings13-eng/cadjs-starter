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
  };
}

export interface SweepRequest extends WorkerRequestBase {
  type: "sweep";
  payload: {
    brepJson: BrepJSON;
    profilePosition: Vec3;
    pathPoints: Vec3[];
    options?:
      | {
          orientation: "perpendicular" | "parallel";
          cornerMode: "right" | "round";
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
        }
      | undefined;
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
export type FileFormat = "stl" | "step";

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
  };
}

export interface PatternRequest extends WorkerRequestBase {
  type: "pattern";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    kind: "circular" | "linear" | "curve";
    count: number;
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

export interface MoveFaceRequest extends WorkerRequestBase {
  type: "moveFace";
  payload: {
    brepJson: BrepJSON;
    position: Vec3;
    occBrep?: string | undefined;
    rotation?: EulerJSON | undefined;
    faceIndex: number;
    distance: number;
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
  | SplitRequest
  | DeleteFaceRequest
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
