import { identifiersIn, UNIT_FACTORS, type Dim } from "./expression";
import type { ScadgenFeatureNode } from "./onshapeHistory";

export interface VariableDef {
  featureId: string;
  name: string;
  type: string;
  units: string;
  expression: string;
  valueSi: number;
  dim: Dim;
}

export interface VariableRow extends VariableDef {
  usedBy: { featureId: string; name: string; featureType: string }[];
}

function quantityParam(node: ScadgenFeatureNode, id: string) {
  const p = node.parameters.find(
    (x) => x.kind === "quantity" && x.parameterId === id,
  );
  return p && p.kind === "quantity" ? p : null;
}

export function collectVariables(
  nodes: ScadgenFeatureNode[],
): Map<string, VariableDef> {
  const out = new Map<string, VariableDef>();
  for (const node of nodes) {
    if (node.featureType !== "variable" || node.suppressed) continue;
    const nameP = node.parameters.find(
      (x) => x.kind === "string" && x.parameterId === "varName",
    );
    if (!nameP || nameP.kind !== "string") continue;
    const q = quantityParam(node, "value");
    if (!q) continue;
    const typeP = node.parameters.find(
      (x) => x.kind === "enum" && x.parameterId === "varType",
    );
    out.set(nameP.value, {
      featureId: node.featureId,
      name: nameP.value,
      type: typeP && typeP.kind === "enum" ? typeP.value : "number",
      units: q.units,
      expression: q.expression,
      valueSi: q.value,
      dim:
        (typeP && typeP.kind === "enum" ? typeP.value : "number") === "distance"
          ? { m: 1 }
          : (typeP && typeP.kind === "enum" ? typeP.value : "number") ===
              "angle"
            ? { rad: 1 }
            : {},
    });
  }
  return out;
}

function expressionsOf(node: ScadgenFeatureNode): string[] {
  const out: string[] = [];
  for (const p of node.parameters) {
    if (p.kind === "quantity") out.push(p.expression);
  }
  return out;
}

export function variablesPanelRows(nodes: ScadgenFeatureNode[]): VariableRow[] {
  const defs = collectVariables(nodes);
  const rows: VariableRow[] = [];
  for (const [name, def] of defs) {
    const usedBy: VariableRow["usedBy"] = [];
    const interested = new Set<string>([name]);
    const queue = [name];
    const reported = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      for (const node of nodes) {
        if (node.suppressed) continue;
        const ids = expressionsOf(node).flatMap((e) => identifiersIn(e));
        if (!ids.some((id) => id === cur)) continue;
        if (node.featureType === "variable") {
          const nameP = node.parameters.find(
            (x) => x.kind === "string" && x.parameterId === "varName",
          );
          const vn = nameP && nameP.kind === "string" ? nameP.value : "";
          if (vn && !interested.has(vn)) {
            interested.add(vn);
            queue.push(vn);
          }
        } else if (!reported.has(node.featureId)) {
          reported.add(node.featureId);
          usedBy.push({
            featureId: node.featureId,
            name: node.name,
            featureType: node.featureType,
          });
        }
      }
    }
    rows.push({ ...def, usedBy });
  }
  return rows;
}

export function variablesForFeature(
  nodes: ScadgenFeatureNode[],
  featureId: string,
): string[] {
  const defs = collectVariables(nodes);
  const node = nodes.find((n) => n.featureId === featureId);
  if (!node) return [];
  const direct = new Set<string>();
  for (const e of expressionsOf(node)) {
    for (const id of identifiersIn(e)) {
      if (defs.has(id)) direct.add(id);
    }
  }
  const out = new Set<string>();
  const visit = (name: string) => {
    if (out.has(name)) return;
    out.add(name);
    const d = defs.get(name);
    if (d)
      for (const id of identifiersIn(d.expression)) {
        if (defs.has(id)) visit(id);
      }
  };
  for (const n of direct) visit(n);
  return [...out];
}

export { UNIT_FACTORS };
