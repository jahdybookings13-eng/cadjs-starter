// Phase 6 feature dispatch registry.
//
// A feature type is registered here before it can appear in a history. The
// registry distinguishes types that already have an executor case from types
// whose kernel operation is still missing, so the executor can report a named
// error instead of silently producing an UNKNOWN feature.
export type Phase6DispatchState =
  | "executor"
  | "alias"
  | "nonGeometry"
  | "blocked";

export interface Phase6DispatchEntry {
  featureType: string;
  label: string;
  /** Executor switch case that handles the feature, when one exists. */
  executorCase: string | null;
  /** Existing worker/kernel operation, or null for data-only features. */
  kernelOp: string | null;
  state: Phase6DispatchState;
  /** Why a registered feature cannot reach a kernel operation yet. */
  blocker?: string;
}

export const PHASE6_DISPATCH: readonly Phase6DispatchEntry[] = [
  {
    featureType: "baseFlange",
    label: "Base flange",
    executorCase: "baseFlange",
    kernelOp: "extrude",
    state: "executor",
  },
  {
    featureType: "edgeFlange",
    label: "Edge flange",
    executorCase: "flange",
    kernelOp: "flange",
    state: "alias",
  },
  {
    featureType: "bend",
    label: "Bend",
    executorCase: "flange",
    kernelOp: "flange",
    state: "alias",
  },
  {
    featureType: "corner",
    label: "Corner treatment",
    executorCase: "corner",
    kernelOp: "fillet",
    state: "executor",
  },
  {
    featureType: "relief",
    label: "Bend relief",
    executorCase: "relief",
    kernelOp: "boolean",
    state: "executor",
  },
  {
    featureType: "louver",
    label: "Louver",
    executorCase: "louver",
    kernelOp: "boolean",
    state: "executor",
  },
  {
    featureType: "hem",
    label: "Hem",
    executorCase: "hem",
    kernelOp: "hem",
    state: "executor",
  },
  {
    featureType: "flatPattern",
    label: "Flat pattern",
    executorCase: "unfold",
    kernelOp: "unfold",
    state: "alias",
  },
  {
    featureType: "unfold",
    label: "Unfold",
    executorCase: "unfold",
    kernelOp: "unfold",
    state: "executor",
  },
  {
    featureType: "bendTable",
    label: "Bend table",
    executorCase: null,
    kernelOp: null,
    state: "nonGeometry",
  },
  {
    featureType: "sheetMetalRule",
    label: "Sheet-metal rule",
    executorCase: null,
    kernelOp: null,
    state: "nonGeometry",
  },
  {
    featureType: "frame",
    label: "Frame",
    executorCase: "frame",
    kernelOp: "extrude",
    state: "executor",
  },
  {
    featureType: "frameGroup",
    label: "Frame group",
    executorCase: "frameGroup",
    kernelOp: "extrude",
    state: "executor",
  },
  {
    featureType: "structuralMember",
    label: "Structural member",
    executorCase: "structuralMember",
    kernelOp: "extrude",
    state: "executor",
  },
  {
    featureType: "cutList",
    label: "Cut list",
    executorCase: null,
    kernelOp: null,
    state: "nonGeometry",
  },
  {
    featureType: "surfaceLoft",
    label: "Surface loft",
    executorCase: "surface",
    kernelOp: "surface",
    state: "alias",
  },
  {
    featureType: "surfaceFill",
    label: "Fill surface",
    executorCase: "surface",
    kernelOp: "surface",
    state: "alias",
  },
  {
    featureType: "ruledSurface",
    label: "Ruled surface",
    executorCase: "surface",
    kernelOp: "surface",
    state: "alias",
  },
  {
    featureType: "surfaceOffset",
    label: "Offset surface",
    executorCase: "surface",
    kernelOp: "surface",
    state: "alias",
  },
  {
    featureType: "knitSurface",
    label: "Knit / stitch",
    executorCase: "knitSurface",
    kernelOp: "sew",
    state: "executor",
  },
  {
    featureType: "trimSurface",
    label: "Trim surface",
    executorCase: "trimSurface",
    kernelOp: "split",
    state: "executor",
  },
  {
    featureType: "extendSurface",
    label: "Extend surface",
    executorCase: "extendSurface",
    kernelOp: "surfaceExtend",
    state: "executor",
  },
  {
    featureType: "thickenSurface",
    label: "Thicken surface",
    executorCase: "thicken",
    kernelOp: "thicken",
    state: "alias",
  },
  {
    featureType: "replaceFace",
    label: "Replace face",
    executorCase: "replaceFace",
    kernelOp: "replaceFace",
    state: "executor",
  },
  {
    featureType: "solidToSurface",
    label: "Solid to surface",
    executorCase: "solidToSurface",
    kernelOp: "sew",
    state: "executor",
  },
  {
    featureType: "convertSurface",
    label: "Surface to solid",
    executorCase: "convertSurface",
    kernelOp: "sew",
    state: "executor",
  },
  {
    featureType: "conversion",
    label: "Conversion",
    executorCase: "convertSurface",
    kernelOp: "sew",
    state: "alias",
  },
];

export function phase6DispatchEntry(
  featureType: string,
): Phase6DispatchEntry | undefined {
  return PHASE6_DISPATCH.find((entry) => entry.featureType === featureType);
}

/**
 * Named executor error for a feature that reached the switch fallthrough.
 * Unknown features are named too, so no history entry can fail anonymously.
 */
export function phase6DispatchError(featureType: string): string {
  const entry = phase6DispatchEntry(featureType);
  if (!entry) return `unknown feature type '${featureType}'`;
  if (entry.state === "blocked")
    return `${entry.featureType}: ${entry.blocker ?? "kernel operation is not implemented"}`;
  if (entry.state === "nonGeometry")
    return `${entry.featureType}: data-only feature cannot produce a body`;
  return `${entry.featureType}: registered dispatch case '${entry.executorCase ?? "none"}' did not handle the feature`;
}

export function phase6BlockedFeatures(): readonly Phase6DispatchEntry[] {
  return PHASE6_DISPATCH.filter((entry) => entry.state === "blocked");
}
