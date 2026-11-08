// Phase 7 — document-level Variable Studio.
//
// Variables live outside Part Studio feature history. The studio owns stable
// IDs, names, types, expressions and evaluation order; the value table is a
// pure function of those expressions. Sketch-scoped variable features can be
// migrated in without changing their evaluated values.
import type { ScadgenFeatureNode } from "../model/onshapeHistory";
import {
  evaluateP7Expression,
  identifiersInP7Expression,
  p7Diagnostic,
  p7TypeLabel,
  p7ValueLabel,
  type P7Diagnostic,
  type P7Scope,
  type P7Type,
  type P7Value,
} from "./expression";

export const VARIABLE_STUDIO_SCHEMA = "scadgen.variablestudio";
export const VARIABLE_STUDIO_VERSION = 1 as const;

export type VariableType = "number" | "length" | "angle" | "boolean" | "string";
export type VariableScope = "document" | "local";

export interface StudioVariable {
  id: string;
  name: string;
  type: VariableType;
  expression: string;
  description: string;
  scope: VariableScope;
  order: number;
}

export interface VariableStudioDocument {
  schema: typeof VARIABLE_STUDIO_SCHEMA;
  v: typeof VARIABLE_STUDIO_VERSION;
  id: string;
  name: string;
  variables: StudioVariable[];
  updatedAt: number;
}

export interface VariableIssue {
  path: string;
  message: string;
  variableId?: string;
}

export type VariableResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: VariableIssue[] };

let variableSeq = 0;

function variableSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "variable"
  );
}

export function nextVariableId(name: string, now = Date.now()): string {
  variableSeq += 1;
  return `var_${variableSlug(name)}_${now.toString(36)}_${variableSeq}`;
}

/** Deterministic id for a legacy variable that was saved without one. */
function legacyVariableId(name: string, index: number): string {
  return `var_legacy_${variableSlug(name)}_${index}`;
}

export function emptyVariableStudio(
  name = "Variable Studio",
  id = `vars_${Date.now().toString(36)}`,
): VariableStudioDocument {
  return {
    schema: VARIABLE_STUDIO_SCHEMA,
    v: VARIABLE_STUDIO_VERSION,
    id,
    name,
    variables: [],
    updatedAt: Date.now(),
  };
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const TYPE_LABEL: Record<VariableType, string> = {
  number: "number",
  length: "length",
  angle: "angle",
  boolean: "boolean",
  string: "string",
};

export function variableTypeLabel(type: VariableType): string {
  return TYPE_LABEL[type];
}

export function isVariableType(value: unknown): value is VariableType {
  return (
    value === "number" ||
    value === "length" ||
    value === "angle" ||
    value === "boolean" ||
    value === "string"
  );
}

function nextOrder(studio: VariableStudioDocument): number {
  return (
    studio.variables.reduce(
      (max, variable) => Math.max(max, variable.order),
      -1,
    ) + 1
  );
}

export function createStudioVariable(
  input: {
    id?: string;
    name: string;
    type: VariableType;
    expression: string;
    description?: string;
    scope?: VariableScope;
  },
  studio?: VariableStudioDocument,
): VariableResult<StudioVariable> {
  const name = input.name.trim();
  if (!IDENTIFIER.test(name))
    return {
      ok: false,
      errors: [
        {
          path: "variable.name",
          message: "name must start with a letter or underscore",
        },
      ],
    };
  if (!input.type)
    return {
      ok: false,
      errors: [{ path: "variable.type", message: "type is required" }],
    };
  if (!input.expression.trim())
    return {
      ok: false,
      errors: [
        { path: "variable.expression", message: "expression is required" },
      ],
    };
  if (
    studio?.variables.some(
      (variable) => variable.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return {
      ok: false,
      errors: [
        {
          path: "variable.name",
          message: `duplicate variable name '${name}'`,
        },
      ],
    };
  return {
    ok: true,
    value: {
      id: input.id?.trim() || nextVariableId(name),
      name,
      type: input.type,
      expression: input.expression.trim(),
      description: input.description?.trim() || "",
      scope: input.scope ?? "document",
      order: studio ? nextOrder(studio) : 0,
    },
  };
}

export function addStudioVariable(
  studio: VariableStudioDocument,
  variable: StudioVariable,
): VariableResult<VariableStudioDocument> {
  if (studio.variables.some((entry) => entry.id === variable.id))
    return {
      ok: false,
      errors: [
        {
          path: "variable.id",
          message: `duplicate variable id '${variable.id}'`,
        },
      ],
    };
  return {
    ok: true,
    value: {
      ...studio,
      variables: [...studio.variables, { ...variable }],
      updatedAt: Date.now(),
    },
  };
}

export function updateStudioVariable(
  studio: VariableStudioDocument,
  variableId: string,
  patch: Partial<Omit<StudioVariable, "id">>,
): VariableResult<VariableStudioDocument> {
  const index = studio.variables.findIndex((entry) => entry.id === variableId);
  if (index < 0)
    return {
      ok: false,
      errors: [
        { path: "variable.id", message: `unknown variable '${variableId}'` },
      ],
    };
  const existing = studio.variables[index]!;
  const nextName = patch.name?.trim() ?? existing.name;
  if (!IDENTIFIER.test(nextName))
    return {
      ok: false,
      errors: [
        {
          path: "variable.name",
          message: "name must start with a letter or underscore",
        },
      ],
    };
  if (
    studio.variables.some(
      (entry) =>
        entry.id !== variableId &&
        entry.name.toLowerCase() === nextName.toLowerCase(),
    )
  )
    return {
      ok: false,
      errors: [
        {
          path: "variable.name",
          message: `duplicate variable name '${nextName}'`,
        },
      ],
    };
  const next: StudioVariable = {
    ...existing,
    ...patch,
    name: nextName,
    expression: patch.expression?.trim() ?? existing.expression,
    description: patch.description?.trim() ?? existing.description,
  };
  if (!next.expression)
    return {
      ok: false,
      errors: [
        { path: "variable.expression", message: "expression is required" },
      ],
    };
  const variables = [...studio.variables];
  variables[index] = next;
  return {
    ok: true,
    value: { ...studio, variables, updatedAt: Date.now() },
  };
}

export function renameStudioVariable(
  studio: VariableStudioDocument,
  variableId: string,
  name: string,
): VariableResult<VariableStudioDocument> {
  return updateStudioVariable(studio, variableId, { name });
}

export function formatStudioVariableValue(value: P7Value | null): string {
  if (!value) return "—";
  return p7ValueLabel(value);
}

export function deleteStudioVariable(
  studio: VariableStudioDocument,
  variableId: string,
): VariableStudioDocument {
  return {
    ...studio,
    variables: studio.variables.filter((entry) => entry.id !== variableId),
    updatedAt: Date.now(),
  };
}

export function reorderStudioVariable(
  studio: VariableStudioDocument,
  variableId: string,
  toIndex: number,
): VariableStudioDocument {
  const ordered = [...studio.variables].sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((entry) => entry.id === variableId);
  if (from < 0) return studio;
  const clamped = Math.max(0, Math.min(ordered.length - 1, toIndex));
  const [moved] = ordered.splice(from, 1);
  if (!moved) return studio;
  ordered.splice(clamped, 0, moved);
  return {
    ...studio,
    variables: ordered.map((entry, index) => ({ ...entry, order: index })),
    updatedAt: Date.now(),
  };
}

export function filterStudioVariables(
  studio: VariableStudioDocument,
  query: string,
): StudioVariable[] {
  const needle = query.trim().toLowerCase();
  const ordered = [...studio.variables].sort((a, b) => a.order - b.order);
  if (!needle) return ordered;
  return ordered.filter((variable) =>
    [
      variable.name,
      variable.description,
      variable.type,
      variable.expression,
    ].some((value) => value.toLowerCase().includes(needle)),
  );
}

export function validateVariableStudio(
  studio: VariableStudioDocument,
): VariableIssue[] {
  const issues: VariableIssue[] = [];
  if (!studio.id.trim())
    issues.push({ path: "studio.id", message: "studio id is required" });
  if (!studio.name.trim())
    issues.push({ path: "studio.name", message: "studio name is required" });
  const names = new Map<string, string>();
  const ids = new Set<string>();
  studio.variables.forEach((variable, index) => {
    if (!variable.id.trim())
      issues.push({
        path: `variables[${index}].id`,
        message: "variable id is required",
      });
    else if (ids.has(variable.id))
      issues.push({
        path: `variables[${index}].id`,
        message: `duplicate id '${variable.id}'`,
        variableId: variable.id,
      });
    ids.add(variable.id);
    if (!IDENTIFIER.test(variable.name))
      issues.push({
        path: `variables[${index}].name`,
        message: `'${variable.name}' is not a valid identifier`,
        variableId: variable.id,
      });
    const key = variable.name.toLowerCase();
    if (names.has(key))
      issues.push({
        path: `variables[${index}].name`,
        message: `duplicate name '${variable.name}'`,
        variableId: variable.id,
      });
    names.set(key, variable.id);
    if (!isVariableType(variable.type))
      issues.push({
        path: `variables[${index}].type`,
        message: "unknown variable type",
        variableId: variable.id,
      });
    if (!variable.expression.trim())
      issues.push({
        path: `variables[${index}].expression`,
        message: "expression is required",
        variableId: variable.id,
      });
  });
  return issues;
}

export interface ResolvedVariable {
  variable: StudioVariable;
  value: P7Value | null;
  directDependencies: string[];
  transitiveDependencies: string[];
  /** Direct and transitive variables that read this variable. */
  transitiveUsedBy: string[];
  diagnostics: P7Diagnostic[];
}

export interface VariableDependencyGraph {
  /** name -> names it directly reads. */
  direct: Record<string, string[]>;
  /** name -> names that directly read it. */
  usedBy: Record<string, string[]>;
}

export interface ResolvedVariableStudio {
  values: Record<string, P7Value>;
  rows: ResolvedVariable[];
  issues: VariableIssue[];
  graph: VariableDependencyGraph;
  cycles: string[];
}

/**
 * Evaluate every variable in dependency order. Cycles are named, not silently
 * resolved to stale values. A failed variable is omitted from `values` so the
 * feature executor can fall back to its own parameter value.
 */
export function resolveVariableStudio(
  studio: VariableStudioDocument,
  extraScope: P7Scope = {},
): ResolvedVariableStudio {
  const ordered = [...studio.variables].sort((a, b) => a.order - b.order);
  const byName = new Map(ordered.map((variable) => [variable.name, variable]));
  const graph: VariableDependencyGraph = { direct: {}, usedBy: {} };
  for (const variable of ordered) {
    const deps = identifiersInP7Expression(variable.expression).filter((name) =>
      byName.has(name),
    );
    graph.direct[variable.name] = deps;
    for (const dep of deps) {
      graph.usedBy[dep] = [...(graph.usedBy[dep] ?? []), variable.name];
    }
  }

  const resolved = new Map<string, P7Value>();
  const failure = new Map<string, P7Diagnostic[]>();
  const visiting = new Set<string>();
  const cycles = new Set<string>();
  const completed = new Set<string>();

  const visit = (name: string, path: string[]): P7Value | null => {
    if (resolved.has(name)) return resolved.get(name)!;
    if (failure.has(name)) return null;
    const variable = byName.get(name);
    if (!variable) return null;
    if (visiting.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      cycles.add(cycle.join(" -> "));
      failure.set(name, [
        p7Diagnostic(
          "variables.cycle",
          `circular reference: ${cycle.join(" -> ")}`,
        ),
      ]);
      return null;
    }
    visiting.add(name);
    const scope: P7Scope = { ...extraScope };
    const depDiagnostics: P7Diagnostic[] = [];
    for (const dep of graph.direct[name] ?? []) {
      const value = visit(dep, [...path, name]);
      if (value) scope[dep] = value;
      else
        depDiagnostics.push(
          p7Diagnostic(
            "variables.dependency",
            `dependency '${dep}' has no value`,
          ),
        );
    }
    visiting.delete(name);
    const result = evaluateP7Expression(variable.expression, scope);
    if (!result.ok || depDiagnostics.length) {
      failure.set(
        name,
        result.ok ? depDiagnostics : [...depDiagnostics, ...result.diagnostics],
      );
      return null;
    }
    if (!valueMatchesType(variable.type, result.value)) {
      failure.set(name, [
        p7Diagnostic(
          "variables.type",
          `'${variable.name}' expects ${p7TypeLabel(variable.type)}, got ${p7TypeLabel(result.value.kind)}`,
        ),
      ]);
      return null;
    }
    resolved.set(name, result.value);
    completed.add(name);
    return result.value;
  };

  for (const variable of ordered) visit(variable.name, []);

  const rows: ResolvedVariable[] = ordered.map((variable) => {
    const diagnostics = failure.get(variable.name) ?? [];
    const transitive: string[] = [];
    const queue = [...(graph.direct[variable.name] ?? [])];
    const seen = new Set<string>();
    while (queue.length) {
      const dep = queue.shift()!;
      if (seen.has(dep)) continue;
      seen.add(dep);
      transitive.push(dep);
      queue.push(...(graph.direct[dep] ?? []));
    }
    const consumers: string[] = [];
    const consumerQueue = [...(graph.usedBy[variable.name] ?? [])];
    const seenConsumers = new Set<string>();
    while (consumerQueue.length) {
      const consumer = consumerQueue.shift()!;
      if (seenConsumers.has(consumer)) continue;
      seenConsumers.add(consumer);
      consumers.push(consumer);
      consumerQueue.push(...(graph.usedBy[consumer] ?? []));
    }
    return {
      variable,
      value: resolved.get(variable.name) ?? null,
      directDependencies: graph.direct[variable.name] ?? [],
      transitiveDependencies: transitive,
      transitiveUsedBy: consumers,
      diagnostics,
    };
  });

  const issues: VariableIssue[] = validateVariableStudio(studio);
  for (const row of rows) {
    if (row.diagnostics.length)
      issues.push({
        path: `variable.${row.variable.name}`,
        message: row.diagnostics.map((diag) => diag.message).join("; "),
        variableId: row.variable.id,
      });
  }
  return {
    values: Object.fromEntries(resolved),
    rows,
    issues,
    graph,
    cycles: [...cycles],
  };
}

function valueMatchesType(type: VariableType, value: P7Value): boolean {
  return value.kind === type;
}

/** Direct + transitive consumers of a variable inside the same studio. */
export function variableUsedBy(
  studio: VariableStudioDocument,
  name: string,
): string[] {
  return (
    resolveVariableStudio(studio).rows.find((row) => row.variable.name === name)
      ?.transitiveUsedBy ?? []
  );
}

export function variableRowsForDisplay(
  resolved: ResolvedVariableStudio,
): Array<{
  variable: StudioVariable;
  display: string;
  error: string;
  dependencies: string;
  usedBy: string;
}> {
  return resolved.rows.map((row) => ({
    variable: row.variable,
    display: row.value ? p7ValueLabel(row.value) : "—",
    error: row.diagnostics.map((diag) => diag.message).join("; "),
    dependencies: row.transitiveDependencies.join(", "),
    usedBy: (resolved.graph.usedBy[row.variable.name] ?? []).join(", "),
  }));
}

// ---------------------------------------------------------------------------
// Migration from sketch-scoped variable features
// ---------------------------------------------------------------------------

function legacyTypeToVariableType(type: string, units: string): VariableType {
  if (type === "distance") return "length";
  if (type === "angle") return "angle";
  if (type === "number") return "number";
  return units === "deg" || units === "rad"
    ? "angle"
    : units
      ? "length"
      : "number";
}

/**
 * Convert `variable` feature nodes into document variables. The expression is
 * preserved verbatim, so migration does not round a 12.7 mm value through a
 * display unit. Existing variables with the same name keep their IDs.
 */
export function migrateSketchVariables(
  nodes: readonly ScadgenFeatureNode[],
  studio: VariableStudioDocument,
): { studio: VariableStudioDocument; migrated: number; skipped: number } {
  const next = {
    ...studio,
    variables: [...studio.variables],
    updatedAt: Date.now(),
  };
  let migrated = 0;
  let skipped = 0;
  for (const node of nodes) {
    if (node.featureType !== "variable" || node.suppressed) continue;
    const nameParam = node.parameters.find(
      (param) => param.kind === "string" && param.parameterId === "varName",
    );
    const valueParam = node.parameters.find(
      (param) => param.kind === "quantity" && param.parameterId === "value",
    );
    if (
      !nameParam ||
      nameParam.kind !== "string" ||
      !valueParam ||
      valueParam.kind !== "quantity"
    ) {
      skipped += 1;
      continue;
    }
    const existing = next.variables.find(
      (variable) => variable.name === nameParam.value,
    );
    if (existing) {
      skipped += 1;
      continue;
    }
    const typeParam = node.parameters.find(
      (param) => param.kind === "enum" && param.parameterId === "varType",
    );
    const type = legacyTypeToVariableType(
      typeParam?.kind === "enum" ? typeParam.value : "number",
      valueParam.units,
    );
    const created = createStudioVariable(
      {
        id: `var_migrated_${node.featureId}`,
        name: nameParam.value,
        type,
        expression: valueParam.expression,
        description: `Migrated from ${node.name}`,
      },
      next,
    );
    if (!created.ok) {
      skipped += 1;
      continue;
    }
    next.variables.push(created.value);
    migrated += 1;
  }
  return { studio: next, migrated, skipped };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeVariableStudio(
  studio: VariableStudioDocument,
): string {
  return JSON.stringify(studio);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseVariableStudio(
  text: string,
): VariableResult<VariableStudioDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      errors: [{ path: "studio", message: "not valid JSON" }],
    };
  }
  const record = asRecord(raw);
  if (!record)
    return {
      ok: false,
      errors: [{ path: "studio", message: "studio must be an object" }],
    };
  if (record.schema !== undefined && record.schema !== VARIABLE_STUDIO_SCHEMA)
    return {
      ok: false,
      errors: [{ path: "studio.schema", message: "unsupported studio schema" }],
    };
  if (record.v !== undefined && record.v !== VARIABLE_STUDIO_VERSION)
    return {
      ok: false,
      errors: [
        {
          path: "studio.v",
          message: `unsupported variable studio version ${String(record.v)}`,
        },
      ],
    };
  const variables: StudioVariable[] = [];
  const rawVariables = Array.isArray(record.variables) ? record.variables : [];
  rawVariables.forEach((item, index) => {
    const entry = asRecord(item);
    if (!entry) return;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) return;
    const type = isVariableType(entry.type) ? entry.type : "number";
    const order =
      typeof entry.order === "number" && Number.isFinite(entry.order)
        ? entry.order
        : index;
    variables.push({
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : legacyVariableId(name, index),
      name,
      type,
      expression:
        typeof entry.expression === "string" && entry.expression.trim()
          ? entry.expression
          : "0",
      description:
        typeof entry.description === "string" ? entry.description : "",
      scope: entry.scope === "local" ? "local" : "document",
      order,
    });
  });
  const studio: VariableStudioDocument = {
    schema: VARIABLE_STUDIO_SCHEMA,
    v: VARIABLE_STUDIO_VERSION,
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `vars_${Date.now().toString(36)}`,
    name:
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : "Variable Studio",
    variables,
    updatedAt:
      typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
  const issues = validateVariableStudio(studio);
  if (issues.length) return { ok: false, errors: issues };
  return { ok: true, value: studio };
}
