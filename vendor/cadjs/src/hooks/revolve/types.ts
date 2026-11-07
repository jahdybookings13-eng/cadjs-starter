import * as THREE from "three";
import type { RevolveDirection } from "../../scene-operations/revolve-operations";

export type { RevolveDirection };

export type RevolvePhase = "SELECT_PROFILE" | "SELECT_AXIS" | "SET_ANGLE";

export interface RevolveState {
  phase: RevolvePhase;
  selectedElement: string | null;
  axisEdgeStart: THREE.Vector3 | null;
  axisEdgeEnd: THREE.Vector3 | null;
  angle: number;
  angle2: number;
  direction: RevolveDirection;
  isApplying: boolean;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
}

export interface EdgeSegmentData {
  edgeIndex: number;
  segments: Float32Array;
  midpoint: { x: number; y: number; z: number };
}
