import * as THREE from "three";

export type MeasureSubMode = "distance" | "edge-length" | "angle";

export interface DistanceMeasurement {
  type: "distance";
  id: string;
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  distance: number;
  pinned: boolean;
  overlayObjects: THREE.Object3D[];
}

export interface EdgeLengthMeasurement {
  type: "edge-length";
  id: string;
  elementNodeId: string;
  edgeIndex: number;
  edgeSegments: Float32Array;
  midpoint: { x: number; y: number; z: number };
  length: number;
  pinned: boolean;
  overlayObjects: THREE.Object3D[];
}

export interface AngleMeasurement {
  type: "angle";
  id: string;
  vertex: THREE.Vector3;
  directionA: THREE.Vector3;
  directionB: THREE.Vector3;
  angleDegrees: number;
  pinned: boolean;
  overlayObjects: THREE.Object3D[];
}

export type Measurement =
  | DistanceMeasurement
  | EdgeLengthMeasurement
  | AngleMeasurement;
