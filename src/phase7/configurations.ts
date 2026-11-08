// Phase 7 — configurations.
//
// A configuration table is a document-owned set of inputs and rows. Switching
// rows resolves parameter/suppression/visibility/variable/BOM overrides without
// mutating the base Part Studio. The caller keeps the base state and applies
// the returned override set, which makes switch-back equality explicit.
import {
  setParameter,
  type ScadgenFeatureNode,
  type ScadgenParameter,
} from "../model/onshapeHistory";
import type { BomRow } from "../assemblies/bom";
import type { Assembly } from "../assemblies/model";
import {
  evaluateP7Expression,
  type P7Diagnostic,
  type P7Scope,
  type P7Value,
} from "./expression";
import type { VariableType } from "./variables";

export const CONFIGURATION_SCHEMA = "scadgen.configurations";
export const CONFIGURATION_VERSION = 1 as const;

export type ConfigurationInputKind =
  | "featureParameter"
  | "variable"
  | "featureSuppression"
  | "featureVisibility"
  | "property"
  | "material"
  | "vendor"
  | "bomField"
  | "assemblyInstanceVisibility"
  | "assemblyInstanceSuppression"
  | "mateValue";

export type ConfigurationScalar = string | number | boolean;

export interface ConfigurationInput {
  id: string;
  kind: ConfigurationInputKind;
  label: string;
  /** Feature id, variable id, assembly instance id or property key. */
  targetId: string;
  /** Parameter id for featureParameter inputs; empty for others. */
  parameterId: string;
  valueType: VariableType | "enum";
  defaultValue: ConfigurationScalar;
  options: string[];
  description: string;
}

export interface ConfigurationRow {
  id: string;
  name: string;
  description: string;
  values: Record<string, ConfigurationScalar>;
  isDefault: boolean;
}

export interface ConfigurationVisibilityCondition {
  id: string;
  targetKind: "feature" | "assemblyInstance" | "bomRow" | "annotation";
  targetId: string;
  condition: string;
}

export interface ConfigurationTable {
  schema: typeof CONFIGURATION_SCHEMA;
  v: typeof CONFIGURATION_VERSION;
  id: string;
  name: string;
  description: string;
  inputs: ConfigurationInput[];
  rows: ConfigurationRow[];
  activeRowId: string | null;
  visibilityConditions: ConfigurationVisibilityCondition[];
}

export interface ConfigurationIssue {
  path: string;
  message: string;
}

export type ConfigurationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ConfigurationIssue[] };

export function emptyConfigurationTable(
  name = "Default configuration",
  id = `config_${Date.now().toString(36)}`,
): ConfigurationTable {
  const row: ConfigurationRow = {
    id: `row_${Date.now().toString(36)}`,
    name: "Default",
    description: "",
    values: {},
    isDefault: true,
  };
  return {
    schema: CONFIGURATION_SCHEMA,
    v: CONFIGURATION_VERSION,
    id,
    name,
    description: "",
    inputs: [],
    rows: [row],
    activeRowId: row.id,
    visibilityConditions: [],
  };
}

export function defaultConfigurationRow(
  table: ConfigurationTable,
): ConfigurationRow | null {
  return table.rows.find((row) => row.isDefault) ?? table.rows[0] ?? null;
}

export function activeConfigurationRow(
  table: ConfigurationTable,
): ConfigurationRow | null {
  return (
    table.rows.find((row) => row.id === table.activeRowId) ??
    defaultConfigurationRow(table)
  );
}

function inputLabel(input: ConfigurationInput): string {
  return input.label.trim() || input.parameterId || input.id;
}

export function validateConfigurationTable(
  table: ConfigurationTable,
  nodes?: readonly ScadgenFeatureNode[],
  variableNames?: readonly string[],
): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  if (!table.id.trim())
    issues.push({ path: "configuration.id", message: "id is required" });
  if (!table.name.trim())
    issues.push({ path: "configuration.name", message: "name is required" });
  if (!table.rows.length)
    issues.push({
      path: "configuration.rows",
      message: "at least one row is required",
    });
  const inputIds = new Set<string>();
  const inputKeys = new Set<string>();
  table.inputs.forEach((input, index) => {
    if (!input.id.trim())
      issues.push({
        path: `configuration.inputs[${index}].id`,
        message: "input id is required",
      });
    else if (inputIds.has(input.id))
      issues.push({
        path: `configuration.inputs[${index}].id`,
        message: `duplicate input id '${input.id}'`,
      });
    inputIds.add(input.id);
    const key = `${input.kind}:${input.targetId}:${input.parameterId}`;
    if (inputKeys.has(key))
      issues.push({
        path: `configuration.inputs[${index}]`,
        message: `duplicate input for ${key}`,
      });
    inputKeys.add(key);
    if (!input.targetId.trim())
      issues.push({
        path: `configuration.inputs[${index}].targetId`,
        message: "target is required",
      });
    if (input.kind === "featureParameter" && !input.parameterId.trim())
      issues.push({
        path: `configuration.inputs[${index}].parameterId`,
        message: "parameter id is required",
      });
    if (input.options.some((option) => !option.trim()))
      issues.push({
        path: `configuration.inputs[${index}].options`,
        message: "options cannot be empty",
      });
    if (new Set(input.options).size !== input.options.length)
      issues.push({
        path: `configuration.inputs[${index}].options`,
        message: "options must be unique",
      });
    if (!valueMatchesType(input.valueType, input.defaultValue))
      issues.push({
        path: `configuration.inputs[${index}].defaultValue`,
        message: `${inputLabel(input)} default does not match ${input.valueType}`,
      });
    if (nodes) {
      const target = nodes.find((node) => node.featureId === input.targetId);
      if (
        (input.kind === "featureParameter" ||
          input.kind === "featureSuppression" ||
          input.kind === "featureVisibility") &&
        !target
      )
        issues.push({
          path: `configuration.inputs[${index}].targetId`,
          message: `target feature '${input.targetId}' was not found`,
        });
      if (
        input.kind === "featureParameter" &&
        target &&
        !target.parameters.some(
          (parameter) => parameter.parameterId === input.parameterId,
        )
      )
        issues.push({
          path: `configuration.inputs[${index}].parameterId`,
          message: `parameter '${input.parameterId}' was not found on '${target.name}'`,
        });
    }
    if (
      variableNames &&
      input.kind === "variable" &&
      !variableNames.includes(input.targetId)
    )
      issues.push({
        path: `configuration.inputs[${index}].targetId`,
        message: `variable '${input.targetId}' was not found in the document scope`,
      });
  });

  const rowNames = new Set<string>();
  let defaultCount = 0;
  table.rows.forEach((row, index) => {
    if (!row.id.trim())
      issues.push({
        path: `configuration.rows[${index}].id`,
        message: "row id is required",
      });
    if (!row.name.trim())
      issues.push({
        path: `configuration.rows[${index}].name`,
        message: "row name is required",
      });
    const key = row.name.trim().toLowerCase();
    if (rowNames.has(key))
      issues.push({
        path: `configuration.rows[${index}].name`,
        message: `duplicate row name '${row.name}'`,
      });
    rowNames.add(key);
    if (row.isDefault) defaultCount += 1;
    for (const input of table.inputs) {
      const value = row.values[input.id];
      if (value === undefined)
        issues.push({
          path: `configuration.rows[${index}].${input.id}`,
          message: `${inputLabel(input)} value is missing`,
        });
      else if (!valueMatchesType(input.valueType, value))
        issues.push({
          path: `configuration.rows[${index}].${input.id}`,
          message: `${inputLabel(input)} must be ${input.valueType}`,
        });
      if (
        typeof value === "string" &&
        input.options.length > 0 &&
        !input.options.includes(value)
      )
        issues.push({
          path: `configuration.rows[${index}].${input.id}`,
          message: `'${value}' is not an allowed option for ${inputLabel(input)}`,
        });
    }
  });
  if (defaultCount > 1)
    issues.push({
      path: "configuration.rows",
      message: "only one row can be the default",
    });
  if (
    table.activeRowId !== null &&
    !table.rows.some((row) => row.id === table.activeRowId)
  )
    issues.push({
      path: "configuration.activeRowId",
      message: "active row does not exist",
    });
  const conditionIds = new Set<string>();
  table.visibilityConditions.forEach((condition, index) => {
    if (!condition.id.trim())
      issues.push({
        path: `configuration.conditions[${index}].id`,
        message: "condition id is required",
      });
    else if (conditionIds.has(condition.id))
      issues.push({
        path: `configuration.conditions[${index}].id`,
        message: `duplicate condition id '${condition.id}'`,
      });
    conditionIds.add(condition.id);
    if (!condition.targetId.trim())
      issues.push({
        path: `configuration.conditions[${index}].targetId`,
        message: "condition target is required",
      });
    if (!condition.condition.trim())
      issues.push({
        path: `configuration.conditions[${index}].condition`,
        message: "condition expression is required",
      });
  });
  for (const cycle of configurationValueCycles(table))
    issues.push({
      path: "configuration.rows",
      message: `cyclic variable configuration: ${cycle}`,
    });
  return issues;
}

/**
 * Variable overrides are scalar, but a string value may name another
 * configured variable. Treat those names as references so a self-referential
 * or mutually-referential override is reported instead of being accepted as a
 * literal. Other scalar values cannot form a cycle.
 */
function configurationValueCycles(table: ConfigurationTable): string[] {
  const variableInputs = table.inputs.filter(
    (input) => input.kind === "variable",
  );
  const targets = new Set(variableInputs.map((input) => input.targetId));
  if (!targets.size) return [];
  const graph = new Map<string, string[]>();
  for (const input of variableInputs) {
    const references = new Set<string>();
    for (const row of table.rows) {
      const value = row.values[input.id] ?? input.defaultValue;
      if (typeof value === "string" && targets.has(value))
        references.add(value);
    }
    graph.set(input.targetId, [...references]);
  }
  const cycles = new Set<string>();
  const visiting = new Set<string>();
  const completed = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    if (completed.has(node)) return;
    if (visiting.has(node)) {
      cycles.add([...stack.slice(stack.indexOf(node)), node].join(" -> "));
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    completed.add(node);
  };
  for (const target of targets) visit(target);
  return [...cycles];
}

function valueMatchesType(
  type: VariableType | "enum",
  value: ConfigurationScalar,
): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number" || type === "length" || type === "angle")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

export function addConfigurationInput(
  table: ConfigurationTable,
  input: ConfigurationInput,
): ConfigurationResult<ConfigurationTable> {
  const next = {
    ...table,
    inputs: [...table.inputs, { ...input }],
    rows: table.rows.map((row) => ({
      ...row,
      values: { ...row.values, [input.id]: input.defaultValue },
    })),
  };
  const issues = validateConfigurationTable(next);
  return issues.length
    ? { ok: false, errors: issues }
    : { ok: true, value: next };
}

export function addConfigurationRow(
  table: ConfigurationTable,
  name: string,
  id = `row_${Date.now().toString(36)}_${table.rows.length}`,
): ConfigurationResult<ConfigurationTable> {
  const row: ConfigurationRow = {
    id,
    name: name.trim(),
    description: "",
    values: Object.fromEntries(
      table.inputs.map((input) => [input.id, input.defaultValue]),
    ),
    isDefault: table.rows.length === 0,
  };
  const next = { ...table, rows: [...table.rows, row] };
  const issues = validateConfigurationTable(next);
  return issues.length
    ? { ok: false, errors: issues }
    : { ok: true, value: next };
}

export function duplicateConfigurationRow(
  table: ConfigurationTable,
  rowId: string,
): ConfigurationResult<ConfigurationTable> {
  const source = table.rows.find((row) => row.id === rowId);
  if (!source)
    return {
      ok: false,
      errors: [{ path: "configuration.row", message: "row not found" }],
    };
  const copy: ConfigurationRow = {
    ...source,
    id: `row_${Date.now().toString(36)}_${table.rows.length}`,
    name: `${source.name} copy`,
    isDefault: false,
    values: { ...source.values },
  };
  const next = { ...table, rows: [...table.rows, copy] };
  const issues = validateConfigurationTable(next);
  return issues.length
    ? { ok: false, errors: issues }
    : { ok: true, value: next };
}

export function reorderConfigurationRow(
  table: ConfigurationTable,
  rowId: string,
  toIndex: number,
): ConfigurationResult<ConfigurationTable> {
  const from = table.rows.findIndex((row) => row.id === rowId);
  if (from < 0)
    return {
      ok: false,
      errors: [{ path: "configuration.row", message: "row not found" }],
    };
  const rows = [...table.rows];
  const clamped = Math.max(0, Math.min(rows.length - 1, toIndex));
  const [moved] = rows.splice(from, 1);
  if (!moved) return { ok: true, value: table };
  rows.splice(clamped, 0, moved);
  return { ok: true, value: { ...table, rows } };
}

export function duplicateConfigurationInput(
  table: ConfigurationTable,
  inputId: string,
): ConfigurationResult<ConfigurationTable> {
  const index = table.inputs.findIndex((input) => input.id === inputId);
  if (index < 0)
    return {
      ok: false,
      errors: [{ path: "configuration.input", message: "input not found" }],
    };
  const source = table.inputs[index]!;
  const copy: ConfigurationInput = {
    ...source,
    id: `input_${Date.now().toString(36)}_${table.inputs.length}`,
    label: `${source.label} copy`,
    options: [...source.options],
  };
  const inputs = [...table.inputs];
  inputs.splice(index + 1, 0, copy);
  const next = {
    ...table,
    inputs,
    rows: table.rows.map((row) => ({
      ...row,
      values: { ...row.values, [copy.id]: source.defaultValue },
    })),
  };
  const issues = validateConfigurationTable(next);
  return issues.length
    ? { ok: false, errors: issues }
    : { ok: true, value: next };
}

export function deleteConfigurationInput(
  table: ConfigurationTable,
  inputId: string,
): ConfigurationResult<ConfigurationTable> {
  if (!table.inputs.some((input) => input.id === inputId))
    return {
      ok: false,
      errors: [{ path: "configuration.input", message: "input not found" }],
    };
  return {
    ok: true,
    value: {
      ...table,
      inputs: table.inputs.filter((input) => input.id !== inputId),
      rows: table.rows.map((row) => {
        const values = { ...row.values };
        delete values[inputId];
        return { ...row, values };
      }),
    },
  };
}

export function reorderConfigurationInput(
  table: ConfigurationTable,
  inputId: string,
  toIndex: number,
): ConfigurationResult<ConfigurationTable> {
  const from = table.inputs.findIndex((input) => input.id === inputId);
  if (from < 0)
    return {
      ok: false,
      errors: [{ path: "configuration.input", message: "input not found" }],
    };
  const inputs = [...table.inputs];
  const clamped = Math.max(0, Math.min(inputs.length - 1, toIndex));
  const [moved] = inputs.splice(from, 1);
  if (!moved) return { ok: true, value: table };
  inputs.splice(clamped, 0, moved);
  return { ok: true, value: { ...table, inputs } };
}

export function deleteConfigurationRow(
  table: ConfigurationTable,
  rowId: string,
): ConfigurationResult<ConfigurationTable> {
  if (table.rows.length <= 1)
    return {
      ok: false,
      errors: [
        {
          path: "configuration.rows",
          message: "a configuration needs at least one row",
        },
      ],
    };
  const rows = table.rows.filter((row) => row.id !== rowId);
  const wasDefault = table.rows.find((row) => row.id === rowId)?.isDefault;
  if (wasDefault && rows[0]) rows[0] = { ...rows[0], isDefault: true };
  const activeRowId =
    table.activeRowId === rowId
      ? (defaultConfigurationRow({ ...table, rows })?.id ?? null)
      : table.activeRowId;
  return { ok: true, value: { ...table, rows, activeRowId } };
}

export function setConfigurationValue(
  table: ConfigurationTable,
  rowId: string,
  inputId: string,
  value: ConfigurationScalar,
): ConfigurationResult<ConfigurationTable> {
  const rowIndex = table.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0)
    return {
      ok: false,
      errors: [{ path: "configuration.row", message: "row not found" }],
    };
  const input = table.inputs.find((entry) => entry.id === inputId);
  if (!input)
    return {
      ok: false,
      errors: [{ path: "configuration.input", message: "input not found" }],
    };
  if (!valueMatchesType(input.valueType, value))
    return {
      ok: false,
      errors: [
        {
          path: `configuration.rows.${rowId}.${inputId}`,
          message: `value must be ${input.valueType}`,
        },
      ],
    };
  if (
    typeof value === "string" &&
    input.options.length > 0 &&
    !input.options.includes(value)
  )
    return {
      ok: false,
      errors: [
        {
          path: `configuration.rows.${rowId}.${inputId}`,
          message: `'${value}' is not an allowed option`,
        },
      ],
    };
  const rows = [...table.rows];
  const row = rows[rowIndex]!;
  rows[rowIndex] = { ...row, values: { ...row.values, [inputId]: value } };
  return { ok: true, value: { ...table, rows } };
}

export function renameConfigurationRow(
  table: ConfigurationTable,
  rowId: string,
  name: string,
): ConfigurationResult<ConfigurationTable> {
  const trimmed = name.trim();
  if (!trimmed)
    return {
      ok: false,
      errors: [
        { path: "configuration.rows.name", message: "name is required" },
      ],
    };
  const next = {
    ...table,
    rows: table.rows.map((row) =>
      row.id === rowId ? { ...row, name: trimmed } : row,
    ),
  };
  const issues = validateConfigurationTable(next);
  return issues.length
    ? { ok: false, errors: issues }
    : { ok: true, value: next };
}

export function setDefaultConfigurationRow(
  table: ConfigurationTable,
  rowId: string,
): ConfigurationResult<ConfigurationTable> {
  if (!table.rows.some((row) => row.id === rowId))
    return {
      ok: false,
      errors: [{ path: "configuration.row", message: "row not found" }],
    };
  return {
    ok: true,
    value: {
      ...table,
      activeRowId: rowId,
      rows: table.rows.map((row) => ({
        ...row,
        isDefault: row.id === rowId,
      })),
    },
  };
}

/** Row values with input defaults filled in. */
export function resolvedConfigurationValues(
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
): Record<string, ConfigurationScalar> {
  const row =
    table.rows.find((entry) => entry.id === rowId) ??
    defaultConfigurationRow(table);
  const out: Record<string, ConfigurationScalar> = {};
  for (const input of table.inputs)
    out[input.id] = row?.values[input.id] ?? input.defaultValue;
  return out;
}

export interface ConfigurationOverrides {
  values: Record<string, ConfigurationScalar>;
  parameterEdits: Array<{
    featureId: string;
    parameterId: string;
    value: ConfigurationScalar;
    inputId: string;
  }>;
  suppressedFeatures: Record<string, boolean>;
  hiddenFeatures: Record<string, boolean>;
  variables: Record<string, ConfigurationScalar>;
  properties: Record<string, ConfigurationScalar>;
  assemblyInstances: Record<string, { visible: boolean; suppressed: boolean }>;
  mateValues: Record<string, ConfigurationScalar>;
}

export function configurationOverrides(
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
): ConfigurationOverrides {
  const values = resolvedConfigurationValues(table, rowId);
  const overrides: ConfigurationOverrides = {
    values,
    parameterEdits: [],
    suppressedFeatures: {},
    hiddenFeatures: {},
    variables: {},
    properties: {},
    assemblyInstances: {},
    mateValues: {},
  };
  for (const input of table.inputs) {
    const value = values[input.id] ?? input.defaultValue;
    switch (input.kind) {
      case "featureParameter":
        overrides.parameterEdits.push({
          featureId: input.targetId,
          parameterId: input.parameterId,
          value,
          inputId: input.id,
        });
        break;
      case "featureSuppression":
        overrides.suppressedFeatures[input.targetId] = Boolean(value);
        break;
      case "featureVisibility":
        overrides.hiddenFeatures[input.targetId] = !value;
        break;
      case "variable":
        overrides.variables[input.targetId] = value;
        break;
      case "property":
      case "material":
      case "vendor":
      case "bomField":
        overrides.properties[input.targetId] = value;
        break;
      case "assemblyInstanceVisibility":
        overrides.assemblyInstances[input.targetId] = {
          ...(overrides.assemblyInstances[input.targetId] ?? {
            visible: true,
            suppressed: false,
          }),
          visible: Boolean(value),
        };
        break;
      case "assemblyInstanceSuppression":
        overrides.assemblyInstances[input.targetId] = {
          ...(overrides.assemblyInstances[input.targetId] ?? {
            visible: true,
            suppressed: false,
          }),
          suppressed: Boolean(value),
        };
        break;
      case "mateValue":
        overrides.mateValues[input.targetId] = value;
        break;
    }
  }
  return overrides;
}

function parameterValueToNode(
  input: ConfigurationInput,
  value: ConfigurationScalar,
): ScadgenParameter | null {
  if (typeof value === "number") {
    if (input.valueType === "length")
      return {
        kind: "quantity",
        parameterId: input.parameterId,
        value,
        units: "m",
        expression: `${value} m`,
      };
    if (input.valueType === "angle")
      return {
        kind: "quantity",
        parameterId: input.parameterId,
        value,
        units: "rad",
        expression: `${value} rad`,
      };
    return {
      kind: "quantity",
      parameterId: input.parameterId,
      value,
      units: "",
      expression: String(value),
    };
  }
  if (typeof value === "boolean")
    return {
      kind: "boolean",
      parameterId: input.parameterId,
      value,
    };
  return {
    kind: "string",
    parameterId: input.parameterId,
    value: String(value),
  };
}

/**
 * Clone the base nodes and apply a row's overrides. The base array is never
 * mutated, so switching configurations is reversible and a failed switch can
 * restore byte-for-byte state.
 */
export function applyConfigurationToNodes(
  nodes: readonly ScadgenFeatureNode[],
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
): {
  nodes: ScadgenFeatureNode[];
  overrides: ConfigurationOverrides;
  issues: ConfigurationIssue[];
} {
  const issues = validateConfigurationTable(table);
  const overrides = configurationOverrides(table, rowId);
  const inputsById = new Map(table.inputs.map((input) => [input.id, input]));
  const conditions = evaluateConfigurationConditions(table, rowId);
  const result = nodes.map((node) => {
    const next: ScadgenFeatureNode = {
      ...node,
      parameters: node.parameters.map((parameter) => ({ ...parameter })),
      ...(node.extensions ? { extensions: { ...node.extensions } } : {}),
    };
    if (!node.suppressed && overrides.suppressedFeatures[node.featureId])
      next.suppressed = true;
    if (overrides.suppressedFeatures[node.featureId] === false)
      next.suppressed = false;
    const hidden = overrides.hiddenFeatures[node.featureId];
    if (hidden !== undefined) {
      next.extensions = next.extensions ?? {};
      next.extensions.hidden = hidden;
    }
    const condition = conditions.find(
      (entry) =>
        entry.targetKind === "feature" && entry.targetId === node.featureId,
    );
    if (condition) {
      next.extensions = next.extensions ?? {};
      next.extensions.hidden = !condition.visible;
      if (!condition.visible) next.suppressed = true;
    }
    for (const edit of overrides.parameterEdits) {
      if (edit.featureId !== node.featureId) continue;
      const input = inputsById.get(edit.inputId);
      if (!input) continue;
      const parameter = parameterValueToNode(input, edit.value);
      if (!parameter) continue;
      const existing = next.parameters.findIndex(
        (entry) => entry.parameterId === parameter.parameterId,
      );
      if (existing >= 0) next.parameters[existing] = parameter;
      else next.parameters.push(parameter);
    }
    return next;
  });
  return { nodes: result, overrides, issues };
}

/** Convert variable overrides into the scope used by Variable Studio rows. */
export function configurationVariableScope(
  overrides: ConfigurationOverrides,
  base: Record<string, P7Value> = {},
): Record<string, P7Value> {
  const out: Record<string, P7Value> = {};
  for (const [name, value] of Object.entries(overrides.variables)) {
    const existing = base[name];
    if (typeof value === "number") {
      // Configuration values are scalars; preserve the declared variable kind
      // so a length override cannot silently become a unitless number.
      out[name] =
        existing?.kind === "length" || existing?.kind === "angle"
          ? { kind: existing.kind, value }
          : { kind: "number", value };
    } else if (typeof value === "boolean") {
      out[name] = { kind: "boolean", value };
    } else {
      out[name] = { kind: "string", value };
    }
  }
  return out;
}

/** Property/BOM precedence: row override first, then base metadata. */
export function resolveConfiguredProperty(
  base: Record<string, string>,
  overrides: ConfigurationOverrides,
): Record<string, string> {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides.properties))
    out[key] = String(value);
  return out;
}

export function applyConfigurationToBomRow(
  row: BomRow,
  overrides: ConfigurationOverrides,
): BomRow {
  const next: BomRow = { ...row };
  const property = (key: string): string | null => {
    const value = overrides.properties[key];
    return typeof value === "string" ? value : null;
  };
  const material = property("material") ?? property("materialId");
  const vendor = property("vendor");
  const name = property("name");
  const number = property("number");
  const description = property("description");
  const revision = property("revision");
  if (material !== null) next.materialId = material;
  if (vendor !== null) next.vendor = vendor;
  if (name !== null) next.name = name;
  if (number !== null) next.number = number;
  if (description !== null) next.description = description;
  if (revision !== null) next.revision = revision;
  return next;
}

export function applyConfigurationToBomRows(
  rows: readonly BomRow[],
  overrides: ConfigurationOverrides,
): BomRow[] {
  return rows.map((row) => applyConfigurationToBomRow(row, overrides));
}

/** Apply row visibility conditions without mutating the base BOM rows. */
export function applyConfigurationConditionsToBomRows(
  rows: readonly BomRow[],
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
): BomRow[] {
  const conditions = evaluateConfigurationConditions(table, rowId).filter(
    (entry) => entry.targetKind === "bomRow" && !entry.visible,
  );
  if (!conditions.length) return [...rows];
  const hidden = new Set(conditions.map((entry) => entry.targetId));
  return rows.filter((row) => !hidden.has(row.key));
}

/**
 * Apply assembly instance visibility/suppression and mate values on top of a
 * cloned assembly. Nested subassemblies receive the same row, so switching
 * back to Default only requires restoring the untouched base assembly.
 */
export function applyConfigurationToAssembly(
  assembly: Assembly,
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
): {
  assembly: Assembly;
  overrides: ConfigurationOverrides;
  issues: ConfigurationIssue[];
} {
  const issues = validateConfigurationTable(table);
  const overrides = configurationOverrides(table, rowId);
  const conditions = evaluateConfigurationConditions(table, rowId);
  const apply = (source: Assembly): Assembly => ({
    ...source,
    ...(source.bomOverrides
      ? { bomOverrides: { ...source.bomOverrides } }
      : {}),
    instances: source.instances.map((instance) => {
      const state = overrides.assemblyInstances[instance.id];
      const condition = conditions.find(
        (entry) =>
          entry.targetKind === "assemblyInstance" &&
          entry.targetId === instance.id,
      );
      const next = {
        ...instance,
        transform: [...instance.transform],
        ...(state
          ? { visible: state.visible, suppressed: state.suppressed }
          : {}),
        ...(condition
          ? { visible: condition.visible, suppressed: !condition.visible }
          : {}),
      };
      if (instance.subassembly) next.subassembly = apply(instance.subassembly);
      return next;
    }),
    mates: source.mates.map((mate) => {
      const value = overrides.mateValues[mate.id];
      if (typeof value !== "number" || !Number.isFinite(value)) return mate;
      return { ...mate, value };
    }),
  });
  return { assembly: apply(assembly), overrides, issues };
}

// ---------------------------------------------------------------------------
// Visibility conditions
// ---------------------------------------------------------------------------

export interface VisibilityConditionResult {
  visible: boolean;
  diagnostics: P7Diagnostic[];
}

export function evaluateVisibilityCondition(
  condition: string,
  scope: P7Scope = {},
): VisibilityConditionResult {
  const trimmed = condition.trim();
  if (!trimmed) return { visible: true, diagnostics: [] };
  const result = evaluateP7Expression(trimmed, scope);
  if (!result.ok) return { visible: false, diagnostics: result.diagnostics };
  if (result.value.kind !== "boolean")
    return {
      visible: false,
      diagnostics: [
        {
          severity: "error",
          code: "configuration.visibility",
          message: `visibility condition must be boolean, got ${result.value.kind}`,
          line: 1,
          column: 1,
        },
      ],
    };
  return { visible: result.value.value, diagnostics: [] };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeConfigurationTables(
  tables: readonly ConfigurationTable[],
): string {
  return JSON.stringify(tables);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseConfigurationTables(
  text: string,
): ConfigurationResult<ConfigurationTable[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      errors: [{ path: "configuration", message: "not valid JSON" }],
    };
  }
  if (!Array.isArray(raw))
    return {
      ok: false,
      errors: [{ path: "configuration", message: "tables must be an array" }],
    };
  const tables: ConfigurationTable[] = [];
  const errors: ConfigurationIssue[] = [];
  raw.forEach((item, index) => {
    const record = asRecord(item);
    if (!record) {
      errors.push({
        path: `configuration[${index}]`,
        message: "table must be an object",
      });
      return;
    }
    if (record.v !== undefined && record.v !== CONFIGURATION_VERSION) {
      errors.push({
        path: `configuration[${index}].v`,
        message: `unsupported configuration version ${String(record.v)}`,
      });
      return;
    }
    const table: ConfigurationTable = {
      schema: CONFIGURATION_SCHEMA,
      v: CONFIGURATION_VERSION,
      id:
        typeof record.id === "string" && record.id
          ? record.id
          : `config_${Date.now().toString(36)}_${index}`,
      name:
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : "Configuration",
      description:
        typeof record.description === "string" ? record.description : "",
      inputs: (Array.isArray(record.inputs) ? record.inputs : []).flatMap(
        (value) => {
          const input = asRecord(value);
          if (!input || typeof input.id !== "string") return [];
          return [
            {
              id: input.id,
              kind:
                (input.kind as ConfigurationInputKind) ?? "featureParameter",
              label: typeof input.label === "string" ? input.label : input.id,
              targetId:
                typeof input.targetId === "string" ? input.targetId : "",
              parameterId:
                typeof input.parameterId === "string" ? input.parameterId : "",
              valueType:
                input.valueType === "boolean" ||
                input.valueType === "number" ||
                input.valueType === "length" ||
                input.valueType === "angle" ||
                input.valueType === "string"
                  ? input.valueType
                  : "enum",
              defaultValue:
                typeof input.defaultValue === "string" ||
                typeof input.defaultValue === "number" ||
                typeof input.defaultValue === "boolean"
                  ? input.defaultValue
                  : "",
              options: (Array.isArray(input.options)
                ? input.options
                : []
              ).filter(
                (option): option is string => typeof option === "string",
              ),
              description:
                typeof input.description === "string" ? input.description : "",
            },
          ];
        },
      ),
      rows: (Array.isArray(record.rows) ? record.rows : []).flatMap((value) => {
        const row = asRecord(value);
        if (!row || typeof row.id !== "string") return [];
        const values: Record<string, ConfigurationScalar> = {};
        if (row.values && typeof row.values === "object")
          for (const [key, entry] of Object.entries(
            row.values as Record<string, unknown>,
          ))
            if (
              typeof entry === "string" ||
              typeof entry === "number" ||
              typeof entry === "boolean"
            )
              values[key] = entry;
        return [
          {
            id: row.id,
            name:
              typeof row.name === "string" && row.name.trim()
                ? row.name.trim()
                : row.id,
            description:
              typeof row.description === "string" ? row.description : "",
            values,
            isDefault: Boolean(row.isDefault),
          },
        ];
      }),
      activeRowId:
        typeof record.activeRowId === "string" ? record.activeRowId : null,
      visibilityConditions: (Array.isArray(record.visibilityConditions)
        ? record.visibilityConditions
        : []
      ).flatMap((value) => {
        const condition = asRecord(value);
        if (!condition || typeof condition.id !== "string") return [];
        const targetKind =
          condition.targetKind === "assemblyInstance" ||
          condition.targetKind === "bomRow" ||
          condition.targetKind === "annotation"
            ? condition.targetKind
            : "feature";
        return [
          {
            id: condition.id,
            targetKind,
            targetId:
              typeof condition.targetId === "string" ? condition.targetId : "",
            condition:
              typeof condition.condition === "string"
                ? condition.condition
                : "",
          },
        ];
      }),
    };
    // A pre-Phase-7 row may predate an input and therefore omit its value.
    // Migration fills the input default explicitly before validation.
    for (const row of table.rows)
      for (const input of table.inputs)
        if (row.values[input.id] === undefined)
          row.values[input.id] = input.defaultValue;
    if (!table.rows.length) {
      errors.push({
        path: `configuration[${index}].rows`,
        message: "at least one row is required",
      });
      return;
    }
    for (const issue of validateConfigurationTable(table))
      errors.push({ ...issue, path: `configuration[${index}].${issue.path}` });
    tables.push(table);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: tables };
}

export interface VisibilityEvaluation {
  targetId: string;
  targetKind: ConfigurationVisibilityCondition["targetKind"];
  visible: boolean;
  diagnostics: P7Diagnostic[];
}

/** Evaluate every visibility condition against a configuration row. */
export function evaluateConfigurationConditions(
  table: ConfigurationTable,
  rowId: string | null = table.activeRowId,
  extraScope: P7Scope = {},
): VisibilityEvaluation[] {
  const values = resolvedConfigurationValues(table, rowId);
  const scope: P7Scope = { ...extraScope };
  for (const input of table.inputs) {
    const value = values[input.id];
    if (typeof value === "number")
      scope[input.label || input.id] = { kind: "number", value };
    else if (typeof value === "boolean")
      scope[input.label || input.id] = { kind: "boolean", value };
    else if (typeof value === "string")
      scope[input.label || input.id] = { kind: "string", value };
  }
  return table.visibilityConditions.map((condition) => {
    const result = evaluateVisibilityCondition(condition.condition, scope);
    return {
      targetId: condition.targetId,
      targetKind: condition.targetKind,
      visible: result.visible,
      diagnostics: result.diagnostics,
    };
  });
}

export function configurationTablesRoundTrip(
  tables: readonly ConfigurationTable[],
): ConfigurationResult<ConfigurationTable[]> {
  const text = serializeConfigurationTables(tables);
  const parsed = parseConfigurationTables(text);
  if (!parsed.ok) return parsed;
  if (serializeConfigurationTables(parsed.value) !== text)
    return {
      ok: false,
      errors: [
        {
          path: "configuration.roundTrip",
          message: "configuration tables did not round-trip",
        },
      ],
    };
  return parsed;
}
