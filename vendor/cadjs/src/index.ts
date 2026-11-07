// Framework-agnostic core. React bindings live at "cadjs/react".
// `services/opencascade-instance`, `services/opencascade-init`, `services/occ-helpers`,
// and `workers/occ-worker.ts` are intentionally not re-exported, they're internal.

export * from "./config";
export * from "./geometry";
export * from "./theme";
export * from "./vectorHelpers";
export * from "./convertBRepToGeometry";

export * from "./services/SketchSolverService";
export * from "./services/SketchToBrepService";
export * from "./services/OccWorkerClient";
export * from "./services/ImportExportService";
export * from "./hooks/sketch/sketch-geometry";

export * from "./scene-operations";
export * from "./types/sketch-types";
// `SketchConstraintBase` is the parent of `DimensionalConstraint` /
// `GeometricConstraint`; tsdown's d.ts rollup tree-shakes type-only base
// interfaces that no exported value references. Pin it explicitly.
export type { SketchConstraintBase } from "./types/sketch-types";

// Worker-protocol value types referenced by `OccWorkerClient.send` and other
// public surfaces. The runtime handlers/dispatcher stay internal.
export type * from "./workers/occ-worker-types";
