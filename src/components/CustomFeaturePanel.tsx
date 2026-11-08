import React, { useEffect, useMemo, useState } from "react";
import type { ScadgenFeatureNode } from "../model/onshapeHistory";
import {
  compileFeatureStudioSource,
  customFeatureDefinition,
  customFeatureNodeSourceHash,
  updateCustomFeatureNodeValues,
  validateCustomFeatureValues,
  type FeatureStudioDocument,
} from "../phase7/featureStudio";
import {
  p7DisplayNumber,
  p7DisplayUnit,
  p7ValueLabel,
  type P7Value,
} from "../phase7/expression";

export interface CustomFeaturePanelProps {
  node: ScadgenFeatureNode;
  studio: FeatureStudioDocument | null;
  readOnly?: boolean;
  onApply: (node: ScadgenFeatureNode) => void;
  onClose: () => void;
}

function definitionIdOf(node: ScadgenFeatureNode): string | null {
  const parameter = node.parameters.find(
    (entry) => entry.kind === "string" && entry.parameterId === "definitionId",
  );
  return parameter?.kind === "string" ? parameter.value : null;
}

function valuesFromNode(
  node: ScadgenFeatureNode,
  definition: NonNullable<ReturnType<typeof customFeatureDefinition>>,
): Record<string, P7Value> {
  const out: Record<string, P7Value> = {};
  for (const parameter of definition.parameters) {
    const stored = node.parameters.find(
      (entry) => entry.parameterId === `fs:${parameter.id}`,
    );
    if (!stored) {
      out[parameter.id] = parameter.defaultValue;
      continue;
    }
    if (parameter.type === "boolean" && stored.kind === "boolean")
      out[parameter.id] = { kind: "boolean", value: stored.value };
    else if (parameter.type === "string" && stored.kind === "string")
      out[parameter.id] = { kind: "string", value: stored.value };
    else if (parameter.type === "length" && stored.kind === "quantity")
      out[parameter.id] = { kind: "length", value: stored.value };
    else if (parameter.type === "angle" && stored.kind === "quantity")
      out[parameter.id] = { kind: "angle", value: stored.value };
    else if (parameter.type === "number" && stored.kind === "quantity")
      out[parameter.id] = { kind: "number", value: stored.value };
    else out[parameter.id] = parameter.defaultValue;
  }
  return out;
}

/**
 * Edit the parameters of an already-inserted custom feature. Apply writes the
 * new values through the history so undo, reload and dependent features use the
 * same stable feature id.
 */
export const CustomFeaturePanel: React.FC<CustomFeaturePanelProps> = ({
  node,
  studio,
  readOnly = false,
  onApply,
  onClose,
}) => {
  const definitionId = definitionIdOf(node);
  const definition = useMemo(
    () =>
      studio && definitionId
        ? customFeatureDefinition(studio, definitionId)
        : null,
    [studio, definitionId],
  );
  const [values, setValues] = useState<Record<string, P7Value>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!definition) {
      setValues({});
      return;
    }
    setValues(valuesFromNode(node, definition));
    setMessage("");
  }, [node.featureId, definition?.id, definition?.sourceHash]);

  if (!definition)
    return (
      <div
        className="absolute bottom-4 left-4 z-30 w-80 rounded-lg border border-red-800 bg-gray-900/98 p-3 text-xs text-red-200 shadow-2xl"
        data-testid="custom-feature-panel"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">Custom feature unavailable</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close custom feature editor"
          >
            ×
          </button>
        </div>
        <p className="mt-2">
          The Feature Studio definition is missing or its source is corrupt. The
          feature row is kept so the document stays loadable.
        </p>
      </div>
    );

  const sourceHash = customFeatureNodeSourceHash(node);
  const stale = sourceHash !== definition.sourceHash;
  const diagnostics = validateCustomFeatureValues(definition, values);
  const sourceDiagnostics = studio
    ? compileFeatureStudioSource(studio.source).diagnostics
    : [];

  const apply = () => {
    if (readOnly || stale || diagnostics.length) return;
    const next = updateCustomFeatureNodeValues(node, values, definition);
    onApply(next);
    setMessage("Applied");
  };

  return (
    <div
      className="absolute bottom-4 left-4 z-30 max-h-[calc(100%-2rem)] w-80 overflow-auto rounded-lg border border-gray-600 bg-gray-900/98 p-3 text-xs text-gray-200 shadow-2xl"
      data-testid="custom-feature-panel"
    >
      <div className="flex items-start justify-between gap-2 border-b border-gray-700 pb-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{node.name}</div>
          <div className="font-mono text-[10px] text-gray-500">
            {definition.id}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close custom feature editor"
          className="rounded px-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          ×
        </button>
      </div>

      {stale && (
        <div className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-amber-200">
          This feature was built from source{" "}
          <code>{sourceHash ?? "unknown"}</code>. The Feature Studio now
          compiles <code>{definition.sourceHash}</code>. Update the definition
          before editing values.
        </div>
      )}

      <div className="mt-2 space-y-2">
        {definition.parameters.map((parameter) => {
          const value = values[parameter.id] ?? parameter.defaultValue;
          return (
            <label key={parameter.id} className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">
                {parameter.label} · {parameter.type}
              </span>
              {parameter.type === "boolean" ? (
                <input
                  type="checkbox"
                  aria-label={parameter.label}
                  checked={value.kind === "boolean" ? value.value : false}
                  disabled={readOnly || stale}
                  onChange={(event) =>
                    setValues((entries) => ({
                      ...entries,
                      [parameter.id]: {
                        kind: "boolean",
                        value: event.target.checked,
                      },
                    }))
                  }
                />
              ) : parameter.options.length > 0 ? (
                <select
                  aria-label={parameter.label}
                  value={
                    value.kind === "string"
                      ? value.value
                      : value.kind === "boolean"
                        ? String(value.value)
                        : String(p7DisplayNumber(value, "mm", "deg") ?? "")
                  }
                  disabled={readOnly || stale}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const numeric = Number(raw);
                    setValues((entries) => ({
                      ...entries,
                      [parameter.id]:
                        parameter.type === "number"
                          ? { kind: "number", value: numeric }
                          : parameter.type === "length"
                            ? { kind: "length", value: numeric / 1000 }
                            : parameter.type === "angle"
                              ? {
                                  kind: "angle",
                                  value: (numeric * Math.PI) / 180,
                                }
                              : { kind: "string", value: raw },
                    }));
                  }}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1"
                >
                  {parameter.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : parameter.type === "string" ? (
                <input
                  aria-label={parameter.label}
                  value={value.kind === "string" ? value.value : ""}
                  disabled={readOnly || stale}
                  onChange={(event) =>
                    setValues((entries) => ({
                      ...entries,
                      [parameter.id]: {
                        kind: "string",
                        value: event.target.value,
                      },
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1"
                />
              ) : (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label={parameter.label}
                    value={p7DisplayNumber(value, "mm", "deg") ?? 0}
                    disabled={readOnly || stale}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      setValues((entries) => ({
                        ...entries,
                        [parameter.id]: {
                          kind: parameter.type,
                          value:
                            parameter.type === "length"
                              ? raw / 1000
                              : parameter.type === "angle"
                                ? (raw * Math.PI) / 180
                                : raw,
                        } as P7Value,
                      }));
                    }}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right"
                  />
                  <span className="w-8 text-[10px] text-gray-500">
                    {p7DisplayUnit(parameter.type, "mm", "deg")}
                  </span>
                </span>
              )}
            </label>
          );
        })}
      </div>

      {diagnostics.length > 0 && (
        <div className="mt-2 rounded border border-red-800 bg-red-950/40 p-2 text-red-300">
          {diagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${index}`}>
              {diagnostic.line}:{diagnostic.column} {diagnostic.message}
            </div>
          ))}
        </div>
      )}

      {sourceDiagnostics.length > 0 && (
        <div className="mt-2 rounded border border-amber-800 bg-amber-950/30 p-2 text-amber-200">
          <div className="mb-1 font-medium">Feature Studio diagnostics</div>
          {sourceDiagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.code}-${index}`} className="text-[10px]">
              {diagnostic.line}:{diagnostic.column} {diagnostic.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 text-[10px] text-gray-500">
        Result:{" "}
        {p7ValueLabel(
          (node.extensions?.featureScript as { result?: P7Value } | undefined)
            ?.result ?? { kind: "string", value: "—" },
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-gray-800 pt-2">
        <button
          type="button"
          onClick={apply}
          disabled={readOnly || stale || diagnostics.length > 0}
          className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500"
        >
          Cancel
        </button>
        {message && (
          <span className="text-[10px] text-emerald-400">{message}</span>
        )}
      </div>
    </div>
  );
};

export default CustomFeaturePanel;
