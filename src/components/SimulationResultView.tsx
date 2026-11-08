import React, { useEffect, useMemo, useState } from "react";
import type {
  SimBucklingResult,
  SimMesh,
  SimModalResult,
  SimStaticBodyResult,
  SimStaticResult,
  SimStaticTargetResult,
  SimThermalResult,
  SimUnit,
} from "../sim";

type Field =
  | "von-mises"
  | "signed-von-mises"
  | "max-principal"
  | "displacement"
  | "strain"
  | "safety-factor"
  | "temperature"
  | "modal"
  | "buckling";

const STATIC_FIELDS: Field[] = [
  "von-mises",
  "signed-von-mises",
  "max-principal",
  "displacement",
  "strain",
  "safety-factor",
];

function isStaticField(field: Field): boolean {
  return STATIC_FIELDS.includes(field);
}

interface SimulationResultViewProps {
  mesh: SimMesh;
  targetMesh: SimMesh | null;
  units: SimUnit;
  staticResult: SimStaticResult | null;
  targetResult: SimStaticTargetResult | null;
  thermalResult: SimThermalResult | null;
  modalResult: SimModalResult | null;
  bucklingResult: SimBucklingResult | null;
}

interface Probe {
  node: number;
  value: number;
  x: number;
  y: number;
}

const WIDTH = 640;
const HEIGHT = 400;
const MARGIN = 30;

function fieldLabel(field: Field): string {
  if (field === "von-mises") return "von Mises (MPa)";
  if (field === "signed-von-mises") return "Signed von Mises (MPa)";
  if (field === "max-principal") return "Max principal (MPa)";
  if (field === "displacement") return "Displacement";
  if (field === "strain") return "Equivalent strain";
  if (field === "safety-factor") return "Safety factor";
  if (field === "temperature") return "Temperature (°C)";
  if (field === "modal") return "Mode shape magnitude";
  return "Buckling mode shape";
}

function staticFieldValues(
  field: Field,
  result: SimStaticBodyResult,
  units: SimUnit,
): { values: number[]; nodal: boolean; unit: string } {
  if (field === "signed-von-mises") {
    return {
      values: [...(result.signedVonMisesPa ?? result.vonMisesPa ?? [])].map(
        (value) => value / 1e6,
      ),
      nodal: false,
      unit: "MPa",
    };
  }
  if (field === "max-principal") {
    return {
      values: (result.principalStressPa ?? []).map(
        (principal) => (principal[2] ?? 0) / 1e6,
      ),
      nodal: false,
      unit: "MPa",
    };
  }
  if (field === "displacement") {
    const values: number[] = [];
    const scale = units === "in" ? 1 / 0.0254 : 1000;
    for (
      let index = 0;
      index < (result.displacementsM ?? []).length;
      index += 3
    ) {
      values.push(
        Math.hypot(
          result.displacementsM[index] ?? 0,
          result.displacementsM[index + 1] ?? 0,
          result.displacementsM[index + 2] ?? 0,
        ) * scale,
      );
    }
    return { values, nodal: true, unit: units };
  }
  if (field === "strain") {
    return {
      values: [...(result.equivalentStrain ?? [])],
      nodal: false,
      unit: "–",
    };
  }
  if (field === "safety-factor") {
    return {
      values: [...(result.safetyFactor ?? [])],
      nodal: false,
      unit: "×",
    };
  }
  return {
    values: [...(result.vonMisesPa ?? [])].map((value) => value / 1e6),
    nodal: false,
    unit: "MPa",
  };
}

function color(value: number, min: number, max: number): string {
  const t =
    max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  const stops = [
    [32, 82, 180],
    [35, 175, 210],
    [250, 210, 70],
    [220, 70, 45],
  ];
  const at = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const local = t * (stops.length - 1) - at;
  const a = stops[at]!;
  const b = stops[at + 1]!;
  const channel = (index: number) =>
    Math.round(a[index]! + (b[index]! - a[index]!) * local);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export const SimulationResultView: React.FC<SimulationResultViewProps> = ({
  mesh,
  targetMesh,
  units,
  staticResult,
  targetResult,
  thermalResult,
  modalResult,
  bucklingResult,
}) => {
  const fields = useMemo<Field[]>(() => {
    const available: Field[] = [];
    if (staticResult) available.push(...STATIC_FIELDS);
    if (thermalResult) available.push("temperature");
    if (modalResult) available.push("modal");
    if (bucklingResult) available.push("buckling");
    return available;
  }, [staticResult, thermalResult, modalResult, bucklingResult]);
  const [field, setField] = useState<Field>(fields[0] ?? "von-mises");
  const [modeIndex, setModeIndex] = useState(0);
  const [deformedScale, setDeformedScale] = useState(10);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [animate, setAnimate] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (fields.length && !fields.includes(field)) setField(fields[0]!);
  }, [field, fields]);

  const modeCount =
    field === "modal"
      ? (modalResult?.modes.length ?? 0)
      : field === "buckling"
        ? (bucklingResult?.modes.length ?? 0)
        : 0;

  useEffect(() => {
    if (modeIndex >= modeCount) setModeIndex(0);
  }, [modeCount, modeIndex]);

  useEffect(() => {
    if (!animate) {
      setPhase(0);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setPhase(((now - started) / 900) * Math.PI * 2);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const animation = !animate
    ? 1
    : field === "modal" || field === "buckling"
      ? Math.sin(phase)
      : (1 - Math.cos(phase)) / 2;

  const view = useMemo(() => {
    const xs = mesh.nodes.map((node) => node.x);
    const ys = mesh.nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);
    const scale = Math.min(
      (WIDTH - MARGIN * 2) / spanX,
      (HEIGHT - MARGIN * 2) / spanY,
    );
    const project = (x: number, y: number) => ({
      x: MARGIN + (x - minX) * scale + (WIDTH - MARGIN * 2 - spanX * scale) / 2,
      y:
        HEIGHT -
        MARGIN -
        (y - minY) * scale -
        (HEIGHT - MARGIN * 2 - spanY * scale) / 2,
    });

    const deformation = (() => {
      if (isStaticField(field) && staticResult) {
        const factor = units === "in" ? 1 / 0.0254 : 1000;
        return { values: staticResult.displacementsM, factor };
      }
      if (field === "modal" && modalResult?.modes[modeIndex]) {
        return { values: modalResult.modes[modeIndex]!.shape, factor: 1 };
      }
      if (field === "buckling" && bucklingResult?.modes[modeIndex]) {
        return { values: bucklingResult.modes[modeIndex]!.shape, factor: 1 };
      }
      return { values: [] as number[], factor: 0 };
    })();
    const deformed = mesh.nodes.map((node, index) => {
      const ux = deformation.values[index * 3] ?? 0;
      const uy = deformation.values[index * 3 + 1] ?? 0;
      return project(
        node.x + ux * deformation.factor * deformedScale * animation,
        node.y + uy * deformation.factor * deformedScale * animation,
      );
    });

    const staticData =
      isStaticField(field) && staticResult
        ? staticFieldValues(field, staticResult, units)
        : null;
    let values: number[];
    if (staticData) {
      values = staticData.values;
    } else if (field === "temperature" && thermalResult) {
      values = thermalResult.temperaturesC;
    } else if (field === "modal" && modalResult?.modes[modeIndex]) {
      const shape = modalResult.modes[modeIndex]!.shape;
      values = mesh.nodes.map((_, index) =>
        Math.hypot(
          shape[index * 3] ?? 0,
          shape[index * 3 + 1] ?? 0,
          shape[index * 3 + 2] ?? 0,
        ),
      );
    } else if (field === "buckling" && bucklingResult?.modes[modeIndex]) {
      const shape = bucklingResult.modes[modeIndex]!.shape;
      values = mesh.nodes.map((_, index) =>
        Math.hypot(
          shape[index * 3] ?? 0,
          shape[index * 3 + 1] ?? 0,
          shape[index * 3 + 2] ?? 0,
        ),
      );
    } else {
      values = mesh.nodes.map(() => 0);
    }

    const nodeValues =
      staticData && !staticData.nodal
        ? mesh.nodes.map(() => ({ sum: 0, count: 0 }))
        : null;
    if (nodeValues) {
      for (const [index, element] of mesh.elements.entries()) {
        const value = values[index] ?? 0;
        for (const node of element) {
          nodeValues[node]!.sum += value;
          nodeValues[node]!.count += 1;
        }
      }
    }
    const effective = nodeValues
      ? nodeValues.map((entry) => (entry.count ? entry.sum / entry.count : 0))
      : values;
    const min = Math.min(...effective);
    const max = Math.max(...effective);
    return { project, deformed, values, effective, min, max };
  }, [
    mesh,
    units,
    field,
    staticResult,
    thermalResult,
    modalResult,
    bucklingResult,
    modeIndex,
    deformedScale,
    animation,
  ]);

  const targetView = useMemo(() => {
    if (!targetMesh || !targetResult || !isStaticField(field)) return null;
    const xs = targetMesh.nodes.map((node) => node.x);
    const ys = targetMesh.nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);
    const scale = Math.min(
      (WIDTH - MARGIN * 2) / spanX,
      (HEIGHT - MARGIN * 2) / spanY,
    );
    const project = (x: number, y: number) => ({
      x: MARGIN + (x - minX) * scale + (WIDTH - MARGIN * 2 - spanX * scale) / 2,
      y:
        HEIGHT -
        MARGIN -
        (y - minY) * scale -
        (HEIGHT - MARGIN * 2 - spanY * scale) / 2,
    });
    const factor = units === "in" ? 1 / 0.0254 : 1000;
    const deformed = targetMesh.nodes.map((node, index) =>
      project(
        node.x +
          (targetResult.displacementsM[index * 3] ?? 0) *
            factor *
            deformedScale *
            animation,
        node.y +
          (targetResult.displacementsM[index * 3 + 1] ?? 0) *
            factor *
            deformedScale *
            animation,
      ),
    );
    const staticData = staticFieldValues(field, targetResult, units);
    const values = staticData.values;
    const nodeValues = staticData.nodal
      ? null
      : targetMesh.nodes.map(() => ({ sum: 0, count: 0 }));
    if (nodeValues) {
      for (const [index, element] of targetMesh.elements.entries()) {
        const value = values[index] ?? 0;
        for (const node of element) {
          nodeValues[node]!.sum += value;
          nodeValues[node]!.count += 1;
        }
      }
    }
    const effective = nodeValues
      ? nodeValues.map((entry) => (entry.count ? entry.sum / entry.count : 0))
      : values;
    return {
      label: fieldLabel(field),
      unit: staticData.unit,
      min: Math.min(...effective),
      max: Math.max(...effective),
      deformed,
      effective,
    };
  }, [targetMesh, targetResult, units, deformedScale, field, animation]);

  if (!fields.length) {
    return (
      <div className="rounded border border-gray-800 bg-gray-900/50 p-3 text-[11px] text-gray-500">
        Run a static, modal, thermal or buckling case to inspect a contour.
      </div>
    );
  }

  return (
    <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-gray-400">
          Result view
        </span>
        <select
          aria-label="Result field"
          value={field}
          onChange={(event) => setField(event.target.value as Field)}
          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-200"
        >
          {fields.map((item) => (
            <option key={item} value={item}>
              {fieldLabel(item)}
            </option>
          ))}
        </select>
        {modeCount > 0 && (
          <select
            aria-label="Result mode"
            value={modeIndex}
            onChange={(event) => setModeIndex(Number(event.target.value))}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-gray-200"
          >
            {Array.from({ length: modeCount }, (_, index) => (
              <option key={index} value={index}>
                Mode {index + 1}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          aria-label="Animate result"
          aria-pressed={animate}
          onClick={() => setAnimate((value) => !value)}
          className={`rounded border px-2 py-1 text-[10px] ${
            animate
              ? "border-blue-500 bg-blue-950 text-blue-200"
              : "border-gray-700 text-gray-300"
          }`}
        >
          {animate ? "Stop" : "Animate"}
        </button>
        <label className="ml-auto flex items-center gap-2 text-gray-500">
          Deformed ×
          <input
            aria-label="Deformed scale"
            type="range"
            min={0}
            max={50}
            step={1}
            value={deformedScale}
            onChange={(event) => setDeformedScale(Number(event.target.value))}
            className="w-24 accent-blue-500"
          />
          <span className="w-6 text-right text-gray-300">{deformedScale}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
        <span>
          {view.min.toFixed(3)} – {view.max.toFixed(3)}
        </span>
        <span
          className="h-2 w-36 rounded"
          style={{
            background:
              "linear-gradient(90deg, rgb(32,82,180), rgb(35,175,210), rgb(250,210,70), rgb(220,70,45))",
          }}
        />
        <span>{fieldLabel(field)}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Simulation contour"
        data-testid="simulation-contour"
        className="mt-2 w-full rounded border border-gray-800 bg-gray-950"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
          const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
          let nearest = -1;
          let best = Infinity;
          for (let index = 0; index < view.deformed.length; index++) {
            const point = view.deformed[index]!;
            const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
            if (distance < best) {
              best = distance;
              nearest = index;
            }
          }
          if (nearest >= 0 && best < 900) {
            setProbe({
              node: nearest,
              value: view.effective[nearest] ?? 0,
              x: view.deformed[nearest]!.x,
              y: view.deformed[nearest]!.y,
            });
          }
        }}
        onPointerLeave={() => setProbe(null)}
      >
        {mesh.elements.map((element, index) => {
          const value =
            element.reduce(
              (sum, node) => sum + (view.effective[node] ?? 0),
              0,
            ) / Math.max(1, element.length);
          return (
            <polygon
              key={index}
              points={element
                .map((node) => {
                  const point = view.deformed[node]!;
                  return `${point.x},${point.y}`;
                })
                .join(" ")}
              fill={color(value, view.min, view.max)}
              fillOpacity={0.82}
              stroke="#111827"
              strokeWidth={0.35}
            />
          );
        })}
        {probe && (
          <g data-testid="simulation-probe">
            <circle
              cx={probe.x}
              cy={probe.y}
              r={4}
              fill="#fff"
              stroke="#0f172a"
              strokeWidth={1}
            />
            <rect
              x={Math.min(WIDTH - 175, probe.x + 8)}
              y={Math.max(8, probe.y - 26)}
              width={166}
              height={22}
              rx={3}
              fill="#0f172a"
              fillOpacity={0.92}
            />
            <text
              x={Math.min(WIDTH - 169, probe.x + 14)}
              y={Math.max(23, probe.y - 11)}
              fill="#f8fafc"
              fontSize={10}
            >
              node {probe.node} · {probe.value.toFixed(3)}
            </text>
          </g>
        )}
      </svg>
      {targetView && targetMesh && targetResult && isStaticField(field) && (
        <div className="mt-2 rounded border border-gray-800 bg-gray-950 p-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
            <span className="font-semibold uppercase tracking-wide text-gray-400">
              Target body
            </span>
            <span>{targetResult.bodyName}</span>
            <span>
              {targetView.label} {targetView.min.toFixed(3)} –{" "}
              {targetView.max.toFixed(3)} {targetView.unit}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label="Target body simulation contour"
            data-testid="simulation-target-contour"
            className="w-full rounded border border-gray-800 bg-gray-950"
          >
            {targetMesh.elements.map((element, index) => {
              const value =
                element.reduce(
                  (sum, node) => sum + (targetView.effective[node] ?? 0),
                  0,
                ) / Math.max(1, element.length);
              return (
                <polygon
                  key={index}
                  points={element
                    .map((node) => {
                      const point = targetView.deformed[node]!;
                      return `${point.x},${point.y}`;
                    })
                    .join(" ")}
                  fill={color(value, targetView.min, targetView.max)}
                  fillOpacity={0.82}
                  stroke="#111827"
                  strokeWidth={0.35}
                />
              );
            })}
          </svg>
        </div>
      )}
      <div className="mt-1 text-[10px] text-gray-500">
        Hover the contour to probe a node. Deformation is a display scale, not a
        changed model.
      </div>
    </section>
  );
};
