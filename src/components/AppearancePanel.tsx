import React, { useMemo, useState } from "react";

import { MATERIALS, type BodyRecord, type PartRecord } from "../model/parts";

export interface AppearanceBody {
  record: BodyRecord;
  part: PartRecord | null;
  materialLabel: string;
  color: string;
  opacity: number;
}

interface AppearancePanelProps {
  bodies: AppearanceBody[];
  onClose: () => void;
  onSelect: (bodyId: string) => void;
  onSetColor: (bodyIds: string[], color: string) => void;
  onSetMaterial: (bodyIds: string[], materialId: string | null) => void;
  onSetOpacity: (bodyIds: string[], opacity: number) => void;
  onSetHidden: (bodyIds: string[], hidden: boolean) => void;
  onReset: (bodyIds: string[]) => void;
}

const PALETTE = [
  "#a8a9ad",
  "#d9dde2",
  "#ffffff",
  "#202124",
  "#c9a227",
  "#f2c94c",
  "#eb5757",
  "#f2994a",
  "#2f80ed",
  "#56ccf2",
  "#27ae60",
  "#9b51e0",
] as const;

export const AppearancePanel: React.FC<AppearancePanelProps> = ({
  bodies,
  onClose,
  onSelect,
  onSetColor,
  onSetMaterial,
  onSetOpacity,
  onSetHidden,
  onReset,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedBodies = bodies.filter((body) =>
    selectedSet.has(body.record.id),
  );
  const ids = selectedBodies.length
    ? selectedBodies.map((body) => body.record.id)
    : bodies.map((body) => body.record.id);
  const opacity = selectedBodies[0]?.opacity ?? bodies[0]?.opacity ?? 1;
  const materialBodies = selectedBodies.length ? selectedBodies : bodies;
  const materialIds = new Set(
    materialBodies.map((body) => body.record.materialId ?? ""),
  );
  const sharedMaterialId =
    materialIds.size === 1
      ? (materialBodies[0]?.record.materialId ?? null)
      : null;
  const mixedMaterial = materialIds.size > 1;
  const allHidden =
    ids.length > 0 &&
    ids.every((id) => {
      const body = bodies.find((entry) => entry.record.id === id);
      return body
        ? body.record.hidden || body.record.state === "removed"
        : true;
    });

  const toggle = (bodyId: string) => {
    setSelected((current) =>
      current.includes(bodyId)
        ? current.filter((id) => id !== bodyId)
        : [...current, bodyId],
    );
  };

  return (
    <aside
      className="cad-light-panel flex w-72 flex-none flex-col overflow-hidden border-l border-[var(--cad-border)] bg-white"
      data-testid="appearance-panel"
      aria-label="Appearance"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--cad-border)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#202124]">Appearance</div>
          <div className="truncate text-[11px] text-[var(--cad-text-muted)]">
            {selectedBodies.length
              ? `${selectedBodies.length} selected`
              : "All bodies"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close appearance panel"
          data-testid="appearance-close"
          className="rounded px-1.5 py-0.5 text-xs text-[var(--cad-text-muted)] hover:bg-[var(--cad-chrome-hover)] hover:text-[var(--cad-text)]"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-[var(--cad-border)] p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-muted)]">
          Color
        </div>
        <div
          className="grid grid-cols-6 gap-1.5"
          role="group"
          aria-label="Color palette"
        >
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Set appearance ${color}`}
              data-testid={`appearance-color-${color.slice(1)}`}
              onClick={() => onSetColor(ids, color)}
              className="h-6 w-full rounded border border-[var(--cad-border)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cad-accent)]"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--cad-text-muted)]">
          <span>Custom</span>
          <input
            type="color"
            aria-label="Custom appearance color"
            data-testid="appearance-color-custom"
            value={selectedBodies[0]?.color ?? bodies[0]?.color ?? "#a8a9ad"}
            onChange={(event) => onSetColor(ids, event.target.value)}
            className="h-6 w-14 cursor-pointer rounded border border-[var(--cad-border)] bg-transparent"
          />
        </label>
      </div>

      <div className="border-b border-[var(--cad-border)] p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--cad-text-muted)]">
          Material
        </div>
        <div
          className="grid grid-cols-2 gap-1"
          role="group"
          aria-label="Material presets"
        >
          <button
            type="button"
            aria-label="Set material None"
            aria-pressed={!mixedMaterial && sharedMaterialId === null}
            data-testid="appearance-material-none"
            onClick={() => onSetMaterial(ids, null)}
            className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[10px] ${
              !mixedMaterial && sharedMaterialId === null
                ? "border-[var(--cad-accent)] bg-[#e8f0fe] text-[var(--cad-accent)]"
                : "border-[var(--cad-border)] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
            }`}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-full border border-[var(--cad-border)] bg-[#e8eaed]" />
            None
          </button>
          {MATERIALS.map((material) => {
            const active = !mixedMaterial && sharedMaterialId === material.id;
            return (
              <button
                key={material.id}
                type="button"
                aria-label={`Set material ${material.label}`}
                aria-pressed={active}
                data-testid={`appearance-material-${material.id}`}
                onClick={() => onSetMaterial(ids, material.id)}
                className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[10px] ${
                  active
                    ? "border-[var(--cad-accent)] bg-[#e8f0fe] text-[var(--cad-accent)]"
                    : "border-[var(--cad-border)] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 flex-none rounded-full border border-[var(--cad-border)]"
                  style={{ backgroundColor: material.color }}
                />
                <span className="truncate">{material.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-b border-[var(--cad-border)] p-3">
        <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--cad-text-muted)]">
          <span>Opacity</span>
          <span data-testid="appearance-opacity-value">
            {Math.round(opacity * 100)}%
          </span>
        </label>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          aria-label="Appearance opacity"
          data-testid="appearance-opacity"
          onChange={(event) =>
            onSetOpacity(ids, Number(event.target.value) / 100)
          }
          className="mt-1 w-full accent-[var(--cad-accent)]"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--cad-border)] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--cad-text-muted)]">
          <span>Bodies ({bodies.length})</span>
          <span className="flex gap-2 normal-case tracking-normal">
            <button
              type="button"
              onClick={() => setSelected(bodies.map((body) => body.record.id))}
              className="hover:text-[var(--cad-text)]"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="hover:text-[var(--cad-text)]"
            >
              None
            </button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {bodies.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--cad-text-muted)]">
              Create a body to give it an appearance.
            </div>
          ) : (
            bodies.map((body) => {
              const active = selectedSet.has(body.record.id);
              return (
                <div
                  key={body.record.id}
                  className={`flex items-center gap-2 border-b border-[var(--cad-border)] px-3 py-1.5 text-xs ${
                    active ? "bg-blue-50" : "hover:bg-[var(--cad-chrome-hover)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(body.record.id)}
                    aria-label={`Select ${body.record.name} for appearance`}
                    className="h-3.5 w-3.5 flex-none accent-[var(--cad-accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(body.record.id)}
                    aria-label={`Select body ${body.record.name}`}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[var(--cad-text)]">
                      {body.record.name}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--cad-text-muted)]">
                      {body.part?.name ?? body.materialLabel}
                    </span>
                  </button>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 flex-none rounded-sm border border-[var(--cad-border)]"
                    style={{ backgroundColor: body.color }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex gap-1.5 border-t border-[var(--cad-border)] p-2">
        <button
          type="button"
          onClick={() => onSetHidden(ids, !allHidden)}
          data-testid="appearance-hide"
          className="flex-1 rounded border border-[var(--cad-border)] px-2 py-1 text-[11px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
        >
          {allHidden ? "Show" : "Hide"}
        </button>
        <button
          type="button"
          onClick={() => onReset(ids)}
          data-testid="appearance-reset"
          className="flex-1 rounded border border-[var(--cad-border)] px-2 py-1 text-[11px] text-[var(--cad-text)] hover:bg-[var(--cad-chrome-hover)]"
        >
          Reset
        </button>
      </div>
    </aside>
  );
};
