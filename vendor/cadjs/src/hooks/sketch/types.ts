import * as THREE from "three";

/** Active drawing tool inside sketch mode. */
export type SketchSubMode =
  | "select"
  | "line"
  | "midpointLine"
  | "rectangle"
  | "centerRectangle"
  | "slot"
  | "polygon"
  | "circle"
  | "circle3p"
  | "ellipse"
  | "ellipticalArc"
  | "spline"
  | "bezier"
  | "conic"
  | "arc"
  | "point"
  | "dimension"
  | "trim"
  | "extend"
  | "split";

/** Info about a newly created line for dimension input. */
export interface PendingLineDimension {
  lineId: string;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  length: number;
  midpoint: THREE.Vector3;
}

/** Context menu state for right-click constraints. */
export interface SketchContextMenu {
  visible: boolean;
  x: number;
  y: number;
  primitiveIds: string[];
  primitiveTypes: string[];
  constraintId?: string | null;
}
