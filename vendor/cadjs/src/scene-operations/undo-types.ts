import { SceneElement } from "./types";
import { FeatureNode, Sketch } from "../types/sketch-types";

export const MAX_UNDO_STEPS = 50;
export const MAX_SKETCH_UNDO_STEPS = 100;

export interface UndoableSnapshot {
  elements: SceneElement[];
  idCounter: number;
  featureTree: FeatureNode[];
  sketches: Sketch[];
  actionName: string;
  timestamp: number;
}
