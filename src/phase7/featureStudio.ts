// Phase 7 — Feature Studio document state.
//
// A Feature Studio owns source, local version history, compiled custom-feature
// declarations and compatibility notices. Custom features are inserted into a
// Part Studio as stable feature nodes carrying the source hash and parameter
// values; kernel execution is the final Phase 7 item and is not claimed here.
import type {
  ScadgenFeatureNode,
  ScadgenParameter,
} from "../model/onshapeHistory";
import {
  compileFeatureScript,
  evaluateCustomFeature,
  featureScriptParameterValue,
  type FeatureScriptCompileResult,
  type FeatureScriptFeature,
  type FeatureScriptParameter,
} from "./featurescript";
import {
  hashString,
  p7Diagnostic,
  type P7Diagnostic,
  type P7Scope,
  type P7Value,
} from "./expression";

export const FEATURE_STUDIO_SCHEMA = "scadgen.featurestudio";
export const FEATURE_STUDIO_VERSION = 1 as const;
export const MAX_FEATURE_STUDIO_VERSIONS = 50;

export interface FeatureStudioVersion {
  id: string;
  label: string;
  source: string;
  sourceHash: string;
  createdAt: number;
}

export interface FeatureStudioDocument {
  schema: typeof FEATURE_STUDIO_SCHEMA;
  v: typeof FEATURE_STUDIO_VERSION;
  id: string;
  name: string;
  source: string;
  sourceHash: string;
  versions: FeatureStudioVersion[];
  customFeatures: FeatureScriptFeature[];
  diagnostics: P7Diagnostic[];
  notices: string[];
  updatedAt: number;
}

export interface FeatureStudioCompile {
  ok: boolean;
  sourceHash: string;
  customFeatures: FeatureScriptFeature[];
  diagnostics: P7Diagnostic[];
  notices: string[];
}

const DEFAULT_FEATURE_SOURCE = `FeatureScript 1;

// Local FeatureScript subset.
// A feature declares typed parameters and a result expression.
export feature FramePlate {
  label "Frame Plate";
  description "A parameterised mounting plate.";
  parameter width is length label "Width" description "Overall width" = 80 mm;
  parameter height is length label "Height" = 40 mm;
  parameter thickness is length label "Thickness" = 3 mm;
  parameter count is number label "Count" options ["1", "2", "4"] = 1;

  result = [width, height, thickness, count];
}
`;

let versionSeq = 0;

function nextVersionId(now = Date.now()): string {
  versionSeq += 1;
  return `fsv_${now.toString(36)}_${versionSeq}`;
}

export function emptyFeatureStudio(
  name = "Feature Studio",
  id = `fs_${Date.now().toString(36)}`,
): FeatureStudioDocument {
  const created = Date.now();
  const compile = compileFeatureScript(DEFAULT_FEATURE_SOURCE);
  return {
    schema: FEATURE_STUDIO_SCHEMA,
    v: FEATURE_STUDIO_VERSION,
    id,
    name,
    source: DEFAULT_FEATURE_SOURCE,
    sourceHash: compile.sourceHash,
    versions: [
      {
        id: nextVersionId(created),
        label: "Initial source",
        source: DEFAULT_FEATURE_SOURCE,
        sourceHash: compile.sourceHash,
        createdAt: created,
      },
    ],
    customFeatures: compile.features,
    diagnostics: compile.diagnostics,
    notices: compile.notices,
    updatedAt: created,
  };
}

export function compileFeatureStudioSource(
  source: string,
): FeatureStudioCompile {
  const compile: FeatureScriptCompileResult = compileFeatureScript(source);
  return {
    ok: compile.ok,
    sourceHash: compile.sourceHash,
    customFeatures: compile.features,
    diagnostics: compile.diagnostics,
    notices: compile.notices,
  };
}

export function updateFeatureStudioSource(
  studio: FeatureStudioDocument,
  source: string,
  opts: { label?: string; now?: number } = {},
): {
  studio: FeatureStudioDocument;
  compile: FeatureStudioCompile;
} {
  const now = opts.now ?? Date.now();
  const compile = compileFeatureStudioSource(source);
  const changed = source !== studio.source;
  const versions =
    changed && compile.ok
      ? [
          ...studio.versions,
          {
            id: nextVersionId(now),
            label:
              opts.label?.trim() || `Version ${studio.versions.length + 1}`,
            source,
            sourceHash: compile.sourceHash,
            createdAt: now,
          },
        ].slice(-MAX_FEATURE_STUDIO_VERSIONS)
      : studio.versions;
  const next: FeatureStudioDocument = {
    ...studio,
    source,
    sourceHash: compile.sourceHash,
    versions,
    // Keep the last good compiled declarations when the new source is broken;
    // the diagnostics make the failure visible without erasing the registry.
    customFeatures: compile.ok ? compile.customFeatures : studio.customFeatures,
    diagnostics: compile.diagnostics,
    notices: compatibilityNotices(source, compile),
    updatedAt: now,
  };
  return { studio: next, compile };
}

function compatibilityNotices(
  source: string,
  compile: FeatureStudioCompile,
): string[] {
  const notices = [...compile.notices];
  if (!compile.ok)
    notices.push(
      "Source has errors; the last good feature registry is retained.",
    );
  if (!/FeatureScript\s+\d+\s*;/.test(source))
    notices.push("Add a `FeatureScript <version>;` header for compatibility.");
  if (/\bimport\s*\(/.test(source))
    notices.push(
      "Imports are resolved against the local standard library; cloud libraries are unavailable.",
    );
  return notices;
}

export function restoreFeatureStudioVersion(
  studio: FeatureStudioDocument,
  versionId: string,
): {
  ok: boolean;
  studio: FeatureStudioDocument;
  compile: FeatureStudioCompile | null;
  diagnostics: P7Diagnostic[];
} {
  const version = studio.versions.find((entry) => entry.id === versionId);
  if (!version)
    return {
      ok: false,
      studio,
      compile: null,
      diagnostics: [p7Diagnostic("featurestudio.version", "version not found")],
    };
  const updated = updateFeatureStudioSource(studio, version.source, {
    label: `Restored ${version.label}`,
  });
  return {
    ok: true,
    studio: {
      ...updated.studio,
      // Restoring is a new version, not a rewrite of history.
      versions: updated.studio.versions,
    },
    compile: updated.compile,
    diagnostics: [],
  };
}

export function registerCustomFeature(
  studio: FeatureStudioDocument,
  feature: FeatureScriptFeature,
): FeatureStudioDocument {
  return {
    ...studio,
    customFeatures: [
      ...studio.customFeatures.filter((entry) => entry.id !== feature.id),
      feature,
    ],
    updatedAt: Date.now(),
  };
}

export function customFeatureDefinition(
  studio: FeatureStudioDocument,
  featureId: string,
): FeatureScriptFeature | null {
  return (
    studio.customFeatures.find((feature) => feature.id === featureId) ?? null
  );
}

export function customFeatureParameterDefaults(
  feature: FeatureScriptFeature,
): Record<string, P7Value> {
  return Object.fromEntries(
    feature.parameters.map((parameter) => [
      parameter.id,
      parameter.defaultValue,
    ]),
  );
}

export function validateCustomFeatureValues(
  feature: FeatureScriptFeature,
  values: Record<string, P7Value>,
): P7Diagnostic[] {
  const diagnostics: P7Diagnostic[] = [];
  for (const parameter of feature.parameters) {
    const value = values[parameter.id] ?? parameter.defaultValue;
    if (value.kind !== parameter.type) {
      diagnostics.push(
        p7Diagnostic(
          "featurestudio.valueType",
          `'${parameter.label}' expects ${parameter.type}, got ${value.kind}`,
        ),
      );
      continue;
    }
    if (
      parameter.options.length > 0 &&
      value.kind === "string" &&
      !parameter.options.includes(value.value)
    )
      diagnostics.push(
        p7Diagnostic(
          "featurestudio.valueOption",
          `'${value.value}' is not an allowed option for '${parameter.label}'`,
        ),
      );
  }
  return diagnostics;
}

function parameterNode(
  featureParameter: FeatureScriptParameter,
  value: P7Value,
): ScadgenParameter {
  const converted = featureScriptParameterValue(value);
  if (converted.kind === "quantity") {
    return {
      kind: "quantity",
      parameterId: `fs:${featureParameter.id}`,
      value: converted.value as number,
      units: converted.units ?? "",
      expression: converted.expression ?? String(converted.value),
    };
  }
  if (converted.kind === "boolean")
    return {
      kind: "boolean",
      parameterId: `fs:${featureParameter.id}`,
      value: converted.value as boolean,
    };
  return {
    kind: "string",
    parameterId: `fs:${featureParameter.id}`,
    value: String(converted.value),
  };
}

/**
 * Build a stable Part Studio node for a registered custom feature. The node
 * keeps the definition id, source hash and language-visible parameter values so
 * a reload can detect a changed source instead of silently rebuilding with a
 * different definition.
 */
export function buildCustomFeatureNode(
  studio: FeatureStudioDocument,
  featureId: string,
  opts: {
    featureId?: string;
    name?: string;
    values?: Record<string, P7Value>;
  } = {},
): {
  node: ScadgenFeatureNode | null;
  evaluation: ReturnType<typeof evaluateCustomFeature> | null;
  diagnostics: P7Diagnostic[];
} {
  const feature = customFeatureDefinition(studio, featureId);
  if (!feature)
    return {
      node: null,
      evaluation: null,
      diagnostics: [
        p7Diagnostic(
          "featurestudio.feature",
          `custom feature '${featureId}' is not registered`,
        ),
      ],
    };
  if (feature.sourceHash !== studio.sourceHash)
    return {
      node: null,
      evaluation: null,
      diagnostics: [
        p7Diagnostic(
          "featurestudio.stale",
          `'${feature.label}' was compiled from a different source version`,
        ),
      ],
    };
  const evaluation = evaluateCustomFeature(
    feature,
    opts.values ?? customFeatureParameterDefaults(feature),
  );
  if (!evaluation.ok)
    return { node: null, evaluation, diagnostics: evaluation.diagnostics };
  const sourceVersion = studio.versions[studio.versions.length - 1] ?? null;
  const parameters: ScadgenParameter[] = [
    {
      kind: "string",
      parameterId: "sourceHash",
      value: feature.sourceHash,
    },
    {
      kind: "string",
      parameterId: "sourceVersionId",
      value: sourceVersion?.id ?? "",
    },
    {
      kind: "string",
      parameterId: "definitionId",
      value: feature.id,
    },
    {
      kind: "string",
      parameterId: "featureName",
      value: feature.name,
    },
    ...feature.parameters.map((parameter) =>
      parameterNode(
        parameter,
        evaluation.values[parameter.id] ?? parameter.defaultValue,
      ),
    ),
  ];
  const node: ScadgenFeatureNode = {
    featureId: opts.featureId ?? `Ffs_${feature.id}_${Date.now().toString(36)}`,
    featureType: "customFeature",
    name: opts.name?.trim() || feature.label,
    namespace: "FeatureScript",
    parameters,
    subFeatures: [],
    suppressed: false,
    extensions: {
      featureScript: {
        definitionId: feature.id,
        sourceHash: feature.sourceHash,
        sourceVersionId: sourceVersion?.id ?? null,
        languageVersion: feature.languageVersion,
        resultExpression: feature.resultExpression,
        result: evaluation.result,
        diagnostics: evaluation.diagnostics,
      },
    },
  };
  return { node, evaluation, diagnostics: [] };
}

/** Update the values on an inserted custom-feature node without changing IDs. */
export function updateCustomFeatureNodeValues(
  node: ScadgenFeatureNode,
  values: Record<string, P7Value>,
  feature?: FeatureScriptFeature,
): ScadgenFeatureNode {
  const parameters = node.parameters.map((parameter) => {
    if (
      parameter.kind === "quantity" &&
      parameter.parameterId.startsWith("fs:")
    ) {
      const id = parameter.parameterId.slice(3);
      const value = values[id];
      if (!value) return parameter;
      const converted = featureScriptParameterValue(value);
      if (converted.kind !== "quantity") return parameter;
      return {
        ...parameter,
        value: converted.value as number,
        units: converted.units ?? "",
        expression: converted.expression ?? String(converted.value),
      };
    }
    if (
      parameter.kind === "boolean" &&
      parameter.parameterId.startsWith("fs:")
    ) {
      const id = parameter.parameterId.slice(3);
      const value = values[id];
      if (!value || value.kind !== "boolean") return parameter;
      return { ...parameter, value: value.value };
    }
    if (
      parameter.kind === "string" &&
      parameter.parameterId.startsWith("fs:")
    ) {
      const id = parameter.parameterId.slice(3);
      const value = values[id];
      if (!value || value.kind !== "string") return parameter;
      return { ...parameter, value: value.value };
    }
    return parameter;
  });
  const evaluation = feature ? evaluateCustomFeature(feature, values) : null;
  const previous = node.extensions?.featureScript;
  return {
    ...node,
    parameters,
    ...(evaluation || previous
      ? {
          extensions: {
            ...node.extensions,
            featureScript: {
              ...(previous && typeof previous === "object" ? previous : {}),
              ...(evaluation
                ? {
                    result: evaluation.result,
                    diagnostics: evaluation.diagnostics,
                  }
                : {}),
            },
          },
        }
      : {}),
  };
}

/** Read a node's FeatureScript source hash, for stale-definition detection. */
export function customFeatureNodeSourceHash(
  node: ScadgenFeatureNode,
): string | null {
  const parameter = node.parameters.find(
    (entry) => entry.kind === "string" && entry.parameterId === "sourceHash",
  );
  return parameter?.kind === "string" ? parameter.value : null;
}

// ---------------------------------------------------------------------------
// File import / export
// ---------------------------------------------------------------------------

export function featureStudioSourceFile(studio: FeatureStudioDocument): string {
  return studio.source.endsWith("\n") ? studio.source : `${studio.source}\n`;
}

export function importFeatureStudioSource(
  studio: FeatureStudioDocument,
  text: string,
  label = "Imported source",
): {
  studio: FeatureStudioDocument;
  compile: FeatureStudioCompile;
} {
  return updateFeatureStudioSource(studio, text.replace(/\r\n/g, "\n"), {
    label,
  });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeFeatureStudio(studio: FeatureStudioDocument): string {
  return JSON.stringify(studio);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseFeatureStudio(
  text: string,
):
  | { ok: true; value: FeatureStudioDocument }
  | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ["not valid JSON"] };
  }
  const record = asRecord(raw);
  if (!record) return { ok: false, errors: ["studio must be an object"] };
  if (record.schema !== undefined && record.schema !== FEATURE_STUDIO_SCHEMA)
    return { ok: false, errors: ["unsupported Feature Studio schema"] };
  if (record.v !== undefined && record.v !== FEATURE_STUDIO_VERSION)
    return {
      ok: false,
      errors: [`unsupported Feature Studio version ${String(record.v)}`],
    };
  const source = typeof record.source === "string" ? record.source : "";
  const compile = compileFeatureStudioSource(source);
  const versions = (
    Array.isArray(record.versions) ? record.versions : []
  ).flatMap((entry) => {
    const value = asRecord(entry);
    if (!value || typeof value.source !== "string") return [];
    return [
      {
        id:
          typeof value.id === "string" && value.id
            ? value.id
            : nextVersionId(
                typeof value.createdAt === "number"
                  ? value.createdAt
                  : undefined,
              ),
        label:
          typeof value.label === "string" && value.label.trim()
            ? value.label.trim()
            : "Version",
        source: value.source,
        sourceHash:
          typeof value.sourceHash === "string"
            ? value.sourceHash
            : hashString(value.source),
        createdAt:
          typeof value.createdAt === "number" ? value.createdAt : Date.now(),
      },
    ];
  });
  const studio: FeatureStudioDocument = {
    schema: FEATURE_STUDIO_SCHEMA,
    v: FEATURE_STUDIO_VERSION,
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `fs_legacy_${hashString(source).slice(0, 8)}`,
    name:
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : "Feature Studio",
    source,
    sourceHash: compile.sourceHash,
    versions: versions.length
      ? versions
      : [
          {
            id: nextVersionId(),
            label: "Restored source",
            source,
            sourceHash: compile.sourceHash,
            createdAt: Date.now(),
          },
        ],
    customFeatures: compile.ok ? compile.customFeatures : [],
    diagnostics: compile.diagnostics,
    notices: compatibilityNotices(source, compile),
    updatedAt:
      typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
  return { ok: true, value: studio };
}

export function featureStudioRoundTrip(studio: FeatureStudioDocument): {
  ok: boolean;
  value: FeatureStudioDocument | null;
  errors: string[];
} {
  const text = serializeFeatureStudio(studio);
  const parsed = parseFeatureStudio(text);
  if (!parsed.ok) return { ok: false, value: null, errors: parsed.errors };
  const before = JSON.stringify(studio);
  const after = JSON.stringify(parsed.value);
  if (before !== after)
    return {
      ok: false,
      value: parsed.value,
      errors: ["Feature Studio did not round-trip canonically"],
    };
  return { ok: true, value: parsed.value, errors: [] };
}

/** Extra values a FeatureScript feature may read besides its parameters. */
export function featureScriptScope(values: Record<string, P7Value>): P7Scope {
  return { ...values };
}
