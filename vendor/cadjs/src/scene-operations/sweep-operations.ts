import { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import { toVec3 } from "../vectorHelpers";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";

export type SweepOrientation = "perpendicular" | "parallel";
export type SweepCornerMode = "right" | "round";
export interface SweepOptions {
  orientation: SweepOrientation;
  cornerMode: SweepCornerMode;
  /** Path approximation tolerance in document units. */
  chordalTolerance?: number | undefined;
  /** One guide curve (auxiliary spine) in world space. */
  guidePoints?: { x: number; y: number; z: number }[] | undefined;
  /** Two or more guide rails in world space; drives constrained sections. */
  guideCurves?: { x: number; y: number; z: number }[][] | undefined;
  /** Total twist from path start to end, in radians. */
  twistRadians?: number | undefined;
  /** Hollow the swept solid into a constant-wall feature. */
  thinWall?: number | undefined;
}

export interface SweepResult {
  brep: Brep;
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

// Sweep a flat profile along a path. Caller adds result.positionOffset to profilePosition.
export async function sweepBRep(
  profileBrep: Brep,
  profilePosition: THREE.Vector3,
  pathPoints: { x: number; y: number; z: number }[],
  options?: SweepOptions,
  sourceOccBrep?: string,
): Promise<Result<SweepResult>> {
  if (!profileBrep.faces.length) return err("profile has no faces");
  if (pathPoints.length < 2) return err("path needs at least 2 points");

  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerGeometryResult>({
      type: "sweep",
      payload: {
        brepJson: profileBrep.toJSON(),
        profilePosition: toVec3(profilePosition),
        pathPoints,
        options: options
          ? {
              orientation: options.orientation,
              cornerMode: options.cornerMode,
              ...(options.chordalTolerance !== undefined
                ? { chordalTolerance: options.chordalTolerance }
                : {}),
              ...(options.twistRadians !== undefined
                ? { twistRadians: options.twistRadians }
                : {}),
            }
          : undefined,
        ...(options?.guidePoints ? { guidePoints: options.guidePoints } : {}),
        ...(options?.guideCurves ? { guideCurves: options.guideCurves } : {}),
        ...(options?.thinWall ? { thinWall: options.thinWall } : {}),
        sourceOccBrep,
      },
    });

    return ok(buildGeometryResult(raw));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
