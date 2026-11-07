export type FilletOperationType = "fillet" | "chamfer";

export interface FilletState {
  selectedElement: string | null;
  selectedEdgeIndices: number[];
  hoveredEdgeIndex: number | null;
  radius: number;
  operationType: FilletOperationType;
  isApplying: boolean;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
}

export interface EdgeSegmentData {
  edgeIndex: number;
  segments: Float32Array;
  midpoint: { x: number; y: number; z: number };
}
