// Curated public barrel for scene-operations.
//
// Library-internal helpers (state mutators consumed only by CoreContext, mode
// hooks, and useSketchSession / useElementMutations) are intentionally NOT
// re-exported here. They remain accessible via direct file imports inside the
// library, see the comment block at the bottom for the full omitted list.

export * from "./types";
export * from "./result";
export * from "./element-helpers";
export * from "./mesh-operations";
export * from "./element-operations";
export * from "./boolean-operations";
export * from "./import-operations";
export * from "./fillet-operations";
export * from "./parity-operations";
export * from "./loft-operations";
export * from "./measure-operations";
export * from "./measure-types";
export * from "./resize-operations";
export * from "./revolve-operations";
export * from "./sketch-intersection-utils";
export * from "./sweep-operations";
export * from "./undo-types";
export * from "./undo-extras";
export * from "./browser-sections";
export * from "./constraint-validation";

export { renameNode, countOperationsOfType } from "./feature-tree-operations";
export {
  createSketch,
  getPointById,
  getAllPoints,
  getConstraintsForPrimitive,
} from "./sketch-operations";

// Internal, omitted from the public barrel; library code imports these
// directly from the source files cited below.
//
//   ./feature-tree-operations:
//     applyBooleanOperationToTree, applyExtrudeToTree, applyFilletToTree,
//     applySweepToTree, applyRevolveToTree, removeNodeById,
//     removeNodesByElementId
//
//   ./sketch-operations:
//     addPrimitiveToSketch, addConstraintToSketch, removePrimitiveFromSketch,
//     removeConstraintFromSketch, updatePrimitiveInSketch,
//     updateConstraintInSketch, splitLineAtParams, removeLineSegment,
//     trimLineAtSegment, convertCircleToArc, cleanupOrphanedPoints
//
//   ./selection-operations:
//     handleSetMode, selectElement, deselectElement, applySelectionMaterial,
//     SelectionChange
