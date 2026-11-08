// Parameter support audit — which params a kernel op actually consumes.
//
// FeatureMap declares the params a feature *can* carry, but the executor only
// reads a subset of them. Editing a param the kernel ignores silently does
// nothing, so panels need a per-param verdict before they offer an edit.
//
// The map is deliberately explicit: only feature types whose executor case has
// been read line-by-line are listed. A missing entry means "not audited yet"
// (null), never "unsupported", so the audit can grow without hiding features.
//
// source: executor.ts switch (node.featureType) — the only place params reach
// a geometry op.

import type { ScadgenFeatureNode } from "./onshapeHistory";

export interface ParamSupport {
  status: "wired" | "unwired";
  /** Human-readable reason, present only when status is "unwired". */
  reason?: string;
}

/**
 * Parameter ids each audited kernel op reads from the node.
 * Query params are included because they drive what the op resolves.
 */
export const KERNEL_CONSUMED_PARAMS: Record<string, readonly string[]> = {
  extrude: [
    "entities",
    "depth",
    "endBound",
    "endBoundOffset",
    "endBoundEntity",
    "oppositeDirection",
    "hasSecondDirection",
    "depthBack",
    "midplane",
    "symmetric",
    "hasOffset",
    "offsetDistance",
    "operationType",
    "targets",
    "hasDraft",
    "draftAngle",
    "draftMode",
    "draftNeutralFace",
    "draftNeutralOrigin",
    "draftNeutralNormal",
    "draftPartingEdge",
    "thinWall",
    "wallThickness",
  ],
  fillet: [
    "entities",
    "radius",
    "radii",
    "crossSection",
    "variableRadii",
    "cornerRadius",
    "tangentPropagation",
  ],
  chamfer: [
    "entities",
    "width",
    "distances",
    "chamferType",
    "angle",
    "tangentPropagation",
  ],
  loft: [
    "profiles",
    "ruled",
    "loftType",
    "closed",
    "startCondition",
    "endCondition",
    "startDirection",
    "endDirection",
    "thinWall",
    "wallThickness",
    "twist",
    "connectors",
    "centerline",
    "operationType",
    "targets",
    "guideSubqueries",
  ],
  revolve: [
    "entities",
    "axis",
    "axisOrigin",
    "axisDir",
    "angleForward",
    "angleBack",
    "direction",
    "oppositeDirection",
    "endBound",
    "endBoundEntity",
    "thinWall",
    "wallThickness",
    "cornerType",
    "operationType",
    "targets",
  ],
  sweep: [
    "profiles",
    "path",
    "keepProfileOrientation",
    "pathPoints",
    "cornerMode",
    "twist",
    "chordalTolerance",
    "guideSubqueries",
    "pathStartOffset",
    "pathEndOffset",
    "thinWall",
    "wallThickness",
    "operationType",
    "targets",
  ],
  boolean: ["targets", "tools", "operationType"],
  shell: [
    "targets",
    "faces",
    "thickness",
    "keepType",
    "thicknesses",
    "curvedCap",
  ],
  thread: [
    "entities",
    "standard",
    "size",
    "mode",
    "kind",
    "engagement",
    "helical",
    "chamferEnds",
    "cosmetic",
  ],
  thicken: ["targets", "faces", "thickness"],
  draft: [
    "targets",
    "faces",
    "neutralFace",
    "neutralOrigin",
    "neutralNormal",
    "draftPartingEdge",
    "angle",
    "draftMode",
  ],
  deleteFace: ["targets", "faces", "mergeAdjacent"],
  hole: [
    "targets",
    "holeType",
    "standard",
    "size",
    "fit",
    "fitClass",
    "countersinkAngle",
    "centerPoints",
    "radius",
    "depth",
    "counterboreRadius",
    "counterboreDepth",
    "axisDir",
    "throughAll",
  ],
  pattern: [
    "entities",
    "faces",
    "patternType",
    "count",
    "spacing",
    "spacingMode",
    "flipDirection",
    "hasSecondDirection",
    "count2",
    "spacing2",
    "suppressedInstances",
    "angle",
    "separate",
    "pathPoints",
    "axisDir",
    "axisOrigin",
    "direction",
    "align",
    "join",
  ],
  moveFace: ["targets", "faces", "distance", "extendNeighbors"],
  split: [
    "targets",
    "planeOrigin",
    "planeNormal",
    "keep",
    "splitBy",
    "tools",
    "allBodies",
  ],
  featurePattern: [
    "chain",
    "count",
    "spacing",
    "axis",
    "spacingMode",
    "suppressedInstances",
    "join",
  ],
  transform: [
    "entities",
    "transformType",
    "translation",
    "rotationAxis",
    "rotationAngle",
    "copy",
  ],
  projectCurves: ["entities", "targets", "direction", "edgeTags"],
  wrap: ["targets", "polylines", "operation", "depth", "width"],
  rib: [
    "targets",
    "x1",
    "y1",
    "x2",
    "y2",
    "z",
    "thickness",
    "depth",
    "hasDraft",
    "draftAngle",
    "flip",
    "merge",
  ],
  gusset: [
    "targets",
    "x1",
    "y1",
    "x2",
    "y2",
    "z",
    "thickness",
    "depth",
    "hasDraft",
    "draftAngle",
    "flip",
    "merge",
  ],
  web: [
    "targets",
    "x1",
    "y1",
    "x2",
    "y2",
    "z",
    "thickness",
    "depth",
    "hasDraft",
    "draftAngle",
    "flip",
    "merge",
  ],
  boss: [
    "targets",
    "x",
    "y",
    "z",
    "diameter",
    "height",
    "hasDraft",
    "draftAngle",
    "merge",
  ],
  domeFeature: ["targets", "x", "y", "z", "radius", "height", "merge"],
  emboss: ["targets", "polylines", "operation", "depth", "width"],
  coil: [
    "targets",
    "x",
    "y",
    "z",
    "radius",
    "wireRadius",
    "pitch",
    "turns",
    "taper",
    "hand",
    "startAngle",
    "endAngle",
    "preset",
    "merge",
  ],
};

/**
 * Read a boolean param that may be stored either as a real boolean (dialog
 * edits) or as the "true"/"false" string older builders emitted.
 */
export function booleanParameter(
  node: ScadgenFeatureNode,
  parameterId: string,
): boolean {
  const p = node.parameters.find((x) => x.parameterId === parameterId);
  if (!p) return false;
  if (p.kind === "boolean") return p.value;
  return p.kind === "string" && p.value === "true";
}

/** Verdict for one param, or null when its feature type has not been audited. */
export function auditParameter(
  featureType: string,
  parameterId: string,
): ParamSupport | null {
  const consumed = KERNEL_CONSUMED_PARAMS[featureType];
  if (!consumed) return null;
  if (consumed.includes(parameterId)) return { status: "wired" };
  return {
    status: "unwired",
    reason: `Not read by the ${featureType} kernel op yet`,
  };
}
