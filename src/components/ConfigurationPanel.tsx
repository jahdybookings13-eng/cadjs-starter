import React, { useMemo, useState } from "react";
import type { ScadgenFeatureNode } from "../model/onshapeHistory";
import {
  activeConfigurationRow,
  addConfigurationInput,
  addConfigurationRow,
  deleteConfigurationInput,
  deleteConfigurationRow,
  duplicateConfigurationInput,
  duplicateConfigurationRow,
  emptyConfigurationTable,
  evaluateConfigurationConditions,
  reorderConfigurationInput,
  reorderConfigurationRow,
  renameConfigurationRow,
  resolvedConfigurationValues,
  setConfigurationValue,
  setDefaultConfigurationRow,
  validateConfigurationTable,
  type ConfigurationInput,
  type ConfigurationInputKind,
  type ConfigurationScalar,
  type ConfigurationTable,
} from "../phase7/configurations";

export interface ConfigurationPanelProps {
  tables: ConfigurationTable[];
  activeTableId: string | null;
  nodes: readonly ScadgenFeatureNode[];
  variableNames?: readonly string[];
  readOnly?: boolean;
  onChange: (
    tables: ConfigurationTable[],
    activeTableId: string | null,
  ) => void;
  onActivate: (tableId: string, rowId: string) => void;
  onClose: () => void;
}

interface ConfigurationSnapshot {
  tables: ConfigurationTable[];
  activeTableId: string | null;
}

const INPUT_KINDS: Array<{ value: ConfigurationInputKind; label: string }> = [
  { value: "featureParameter", label: "Feature parameter" },
  { value: "featureSuppression", label: "Feature suppression" },
  { value: "featureVisibility", label: "Feature visibility" },
  { value: "variable", label: "Variable" },
  { value: "property", label: "Property / BOM" },
  { value: "material", label: "Material" },
  { value: "vendor", label: "Vendor" },
  { value: "bomField", label: "BOM field" },
  { value: "assemblyInstanceVisibility", label: "Instance visibility" },
  { value: "assemblyInstanceSuppression", label: "Instance suppression" },
  { value: "mateValue", label: "Mate value" },
];

function parameterValueType(
  node: ScadgenFeatureNode | undefined,
  parameterId: string,
): ConfigurationInput["valueType"] {
  const parameter = node?.parameters.find(
    (entry) => entry.parameterId === parameterId,
  );
  if (!parameter) return "enum";
  if (parameter.kind === "boolean") return "boolean";
  if (parameter.kind === "quantity") {
    if (parameter.units === "deg" || parameter.units === "rad") return "angle";
    if (parameter.units === "") return "number";
    return "length";
  }
  if (parameter.kind === "enum") return "enum";
  return "string";
}

function defaultValueFor(
  type: ConfigurationInput["valueType"],
): ConfigurationScalar {
  if (type === "boolean") return false;
  if (type === "number" || type === "length" || type === "angle") return 0;
  return "";
}

/**
 * Configuration table editor. Rows are non-destructive: the scene keeps the
 * base Part Studio and applies the active row's overrides on top. Each row has
 * an explicit Activate action instead of silently mutating geometry while the
 * user is typing.
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  tables,
  activeTableId,
  nodes,
  variableNames = [],
  readOnly = false,
  onChange,
  onActivate,
  onClose,
}) => {
  const [inputKind, setInputKind] =
    useState<ConfigurationInputKind>("featureParameter");
  const [featureId, setFeatureId] = useState(nodes[0]?.featureId ?? "");
  const [parameterId, setParameterId] = useState(
    nodes[0]?.parameters[0]?.parameterId ?? "",
  );
  const [variableName, setVariableName] = useState("");
  const [message, setMessage] = useState("");
  const [undoStack, setUndoStack] = useState<ConfigurationSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ConfigurationSnapshot[]>([]);
  const [clipboard, setClipboard] = useState<{
    name: string;
    values: Record<string, ConfigurationScalar>;
  } | null>(null);

  const table =
    tables.find((entry) => entry.id === activeTableId) ?? tables[0] ?? null;
  const activeRow = table ? activeConfigurationRow(table) : null;
  const values = table ? resolvedConfigurationValues(table) : {};
  const selectedNode = nodes.find((node) => node.featureId === featureId);
  const issues = table
    ? validateConfigurationTable(table, nodes, variableNames)
    : [];
  const visibility = useMemo(
    () =>
      table ? evaluateConfigurationConditions(table, table.activeRowId) : [],
    [table],
  );

  const replaceTable = (next: ConfigurationTable) => {
    if (tables.some((entry) => entry.id === next.id)) {
      setUndoStack((entries) => [
        ...entries.slice(-29),
        { tables, activeTableId },
      ]);
      setRedoStack([]);
    }
    onChange(
      tables.map((entry) => (entry.id === next.id ? next : entry)),
      next.id,
    );
  };

  const undoConfiguration = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((entries) => [
      ...entries.slice(-29),
      { tables, activeTableId },
    ]);
    setUndoStack((entries) => entries.slice(0, -1));
    onChange(previous.tables, previous.activeTableId);
  };

  const redoConfiguration = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((entries) => [
      ...entries.slice(-29),
      { tables, activeTableId },
    ]);
    setRedoStack((entries) => entries.slice(0, -1));
    onChange(next.tables, next.activeTableId);
  };

  const addTable = () => {
    if (readOnly) return;
    const tableName = `Configuration ${tables.length + 1}`;
    const next = emptyConfigurationTable(
      tableName,
      `config_${Date.now().toString(36)}`,
    );
    setUndoStack((entries) => [
      ...entries.slice(-29),
      { tables, activeTableId },
    ]);
    setRedoStack([]);
    onChange([...tables, next], next.id);
  };

  const addInput = () => {
    if (!table || readOnly) return;
    const targetId =
      inputKind === "material"
        ? "material"
        : inputKind === "vendor"
          ? "vendor"
          : inputKind === "variable" ||
              inputKind === "property" ||
              inputKind === "bomField" ||
              inputKind === "mateValue"
            ? variableName.trim() || table.inputs.length.toString()
            : featureId;
    if (!targetId) {
      setMessage("Choose a target first.");
      return;
    }
    const type =
      inputKind === "featureParameter"
        ? parameterValueType(selectedNode, parameterId)
        : inputKind === "featureSuppression" ||
            inputKind === "featureVisibility" ||
            inputKind === "assemblyInstanceVisibility" ||
            inputKind === "assemblyInstanceSuppression"
          ? "boolean"
          : inputKind === "variable" || inputKind === "mateValue"
            ? "number"
            : "string";
    const label =
      inputKind === "featureParameter"
        ? `${selectedNode?.name ?? "Feature"} · ${parameterId}`
        : inputKind === "variable"
          ? variableName || "Variable"
          : `${INPUT_KINDS.find((entry) => entry.value === inputKind)?.label ?? "Input"} ${table.inputs.length + 1}`;
    const input: ConfigurationInput = {
      id: `input_${Date.now().toString(36)}_${table.inputs.length}`,
      kind: inputKind,
      label,
      targetId,
      parameterId: inputKind === "featureParameter" ? parameterId : "",
      valueType: type,
      defaultValue: defaultValueFor(type),
      options: [],
      description: "",
    };
    const result = addConfigurationInput(table, input);
    if (!result.ok) {
      setMessage(result.errors.map((error) => error.message).join("; "));
      return;
    }
    replaceTable(result.value);
    setMessage(`Added ${label}`);
  };

  const addRow = () => {
    if (!table || readOnly) return;
    const result = addConfigurationRow(
      table,
      `Configuration ${table.rows.length + 1}`,
    );
    if (!result.ok) {
      setMessage(result.errors.map((error) => error.message).join("; "));
      return;
    }
    replaceTable(result.value);
  };

  const pasteRow = () => {
    if (!table || !clipboard || readOnly) return;
    const added = addConfigurationRow(table, `${clipboard.name} copy`);
    if (!added.ok) {
      setMessage(added.errors.map((error) => error.message).join("; "));
      return;
    }
    const created = added.value.rows[added.value.rows.length - 1];
    if (!created) return;
    let next = added.value;
    for (const [inputId, value] of Object.entries(clipboard.values)) {
      const result = setConfigurationValue(next, created.id, inputId, value);
      if (result.ok) next = result.value;
    }
    replaceTable(next);
  };

  const commitValue = (
    rowId: string,
    inputId: string,
    value: ConfigurationScalar,
  ) => {
    if (!table || readOnly) return;
    const result = setConfigurationValue(table, rowId, inputId, value);
    if (!result.ok) {
      setMessage(result.errors.map((error) => error.message).join("; "));
      return;
    }
    replaceTable(result.value);
  };

  return (
    <div
      className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-[min(980px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-900/98 text-xs text-gray-200 shadow-2xl"
      data-testid="configuration-panel"
    >
      <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
        <span className="font-medium">Configurations</span>
        <select
          value={table?.id ?? ""}
          onChange={(event) => onChange(tables, event.target.value)}
          aria-label="Active configuration table"
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
        >
          {tables.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
          {tables.length === 0 && <option value="">No tables</option>}
        </select>
        <button
          type="button"
          onClick={addTable}
          disabled={readOnly}
          title={
            readOnly ? "Read-only document" : "Create a configuration table"
          }
          className="rounded border border-gray-700 px-2 py-1 hover:border-blue-500 disabled:opacity-40"
        >
          + Table
        </button>
        <button
          type="button"
          onClick={undoConfiguration}
          disabled={readOnly || undoStack.length === 0}
          title="Undo the last configuration edit"
          className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redoConfiguration}
          disabled={readOnly || redoStack.length === 0}
          title="Redo the last configuration edit"
          className="rounded border border-gray-700 px-2 py-1 hover:border-gray-500 disabled:opacity-40"
        >
          Redo
        </button>
        <span className="ml-auto text-[10px] text-gray-500">
          {readOnly
            ? "View only"
            : "Activating a row applies its overrides without changing the base"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close configurations"
          className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          ×
        </button>
      </div>

      {!table && (
        <div className="p-6 text-center text-gray-500">
          No configuration tables. Create one to make feature parameters
          switchable.
        </div>
      )}

      {table && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <span className="text-gray-500">Table name</span>
              <input
                aria-label="Table name"
                value={table.name}
                readOnly={readOnly}
                onChange={(event) =>
                  replaceTable({ ...table, name: event.target.value })
                }
                className="w-44 rounded border border-gray-700 bg-gray-800 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-gray-500">Description</span>
              <input
                aria-label="Table description"
                value={table.description}
                readOnly={readOnly}
                onChange={(event) =>
                  replaceTable({ ...table, description: event.target.value })
                }
                className="w-52 rounded border border-gray-700 bg-gray-800 px-2 py-1"
              />
            </label>
            <span className="text-[11px] text-gray-500">
              {table.rows.length} row(s) · {table.inputs.length} input(s)
            </span>
            {activeRow && (
              <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-300">
                Active: {activeRow.name}
              </span>
            )}
            {issues.length > 0 && (
              <span className="rounded bg-red-900/50 px-2 py-0.5 text-[11px] text-red-300">
                {issues.length} validation issue(s)
              </span>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-2 rounded border border-gray-700 bg-gray-800/40 p-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase text-gray-500">Input</span>
              <select
                value={inputKind}
                onChange={(event) =>
                  setInputKind(event.target.value as ConfigurationInputKind)
                }
                className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
                aria-label="Configuration input kind"
              >
                {INPUT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            {(inputKind === "featureParameter" ||
              inputKind === "featureSuppression" ||
              inputKind === "featureVisibility" ||
              inputKind === "assemblyInstanceVisibility" ||
              inputKind === "assemblyInstanceSuppression") && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-gray-500">
                    Feature / instance
                  </span>
                  <select
                    value={featureId}
                    onChange={(event) => {
                      setFeatureId(event.target.value);
                      const node = nodes.find(
                        (entry) => entry.featureId === event.target.value,
                      );
                      setParameterId(node?.parameters[0]?.parameterId ?? "");
                    }}
                    className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
                    aria-label="Configuration target feature"
                  >
                    {nodes.map((node) => (
                      <option key={node.featureId} value={node.featureId}>
                        {node.name} ({node.featureType})
                      </option>
                    ))}
                    {nodes.length === 0 && (
                      <option value="">No features</option>
                    )}
                  </select>
                </label>
                {inputKind === "featureParameter" && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-gray-500">
                      Parameter
                    </span>
                    <select
                      value={parameterId}
                      onChange={(event) => setParameterId(event.target.value)}
                      className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
                      aria-label="Configuration target parameter"
                    >
                      {(selectedNode?.parameters ?? []).map((parameter) => (
                        <option
                          key={parameter.parameterId}
                          value={parameter.parameterId}
                        >
                          {parameter.parameterId} ({parameter.kind})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {inputKind === "material" || inputKind === "vendor" ? (
              <div className="flex flex-col gap-1 text-[11px]">
                <span className="text-[10px] uppercase text-gray-500">
                  BOM field
                </span>
                <span className="rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono">
                  {inputKind}
                </span>
              </div>
            ) : inputKind === "property" || inputKind === "bomField" ? (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-gray-500">
                  BOM field
                </span>
                <select
                  value={variableName}
                  onChange={(event) => setVariableName(event.target.value)}
                  aria-label="Configuration BOM field"
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
                >
                  <option value="">Choose field</option>
                  {["name", "number", "description", "revision", "vendor"].map(
                    (field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-gray-500">
                  Variable / key
                </span>
                <input
                  list={
                    inputKind === "variable"
                      ? "configuration-variable-names"
                      : undefined
                  }
                  value={variableName}
                  onChange={(event) => setVariableName(event.target.value)}
                  placeholder={inputKind === "variable" ? "width" : "mateId"}
                  className="w-40 rounded border border-gray-700 bg-gray-800 px-2 py-1"
                  aria-label="Configuration target name"
                />
                <datalist id="configuration-variable-names">
                  {variableNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
            )}
            <button
              type="button"
              onClick={addInput}
              disabled={readOnly}
              title={
                readOnly
                  ? "Read-only document"
                  : "Add the selected input as a column"
              }
              className="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              + Add input
            </button>
            <button
              type="button"
              onClick={addRow}
              disabled={readOnly}
              title={
                readOnly ? "Read-only document" : "Add a configuration row"
              }
              className="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              + Add row
            </button>
            <button
              type="button"
              onClick={pasteRow}
              disabled={readOnly || !clipboard}
              title={clipboard ? `Paste ${clipboard.name}` : "Copy a row first"}
              className="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              Paste row
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-gray-700">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="bg-gray-800 text-[11px] text-gray-400">
                <tr>
                  <th className="border-b border-gray-700 px-2 py-1">Row</th>
                  {table.inputs.map((input, inputIndex) => (
                    <th
                      key={input.id}
                      className="border-b border-gray-700 px-2 py-1"
                      title={input.description || input.targetId}
                    >
                      <div className="flex items-center gap-1">
                        <span>{input.label}</span>
                        <button
                          type="button"
                          disabled={readOnly || inputIndex === 0}
                          title="Move column left"
                          onClick={() => {
                            const result = reorderConfigurationInput(
                              table,
                              input.id,
                              inputIndex - 1,
                            );
                            if (result.ok) replaceTable(result.value);
                          }}
                          className="rounded px-0.5 text-gray-500 hover:bg-gray-700 disabled:opacity-30"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          disabled={
                            readOnly || inputIndex === table.inputs.length - 1
                          }
                          title="Move column right"
                          onClick={() => {
                            const result = reorderConfigurationInput(
                              table,
                              input.id,
                              inputIndex + 1,
                            );
                            if (result.ok) replaceTable(result.value);
                          }}
                          className="rounded px-0.5 text-gray-500 hover:bg-gray-700 disabled:opacity-30"
                        >
                          ›
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          title="Duplicate column"
                          onClick={() => {
                            const result = duplicateConfigurationInput(
                              table,
                              input.id,
                            );
                            if (!result.ok) {
                              setMessage(
                                result.errors
                                  .map((error) => error.message)
                                  .join("; "),
                              );
                              return;
                            }
                            replaceTable(result.value);
                          }}
                          className="rounded px-0.5 text-gray-500 hover:bg-gray-700 disabled:opacity-30"
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          title="Delete column"
                          onClick={() => {
                            const result = deleteConfigurationInput(
                              table,
                              input.id,
                            );
                            if (!result.ok) {
                              setMessage(
                                result.errors
                                  .map((error) => error.message)
                                  .join("; "),
                              );
                              return;
                            }
                            replaceTable(result.value);
                          }}
                          className="rounded px-0.5 text-red-400 hover:bg-gray-700 disabled:opacity-30"
                        >
                          ×
                        </button>
                      </div>
                      <div className="text-[9px] font-normal text-gray-500">
                        {input.kind}
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-gray-700 px-2 py-1">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr
                    key={row.id}
                    className={
                      row.id === activeRow?.id ? "bg-emerald-900/20" : ""
                    }
                  >
                    <td className="border-b border-gray-800 px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="active-config-row"
                          checked={row.id === activeRow?.id}
                          onChange={() => onActivate(table.id, row.id)}
                          aria-label={`Activate ${row.name}`}
                        />
                        <input
                          aria-label={`Configuration row ${row.name} name`}
                          value={row.name}
                          readOnly={readOnly}
                          onBlur={(event) => {
                            const result = renameConfigurationRow(
                              table,
                              row.id,
                              event.target.value,
                            );
                            if (!result.ok) {
                              setMessage(
                                result.errors
                                  .map((error) => error.message)
                                  .join("; "),
                              );
                              return;
                            }
                            replaceTable(result.value);
                          }}
                          onChange={() => undefined}
                          defaultValue={row.name}
                          key={`${row.id}-name-${row.name}`}
                          className="w-28 rounded bg-transparent px-1 py-0.5 outline-none focus:bg-gray-800"
                        />
                        {row.isDefault && (
                          <span
                            title="Default configuration"
                            className="text-[10px] text-emerald-400"
                          >
                            default
                          </span>
                        )}
                      </div>
                      <input
                        value={row.description}
                        readOnly={readOnly}
                        placeholder="Description"
                        onChange={(event) =>
                          replaceTable({
                            ...table,
                            rows: table.rows.map((entry) =>
                              entry.id === row.id
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          })
                        }
                        className="mt-0.5 w-28 rounded bg-transparent px-1 py-0.5 text-[10px] text-gray-500 outline-none focus:bg-gray-800"
                      />
                    </td>
                    {table.inputs.map((input) => {
                      const value = row.values[input.id] ?? input.defaultValue;
                      return (
                        <td
                          key={input.id}
                          className="border-b border-gray-800 px-2 py-1"
                        >
                          {input.valueType === "boolean" ? (
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              disabled={readOnly}
                              onChange={(event) =>
                                commitValue(
                                  row.id,
                                  input.id,
                                  event.target.checked,
                                )
                              }
                              aria-label={`${row.name} ${input.label}`}
                            />
                          ) : input.options.length > 0 ? (
                            <select
                              aria-label={`${row.name} ${input.label}`}
                              value={String(value)}
                              disabled={readOnly}
                              onChange={(event) =>
                                commitValue(
                                  row.id,
                                  input.id,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                            >
                              {input.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`${row.name} ${input.label}`}
                              type={
                                input.valueType === "number" ||
                                input.valueType === "length" ||
                                input.valueType === "angle"
                                  ? "number"
                                  : "text"
                              }
                              value={String(value)}
                              disabled={readOnly}
                              onChange={(event) =>
                                commitValue(
                                  row.id,
                                  input.id,
                                  input.valueType === "number" ||
                                    input.valueType === "length" ||
                                    input.valueType === "angle"
                                    ? Number(event.target.value)
                                    : event.target.value,
                                )
                              }
                              className="w-full min-w-[64px] rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-gray-800 px-2 py-1">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={readOnly || rowIndex === 0}
                          title="Move row up"
                          onClick={() => {
                            const result = reorderConfigurationRow(
                              table,
                              row.id,
                              rowIndex - 1,
                            );
                            if (result.ok) replaceTable(result.value);
                          }}
                          className="rounded border border-gray-700 px-1 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={
                            readOnly || rowIndex === table.rows.length - 1
                          }
                          title="Move row down"
                          onClick={() => {
                            const result = reorderConfigurationRow(
                              table,
                              row.id,
                              rowIndex + 1,
                            );
                            if (result.ok) replaceTable(result.value);
                          }}
                          className="rounded border border-gray-700 px-1 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          title="Copy row values"
                          onClick={() =>
                            setClipboard({
                              name: row.name,
                              values: { ...row.values },
                            })
                          }
                          className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-40"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          title="Duplicate this row and its values"
                          onClick={() => {
                            const result = duplicateConfigurationRow(
                              table,
                              row.id,
                            );
                            if (!result.ok) {
                              setMessage(
                                result.errors
                                  .map((error) => error.message)
                                  .join("; "),
                              );
                              return;
                            }
                            replaceTable(result.value);
                          }}
                          className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-40"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          disabled={readOnly || table.rows.length <= 1}
                          title={
                            table.rows.length <= 1
                              ? "A configuration needs at least one row"
                              : "Delete this row"
                          }
                          onClick={() => {
                            const result = deleteConfigurationRow(
                              table,
                              row.id,
                            );
                            if (!result.ok) {
                              setMessage(
                                result.errors
                                  .map((error) => error.message)
                                  .join("; "),
                              );
                              return;
                            }
                            replaceTable(result.value);
                          }}
                          className="rounded border border-red-800 px-1.5 py-0.5 text-[10px] text-red-300 hover:border-red-600 disabled:opacity-40"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          title="Make this row the default configuration"
                          onClick={() => {
                            const result = setDefaultConfigurationRow(
                              table,
                              row.id,
                            );
                            if (!result.ok) return;
                            replaceTable(result.value);
                            onActivate(table.id, row.id);
                          }}
                          className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-40"
                        >
                          Set default
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded border border-gray-700 bg-gray-800/30 p-2">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-medium text-gray-300">
                Visibility conditions
              </span>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  if (!table) return;
                  const next: ConfigurationTable = {
                    ...table,
                    visibilityConditions: [
                      ...table.visibilityConditions,
                      {
                        id: `cond_${Date.now().toString(36)}_${table.visibilityConditions.length}`,
                        targetKind: "feature",
                        targetId: nodes[0]?.featureId ?? "",
                        condition: "true",
                      },
                    ],
                  };
                  replaceTable(next);
                }}
                className="rounded border border-gray-700 px-2 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-40"
              >
                + Condition
              </button>
            </div>
            {table.visibilityConditions.length === 0 && (
              <p className="text-[11px] text-gray-500">
                Conditions evaluate against the active row and document
                variables. A non-boolean result is a localized error.
              </p>
            )}
            {table.visibilityConditions.map((condition) => {
              const evaluation = visibility.find(
                (entry) => entry.targetId === condition.targetId,
              );
              return (
                <div
                  key={condition.id}
                  className="mb-1 flex flex-wrap items-center gap-1"
                >
                  <select
                    value={condition.targetId}
                    disabled={readOnly}
                    onChange={(event) =>
                      replaceTable({
                        ...table,
                        visibilityConditions: table.visibilityConditions.map(
                          (entry) =>
                            entry.id === condition.id
                              ? { ...entry, targetId: event.target.value }
                              : entry,
                        ),
                      })
                    }
                    aria-label="Visibility condition target"
                    className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[11px]"
                  >
                    {nodes.map((node) => (
                      <option key={node.featureId} value={node.featureId}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={condition.condition}
                    disabled={readOnly}
                    onChange={(event) =>
                      replaceTable({
                        ...table,
                        visibilityConditions: table.visibilityConditions.map(
                          (entry) =>
                            entry.id === condition.id
                              ? { ...entry, condition: event.target.value }
                              : entry,
                        ),
                      })
                    }
                    aria-label="Visibility condition expression"
                    className="w-56 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 font-mono text-[11px]"
                  />
                  <span
                    className={
                      evaluation?.diagnostics.length
                        ? "text-[10px] text-red-300"
                        : evaluation?.visible
                          ? "text-[10px] text-emerald-300"
                          : "text-[10px] text-gray-500"
                    }
                  >
                    {evaluation?.diagnostics
                      .map((diagnostic) => diagnostic.message)
                      .join("; ") ??
                      (evaluation?.visible ? "visible" : "hidden")}
                  </span>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      replaceTable({
                        ...table,
                        visibilityConditions: table.visibilityConditions.filter(
                          (entry) => entry.id !== condition.id,
                        ),
                      })
                    }
                    className="rounded px-1 text-red-400 hover:bg-gray-800 disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 text-[11px] text-gray-500 md:grid-cols-2">
            <div>
              <span className="text-gray-400">Resolved values: </span>
              {Object.entries(values)
                .map(
                  ([id, value]) =>
                    `${table.inputs.find((input) => input.id === id)?.label ?? id}=${String(value)}`,
                )
                .join(", ") || "none"}
            </div>
            {message && <div className="text-amber-300">{message}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationPanel;
