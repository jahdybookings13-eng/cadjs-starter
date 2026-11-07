import * as THREE from "three";
import type { MeasureSubMode } from "../../scene-operations/measure-types";

export interface EdgeSegmentData {
  edgeIndex: number;
  segments: Float32Array;
  midpoint: { x: number; y: number; z: number };
}

export interface MeasureState {
  subMode: MeasureSubMode;
  firstPoint: THREE.Vector3 | null;
  hoveredEdgeIndex: number | null;
  hoveredElementId: string | null;
  firstEdge: { elementId: string; edgeIndex: number } | null;
  secondEdge: { elementId: string; edgeIndex: number } | null;
  statusText: string;
}
