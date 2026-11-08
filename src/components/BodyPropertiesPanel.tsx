import React, { FC, useState } from "react";
import type { BodyProperties } from "../model/bodyProperties";
import { formatPhase6Length, phase6BodyKindLabel } from "../model/phase6";
import { surfaceBodyStatus } from "../model/phase6b";
import {
  convertArea,
  convertLength,
  convertVolume,
  formatArea,
  formatCurvature,
  formatLength,
  formatVolume,
  INSPECT_TOLERANCE,
  type BodyInspection,
  type InspectionUnit,
  type SelectionInspection,
} from "../model/inspect";
import {
  MATERIALS,
  type BodyRecord,
  type Material,
  type PartRecord,
} from "../model/parts";

export interface BodySelectionEntry {
  body: BodyProperties;
  meta: BodyRecord;
  part: PartRecord | null;
  material: Material | null;
  featureStatus: string;
  featureDetail: string | null;
  /** Feature that owns the status above; null means the body's own feature. */
  featureName?: string | null;
  featureType?: string | null;
  consumedBy: string | null;
  inspection: BodyInspection;
}

interface BodyPropertiesPanelProps {
  bodies: BodySelectionEntry[];
  parts: PartRecord[];
  onRenameBody: (bodyId: string, name: string) => void;
  onCreatePart: () => void;
  onAssignPart: (bodyIds: string[], partId: string | null) => void;
  onUpdatePart: (
    partId: string,
    patch: { name?: string; number?: string; description?: string },
  ) => void;
  onSetMaterial: (bodyIds: string[], materialId: string | null) => void;
  onSetColor: (bodyIds: string[], color: string) => void;
  onSetHidden: (bodyIds: string[], hidden: boolean) => void;
  onSetTransparent: (bodyIds: string[], transparent: boolean) => void;
  onSetRemoved: (bodyIds: string[], removed: boolean) => void;
  onIsolate: (bodyId: string | null) => void;
  onTransform: (bodyIds: string[], mode: "MOVE" | "COPY") => void;
  onExportStl?: (() => void) | undefined;
  onExportPartStl?: ((partId: string) => void) | undefined;
  inspection?: SelectionInspection | null;
}

const Row: FC<{ label: string; value: string; testId?: string }> = ({
  label,
  value,
  testId,
}) => (
  <div className="flex items-baseline gap-2 py-0.5">
    <span className="w-16 flex-none text-[10px] text-gray-500 uppercase tracking-wide">
      {label}
    </span>
    <span className="text-xs text-gray-200 break-all" data-testid={testId}>
      {value}
    </span>
  </div>
);

const mm = (value: number, unit: InspectionUnit) =>
  formatLength(value, unit, 1);
const volume = (value: number, unit: InspectionUnit) =>
  formatVolume(value, unit, 1);
const area = (value: number, unit: InspectionUnit) =>
  `${convertArea(value, unit).toFixed(1)} ${unit}²`;
const LB_PER_KG = 2.2046226218;
const mass = (value: number, unit: InspectionUnit) =>
  unit === "in"
    ? `${(value * LB_PER_KG).toFixed(2)} lb`
    : value >= 1
      ? `${value.toFixed(2)} kg`
      : `${(value * 1000).toFixed(1)} g`;
const point = (value: [number, number, number] | null, unit: InspectionUnit) =>
  value
    ? `${value.map((v) => convertLength(v, unit).toFixed(1)).join(", ")} ${unit}`
    : "n/a";
const inertia = (
  value: BodyProperties["inertiaKgMM2"],
  unit: InspectionUnit,
) =>
  value
    ? `${value
        .map((v) =>
          (unit === "in" ? (v * LB_PER_KG) / 25.4 ** 2 : v).toExponential(2),
        )
        .join(" / ")} ${unit === "in" ? "lb·in²" : "kg·mm²"}`
    : "n/a";

const Section: FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="px-3 py-2 border-b border-gray-700">
    <div className="mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
      {title}
    </div>
    {children}
  </div>
);

const Field: FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="flex items-center gap-2 py-0.5 text-[11px] text-gray-400">
    <span className="w-16 flex-none uppercase tracking-wide">{label}</span>
    <span className="flex-1 min-w-0">{children}</span>
  </label>
);

const inputClass =
  "w-full rounded bg-gray-900 border border-gray-600 px-1.5 py-0.5 text-xs text-gray-100";

export const BodyPropertiesPanel: FC<BodyPropertiesPanelProps> = ({
  bodies,
  parts,
  onRenameBody,
  onCreatePart,
  onAssignPart,
  onUpdatePart,
  onSetMaterial,
  onSetColor,
  onSetHidden,
  onSetTransparent,
  onSetRemoved,
  onIsolate,
  onTransform,
  onExportStl,
  onExportPartStl,
  inspection = null,
}) => {
  const [unit, setUnit] = useState<InspectionUnit>("mm");
  const [precision, setPrecision] = useState(2);
  if (bodies.length === 0) return null;
  const ids = bodies.map((b) => b.meta.id);
  const single = bodies.length === 1 ? bodies[0]! : null;
  const sharedPartId =
    new Set(bodies.map((b) => b.meta.partId ?? "")).size === 1
      ? (bodies[0]!.meta.partId ?? "")
      : "";
  const sharedPart = sharedPartId
    ? (parts.find((p) => p.id === sharedPartId) ?? null)
    : null;
  const part = single?.part ?? sharedPart;
  const sharedMaterial =
    new Set(bodies.map((b) => b.meta.materialId ?? "")).size === 1
      ? (bodies[0]!.meta.materialId ?? "")
      : "";
  const totalVolume = bodies.reduce(
    (sum, b) => sum + (b.body.volumeMM3 ?? 0),
    0,
  );
  const totalMass = bodies.reduce((sum, b) => sum + (b.body.massKg ?? 0), 0);
  const anyMass = bodies.some((b) => b.body.massKg !== null);
  const color =
    single?.meta.appearance.color ?? single?.material?.color ?? "#9aa4ad";
  const removed = bodies.every((b) => b.meta.state === "removed");
  const hidden = bodies.every((b) => b.meta.hidden);
  const transparent = bodies.every((b) => b.meta.transparent);
  const isolatedId = single?.meta.id ?? null;
  const solidStatus = single
    ? surfaceBodyStatus({
        kind: single.body.kind,
        openShell: single.body.openShell,
        boundaryEdges: single.body.boundaryEdges,
      })
    : null;

  return (
    <aside
      className="cad-studio-light cad-light-panel flex-none w-64 overflow-y-auto border-l border-[var(--cad-border)] bg-white"
      data-testid="body-properties"
      aria-label="Body properties"
    >
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="text-sm font-bold text-[#202124]">Body Properties</div>
        <div className="text-[11px] text-gray-400 truncate">
          {single ? single.body.name : `${bodies.length} bodies selected`}
        </div>
      </div>

      {bodies.length > 1 && (
        <Section title="Selection">
          <Row
            label="Bodies"
            value={String(bodies.length)}
            testId="body-selection-count"
          />
          <Row
            label="Volume"
            value={volume(totalVolume, unit)}
            testId="body-selection-volume"
          />
          <Row
            label="Mass"
            value={anyMass ? mass(totalMass, unit) : "n/a (no material)"}
            testId="body-selection-mass"
          />
          <div className="mt-1 space-y-0.5">
            {bodies.map((b) => (
              <div
                key={b.meta.id}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-gray-300">{b.meta.name}</span>
                <span className="flex-none text-gray-500">
                  {b.body.volumeMM3 === null
                    ? "n/a"
                    : volume(b.body.volumeMM3, unit)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Part">
        <Field label="Part">
          <select
            aria-label="Part"
            data-testid="body-part-select"
            value={sharedPartId}
            onChange={(e) => onAssignPart(ids, e.target.value || null)}
            className={inputClass}
          >
            <option value="">No part</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          onClick={onCreatePart}
          data-testid="body-part-create"
          className="mt-1 w-full rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-600"
        >
          New Part…
        </button>
        {part && (
          <div className="mt-1 space-y-1">
            <Field label="Name">
              <input
                key={`${part.id}-name`}
                aria-label="Part name"
                data-testid="body-part-name"
                defaultValue={part.name}
                onBlur={(e) => onUpdatePart(part.id, { name: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Number">
              <input
                key={`${part.id}-number`}
                aria-label="Part number"
                data-testid="body-part-number"
                defaultValue={part.number}
                onBlur={(e) =>
                  onUpdatePart(part.id, { number: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Desc">
              <input
                key={`${part.id}-description`}
                aria-label="Part description"
                data-testid="body-part-description"
                defaultValue={part.description}
                onBlur={(e) =>
                  onUpdatePart(part.id, { description: e.target.value })
                }
                className={inputClass}
              />
            </Field>
            <Row
              label="Bodies"
              value={String(part.bodyIds.length)}
              testId="body-part-body-count"
            />
            {part.bodyIds.length > 1 && (
              <Row
                label="Type"
                value="Composite"
                testId="body-part-composite"
              />
            )}
          </div>
        )}
      </Section>

      <Section title="Body">
        <Row
          label="Type"
          value={
            single
              ? phase6BodyKindLabel(single.body.kind)
              : new Set(bodies.map((body) => body.body.kind)).size === 1
                ? phase6BodyKindLabel(bodies[0]!.body.kind)
                : "Mixed"
          }
          testId="body-kind"
        />
        {single ? (
          <Field label="Name">
            <input
              aria-label="Body name"
              data-testid="body-name"
              defaultValue={single.meta.name}
              onBlur={(e) => onRenameBody(single.meta.id, e.target.value)}
              className={inputClass}
            />
          </Field>
        ) : (
          <Row label="Name" value="Apply below to all" />
        )}
        <Field label="Material">
          <select
            aria-label="Material"
            data-testid="body-material"
            value={sharedMaterial}
            onChange={(e) => onSetMaterial(ids, e.target.value || null)}
            className={inputClass}
          >
            <option value="">None</option>
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Color">
          <input
            type="color"
            aria-label="Color"
            data-testid="body-color"
            value={color}
            onChange={(e) => onSetColor(ids, e.target.value)}
            className="h-6 w-12 cursor-pointer rounded border border-gray-600 bg-transparent"
          />
        </Field>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            aria-label={hidden ? "Show bodies" : "Hide bodies"}
            data-testid="body-hide"
            onClick={() => onSetHidden(ids, !hidden)}
            className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
          >
            {hidden ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            aria-label="Isolate body"
            data-testid="body-isolate"
            onClick={() => onIsolate(isolatedId)}
            className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
          >
            Isolate
          </button>
          <button
            type="button"
            aria-label="Transparent body"
            data-testid="body-transparent"
            aria-pressed={transparent}
            onClick={() => onSetTransparent(ids, !transparent)}
            className={`rounded px-2 py-0.5 text-[10px] ${transparent ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
          >
            Transparent
          </button>
          <button
            type="button"
            aria-label={removed ? "Restore bodies" : "Remove bodies"}
            data-testid="body-remove"
            onClick={() => onSetRemoved(ids, !removed)}
            className="rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-gray-600"
          >
            {removed ? "Restore" : "Remove"}
          </button>
        </div>
      </Section>

      <Section title="Mass Properties">
        <Row
          label="Volume"
          value={
            single
              ? single.body.volumeMM3 === null
                ? "n/a"
                : volume(single.body.volumeMM3, unit)
              : volume(totalVolume, unit)
          }
          testId="body-volume"
        />
        <Row
          label="Mass"
          value={
            !single && anyMass
              ? mass(totalMass, unit)
              : single?.body.massKg == null
                ? "n/a (no material)"
                : mass(single.body.massKg, unit)
          }
          testId="body-mass"
        />
        <Row
          label="CoM"
          value={point(single?.body.centerOfMassMM ?? null, unit)}
          testId="body-center-of-mass"
        />
        <Row
          label="Inertia"
          value={inertia(single?.body.inertiaKgMM2 ?? null, unit)}
          testId="body-inertia"
        />
        <Row
          label="Surface"
          value={
            single?.body.surfaceAreaMM2 == null
              ? "n/a"
              : area(single.body.surfaceAreaMM2, unit)
          }
          testId="body-surface-area"
        />
        <Row
          label="Tris"
          value={single ? String(single.body.triangles) : "—"}
          testId="body-triangle-count"
        />
        {single && (
          <>
            <Row
              label="Shell"
              value={
                single.body.openShell
                  ? `Open (${single.body.boundaryEdges} boundary edge${single.body.boundaryEdges === 1 ? "" : "s"})`
                  : "Closed"
              }
              testId="body-shell"
            />
            <Row
              label="Solid ops"
              value={
                solidStatus?.solidOpsAllowed
                  ? "Allowed"
                  : (solidStatus?.reason ?? "—")
              }
              testId="body-solid-ops"
            />
            {single.meta.sheetMetal && (
              <>
                <Row
                  label="Rule"
                  value={single.meta.sheetMetal.ruleId}
                  testId="body-sheet-rule"
                />
                <Row
                  label="Sheet mat."
                  value={single.meta.sheetMetal.material}
                  testId="body-sheet-material"
                />
                <Row
                  label="Sheet mass"
                  value={
                    single.meta.sheetMetal.massKg == null
                      ? "n/a"
                      : mass(single.meta.sheetMetal.massKg, unit)
                  }
                  testId="body-sheet-mass"
                />
                <Row
                  label="Thickness"
                  value={formatPhase6Length(
                    single.meta.sheetMetal.thicknessMM,
                    unit,
                    precision,
                  )}
                  testId="body-sheet-thickness"
                />
                <Row
                  label="Flat size"
                  value={`${formatPhase6Length(
                    single.meta.sheetMetal.flatWidthMM,
                    unit,
                    precision,
                  )} × ${formatPhase6Length(
                    single.meta.sheetMetal.flatHeightMM,
                    unit,
                    precision,
                  )}`}
                  testId="body-sheet-flat-size"
                />
                <Row
                  label="Bends"
                  value={String(single.meta.sheetMetal.bendCount)}
                  testId="body-sheet-bends"
                />
                <Row
                  label="Grain"
                  value={single.meta.sheetMetal.grainDirection}
                  testId="body-sheet-grain"
                />
              </>
            )}
            <Row
              label="X"
              value={mm(single.body.sizeMM[0], unit)}
              testId="body-size-x"
            />
            <Row
              label="Y"
              value={mm(single.body.sizeMM[1], unit)}
              testId="body-size-y"
            />
            <Row
              label="Z"
              value={mm(single.body.sizeMM[2], unit)}
              testId="body-size-z"
            />
            <Row
              label="Faces"
              value={String(single.body.faces)}
              testId="body-face-count"
            />
            <Row
              label="Edges"
              value={String(single.body.edges)}
              testId="body-edge-count"
            />
            <Row
              label="Visible"
              value={single.body.visible ? "Yes" : "No"}
              testId="body-visible"
            />
          </>
        )}
      </Section>

      <Section title="Inspect">
        <Field label="Units">
          <div className="flex gap-1">
            {(["mm", "in"] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`inspect-unit-${value}`}
                aria-pressed={unit === value}
                onClick={() => setUnit(value)}
                className={`rounded px-2 py-0.5 text-[10px] ${unit === value ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-200 hover:bg-gray-600"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Precision">
          <select
            aria-label="Inspect precision"
            data-testid="inspect-precision"
            value={precision}
            onChange={(e) => setPrecision(Number(e.target.value))}
            className={inputClass}
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value} decimals
              </option>
            ))}
          </select>
        </Field>
        <Row
          label="Accuracy"
          value={INSPECT_TOLERANCE}
          testId="inspect-tolerance"
        />
        {single ? (
          single.inspection.error ? (
            <Row
              label="Error"
              value={single.inspection.error}
              testId="inspect-error"
            />
          ) : (
            <>
              <Row
                label="Radius"
                value={formatLength(
                  single.inspection.radiusMM,
                  unit,
                  precision,
                )}
                testId="inspect-radius"
              />
              <Row
                label="Diameter"
                value={formatLength(
                  single.inspection.diameterMM,
                  unit,
                  precision,
                )}
                testId="inspect-diameter"
              />
              <Row
                label="Thickness"
                value={formatLength(
                  single.inspection.thicknessMM,
                  unit,
                  precision,
                )}
                testId="inspect-thickness"
              />
              <Row
                label="Curvature"
                value={formatCurvature(
                  single.inspection.curvatureMaxPerMM,
                  unit,
                  Math.max(precision, 4),
                )}
                testId="inspect-curvature"
              />
              <Row
                label="Section"
                value={formatArea(
                  single.inspection.sectionAreaMM2,
                  unit,
                  precision,
                )}
                testId="inspect-section-area"
              />
              <Row
                label="Perimeter"
                value={formatLength(
                  single.inspection.sectionPerimeterMM,
                  unit,
                  precision,
                )}
                testId="inspect-section-perimeter"
              />
            </>
          )
        ) : (
          <>
            <Row
              label="Interference"
              value={inspection?.interference ? "Yes" : "No"}
              testId="inspect-interference"
            />
            <Row
              label="Clearance"
              value={formatLength(
                inspection?.minClearanceMM ?? null,
                unit,
                precision,
              )}
              testId="inspect-clearance"
            />
          </>
        )}
      </Section>

      {single && (
        <Section title="Provenance">
          <Row
            label="Feature"
            value={`${single.featureName ?? single.body.name} (${single.featureType ?? single.body.featureType})`}
            testId="body-feature"
          />
          <Row
            label="Status"
            value={single.featureStatus}
            testId="body-feature-status"
          />
          {single.featureStatus === "ERROR" && single.featureDetail && (
            <Row
              label="Error"
              value={single.featureDetail}
              testId="body-feature-error"
            />
          )}
          <Row
            label="Consumed"
            value={single.consumedBy ?? "—"}
            testId="body-consumed-by"
          />
        </Section>
      )}

      <Section title="Actions">
        {onExportStl && (
          <button
            type="button"
            onClick={onExportStl}
            data-testid="body-export-stl"
            className="w-full rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Export STL
          </button>
        )}
        {onExportPartStl && part && (
          <button
            type="button"
            onClick={() => onExportPartStl(part.id)}
            data-testid="body-export-part-stl"
            className="mt-1 w-full rounded bg-blue-700 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Export Part STL
          </button>
        )}
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            data-testid="body-transform-move"
            onClick={() => onTransform(ids, "MOVE")}
            className="flex-1 rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-600"
          >
            Move +X 10 mm
          </button>
          <button
            type="button"
            data-testid="body-transform-copy"
            onClick={() => onTransform(ids, "COPY")}
            className="flex-1 rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-600"
          >
            Copy Body
          </button>
        </div>
      </Section>
    </aside>
  );
};
