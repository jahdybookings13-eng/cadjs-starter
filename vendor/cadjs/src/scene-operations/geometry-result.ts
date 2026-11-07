import * as THREE from "three";
import { Brep } from "../geometry";
import type { WorkerGeometryResult } from "../workers/occ-worker-types";
import {
  reconstructEdgeGeometry,
  reconstructFaceGeometry,
} from "../workers/geometry-reconstruction";

export interface GeometryResultCore {
  brep: Brep;
  positionOffset: { x: number; y: number; z: number };
  edgeGeometry?: THREE.BufferGeometry | undefined;
  vertexPositions?: Float32Array | undefined;
  occBrep?: string | undefined;
  faceGeometry?: THREE.BufferGeometry | undefined;
}

export function buildGeometryResult(
  raw: WorkerGeometryResult,
): GeometryResultCore {
  return {
    brep: Brep.fromJSON(raw.brepJson),
    positionOffset: raw.positionOffset,
    edgeGeometry: raw.edgePositions
      ? reconstructEdgeGeometry(raw.edgePositions)
      : undefined,
    vertexPositions: raw.vertexPositions,
    occBrep: raw.occBrep,
    faceGeometry: raw.faceGeometry
      ? reconstructFaceGeometry(raw.faceGeometry)
      : undefined,
  };
}
