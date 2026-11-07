import { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import { toVec3 } from "../vectorHelpers";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";

export interface LoftResult {
  brep: Brep;
  position: THREE.Vector3;
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

// Lofts an ordered list of flat profiles into one centered solid via BRepOffsetAPI_ThruSections.
// `isRuled` swaps smooth interpolation for ruled (linear) surfaces.
export async function loftBReps(
  profiles: { brep: Brep; position: THREE.Vector3; occBrep?: string }[],
  isRuled: boolean = false,
): Promise<Result<LoftResult>> {
  if (profiles.length < 2) {
    return err("need at least 2 profiles");
  }

  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerGeometryResult>({
      type: "loft",
      payload: {
        profiles: profiles.map((p) => ({
          brepJson: p.brep.toJSON(),
          position: toVec3(p.position),
          occBrep: p.occBrep,
        })),
        isRuled,
      },
    });

    const core = buildGeometryResult(raw);
    return ok({
      brep: core.brep,
      position: new THREE.Vector3(
        core.positionOffset.x,
        core.positionOffset.y,
        core.positionOffset.z,
      ),
      edgeGeometry: core.edgeGeometry,
      vertexPositions: core.vertexPositions,
      occBrep: core.occBrep,
      faceGeometry: core.faceGeometry,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
