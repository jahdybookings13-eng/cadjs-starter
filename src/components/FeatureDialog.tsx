import React, { FC, useEffect } from "react";
import type { PanelRow } from "../model/paramPanel";
import type { ProvenanceQuery } from "../model/onshapeHistory";
import {
  isFeatureDialogDirty,
  isRowDirty,
  type FeatureDialogState,
} from "../model/featureDialog";
import { phase6DialogFor, phase6SelectionLabel } from "../model/phase6b";

interface FeatureDialogProps {
  state: FeatureDialogState;
  onEdit: (parameterId: string, value: unknown) => void;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
  /** Toggle viewport picking for a query-list row (the extrude end reference). */
  onPickRow?: (parameterId: string) => void;
  /** Row currently waiting for a viewport pick, if any. */
  pickingRow?: string | null;
}

const RowEditor: FC<{
  row: PanelRow;
  value: unknown;
  onChange: (value: unknown) => void;
  pickable?: boolean;
  picking?: boolean;
  onPick?: () => void;
}> = ({ row, value, onChange, pickable, picking, onPick }) => {
  const disabled = row.support?.status === "unwired";
  const common =
    "w-full rounded bg-gray-900 border border-gray-600 px-2 py-1 text-sm text-gray-100 disabled:text-gray-500 disabled:border-gray-700";

  if (row.kind === "boolean") {
    return (
      <input
        type="checkbox"
        aria-label={row.label}
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-500 disabled:opacity-50"
      />
    );
  }

  if (row.kind === "enum") {
    return (
      <select
        aria-label={row.label}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={common}
      >
        {(row.enumValues ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (row.kind === "string") {
    return (
      <input
        type="text"
        aria-label={row.label}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={common}
      />
    );
  }

  if (row.kind === "quantity") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          aria-label={row.label}
          value={typeof value === "number" ? value : 0}
          disabled={disabled}
          min={row.min}
          max={row.max}
          step={row.step ?? 0.001}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className={common}
        />
        <span className="flex-none text-xs text-gray-400">
          {row.units ?? ""}
        </span>
      </div>
    );
  }

  if (row.kind === "queryList") {
    const queries = Array.isArray(value) ? (value as ProvenanceQuery[]) : [];
    const tags = queries
      .map((q) => q.entityTag)
      .filter((t): t is string => Boolean(t));
    const summary =
      tags.length === 0
        ? "None"
        : tags.length === 1
          ? tags[0]!
          : `${tags.length} selected`;
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="min-w-0 flex-1 truncate text-xs text-gray-400"
          title={tags.join(", ")}
        >
          {summary}
        </span>
        {row.parameterId === "profiles" && queries.length > 1 && (
          <button
            type="button"
            data-testid="reverse-profiles"
            onClick={() => onChange([...queries].reverse())}
            disabled={disabled}
            title="Reverse the loft section order"
            className="flex-none rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700 disabled:text-gray-600"
          >
            Reverse
          </button>
        )}
        {row.parameterId === "guideSubqueries" && queries.length > 0 && (
          <button
            type="button"
            data-testid="clear-guides"
            onClick={() => onChange([])}
            disabled={disabled}
            className="flex-none rounded border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-700 disabled:text-gray-600"
          >
            Clear
          </button>
        )}
        {pickable && (
          <button
            type="button"
            data-testid="pick-end-reference"
            onClick={onPick}
            disabled={disabled}
            className="flex-none rounded border border-blue-700 bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-200 hover:bg-blue-800/60 disabled:border-gray-700 disabled:text-gray-600"
          >
            {picking
              ? "Cancel pick"
              : row.parameterId === "connectors"
                ? "Pick vertex"
                : row.parameterId === "guideSubqueries"
                  ? "Pick curve"
                  : row.parameterId === "draftPartingEdge"
                    ? "Pick edge"
                    : "Pick face"}
          </button>
        )}
      </div>
    );
  }

  const summary = Array.isArray(value)
    ? `${value.length} selected`
    : String(value ?? "");
  return (
    <span
      className="text-sm text-gray-400"
      title="Pick this from the modeling viewport"
    >
      {summary || "None"}
    </span>
  );
};

const FeatureDialog: FC<FeatureDialogProps> = ({
  state,
  onEdit,
  onApply,
  onReset,
  onCancel,
  onPickRow,
  pickingRow,
}) => {
  const open = state.phase === "editing" && !!state.panel;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      // A live viewport pick swallows the first Escape; the dialog stays open.
      if (pickingRow && onPickRow) onPickRow(pickingRow);
      else onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onPickRow, pickingRow]);

  if (!open || !state.panel) return null;

  const dirty = isFeatureDialogDirty(state);
  const phase6Spec = phase6DialogFor(state.featureType ?? "");
  const selectionFilter = phase6Spec
    ? phase6Spec.selectionKind === "mixed"
      ? "Mixed selection"
      : phase6SelectionLabel(phase6Spec.selectionKind)
    : null;

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 ${
        pickingRow ? "pointer-events-none" : ""
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${state.label}`}
        data-testid="feature-dialog"
        className="pointer-events-auto w-80 rounded-lg border border-gray-600 bg-gray-800 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
          <h2 className="text-sm font-semibold text-white">
            Edit {state.label}
          </h2>
          <span className="text-[11px] uppercase tracking-wide text-gray-500">
            {state.featureType}
          </span>
        </div>

        {selectionFilter && (
          <div
            data-testid="feature-dialog-selection-filter"
            className="border-b border-gray-700 px-3 py-1 text-[10px] uppercase tracking-wide text-blue-300"
          >
            Active filter: {selectionFilter}
          </div>
        )}

        <div className="max-h-96 space-y-2 overflow-y-auto px-3 py-2">
          {state.dependents.length > 0 && (
            <p
              data-testid="feature-dialog-dependents"
              role="status"
              className="rounded border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-[11px] leading-tight text-amber-200"
            >
              Used by {state.dependents.length}:{" "}
              {state.dependents.map((d) => d.name).join(", ")}. Changes rebuild
              these downstream features.
            </p>
          )}
          {state.panel.rows.length === 0 && (
            <p className="text-sm text-gray-400">No editable parameters.</p>
          )}
          {state.panel.rows.map((row) => {
            const unwired = row.support?.status === "unwired";
            return (
              <div
                key={row.parameterId}
                data-parameter-id={row.parameterId}
                data-dirty={isRowDirty(row, state.draft[row.parameterId])}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2"
              >
                <label
                  className={`text-xs ${unwired ? "text-gray-500" : "text-gray-300"}`}
                  title={row.support?.reason}
                >
                  {row.label}
                  {row.usingDefault && (
                    <span className="ml-1 text-gray-500">(default)</span>
                  )}
                </label>
                <RowEditor
                  row={row}
                  value={state.draft[row.parameterId]}
                  onChange={(value) => onEdit(row.parameterId, value)}
                  pickable={
                    row.parameterId === "endBoundEntity" ||
                    row.parameterId === "connectors" ||
                    row.parameterId === "draftNeutralFace" ||
                    row.parameterId === "draftPartingEdge" ||
                    row.parameterId === "guideSubqueries"
                  }
                  picking={pickingRow === row.parameterId}
                  onPick={() => onPickRow?.(row.parameterId)}
                />
                {pickingRow === row.parameterId && (
                  <span className="col-span-2 -mt-1 text-[10px] leading-tight text-blue-300">
                    {row.parameterId === "connectors"
                      ? "Click a vertex on a loft section. Each click adds a connector; Esc cancels the pick."
                      : row.parameterId === "draftNeutralFace"
                        ? "Click the face whose plane is the draft neutral plane. Esc cancels the pick."
                        : row.parameterId === "guideSubqueries"
                          ? "Click a sketch curve. Each click adds a guide; Esc cancels the pick."
                          : row.parameterId === "draftPartingEdge"
                            ? "Click a sketch line to use as the parting edge. Esc cancels the pick."
                            : "Click a face on a body in the viewport. With Up To Vertex, the nearest vertex on that face is used. Esc cancels the pick."}
                  </span>
                )}
                {unwired && (
                  <span className="col-span-2 -mt-1 text-[10px] leading-tight text-amber-400/80">
                    {row.support?.reason}
                  </span>
                )}
              </div>
            );
          })}
          {state.error && (
            <p role="alert" className="text-xs text-red-400">
              {state.error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-700 px-3 py-2">
          <button
            onClick={onReset}
            disabled={!dirty}
            className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-transparent"
          >
            Reset
          </button>
          <div className="flex-1" />
          <button
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={!dirty}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeatureDialog;
