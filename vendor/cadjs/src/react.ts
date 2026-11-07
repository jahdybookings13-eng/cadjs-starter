/**
 * React bindings for the cadjs library.
 *
 * Requires `react` and `react-dom` (declared as peerDependencies).
 *
 * What's exported here:
 *   - Context providers: CadCoreProvider, CadVisualizerProvider
 *   - Context hooks: useCadCore, useCadVisualizer
 *   - Mode hooks (interaction logic for each editor mode):
 *     useMoveMode, useExtrudeMode, useFilletMode, useSweepMode,
 *     useLoftMode, useRevolveMode, useCombineMode, useSketchMode,
 *     useMeasureMode, useSelectOther,
 *     useCameraAnimation, useSketchInference
 *
 * Notifications: hooks publish errors/warnings via the `notify` callback set
 * with `configureCadjs({ notify })`. The library does not ship a toast UI,
 * consumers wire their own (see the cadjs-starter package for an example).
 */

export * from "./contexts/CoreContext";
export * from "./contexts/VisualizerContext";

export * from "./hooks/useMoveMode";
export * from "./hooks/useSketchInference";
export * from "./hooks/useCameraAnimation";
export * from "./hooks/useCombineMode";
export * from "./hooks/useExtrudeMode";
export * from "./hooks/useFilletMode";
export * from "./hooks/useLoftMode";
export * from "./hooks/useMeasureMode";
export * from "./hooks/useRevolveMode";
export * from "./hooks/useSelectOther";
export * from "./hooks/useSketchMode";
export * from "./hooks/useSweepMode";

export * from "./contexts/visualizer/hooks/useVisualizerResize";

// Re-export every public type from the framework-agnostic entry so consumers
// of `cadjs/react` can annotate without a parallel `import type { ... } from
// "cadjs"` line. `export type *` strips runtime values from `./index`, leaving
// only the types, the contexts/hooks above already provide the runtime side.
export type * from "./index";
