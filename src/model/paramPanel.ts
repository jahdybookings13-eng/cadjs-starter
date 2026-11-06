// Parameter panel model — the UI-ready projection of a feature's params.
// This is "P6c": given a feature node and its FeatureMapEntry, produce the
// rows a VR (or desktop) panel renders and edits, in declared order. Pure
// data: no DOM, no worker. Mirrors variables.ts's panel-row shape so panels
// can be built the same way in both worlds.
//
// source: featureMap.ts ParamSpec, onshapeHistory.ts ScadgenFeatureNode.
import { feature, type ParamSpec } from "./featureMap";
import { collectVariables, type VariableDef } from "./variables";
import type { ScadgenFeatureNode } from "./onshapeHistory";

export type PanelRowKind =
  | "quantity"
  | "boolean"
  | "enum"
  | "string"
  | "queryList"
  | "matrix";

export interface PanelRow {
  parameterId: string;
  kind: PanelRowKind;
  label: string;
  /** Raw current value from the node, or the spec default if absent. */
  value: unknown;
  /** For quantity rows: the entered expression string and resolved SI value. */
  expression?: string;
  valueSi?: number;
  units?: string;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: string[];
  /** Variable name this row is driven by, if its expression is a bare identifier. */
  linkedVariable?: string;
  /** True when the node carries no explicit parameter for this spec. */
  usingDefault: boolean;
}

export interface ParamPanel {
  featureId: string;
  featureType: string;
  label: string;
  status: "implemented" | "gap" | "deferred";
  rows: PanelRow[];
  /** True when the feature type is unknown to the map (older/imported nodes). */
  unknownType: boolean;
}

const BARE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function findParam(node: ScadgenFeatureNode, id: string) {
  return node.parameters.find((p) => p.parameterId === id);
}

function linkFor(
  expression: string | undefined,
  vars: Map<string, VariableDef>,
): string | undefined {
  if (!expression) return undefined;
  const trimmed = expression.trim();
  return BARE_IDENT.test(trimmed) && vars.has(trimmed) ? trimmed : undefined;
}

function rowFromSpec(
  node: ScadgenFeatureNode,
  spec: ParamSpec,
  vars: Map<string, VariableDef>,
): PanelRow {
  const p = findParam(node, spec.parameterId);
  const base: Pick<
    PanelRow,
    | "parameterId"
    | "kind"
    | "label"
    | "units"
    | "min"
    | "max"
    | "step"
    | "enumValues"
  > = {
    parameterId: spec.parameterId,
    kind: spec.kind,
    label: spec.label,
  };
  if (spec.units !== undefined) base.units = spec.units;
  if (spec.min !== undefined) base.min = spec.min;
  if (spec.max !== undefined) base.max = spec.max;
  if (spec.step !== undefined) base.step = spec.step;
  if (spec.enumValues !== undefined) base.enumValues = spec.enumValues;

  switch (spec.kind) {
    case "quantity": {
      if (p && p.kind === "quantity") {
        const row: PanelRow = {
          ...base,
          kind: "quantity",
          value: p.value,
          expression: p.expression,
          valueSi: p.value,
          usingDefault: false,
        };
        const link = linkFor(p.expression, vars);
        if (link) row.linkedVariable = link;
        return row;
      }
      const dv = Number(spec.default);
      return {
        ...base,
        kind: "quantity",
        value: dv,
        expression: String(dv),
        valueSi: dv,
        usingDefault: true,
      };
    }
    case "boolean": {
      if (p && p.kind === "boolean") {
        return {
          ...base,
          kind: "boolean",
          value: p.value,
          usingDefault: false,
        };
      }
      return {
        ...base,
        kind: "boolean",
        value: Boolean(spec.default),
        usingDefault: true,
      };
    }
    case "enum":
    case "string": {
      if (p && p.kind === spec.kind) {
        const expr =
          "expression" in p && typeof p.expression === "string"
            ? p.expression
            : undefined;
        const row: PanelRow = {
          ...base,
          kind: spec.kind,
          value: p.value,
          usingDefault: false,
        };
        if (expr !== undefined) {
          row.expression = expr;
          const link = linkFor(expr, vars);
          if (link) row.linkedVariable = link;
        }
        return row;
      }
      return {
        ...base,
        kind: spec.kind,
        value: spec.default,
        usingDefault: true,
      };
    }
    case "queryList": {
      if (p && p.kind === "queryList") {
        return {
          ...base,
          kind: "queryList",
          value: p.queries,
          usingDefault: false,
        };
      }
      return {
        ...base,
        kind: "queryList",
        value: spec.default,
        usingDefault: true,
      };
    }
    case "matrix": {
      if (p && p.kind === "matrix") {
        return {
          ...base,
          kind: "matrix",
          value: p.elements,
          usingDefault: false,
        };
      }
      return {
        ...base,
        kind: "matrix",
        value: spec.default,
        usingDefault: true,
      };
    }
  }
}

/**
 * Build the editable panel for one feature node. Rows follow the FeatureMapEntry's
 * declared param order; hidden specs are dropped (never shown, still sent to kernel).
 */
export function paramPanelForFeature(
  nodes: ScadgenFeatureNode[],
  featureId: string,
): ParamPanel | null {
  const node = nodes.find((n) => n.featureId === featureId);
  if (!node) return null;
  const entry = feature(node.featureType);
  const vars = collectVariables(nodes);

  if (!entry) {
    return {
      featureId: node.featureId,
      featureType: node.featureType,
      label: node.featureType,
      status: "gap",
      rows: [],
      unknownType: true,
    };
  }

  const rows = entry.params
    .filter((s) => !s.hidden)
    .map((s) => rowFromSpec(node, s, vars));

  return {
    featureId: node.featureId,
    featureType: node.featureType,
    label: entry.label,
    status: entry.status,
    rows,
    unknownType: false,
  };
}

/**
 * Apply a single row edit back onto a node's parameter array, returning a new
 * params array. Quantity edits set both the expression string and the resolved
 * SI value. Unknown parameter ids are appended (kernel-friendly) rather than lost.
 */
export function applyPanelEdit(
  node: ScadgenFeatureNode,
  edit: { parameterId: string; value: unknown; expression?: string },
): ScadgenFeatureNode["parameters"] {
  const next = node.parameters.map((p) => {
    if (p.parameterId !== edit.parameterId) return p;
    if (p.kind === "quantity" && typeof edit.value === "number") {
      return {
        ...p,
        value: edit.value,
        expression: edit.expression ?? String(edit.value),
      };
    }
    return { ...p, value: edit.value } as typeof p;
  });
  const exists = node.parameters.some(
    (p) => p.parameterId === edit.parameterId,
  );
  if (!exists) {
    const entry = feature(node.featureType);
    const spec = entry?.params.find((s) => s.parameterId === edit.parameterId);
    if (spec?.kind === "quantity") {
      next.push({
        kind: "quantity",
        parameterId: edit.parameterId,
        units: spec.units ?? "m",
        value: Number(edit.value),
        expression: edit.expression ?? String(edit.value),
      } as ScadgenFeatureNode["parameters"][number]);
    } else if (spec) {
      next.push({
        kind: spec.kind as Exclude<typeof spec.kind, "quantity">,
        parameterId: edit.parameterId,
        value: edit.value,
      } as ScadgenFeatureNode["parameters"][number]);
    }
  }
  return next;
}

/**
 * Build the concrete kernel parameter to commit for one panel row edit, or null
 * when the value is unchanged / not a committable kind. The caller hands the
 * result to ScadgenHistory.updateParameter(featureId, param) to trigger rebuild.
 */
export function panelEditToParameter(
  row: PanelRow,
  value: unknown,
  expression?: string,
): ScadgenFeatureNode["parameters"][number] | null {
  if (value === undefined || value === null) return null;
  switch (row.kind) {
    case "quantity": {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      const clamped =
        row.min !== undefined || row.max !== undefined
          ? Math.min(row.max ?? Infinity, Math.max(row.min ?? -Infinity, n))
          : n;
      return {
        kind: "quantity",
        parameterId: row.parameterId,
        units: row.units ?? "m",
        value: clamped,
        expression: expression ?? String(clamped),
      } as ScadgenFeatureNode["parameters"][number];
    }
    case "boolean":
      return {
        kind: "boolean",
        parameterId: row.parameterId,
        value: Boolean(value),
      } as ScadgenFeatureNode["parameters"][number];
    case "enum":
    case "string":
      return {
        kind: row.kind,
        parameterId: row.parameterId,
        value: String(value),
      } as ScadgenFeatureNode["parameters"][number];
    default:
      return null;
  }
}
