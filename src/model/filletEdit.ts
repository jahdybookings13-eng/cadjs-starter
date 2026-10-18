// modifyFillet (Onshape): edits the radius and/or edge set of an existing
// fillet feature — rebuild-per-edit executor does the geometry, so this is a
// pure history operation, not a new kernel call.
import type { ScadgenHistory } from "./featureEngine";
import {
  buildFilletNode,
  formatQuantityExpression,
  provenanceForFeature,
  setParameter,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "./onshapeHistory";

export interface FilletEdit {
  radius?: number;
  edgeTags?: string[];
}

export function applyFilletEdit(
  node: ScadgenFeatureNode,
  edit: FilletEdit,
): ScadgenFeatureNode {
  if (node.featureType !== "fillet")
    throw new Error("modifyFillet: not a fillet feature");
  const parameters: ScadgenParameter[] = node.parameters.map((p) => ({ ...p }));
  if (edit.radius !== undefined) {
    if (!(edit.radius > 0)) throw new Error("modifyFillet: radius must be > 0");
    setParameter(parameters, {
      kind: "quantity",
      parameterId: "radius",
      value: edit.radius,
      units: "m",
      expression: formatQuantityExpression(edit.radius, "m"),
    });
  }
  if (edit.edgeTags) {
    const ent = parameters.find(
      (p) => p.kind === "queryList" && p.parameterId === "entities",
    );
    const srcFid =
      ent && ent.kind === "queryList"
        ? (ent.queries[0]?.creationFeatureId ?? null)
        : null;
    if (!srcFid)
      throw new Error("modifyFillet: cannot resolve edge source feature");
    setParameter(parameters, {
      kind: "queryList",
      parameterId: "entities",
      queries: edit.edgeTags.map((t) =>
        provenanceForFeature(srcFid, "EDGE", t),
      ),
    });
  }
  return { ...node, parameters };
}

export function modifyFillet(
  history: ScadgenHistory,
  featureId: string,
  edit: FilletEdit,
): boolean {
  const node = history.get(featureId);
  if (!node) return false;
  const updated = applyFilletEdit(node, edit);
  for (const p of updated.parameters) history.updateParameter(featureId, p);
  return true;
}

export function buildEdgeFilletNode(
  featureId: string,
  name: string,
  bodyFeatureId: string,
  edgeTags: string[],
  radius: number,
): ScadgenFeatureNode {
  return buildFilletNode(
    featureId,
    name,
    edgeTags.map((t) => provenanceForFeature(bodyFeatureId, "EDGE", t)),
    {
      value: radius,
      units: "m",
      expression: formatQuantityExpression(radius, "m"),
    },
  );
}
