import type { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type {
  WorkerGeometryResult,
  WorkerSewResult,
} from "../workers/occ-worker-types";
import { toVec3, toEulerJSON } from "../vectorHelpers";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";
import type { Vec3 } from "../workers/occ-worker-types";

export interface ParityResult {
  brep: Brep;
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

async function run(
  type:
    | "shell"
    | "draft"
    | "pattern"
    | "projectCurves"
    | "surfaceOp"
    | "section"
    | "thread"
    | "hem"
    | "wrapCurves"
    | "moveFace"
    | "split"
    | "deleteFace"
    | "replaceFace"
    | "transform"
    | "flange"
    | "thicken"
    | "sew"
    | "surfaceExtend"
    | "hole",
  payload: Record<string, unknown>,
): Promise<Result<ParityResult>> {
  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerGeometryResult>({
      type,
      payload: payload as never,
    });
    return ok(buildGeometryResult(raw));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function shellBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndices: number[],
  thickness: number,
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: {
    keepType?: "KEEP_SHELL" | "KEEP_CORE";
    thicknesses?: number[];
    curvedCap?: boolean;
  },
): Promise<Result<ParityResult>> {
  return run("shell", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    thickness,
    ...options,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function draftBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndices: number[],
  angleDeg: number,
  neutralNormal: Vec3,
  neutralPoint: Vec3,
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: {
    mode?: "NEUTRAL" | "STEP" | "PARTING";
    partingLine?: { start: Vec3; end: Vec3 };
  },
): Promise<Result<ParityResult>> {
  return run("draft", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    angleDeg,
    neutralNormal,
    neutralPoint,
    ...options,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export type PatternSpec =
  | {
      kind: "circular";
      count: number;
      axisOrigin: Vec3;
      axisDir: Vec3;
      angleRad: number;
      separate?: boolean;
      skip?: number[];
    }
  | {
      kind: "linear";
      count: number;
      translation: Vec3;
      separate?: boolean;
      skip?: number[];
    }
  | {
      kind: "body";
      count: number;
      translation: Vec3;
      separate?: boolean;
      skip?: number[];
    }
  | {
      kind: "face";
      count: number;
      translation: Vec3;
      faceIndices: number[];
      separate?: boolean;
      skip?: number[];
    }
  | {
      kind: "curve";
      count: number;
      pathPoints: Vec3[];
      align?: boolean;
      separate?: boolean;
      skip?: number[];
    };

export async function patternBRep(
  brep: Brep,
  position: THREE.Vector3,
  spec: PatternSpec,
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult | ParityResult[]>> {
  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<unknown>({
      type: "pattern",
      payload: {
        brepJson: brep.toJSON(),
        position: toVec3(position),
        ...spec,
        occBrep,
        rotation: rotation ? toEulerJSON(rotation) : undefined,
      },
    });
    const cand = raw as { results?: WorkerGeometryResult[] };
    if (cand && Array.isArray(cand.results))
      return ok(cand.results.map(buildGeometryResult));
    return ok(buildGeometryResult(raw as WorkerGeometryResult));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function surfaceOpBRep(
  kind: "ruled" | "fill" | "offset" | "boundary" | "constrained",
  brep: Brep,
  position: THREE.Vector3,
  opts: {
    edgeIndices?: number[] | undefined;
    faceIndex?: number | undefined;
    distance?: number | undefined;
  },
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("surfaceOp", {
    kind,
    brepJson: brep.toJSON(),
    position: toVec3(position),
    edgeIndices: opts.edgeIndices,
    faceIndex: opts.faceIndex,
    distance: opts.distance,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function projectCurvesBRep(
  source: {
    brep: Brep;
    position: THREE.Vector3;
    occBrep?: string | undefined;
    rotation?: THREE.Euler | undefined;
  },
  target: {
    brep: Brep;
    position: THREE.Vector3;
    occBrep?: string | undefined;
  },
  edgeIndices: number[],
  direction: Vec3,
): Promise<Result<ParityResult>> {
  return run("projectCurves", {
    brepJson: source.brep.toJSON(),
    position: toVec3(source.position),
    occBrep: source.occBrep,
    rotation: source.rotation ? toEulerJSON(source.rotation) : undefined,
    targetBrepJson: target.brep.toJSON(),
    targetPosition: toVec3(target.position),
    targetOccBrep: target.occBrep,
    edgeIndices,
    direction,
  });
}

export async function moveFaceBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndex: number,
  distance: number,
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: { faceIndices?: number[]; extendNeighbors?: boolean },
): Promise<Result<ParityResult>> {
  return run("moveFace", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndex,
    faceIndices: options?.faceIndices,
    distance,
    extendNeighbors: options?.extendNeighbors,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function threadBRep(
  brep: Brep,
  position: THREE.Vector3,
  spec: {
    origin: Vec3;
    axisDir: Vec3;
    radius: number;
    pitch: number;
    height: number;
    depth: number;
    kind: "external" | "internal";
    crown?: number;
    taperPerLength?: number;
    helical?: boolean;
    endChamfer?: number;
    cosmetic?: boolean;
  },
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("thread", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    ...spec,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function flangeBRep(
  brep: Brep,
  position: THREE.Vector3,
  spec: {
    origin: Vec3;
    bendDir: Vec3;
    bendLineDir: Vec3;
    angle: number;
    thickness: number;
    relief: number;
    length?: number;
    width?: number;
    radius?: number;
  },
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("flange", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    ...spec,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function hemBRep(
  brep: Brep,
  position: THREE.Vector3,
  spec: {
    origin: Vec3;
    bendDir: Vec3;
    bendLineDir: Vec3;
    thickness: number;
    lip?: number;
    relief?: number;
    radius?: number;
  },
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("hem", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    ...spec,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function wrapCurvesBRep(
  brep: Brep,
  position: THREE.Vector3,
  spec: {
    axisOrigin: Vec3;
    axisDir: Vec3;
    radius: number;
    polylines: number[][][];
    operation?: "CURVE" | "CUT" | "EMBOSS";
    depth?: number;
    width?: number;
  },
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("wrapCurves", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    ...spec,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function sectionBRep(
  brep: Brep,
  position: THREE.Vector3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("section", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    planeOrigin,
    planeNormal,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function splitBRep(
  brep: Brep,
  position: THREE.Vector3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  occBrep?: string,
  rotation?: THREE.Euler,
  keep?: "positive" | "negative" | "both",
  options?: {
    splitBy?: "plane" | "surface";
    tool?: { brep: Brep; position: THREE.Vector3; occBrep?: string };
  },
): Promise<Result<ParityResult | SplitPair>> {
  return runSplit(
    brep,
    position,
    planeOrigin,
    planeNormal,
    occBrep,
    rotation,
    keep,
    options,
  );
}

export interface SplitPair {
  primary: ParityResult;
  secondary: ParityResult;
}

async function runSplit(
  brep: Brep,
  position: THREE.Vector3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  occBrep?: string,
  rotation?: THREE.Euler,
  keep?: "positive" | "negative" | "both",
  options?: {
    splitBy?: "plane" | "surface";
    tool?: { brep: Brep; position: THREE.Vector3; occBrep?: string };
  },
): Promise<Result<ParityResult | SplitPair>> {
  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<unknown>({
      type: "split",
      payload: {
        brepJson: brep.toJSON(),
        position: toVec3(position),
        planeOrigin,
        planeNormal,
        keep,
        splitBy: options?.splitBy,
        ...(options?.tool
          ? {
              toolBrepJson: options.tool.brep.toJSON(),
              toolPosition: toVec3(options.tool.position),
              toolOccBrep: options.tool.occBrep,
            }
          : {}),
        occBrep,
        rotation: rotation ? toEulerJSON(rotation) : undefined,
      },
    });
    const cand = raw as {
      primary?: WorkerGeometryResult;
      secondary?: WorkerGeometryResult;
    };
    if (cand && cand.primary && cand.secondary)
      return ok({
        primary: buildGeometryResult(cand.primary),
        secondary: buildGeometryResult(cand.secondary),
      });
    return ok(buildGeometryResult(raw as WorkerGeometryResult));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function deleteFaceBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndices: number[],
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: { mergeAdjacent?: boolean },
): Promise<Result<ParityResult>> {
  return run("deleteFace", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    mergeAdjacent: options?.mergeAdjacent,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function replaceFaceBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndices: number[],
  replacementBrep: Brep,
  replacementPosition: THREE.Vector3,
  occBrep?: string,
  replacementOccBrep?: string,
  options?: {
    replacementFaceIndex?: number;
    rotation?: THREE.Euler;
    replacementRotation?: THREE.Euler;
  },
): Promise<Result<ParityResult>> {
  return run("replaceFace", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    replacementBrepJson: replacementBrep.toJSON(),
    replacementPosition: toVec3(replacementPosition),
    occBrep,
    replacementOccBrep,
    replacementFaceIndex: options?.replacementFaceIndex,
    rotation: options?.rotation ? toEulerJSON(options.rotation) : undefined,
    replacementRotation: options?.replacementRotation
      ? toEulerJSON(options.replacementRotation)
      : undefined,
  });
}

export async function transformBRep(
  brep: Brep,
  position: THREE.Vector3,
  matrix: number[],
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("transform", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    matrix,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export async function thickenBRep(
  brep: Brep,
  position: THREE.Vector3,
  faceIndices: number[],
  thickness: number,
  occBrep?: string,
  rotation?: THREE.Euler,
): Promise<Result<ParityResult>> {
  return run("thicken", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    thickness,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}

export interface SewInput {
  brep: Brep;
  position: THREE.Vector3;
  occBrep?: string | undefined;
  rotation?: THREE.Euler | undefined;
  faceIndices?: number[] | undefined;
}

export interface SewResult extends ParityResult {
  unstitchedEdges: number;
  shellCount: number;
}

export async function sewBReps(
  sources: SewInput[],
  options?: {
    tolerance?: number;
    makeSolid?: boolean;
    mergeFaces?: boolean;
    sewFreeEdges?: boolean;
    sewSharedEdges?: boolean;
    extractShell?: boolean;
  },
): Promise<Result<SewResult>> {
  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerSewResult>({
      type: "sew",
      payload: {
        sources: sources.map((source) => ({
          brepJson: source.brep.toJSON(),
          position: toVec3(source.position),
          occBrep: source.occBrep,
          rotation: source.rotation ? toEulerJSON(source.rotation) : undefined,
          faceIndices: source.faceIndices,
        })),
        ...options,
      },
    });
    return ok({
      ...buildGeometryResult(raw),
      unstitchedEdges: raw.unstitchedEdges ?? 0,
      shellCount: raw.shellCount ?? 0,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export interface SurfaceExtendResult extends ParityResult {}

export async function extendSurfaceBRep(
  brep: Brep,
  position: THREE.Vector3,
  edgeIndices: number[],
  distance: number,
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: { mode?: "linear" | "natural"; tolerance?: number },
): Promise<Result<SurfaceExtendResult>> {
  if (!edgeIndices.length) return err("extendSurface: no edges selected");
  return run("surfaceExtend", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    edgeIndices,
    distance,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
    ...options,
  });
}

export async function holeBRep(
  brep: Brep,
  position: THREE.Vector3,
  centers: Vec3[],
  axisDir: Vec3,
  radius: number,
  length: number,
  overdrive = 2,
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: {
    holeType?: "SIMPLE" | "COUNTERBORE" | "COUNTERSINK";
    countersinkAngleDeg?: number;
    /** NPT-style radial taper per unit depth. */
    taperPerLength?: number;
  },
): Promise<Result<ParityResult>> {
  if (!centers.length) throw new Error("holeBRep: no centers");
  return run("hole", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    centers,
    axisDir,
    radius,
    length,
    overdrive,
    ...options,
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}
