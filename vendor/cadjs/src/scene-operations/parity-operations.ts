import type { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
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
    | "flange"
    | "thicken"
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
): Promise<Result<ParityResult>> {
  return run("shell", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    thickness,
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
): Promise<Result<ParityResult>> {
  return run("draft", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
    angleDeg,
    neutralNormal,
    neutralPoint,
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
    }
  | { kind: "linear"; count: number; translation: Vec3; separate?: boolean }
  | {
      kind: "curve";
      count: number;
      pathPoints: Vec3[];
      align?: boolean;
      separate?: boolean;
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
): Promise<Result<ParityResult>> {
  return run("moveFace", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndex,
    distance,
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
): Promise<Result<ParityResult | SplitPair>> {
  return runSplit(
    brep,
    position,
    planeOrigin,
    planeNormal,
    occBrep,
    rotation,
    keep,
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
): Promise<Result<ParityResult>> {
  return run("deleteFace", {
    brepJson: brep.toJSON(),
    position: toVec3(position),
    faceIndices,
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
    occBrep,
    rotation: rotation ? toEulerJSON(rotation) : undefined,
  });
}
