import { Brep } from "../geometry";
import * as THREE from "three";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import { Result, ok, err } from "./result";
import { buildGeometryResult } from "./geometry-result";
import { flatAxis } from "./brep-utils";

/**
 * Result of extrusion operation, including position offset for the new center.
 */
export interface ExtrusionResult {
  brep: Brep;
  /** Position offset to apply to element.position to account for new center */
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

// Direction is +1 / -1 along the flat normal. Pass `normalVec` (e.g. from a sketch plane)
// to skip vertex-range axis detection. Result is centered; positionOffset is the bbox center.
export async function extrudeBRep(
  brep: Brep,
  extrusionDepth: number,
  direction: number,
  normalVec?: { x: number; y: number; z: number },
  sourceOccBrep?: string,
  symmetric?: boolean,
  options?: {
    draftAngleDeg?: number;
    draftNeutralPoint?: { x: number; y: number; z: number } | undefined;
    draftNeutralNormal?: { x: number; y: number; z: number } | undefined;
    draftMode?: "NEUTRAL" | "PARTING" | undefined;
    draftPartingLine?: {
      start: { x: number; y: number; z: number };
      end: { x: number; y: number; z: number };
    } | undefined;
    thinWall?: number;
    /** Closed wall loop for an open sketch profile (thin extrude only). */
    ribbonPoints?: { x: number; y: number; z: number }[] | undefined;
  },
): Promise<Result<ExtrusionResult>> {
  if (!options?.ribbonPoints?.length && (!brep.faces.length || !brep.vertices.length)) {
    return err("brep has no faces or vertices");
  }

  let normal: { x: number; y: number; z: number };
  if (normalVec) {
    normal = normalVec;
  } else {
    const axis = flatAxis(brep);
    if (!axis) return err("brep is not flat along any axis");
    normal =
      axis === "x"
        ? { x: 1, y: 0, z: 0 }
        : axis === "y"
          ? { x: 0, y: 1, z: 0 }
          : { x: 0, y: 0, z: 1 };
  }

  try {
    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerGeometryResult>({
      type: "extrude",
      payload: {
        brepJson: brep.toJSON(),
        depth: extrusionDepth,
        direction,
        normalVec: normal,
        sourceOccBrep,
        symmetric,
        ...options,
      },
    });

    return ok(buildGeometryResult(raw));
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
