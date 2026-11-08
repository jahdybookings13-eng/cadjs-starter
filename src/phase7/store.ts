// Phase 7 — document/runtime bridge.
//
// Variable Studio values are document-scoped: every Part Studio rebuild sees
// them through the executor's external scope. Configurations are stored with
// the Part Studio's project blob (documentStore) so a tab switch saves and
// restores them with the geometry that they drive.
import {
  parseConfigurationTables,
  serializeConfigurationTables,
  type ConfigurationTable,
} from "./configurations";
import type { P7Scope, P7Value } from "./expression";
import {
  emptyVariableStudio,
  parseVariableStudio,
  resolveVariableStudio,
  type ResolvedVariableStudio,
  type VariableStudioDocument,
  type VariableIssue,
} from "./variables";
import {
  emptyFeatureStudio,
  parseFeatureStudio,
  type FeatureStudioDocument,
} from "./featureStudio";
import type { DocumentTab } from "../document/model";
import type { FeatureHistorySnapshot } from "../model/featureEngine";

export const PART_CONFIG_SCHEMA = "scadgen.phase7part";
export const PART_CONFIG_VERSION = 1 as const;

export interface Phase7PartState {
  schema: typeof PART_CONFIG_SCHEMA;
  v: typeof PART_CONFIG_VERSION;
  configurations: ConfigurationTable[];
  activeConfigurationId: string | null;
  activeRowId: string | null;
  /** Untouched feature history captured before the first configuration switch. */
  base: FeatureHistorySnapshot | null;
}

export function emptyPhase7PartState(): Phase7PartState {
  return {
    schema: PART_CONFIG_SCHEMA,
    v: PART_CONFIG_VERSION,
    configurations: [],
    activeConfigurationId: null,
    activeRowId: null,
    base: null,
  };
}

let currentPartState: Phase7PartState = emptyPhase7PartState();

export const scadgenPhase7Part = {
  snapshot(): Phase7PartState {
    return currentPartState;
  },
  restore(value: unknown): Phase7PartState {
    if (value === null || value === undefined) {
      currentPartState = emptyPhase7PartState();
      return currentPartState;
    }
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
    if (!record) {
      currentPartState = emptyPhase7PartState();
      return currentPartState;
    }
    // Older Phase 7 documents have no version or omitted optional fields. They
    // migrate by explicit defaults; a newer version is refused rather than
    // guessed at, so geometry never changes silently.
    const version = typeof record.v === "number" ? record.v : 0;
    if (version > PART_CONFIG_VERSION) {
      currentPartState = emptyPhase7PartState();
      return currentPartState;
    }
    const tables = parseConfigurationTables(
      JSON.stringify(record.configurations ?? []),
    );
    const baseRecord =
      record.base && typeof record.base === "object"
        ? (record.base as Record<string, unknown>)
        : null;
    const baseNodes = Array.isArray(baseRecord?.nodes)
      ? (baseRecord!.nodes as FeatureHistorySnapshot["nodes"])
      : null;
    currentPartState = {
      schema: PART_CONFIG_SCHEMA,
      v: PART_CONFIG_VERSION,
      configurations: tables.ok ? tables.value : [],
      activeConfigurationId:
        typeof record.activeConfigurationId === "string"
          ? record.activeConfigurationId
          : null,
      activeRowId:
        typeof record.activeRowId === "string" ? record.activeRowId : null,
      base: baseNodes
        ? {
            nodes: baseNodes,
            rollbackIndex:
              typeof baseRecord?.rollbackIndex === "number"
                ? baseRecord.rollbackIndex
                : null,
          }
        : null,
    };
    return currentPartState;
  },
  reset(): Phase7PartState {
    currentPartState = emptyPhase7PartState();
    return currentPartState;
  },
  update(
    mutator: (state: Phase7PartState) => Phase7PartState,
  ): Phase7PartState {
    currentPartState = mutator(currentPartState);
    return currentPartState;
  },
  serialize(): string {
    return serializeConfigurationTables(currentPartState.configurations);
  },
};

// ---------------------------------------------------------------------------
// Document variable runtime scope
// ---------------------------------------------------------------------------

let documentValues: Record<string, P7Value> = {};
let documentIssues: VariableIssue[] = [];
const listeners = new Set<(values: Record<string, P7Value>) => void>();

export function documentVariableValues(): Record<string, P7Value> {
  return documentValues;
}

/** Legacy executor scope: only numeric types can drive feature parameters. */
export function documentVariableScope(): Record<
  string,
  { value: number; dim: Record<string, number> }
> {
  const scope: Record<string, { value: number; dim: Record<string, number> }> =
    {};
  for (const [name, value] of Object.entries(documentValues)) {
    if (value.kind === "length")
      scope[name] = { value: value.value, dim: { m: 1 } };
    else if (value.kind === "angle")
      scope[name] = { value: value.value, dim: { rad: 1 } };
    else if (value.kind === "number")
      scope[name] = { value: value.value, dim: {} };
  }
  return scope;
}

export function documentVariableIssues(): VariableIssue[] {
  return documentIssues;
}

export function subscribeDocumentVariables(
  listener: (values: Record<string, P7Value>) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDocumentVariableValues(
  values: Record<string, P7Value>,
  issues: VariableIssue[] = [],
): void {
  documentValues = { ...values };
  documentIssues = issues;
  for (const listener of listeners) listener(documentValues);
}

export function clearDocumentVariableValues(): void {
  setDocumentVariableValues({}, []);
}

/**
 * Collect and resolve every Variable Studio tab in a document. Two studios
 * declaring the same name is a named error, not last-one-wins: geometry should
 * never depend on tab order.
 */
export function collectDocumentVariables(tabs: readonly DocumentTab[]): {
  values: Record<string, P7Value>;
  issues: VariableIssue[];
  studios: Array<{
    tabId: string;
    studio: VariableStudioDocument;
    resolved: ResolvedVariableStudio;
  }>;
} {
  const values: Record<string, P7Value> = {};
  const issues: VariableIssue[] = [];
  const owners = new Map<string, string>();
  const studios: Array<{
    tabId: string;
    studio: VariableStudioDocument;
    resolved: ResolvedVariableStudio;
  }> = [];
  for (const tab of tabs) {
    if (tab.kind !== "variablestudio") continue;
    const studio = variableStudioFromDesign(tab.design);
    if (!studio) {
      issues.push({
        path: `tab.${tab.id}`,
        message: `${tab.name} is not a valid Variable Studio`,
      });
      continue;
    }
    const resolved = resolveVariableStudio(studio);
    studios.push({ tabId: tab.id, studio, resolved });
    const documentNames = new Set(
      studio.variables
        .filter((variable) => variable.scope === "document")
        .map((variable) => variable.name),
    );
    for (const [name, value] of Object.entries(resolved.values)) {
      // Local variables stay inside their studio; only document-scope values
      // are published to Part Studios.
      if (!documentNames.has(name)) continue;
      if (owners.has(name)) {
        issues.push({
          path: `variable.${name}`,
          message: `'${name}' is declared in ${owners.get(name)} and ${tab.name}`,
        });
        continue;
      }
      owners.set(name, tab.name);
      values[name] = value;
    }
    for (const issue of resolved.issues)
      issues.push({ ...issue, path: `${tab.name}.${issue.path}` });
  }
  return { values, issues, studios };
}

/** Recompute and publish the document scope from the tabs currently loaded. */
export function refreshDocumentVariables(
  tabs: readonly DocumentTab[],
): ReturnType<typeof collectDocumentVariables> {
  const result = collectDocumentVariables(tabs);
  setDocumentVariableValues(result.values, result.issues);
  return result;
}

// ---------------------------------------------------------------------------
// Tab payloads
// ---------------------------------------------------------------------------

export function variableStudioFromDesign(
  design: string,
): VariableStudioDocument | null {
  if (!design.trim()) return emptyVariableStudio();
  const parsed = parseVariableStudio(design);
  return parsed.ok ? parsed.value : null;
}

export function variableStudioTabDesign(
  studio: VariableStudioDocument,
): string {
  return JSON.stringify(studio);
}

export function featureStudioFromDesign(
  design: string,
): FeatureStudioDocument | null {
  if (!design.trim()) return emptyFeatureStudio();
  const parsed = parseFeatureStudio(design);
  return parsed.ok ? parsed.value : null;
}

export function featureStudioTabDesign(studio: FeatureStudioDocument): string {
  return JSON.stringify(studio);
}

/** Empty design for a newly created Variable or Feature Studio tab. */
export function emptyPhase7TabDesign(
  kind: "variablestudio" | "featurestudio",
): string {
  return kind === "variablestudio"
    ? variableStudioTabDesign(emptyVariableStudio())
    : featureStudioTabDesign(emptyFeatureStudio());
}

export function phase7DesignKind(
  design: string,
): "variablestudio" | "featurestudio" | null {
  try {
    const raw = JSON.parse(design) as { schema?: unknown };
    if (raw.schema === "scadgen.variablestudio") return "variablestudio";
    if (raw.schema === "scadgen.featurestudio") return "featurestudio";
  } catch {
    /* not a Phase 7 payload */
  }
  return null;
}

/** Merge configuration variable overrides into the document scope. */
export function withConfigurationVariables(
  base: Record<string, P7Value>,
  overrides: Record<string, P7Value>,
): Record<string, P7Value> {
  return { ...base, ...overrides };
}
