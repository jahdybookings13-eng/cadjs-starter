import * as THREE from "three";
import { Brep } from "../geometry";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import { toVec3, toEulerJSON } from "../vectorHelpers";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";

export interface FilletResult {
  brep: Brep;
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

// If occBrep is provided, deserializes it instead of reconstructing from
// tessellated triangles, preserving analytic geometry for correct results.
export async function filletBRep(
  brep: Brep,
  position: THREE.Vector3,
  edgeIndices: number[],
  radius: number | number[],
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: {
    section?: "RATIONAL" | "QUASI_ANGULAR" | "POLYNOMIAL";
    variableRadii?: Array<{ start: number; end: number }>;
    cornerRadius?: number;
  },
): Promise<Result<FilletResult>> {
  try {
    const client = OccWorkerClient.getInstance();
    const arr = Array.isArray(radius) ? radius : undefined;
    const base = Array.isArray(radius) ? (radius[0] ?? 0) : radius;
    const raw = await client.send<WorkerGeometryResult>({
      type: "fillet",
      payload: {
        brepJson: brep.toJSON(),
        position: toVec3(position),
        edgeIndices,
        radius: base,
        radii: arr,
        ...options,
        occBrep,
        rotation: rotation ? toEulerJSON(rotation) : undefined,
      },
    });

    return ok(buildGeometryResult(raw));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function chamferBRep(
  brep: Brep,
  position: THREE.Vector3,
  edgeIndices: number[],
  distance: number | number[],
  occBrep?: string,
  rotation?: THREE.Euler,
  options?: {
    mode?: "DIST_DISTS" | "DIST_ANG" | "ANG_DISTS" | "SYM_DISTS";
    angleDeg?: number;
  },
): Promise<Result<FilletResult>> {
  try {
    const client = OccWorkerClient.getInstance();
    const arr = Array.isArray(distance) ? distance : undefined;
    const base = Array.isArray(distance) ? (distance[0] ?? 0) : distance;
    const raw = await client.send<WorkerGeometryResult>({
      type: "chamfer",
      payload: {
        brepJson: brep.toJSON(),
        position: toVec3(position),
        edgeIndices,
        distance: base,
        distances: arr,
        ...options,
        occBrep,
        rotation: rotation ? toEulerJSON(rotation) : undefined,
      },
    });

    return ok(buildGeometryResult(raw));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
