export type ExtrudeDirection = "up" | "down" | "symmetric";
export type ExtrudeOperationType = "join" | "cut";

export interface ExtrudeState {
  selectedElements: string[];
  isExtruding: boolean;
  activeDirection: ExtrudeDirection | null;
  extrusionDepth: number;
  showDimensionInput: boolean;
  dimensionInputPosition: { x: number; y: number };
  operationType: ExtrudeOperationType;
}
