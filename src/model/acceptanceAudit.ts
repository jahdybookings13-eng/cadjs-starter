/**
 * Pure audit for the Phase 3 exit part. It checks that a persisted feature
 * history contains the required feature coverage; it does not claim the
 * geometry evaluates — that is the browser acceptance run.
 */
import type { ScadgenFeatureNode } from "./onshapeHistory";

export const PHASE3_MIN_FEATURES = 20;

export interface RequiredFeatureGroup {
  key: string;
  label: string;
  types: readonly string[];
}

/** One row per Phase 3 exit-part requirement. */
export const PHASE3_REQUIRED_GROUPS: readonly RequiredFeatureGroup[] = [
  { key: "sketch", label: "Sketch", types: ["newSketch"] },
  { key: "extrude", label: "Extrude", types: ["extrude"] },
  { key: "revolve", label: "Revolve", types: ["revolve"] },
  { key: "sweep", label: "Sweep", types: ["sweep"] },
  { key: "loft", label: "Loft", types: ["loft"] },
  { key: "fillet", label: "Fillet", types: ["fillet"] },
  { key: "chamfer", label: "Chamfer", types: ["chamfer"] },
  { key: "shell", label: "Shell", types: ["shell"] },
  { key: "draft", label: "Draft", types: ["draft"] },
  { key: "hole", label: "Hole", types: ["hole"] },
  {
    key: "pattern",
    label: "Pattern",
    types: [
      "pattern",
      "linearPattern",
      "circularPattern",
      "curvePattern",
      "featurePattern",
      "sketchPattern",
    ],
  },
  { key: "boolean", label: "Boolean", types: ["boolean", "booleanBRep"] },
  { key: "split", label: "Split", types: ["split", "splitFace", "splitBody"] },
  {
    key: "newFeature",
    label: "At least one new F feature",
    types: [
      "rib",
      "gusset",
      "web",
      "boss",
      "emboss",
      "coil",
      "helixCurve",
      "fitSpline",
      "bridgingCurve",
      "enclose",
      "dome",
      "derive",
    ],
  },
];

export interface Phase3AcceptanceAudit {
  ok: boolean;
  /** Persisted features excluding variables; sketches count. */
  featureCount: number;
  /** Present feature types, sorted, without duplicates. */
  types: string[];
  /** Missing required group labels. */
  missing: string[];
  duplicateIds: string[];
  unnamed: string[];
  /** Present F feature types. */
  newFeatures: string[];
  suppressedCount: number;
}

function flatten(nodes: readonly ScadgenFeatureNode[]): ScadgenFeatureNode[] {
  const out: ScadgenFeatureNode[] = [];
  const walk = (node: ScadgenFeatureNode) => {
    out.push(node);
    for (const child of node.subFeatures ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return out;
}

export function auditPhase3Acceptance(
  nodes: readonly ScadgenFeatureNode[],
): Phase3AcceptanceAudit {
  const all = flatten(nodes);
  const mechanical = all.filter((n) => n.featureType !== "variable");
  const types = [...new Set(all.map((n) => n.featureType))].sort();

  const names = new Map<string, number>();
  for (const n of all)
    names.set(n.featureId, (names.get(n.featureId) ?? 0) + 1);
  const duplicateIds = [...names.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  const missing = PHASE3_REQUIRED_GROUPS.filter(
    (group) => !group.types.some((t) => types.includes(t)),
  ).map((group) => group.label);

  const unnamed = all
    .filter((n) => !n.name.trim())
    .map((n) => n.featureId)
    .sort();

  const newFeatureGroup = PHASE3_REQUIRED_GROUPS.find(
    (g) => g.key === "newFeature",
  )!;
  const newFeatures = types.filter((t) => newFeatureGroup.types.includes(t));

  return {
    ok:
      mechanical.length >= PHASE3_MIN_FEATURES &&
      missing.length === 0 &&
      duplicateIds.length === 0 &&
      unnamed.length === 0,
    featureCount: mechanical.length,
    types,
    missing,
    duplicateIds,
    unnamed,
    newFeatures,
    suppressedCount: all.filter((n) => n.suppressed).length,
  };
}
