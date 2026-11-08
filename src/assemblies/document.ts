// The persisted payload of an Assembly tab. Tab.design is a string in the
// document model, so an assembly stores its own small JSON document instead of
// pretending to be a Part Studio design.

import {
  identity,
  type Assembly,
  type AssemblyConnector,
  type AssemblyFeature,
  type AssemblyInstance,
} from "./model";
import {
  parseContextSketches,
  type ContextSketchDocument,
} from "../model/contextSketch";

export interface AssemblyPosition {
  name: string;
  explode: number;
  /** Optional per-instance transform snapshots captured with the position. */
  transforms?: Record<string, number[]>;
  /** Optional visibility snapshot captured with the position. */
  visibility?: Record<string, boolean>;
  /** Display state applied when this position is restored. */
  displayStateId?: string;
}

export interface AssemblySolveSnapshot {
  ok: boolean;
  dof: number;
  residual: number;
  converged: boolean;
  issues: string[];
  mateIds?: string[];
  instanceIds?: string[];
  at: number;
}

export interface AssemblyTabData {
  v: 1;
  kind: "assembly";
  sourceTabId: string;
  assembly: Assembly;
  explode: number;
  positions: AssemblyPosition[];
  /** Persisted BOM presentation setting for this tab. */
  bomMode?: "structured" | "indented" | "flat";
  /** Last solve result survives save/reload. */
  solve?: AssemblySolveSnapshot;
  /** Sketches authored in the assembly context against source geometry. */
  contextSketches?: ContextSketchDocument[];
}

export function emptyAssemblyTab(sourceTabId: string): AssemblyTabData {
  return {
    v: 1,
    kind: "assembly",
    sourceTabId,
    assembly: { id: "assembly", instances: [], mates: [] },
    explode: 0,
    positions: [{ name: "Default", explode: 0 }],
    bomMode: "structured",
  };
}

export function serializeAssemblyTab(data: AssemblyTabData): string {
  return JSON.stringify(data);
}

function parseFeature(raw: unknown): AssemblyFeature | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<AssemblyFeature>;
  if (typeof f.id !== "string" || typeof f.instanceId !== "string") return null;
  if (
    f.kind !== "hole" &&
    f.kind !== "cut" &&
    f.kind !== "boss" &&
    f.kind !== "revolve" &&
    f.kind !== "fillet" &&
    f.kind !== "chamfer"
  )
    return null;
  const axis =
    f.axis === "x" || f.axis === "y" || f.axis === "z" ? f.axis : "z";
  const offset =
    Array.isArray(f.offset) && f.offset.length === 3
      ? (f.offset.map(Number) as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
  return {
    id: f.id,
    kind: f.kind,
    instanceId: f.instanceId,
    axis,
    radius: Number.isFinite(f.radius) ? Math.max(0.01, Number(f.radius)) : 3,
    depth: Number.isFinite(f.depth) ? Math.max(0.01, Number(f.depth)) : 100,
    offset: offset.map((n) => (Number.isFinite(n) ? n : 0)) as [
      number,
      number,
      number,
    ],
    ...(typeof f.historyId === "string" && f.historyId.trim()
      ? { historyId: f.historyId.trim() }
      : {}),
    ...(Array.isArray(f.historyIds)
      ? {
          historyIds: f.historyIds.filter(
            (id): id is string => typeof id === "string",
          ),
        }
      : {}),
    ...(typeof f.label === "string" && f.label.trim()
      ? { label: f.label.trim() }
      : {}),
    ...(typeof f.error === "string" && f.error.trim()
      ? { error: f.error.trim() }
      : {}),
  };
}

function parseAppearance(raw: unknown): { color?: string; opacity?: number } {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as { color?: unknown; opacity?: unknown };
  const out: { color?: string; opacity?: number } = {};
  if (typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color))
    out.color = value.color;
  if (Number.isFinite(value.opacity))
    out.opacity = Math.max(0, Math.min(1, Number(value.opacity)));
  return out;
}

function parseConnectors(raw: unknown): AssemblyInstance["connectors"] {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as {
      id?: unknown;
      name?: unknown;
      base?: unknown;
      offset?: unknown;
      flip?: unknown;
      radius?: unknown;
      normal?: unknown;
      kind?: unknown;
      axis?: unknown;
    };
    if (typeof item.name !== "string" || !item.name.trim()) return [];
    const base =
      typeof item.base === "string" && item.base.trim() ? item.base : "body";
    const offset =
      Array.isArray(item.offset) && item.offset.length === 3
        ? (item.offset.map(Number) as [number, number, number])
        : undefined;
    const kind: AssemblyConnector["kind"] | undefined =
      item.kind === "face" ||
      item.kind === "edge" ||
      item.kind === "axis" ||
      item.kind === "point"
        ? item.kind
        : undefined;
    return [
      {
        id:
          typeof item.id === "string" && item.id
            ? item.id
            : `conn_${item.name}`,
        name: item.name.trim(),
        base,
        ...(offset && offset.every(Number.isFinite) ? { offset } : {}),
        ...(item.flip === true ? { flip: true } : {}),
        ...(Number.isFinite(item.radius)
          ? { radius: Math.max(0, Number(item.radius)) }
          : {}),
        ...(Array.isArray(item.normal) && item.normal.length === 3
          ? {
              normal: item.normal.map(Number) as [number, number, number],
            }
          : {}),
        ...(kind ? { kind } : {}),
        ...(Array.isArray(item.axis) && item.axis.length === 3
          ? { axis: item.axis.map(Number) as [number, number, number] }
          : {}),
      },
    ];
  });
  return out.length ? out : undefined;
}

function parseAssembly(raw: unknown, depth = 0): Assembly | null {
  if (!raw || typeof raw !== "object" || depth > 12) return null;
  const asm = raw as Partial<Assembly>;
  if (!Array.isArray(asm.instances) || !Array.isArray(asm.mates)) return null;
  const instances: AssemblyInstance[] = [];
  for (const item of asm.instances) {
    if (!item || typeof item.id !== "string") continue;
    const inst = item as Partial<AssemblyInstance>;
    const id = item.id;
    const subassembly = parseAssembly(inst.subassembly, depth + 1);
    const connectors = parseConnectors(inst.connectors);
    instances.push({
      id,
      partId: typeof inst.partId === "string" ? inst.partId : id,
      ...(typeof inst.bodyId === "string" ? { bodyId: inst.bodyId } : {}),
      ...(inst.visible === false ? { visible: false } : {}),
      ...(inst.suppressed === true ? { suppressed: true } : {}),
      ...(inst.grounded === true ? { grounded: true } : {}),
      ...(Number.isFinite(inst.explode)
        ? { explode: Math.max(0, Number(inst.explode)) }
        : {}),
      ...(typeof inst.linkedTabId === "string" && inst.linkedTabId
        ? { linkedTabId: inst.linkedTabId }
        : {}),
      ...(inst.appearance && typeof inst.appearance === "object"
        ? { appearance: parseAppearance(inst.appearance) }
        : {}),
      ...(connectors ? { connectors } : {}),
      ...(typeof inst.folder === "string" && inst.folder.trim()
        ? { folder: inst.folder.trim() }
        : {}),
      ...(inst.metadata && typeof inst.metadata === "object"
        ? { metadata: { ...inst.metadata } }
        : {}),
      ...(typeof inst.name === "string" && inst.name.trim()
        ? { name: inst.name }
        : {}),
      ...(subassembly ? { subassembly } : {}),
      transform:
        Array.isArray(inst.transform) && inst.transform.length === 16
          ? inst.transform.map(Number)
          : identity(),
    });
  }
  return {
    id: typeof asm.id === "string" ? asm.id : "assembly",
    ...(typeof asm.name === "string" && asm.name.trim()
      ? { name: asm.name }
      : {}),
    instances,
    mates: asm.mates
      .filter((m) => m && typeof m.id === "string")
      .map((m) => ({
        ...m,
        ...(m.enabled === false ? { enabled: false } : {}),
        ...(m.suppressed === true ? { suppressed: true } : {}),
        ...(Number.isFinite(m.min) ? { min: Number(m.min) } : {}),
        ...(Number.isFinite(m.max) ? { max: Number(m.max) } : {}),
        ...(typeof m.label === "string" && m.label.trim()
          ? { label: m.label.trim() }
          : {}),
      })),
    ...(Array.isArray(asm.folders)
      ? {
          folders: asm.folders.filter(
            (f) => f && typeof f.id === "string" && typeof f.name === "string",
          ),
        }
      : {}),
    ...(Array.isArray(asm.displayStates)
      ? {
          displayStates: asm.displayStates
            .filter(
              (s) =>
                s && typeof s.id === "string" && typeof s.name === "string",
            )
            .map((state) => ({
              ...state,
              ...(state.appearance && typeof state.appearance === "object"
                ? {
                    appearance: Object.fromEntries(
                      Object.entries(state.appearance).map(([id, value]) => [
                        id,
                        parseAppearance(value),
                      ]),
                    ),
                  }
                : {}),
            })),
        }
      : {}),
    ...(asm.bomOverrides && typeof asm.bomOverrides === "object"
      ? { bomOverrides: asm.bomOverrides }
      : {}),
    ...(Array.isArray(asm.bomColumns) ? { bomColumns: asm.bomColumns } : {}),
    ...(asm.bomMode === "indented" ||
    asm.bomMode === "flat" ||
    asm.bomMode === "structured"
      ? { bomMode: asm.bomMode }
      : {}),
    ...(Array.isArray(asm.features)
      ? {
          features: [
            ...new Map(
              asm.features
                .map(parseFeature)
                .filter((f): f is AssemblyFeature => f !== null)
                .map((feature) => [feature.id, feature] as const),
            ).values(),
          ],
        }
      : {}),
  };
}

export function parseAssemblyTab(design: string): AssemblyTabData | null {
  try {
    const raw = JSON.parse(design) as Partial<AssemblyTabData>;
    if (raw?.v !== 1 || raw.kind !== "assembly") return null;
    const assembly = parseAssembly(raw.assembly);
    if (!assembly) return null;
    return {
      v: 1,
      kind: "assembly",
      sourceTabId: typeof raw.sourceTabId === "string" ? raw.sourceTabId : "",
      assembly,
      explode: Number.isFinite(raw.explode) ? Number(raw.explode) : 0,
      ...(raw.bomMode === "indented" ||
      raw.bomMode === "flat" ||
      raw.bomMode === "structured"
        ? { bomMode: raw.bomMode }
        : {}),
      ...(raw.solve && typeof raw.solve === "object"
        ? {
            solve: {
              ok: raw.solve.ok === true,
              dof: Number.isFinite(raw.solve.dof) ? Number(raw.solve.dof) : 0,
              residual: Number.isFinite(raw.solve.residual)
                ? Number(raw.solve.residual)
                : 0,
              converged: raw.solve.converged === true,
              issues: Array.isArray(raw.solve.issues)
                ? raw.solve.issues.filter(
                    (issue): issue is string => typeof issue === "string",
                  )
                : [],
              ...(Array.isArray(raw.solve.mateIds)
                ? {
                    mateIds: raw.solve.mateIds.filter(
                      (id): id is string => typeof id === "string",
                    ),
                  }
                : {}),
              ...(Array.isArray(raw.solve.instanceIds)
                ? {
                    instanceIds: raw.solve.instanceIds.filter(
                      (id): id is string => typeof id === "string",
                    ),
                  }
                : {}),
              at: Number.isFinite(raw.solve.at) ? Number(raw.solve.at) : 0,
            },
          }
        : {}),
      ...(Array.isArray(raw.contextSketches) && raw.contextSketches.length
        ? { contextSketches: parseContextSketches(raw.contextSketches) }
        : {}),
      positions:
        Array.isArray(raw.positions) && raw.positions.length
          ? raw.positions
              .filter(
                (p) =>
                  p && typeof p.name === "string" && Number.isFinite(p.explode),
              )
              .map((p) => ({
                name: p.name,
                explode: Number(p.explode),
                ...(p.transforms && typeof p.transforms === "object"
                  ? { transforms: p.transforms }
                  : {}),
                ...(p.visibility && typeof p.visibility === "object"
                  ? { visibility: p.visibility }
                  : {}),
                ...(typeof p.displayStateId === "string"
                  ? { displayStateId: p.displayStateId }
                  : {}),
              }))
          : [{ name: "Default", explode: 0 }],
    };
  } catch {
    return null;
  }
}
