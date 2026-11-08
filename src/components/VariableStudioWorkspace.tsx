import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addStudioVariable,
  createStudioVariable,
  deleteStudioVariable,
  filterStudioVariables,
  formatStudioVariableValue,
  renameStudioVariable,
  reorderStudioVariable,
  resolveVariableStudio,
  updateStudioVariable,
  variableTypeLabel,
  type StudioVariable,
  type VariableStudioDocument,
  type VariableType,
} from "../phase7/variables";

export interface VariableStudioWorkspaceProps {
  studio: VariableStudioDocument;
  readOnly?: boolean;
  onChange: (studio: VariableStudioDocument) => void;
  onImportSketchVariables?: (studio: VariableStudioDocument) => {
    studio: VariableStudioDocument;
    migrated: number;
    skipped: number;
  };
}

const TYPE_OPTIONS: readonly VariableType[] = [
  "number",
  "length",
  "angle",
  "boolean",
  "string",
];

/**
 * Document-level Variable Studio. Edits are drafts until Apply; Cancel restores
 * the last applied state, and Undo walks the local apply stack. Evaluation and
 * dependency information come from the same model the Part Studio uses.
 */
export const VariableStudioWorkspace: React.FC<
  VariableStudioWorkspaceProps
> = ({ studio, readOnly = false, onChange, onImportSketchVariables }) => {
  const [draft, setDraft] = useState<VariableStudioDocument>(studio);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<VariableStudioDocument[]>([]);
  const [redo, setRedo] = useState<VariableStudioDocument[]>([]);
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [expressionDraft, setExpressionDraft] = useState<
    Record<string, string>
  >({});
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    setDraft(studio);
    setHistory([]);
    setRedo([]);
    setNameDraft({});
    setExpressionDraft({});
    setMessage("");
  }, [studio]);

  const resolved = useMemo(() => resolveVariableStudio(draft), [draft]);
  const rows = useMemo(
    () => filterStudioVariables(draft, query),
    [draft, query],
  );
  const selected = resolved.rows.find((row) => row.variable.id === selectedId);
  const selectByName = (name: string) => {
    const row = resolved.rows.find((entry) => entry.variable.name === name);
    if (row) setSelectedId(row.variable.id);
  };

  const commitDraft = (next: VariableStudioDocument) => {
    setHistory((entries) => [...entries.slice(-19), draft]);
    setRedo([]);
    setDraft(next);
    setMessage("");
  };

  const add = () => {
    if (readOnly) return;
    let index = draft.variables.length + 1;
    let name = `variable${index}`;
    while (
      draft.variables.some(
        (variable) => variable.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      index += 1;
      name = `variable${index}`;
    }
    const created = createStudioVariable(
      {
        name,
        type: "length",
        expression: "10 mm",
        description: "",
      },
      draft,
    );
    if (!created.ok) {
      setMessage(created.errors.map((error) => error.message).join("; "));
      return;
    }
    const next = addStudioVariable(draft, created.value);
    if (!next.ok) {
      setMessage(next.errors.map((error) => error.message).join("; "));
      return;
    }
    commitDraft(next.value);
    setSelectedId(created.value.id);
  };

  const remove = (id: string) => {
    if (readOnly) return;
    commitDraft(deleteStudioVariable(draft, id));
    if (selectedId === id) setSelectedId(null);
  };

  const move = (variable: StudioVariable, direction: -1 | 1) => {
    if (readOnly) return;
    const ordered = [...draft.variables].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((entry) => entry.id === variable.id);
    if (index < 0) return;
    commitDraft(reorderStudioVariable(draft, variable.id, index + direction));
  };

  const apply = () => {
    if (readOnly) return;
    const next = resolveVariableStudio(draft);
    if (next.issues.length) {
      setMessage("Fix the named errors before applying.");
      return;
    }
    onChange(draft);
    setHistory([]);
    setRedo([]);
    setMessage("Applied");
  };

  const cancel = () => {
    setDraft(studio);
    setHistory([]);
    setRedo([]);
    setNameDraft({});
    setExpressionDraft({});
    setMessage("");
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setRedo((entries) => [...entries.slice(-19), draft]);
    setDraft(previous);
    setHistory((entries) => entries.slice(0, -1));
    setMessage("");
  };

  const redoLast = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setHistory((entries) => [...entries.slice(-19), draft]);
    setDraft(next);
    setRedo((entries) => entries.slice(0, -1));
    setMessage("");
  };

  const importSketchVariables = () => {
    if (!onImportSketchVariables || readOnly) return;
    const result = onImportSketchVariables(draft);
    if (!result.migrated) {
      setMessage(
        result.skipped
          ? `No new sketch variables (${result.skipped} already present or invalid)`
          : "No sketch variables to import",
      );
      return;
    }
    commitDraft(result.studio);
    setMessage(
      `Imported ${result.migrated} sketch variable(s)${result.skipped ? ` · ${result.skipped} skipped` : ""}`,
    );
  };

  return (
    <div
      className="cad-studio-light absolute inset-0 z-20 flex flex-col bg-gray-950 text-gray-200"
      data-testid="variable-studio-workspace"
    >
      <div className="flex items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{draft.name}</div>
          <div className="text-[11px] text-gray-500">
            Document-level variables · {draft.variables.length} total
          </div>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter variables"
          aria-label="Filter variables"
          className="w-44 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
        />
        <span className="ml-auto text-[11px] text-gray-500">
          {readOnly ? "View only" : "Edits are staged until Apply"}
        </span>
        <button
          type="button"
          onClick={undo}
          disabled={readOnly || history.length === 0}
          className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redoLast}
          disabled={readOnly || redo.length === 0}
          className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500 disabled:opacity-40"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={readOnly}
          className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={readOnly}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-gray-900 text-gray-400">
              <tr>
                <th className="w-8 border-b border-gray-700 px-2 py-2 text-left">
                  #
                </th>
                <th className="border-b border-gray-700 px-2 py-2 text-left">
                  Name
                </th>
                <th className="w-28 border-b border-gray-700 px-2 py-2 text-left">
                  Type
                </th>
                <th className="w-24 border-b border-gray-700 px-2 py-2 text-left">
                  Scope
                </th>
                <th className="border-b border-gray-700 px-2 py-2 text-left">
                  Expression
                </th>
                <th className="w-32 border-b border-gray-700 px-2 py-2 text-right">
                  Value
                </th>
                <th className="w-24 border-b border-gray-700 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((variable, index) => {
                const resolvedRow = resolved.rows.find(
                  (row) => row.variable.id === variable.id,
                );
                const error = resolvedRow?.diagnostics.length
                  ? resolvedRow.diagnostics
                      .map((diagnostic) => diagnostic.message)
                      .join("; ")
                  : "";
                const isSelected = selectedId === variable.id;
                return (
                  <tr
                    key={variable.id}
                    onClick={() => setSelectedId(variable.id)}
                    className={
                      isSelected ? "bg-blue-900/30" : "hover:bg-gray-900/70"
                    }
                  >
                    <td className="border-b border-gray-800 px-2 py-1 text-gray-500">
                      {index + 1}
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1">
                      <input
                        value={nameDraft[variable.id] ?? variable.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          setNameDraft((entries) => ({
                            ...entries,
                            [variable.id]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          const next = nameDraft[variable.id];
                          if (next === undefined || next === variable.name)
                            return;
                          const result = renameStudioVariable(
                            draft,
                            variable.id,
                            next,
                          );
                          if (!result.ok) {
                            setMessage(
                              result.errors
                                .map((entry) => entry.message)
                                .join("; "),
                            );
                            return;
                          }
                          commitDraft(result.value);
                          setNameDraft((entries) => {
                            const copy = { ...entries };
                            delete copy[variable.id];
                            return copy;
                          });
                        }}
                        className="w-full rounded bg-transparent px-1 py-0.5 outline-none focus:bg-gray-800"
                        aria-label={`Variable name ${variable.name}`}
                      />
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1">
                      <select
                        value={variable.type}
                        disabled={readOnly}
                        onChange={(event) => {
                          const result = updateStudioVariable(
                            draft,
                            variable.id,
                            { type: event.target.value as VariableType },
                          );
                          if (!result.ok) {
                            setMessage(
                              result.errors
                                .map((entry) => entry.message)
                                .join("; "),
                            );
                            return;
                          }
                          commitDraft(result.value);
                        }}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-xs"
                        aria-label={`Variable type ${variable.name}`}
                      >
                        {TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {variableTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1">
                      <select
                        value={variable.scope}
                        disabled={readOnly}
                        onChange={(event) => {
                          const result = updateStudioVariable(
                            draft,
                            variable.id,
                            {
                              scope:
                                event.target.value === "local"
                                  ? "local"
                                  : "document",
                            },
                          );
                          if (!result.ok) {
                            setMessage(
                              result.errors
                                .map((entry) => entry.message)
                                .join("; "),
                            );
                            return;
                          }
                          commitDraft(result.value);
                        }}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-xs"
                        aria-label={`Variable scope ${variable.name}`}
                      >
                        <option value="document">Document</option>
                        <option value="local">Local</option>
                      </select>
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1">
                      <input
                        value={
                          expressionDraft[variable.id] ?? variable.expression
                        }
                        disabled={readOnly}
                        onChange={(event) =>
                          setExpressionDraft((entries) => ({
                            ...entries,
                            [variable.id]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          const next = expressionDraft[variable.id];
                          if (
                            next === undefined ||
                            next === variable.expression
                          )
                            return;
                          const result = updateStudioVariable(
                            draft,
                            variable.id,
                            { expression: next },
                          );
                          if (!result.ok) {
                            setMessage(
                              result.errors
                                .map((entry) => entry.message)
                                .join("; "),
                            );
                            return;
                          }
                          commitDraft(result.value);
                          setExpressionDraft((entries) => {
                            const copy = { ...entries };
                            delete copy[variable.id];
                            return copy;
                          });
                        }}
                        className={`w-full rounded bg-transparent px-1 py-0.5 font-mono outline-none focus:bg-gray-800 ${
                          error ? "text-red-300" : ""
                        }`}
                        aria-label={`Variable expression ${variable.name}`}
                      />
                      {error && (
                        <div className="mt-0.5 text-[10px] text-red-400">
                          {error}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1 text-right font-mono text-emerald-300">
                      {formatStudioVariableValue(resolvedRow?.value ?? null)}
                    </td>
                    <td className="border-b border-gray-800 px-2 py-1">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Move up"
                          disabled={readOnly || index === 0}
                          onClick={() => move(variable, -1)}
                          className="rounded px-1 text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          disabled={readOnly || index === rows.length - 1}
                          onClick={() => move(variable, 1)}
                          className="rounded px-1 text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title="Delete variable"
                          disabled={readOnly}
                          onClick={() => remove(variable.id)}
                          className="rounded px-1 text-red-400 hover:bg-gray-800 disabled:opacity-30"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No variables match. Add one to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={add}
              disabled={readOnly}
              className="rounded border border-gray-700 px-3 py-1 text-xs hover:border-blue-500 disabled:opacity-40"
            >
              + Add variable
            </button>
            {onImportSketchVariables && (
              <button
                type="button"
                onClick={importSketchVariables}
                disabled={readOnly}
                className="rounded border border-gray-700 px-3 py-1 text-xs hover:border-blue-500 disabled:opacity-40"
              >
                Import sketch variables
              </button>
            )}
            {message && (
              <span
                className={`text-[11px] ${
                  message === "Applied" ? "text-emerald-400" : "text-amber-300"
                }`}
              >
                {message}
              </span>
            )}
          </div>
        </div>

        <aside className="w-80 flex-none overflow-auto border-l border-gray-700 bg-gray-900/60 p-3 text-xs">
          <h3 className="mb-2 font-medium text-gray-300">Dependencies</h3>
          {!selected && (
            <p className="text-gray-500">
              Select a variable to see what it reads and where it is used.
            </p>
          )}
          {selected && (
            <div className="space-y-3">
              <div>
                <div className="text-gray-500">Variable</div>
                <div className="font-mono text-gray-100">
                  {selected.variable.name}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Scope</div>
                <div className="font-mono text-gray-300">
                  {selected.variable.scope}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Direct dependencies</div>
                <div className="flex flex-wrap gap-1 font-mono">
                  {selected.directDependencies.length === 0 && "none"}
                  {selected.directDependencies.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={`Select variable ${name}`}
                      onClick={() => selectByName(name)}
                      className="rounded bg-gray-800 px-1.5 py-0.5 text-sky-300 hover:bg-gray-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Transitive dependencies</div>
                <div className="flex flex-wrap gap-1 font-mono">
                  {selected.transitiveDependencies.length === 0 && "none"}
                  {selected.transitiveDependencies.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={`Select variable ${name}`}
                      onClick={() => selectByName(name)}
                      className="rounded bg-gray-800 px-1.5 py-0.5 text-sky-300 hover:bg-gray-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Directly used by</div>
                <div className="flex flex-wrap gap-1 font-mono">
                  {(resolved.graph.usedBy[selected.variable.name] ?? [])
                    .length === 0 && "none"}
                  {(resolved.graph.usedBy[selected.variable.name] ?? []).map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        aria-label={`Select variable ${name}`}
                        onClick={() => selectByName(name)}
                        className="rounded bg-gray-800 px-1.5 py-0.5 text-amber-300 hover:bg-gray-700"
                      >
                        {name}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Transitively used by</div>
                <div className="flex flex-wrap gap-1 font-mono">
                  {selected.transitiveUsedBy.length === 0 && "none"}
                  {selected.transitiveUsedBy.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-label={`Select variable ${name}`}
                      onClick={() => selectByName(name)}
                      className="rounded bg-gray-800 px-1.5 py-0.5 text-amber-300 hover:bg-gray-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              {selected.diagnostics.length > 0 && (
                <div className="rounded border border-red-800 bg-red-950/40 p-2 text-red-300">
                  {selected.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic.code}-${index}`}>
                      {diagnostic.line}:{diagnostic.column} {diagnostic.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-6 border-t border-gray-800 pt-3 text-[11px] text-gray-500">
            Expressions support units (`mm`, `in`, `deg`), arithmetic,
            comparisons, `min`, `max`, `abs`, `sqrt`, trig functions and other
            variables by name.
          </div>
        </aside>
      </div>
    </div>
  );
};

export default VariableStudioWorkspace;
