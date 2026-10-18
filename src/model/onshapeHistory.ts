// scadgen canonical feature history, ported from Onshape BTM wire evidence
// (~/cadjs/docs/ONSHAPE_MAP.md §5.1–5.2, captured 2026-10-17)

import {
  DIM_LENGTH,
  type Scope,
  dimsEqual,
  dimLabel,
  evalExpr,
  formatSi,
} from "./expression";

export type ScadgenEntityType = "EDGE" | "FACE" | "VERTEX" | "SKETCH_ENTITY";

export interface ProvenanceQuery {
  entityType: ScadgenEntityType;
  historyType: "CREATION";
  creationFeatureId: string | null;
  entityTag: string;
  disambiguation?: "IMPRINT" | string;
  derivedFrom?: string | null;
}

export type ScadgenParameter =
  | { kind: "boolean"; parameterId: string; value: boolean }
  | { kind: "enum"; parameterId: string; value: string }
  | {
      kind: "quantity";
      parameterId: string;
      value: number;
      units: string;
      expression: string;
    }
  | { kind: "string"; parameterId: string; value: string }
  | { kind: "queryList"; parameterId: string; queries: ProvenanceQuery[] }
  | { kind: "matrix"; parameterId: string; elements: number[] };

export interface ScadgenFeatureNode {
  featureId: string;
  featureType: string;
  name: string;
  namespace: string;
  parameters: ScadgenParameter[];
  subFeatures: ScadgenFeatureNode[];
  suppressed: boolean;
  extensions?: Record<string, unknown>;
}

export function parseQuantityExpression(expression: string): number | null {
  const r = evalExpr(expression);
  return r.ok ? r.value : null;
}

export function formatQuantityExpression(
  valueSi: number,
  units: string,
): string {
  return formatSi(valueSi, units);
}

function paramById(
  params: ScadgenParameter[],
  id: string,
): ScadgenParameter | undefined {
  return params.find((p) => p.parameterId === id);
}

export function setParameter(
  params: ScadgenParameter[],
  param: ScadgenParameter,
): ScadgenParameter[] {
  const existing = paramById(params, param.parameterId);
  if (existing) Object.assign(existing, param);
  else params.push(param);
  return params;
}

export function buildSketchNode(
  featureId: string,
  name: string,
  entityTags: string[],
  planeRef: ProvenanceQuery | null,
  snapshot?: Record<string, unknown>,
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  setParameter(parameters, {
    kind: "queryList",
    parameterId: "entities",
    queries: entityTags.map((entityTag) => ({
      entityType: "SKETCH_ENTITY" as ScadgenEntityType,
      historyType: "CREATION" as const,
      creationFeatureId: featureId,
      entityTag,
    })),
  });
  if (planeRef) {
    setParameter(parameters, {
      kind: "queryList",
      parameterId: "sketchPlane",
      queries: [planeRef],
    });
  }
  return {
    featureId,
    featureType: "newSketch",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
    ...(snapshot ? { extensions: { sketch: snapshot } } : {}),
  };
}

export function buildVariableNode(
  featureId: string,
  varName: string,
  valueSi: number,
  units: string,
  varType: "distance" | "angle" | "number" = units === "deg" || units === "rad"
    ? "angle"
    : units
      ? "distance"
      : "number",
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "variable",
    name: varName,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "varName", value: varName },
      { kind: "enum", parameterId: "varType", value: varType },
      {
        kind: "quantity",
        parameterId: "value",
        value: valueSi,
        units,
        expression: formatSi(valueSi, units),
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}

export function buildExtrudeNode(
  featureId: string,
  name: string,
  entities: ProvenanceQuery[],
  depth: { value: number; units: string; expression: string },
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "enum", parameterId: "domain", value: "MODEL" });
  push({ kind: "enum", parameterId: "bodyType", value: "SOLID" });
  push({ kind: "enum", parameterId: "operationType", value: "NEW" });
  push({ kind: "enum", parameterId: "surfaceOperationType", value: "NEW" });
  push({ kind: "enum", parameterId: "flatOperationType", value: "REMOVE" });
  push({
    kind: "queryList",
    parameterId: "entities",
    queries: entities,
  });
  push({ kind: "queryList", parameterId: "surfaceEntities", queries: [] });
  push({ kind: "boolean", parameterId: "midplane", value: false });
  push({
    kind: "quantity",
    parameterId: "thickness",
    ...depth,
  });
  push({ kind: "enum", parameterId: "endBound", value: "BLIND" });
  push({ kind: "boolean", parameterId: "oppositeDirection", value: false });
  push({
    kind: "quantity",
    parameterId: "depth",
    ...depth,
  });
  push({
    kind: "quantity",
    parameterId: "offsetDistance",
    value: 0,
    units: "m",
    expression: "25 mm",
  });
  push({
    kind: "quantity",
    parameterId: "draftAngle",
    value: 0,
    units: "rad",
    expression: "3 deg",
  });
  push({ kind: "boolean", parameterId: "hasDraft", value: false });
  push({ kind: "boolean", parameterId: "hasOffset", value: false });
  push({ kind: "boolean", parameterId: "symmetric", value: false });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "extrude",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function extrudeDepthOf(
  node: ScadgenFeatureNode,
  scope: Scope = {},
): number | null {
  const p = node.parameters.find(
    (x) => x.kind === "quantity" && x.parameterId === "depth",
  );
  if (!p || p.kind !== "quantity") return null;
  const r = evalExpr(p.expression, scope);
  if (!r.ok) return p.value || 0;
  if (!dimsEqual(r.dim, DIM_LENGTH))
    throw new Error(
      `'depth': expected ${dimLabel(DIM_LENGTH)}, got ${dimLabel(r.dim)}`,
    );
  return r.value;
}

// Contracts below follow opFillet/opShell map keys from the FS stdlib dump
// (~/references/onshape-fs-library.md lines ~1886–2060, 3511+).

export function buildFilletNode(
  featureId: string,
  name: string,
  edges: ProvenanceQuery[],
  radius: { value: number; units: string; expression: string },
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "entities", queries: edges });
  push({ kind: "quantity", parameterId: "radius", ...radius });
  push({ kind: "boolean", parameterId: "isVariable", value: false });
  push({ kind: "boolean", parameterId: "tangentPropagation", value: true });
  push({ kind: "boolean", parameterId: "smoothCorners", value: false });
  push({ kind: "boolean", parameterId: "allowEdgeOverflow", value: true });
  push({ kind: "enum", parameterId: "crossSection", value: "CIRCULAR" });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "fillet",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildShellNode(
  featureId: string,
  name: string,
  facesToRemove: ProvenanceQuery[],
  thickness: { value: number; units: string; expression: string },
  keepType: "KEEP_SHELL" | "KEEP_CORE" | string = "KEEP_SHELL",
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({
    kind: "queryList",
    parameterId: "entities",
    queries: facesToRemove,
  });
  push({ kind: "quantity", parameterId: "thickness", ...thickness });
  push({ kind: "enum", parameterId: "keepType", value: keepType });
  push({ kind: "boolean", parameterId: "direction", value: false });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "shell",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function provenanceForFeature(
  creationFeatureId: string,
  entityType: ScadgenEntityType,
  entityTag: string,
): ProvenanceQuery {
  return {
    entityType,
    historyType: "CREATION",
    creationFeatureId,
    entityTag,
  };
}

// Revolve/sweep/loft/chamfer/boolean/mirror parameter keys are from the
// op* map definitions in ~/references/onshape-fs-library.md (2026-10-17 pass).

export function buildRevolveNode(
  featureId: string,
  name: string,
  profiles: ProvenanceQuery[],
  axis: ProvenanceQuery[],
  angleForward: { value: number; units: string; expression: string },
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "entities", queries: profiles });
  push({ kind: "queryList", parameterId: "axis", queries: axis });
  push({ kind: "quantity", parameterId: "angleForward", ...angleForward });
  push({
    kind: "quantity",
    parameterId: "angleBack",
    value: 0,
    units: "rad",
    expression: "0 deg",
  });
  push({ kind: "enum", parameterId: "cornerType", value: "ROUNDED" });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "revolve",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildSweepNode(
  featureId: string,
  name: string,
  profiles: ProvenanceQuery[],
  path: ProvenanceQuery[],
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "profiles", queries: profiles });
  push({ kind: "queryList", parameterId: "path", queries: path });
  push({
    kind: "boolean",
    parameterId: "keepProfileOrientation",
    value: false,
  });
  push({
    kind: "quantity",
    parameterId: "chordalTolerance",
    value: 0,
    units: "m",
    expression: "0.05 mm",
  });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "sweep",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildLoftNode(
  featureId: string,
  name: string,
  profiles: ProvenanceQuery[],
  guides: ProvenanceQuery[] = [],
  ruled = false,
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "profiles", queries: profiles });
  push({ kind: "queryList", parameterId: "guideSubqueries", queries: guides });
  push({ kind: "boolean", parameterId: "ruled", value: ruled });
  push({ kind: "enum", parameterId: "loftType", value: "FLUID" });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "loft",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildChamferNode(
  featureId: string,
  name: string,
  edges: ProvenanceQuery[],
  chamferType: "DIST_DISTS" | "DIST_ANG" | "ANG_DISTS" | "SYM_DISTS" | string,
  width: { value: number; units: string; expression: string },
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "entities", queries: edges });
  push({ kind: "enum", parameterId: "chamferType", value: chamferType });
  push({ kind: "quantity", parameterId: "width", ...width });
  push({ kind: "boolean", parameterId: "tangentPropagation", value: true });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "chamfer",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildBooleanNode(
  featureId: string,
  name: string,
  targets: ProvenanceQuery[],
  tools: ProvenanceQuery[],
  operationType: "ADD" | "CUT" | "COMMON" | "INTERSECT" | string = "ADD",
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "targets", queries: targets });
  push({ kind: "queryList", parameterId: "tools", queries: tools });
  push({ kind: "enum", parameterId: "operationType", value: operationType });
  push({ kind: "boolean", parameterId: "keepTools", value: false });
  push({ kind: "boolean", parameterId: "makeSolid", value: true });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "boolean",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildMirrorNode(
  featureId: string,
  name: string,
  entities: ProvenanceQuery[],
  mirrorPlane: ProvenanceQuery[],
  transform: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  overrides: ScadgenParameter[] = [],
): ScadgenFeatureNode {
  const parameters: ScadgenParameter[] = [];
  const push = (p: ScadgenParameter) => setParameter(parameters, p);
  push({ kind: "queryList", parameterId: "entities", queries: entities });
  push({ kind: "queryList", parameterId: "mirrorPlane", queries: mirrorPlane });
  push({ kind: "matrix", parameterId: "transform", elements: transform });
  push({ kind: "boolean", parameterId: "orientWithMirror", value: false });
  for (const o of overrides) push(o);
  return {
    featureId,
    featureType: "mirror",
    name,
    namespace: "",
    parameters,
    subFeatures: [],
    suppressed: false,
  };
}

export function buildInsertNode(
  featureId: string,
  name: string,
  assetId: string,
  format: "stl" | "step",
): ScadgenFeatureNode {
  return {
    featureId,
    featureType: "insertedBody",
    name,
    namespace: "",
    parameters: [
      { kind: "string", parameterId: "assetId", value: assetId },
      { kind: "enum", parameterId: "format", value: format },
      {
        kind: "matrix",
        parameterId: "placement",
        elements: [0, 0, 0],
      },
    ],
    subFeatures: [],
    suppressed: false,
  };
}
