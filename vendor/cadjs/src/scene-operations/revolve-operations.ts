import { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import { toVec3 } from "../vectorHelpers";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";
import { debugLog } from "../config";

export type RevolveDirection = "one" | "two" | "symmetric";

export interface RevolveResult {
  brep: Brep;
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

// Revolve a flat profile around an axis. Caller adds result.positionOffset to profilePosition.
export async function revolveBRep(
  profileBrep: Brep,
  profilePosition: THREE.Vector3,
  axisOrigin: { x: number; y: number; z: number },
  axisDir: { x: number; y: number; z: number },
  angleRadians?: number,
  sourceOccBrep?: string,
  direction: RevolveDirection = "one",
  angleRadians2?: number,
): Promise<Result<RevolveResult>> {
  if (!profileBrep.faces.length) {
    return err("profile brep has no faces");
  }

  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerGeometryResult>({
      type: "revolve",
      payload: {
        brepJson: profileBrep.toJSON(),
        profilePosition: toVec3(profilePosition),
        axisOrigin,
        axisDir,
        angleRadians,
        sourceOccBrep,
        direction,
        angleRadians2,
      },
    });

    const result = buildGeometryResult(raw);
    debugLog("[revolve] inputs", {
      profileFaces: profileBrep.faces.length,
      profilePosition: toVec3(profilePosition),
      axisOrigin,
      axisDir,
      angleRadians,
      direction,
      angleRadians2,
      hasSourceOccBrep: !!sourceOccBrep,
    });
    debugLog("[revolve] result", {
      brepFaces: result.brep.faces.length,
      brepVertices: result.brep.vertices.length,
      edgeGeomVerts: result.edgeGeometry?.attributes.position?.count ?? 0,
      faceGeomVerts: result.faceGeometry?.attributes.position?.count ?? 0,
      vertexPositions: result.vertexPositions?.length ?? 0,
      hasOccBrep: !!result.occBrep,
      positionOffset: result.positionOffset,
    });
    if (!result.brep.faces.length) {
      return err(
        "revolve produced no solid faces (axis may be coplanar with profile or otherwise degenerate)",
      );
    }
    return ok(result);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
