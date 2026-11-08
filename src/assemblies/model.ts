// Assembly model (Phase 5) — pure, no core deps.

import { mateResidual, solveGeometry, type MateGeom } from "./geometry";
import type { BodyBounds } from "./connectors";

export type MateKind =
  | "fasten"
  | "coincident"
  | "concentric"
  | "distance"
  | "angle"
  | "parallel"
  | "perpendicular"
  | "tangent"
  | "planar"
  | "ball"
  | "pin-slot"
  | "slider"
  | "cylindrical"
  | "revolute"
  | "prismatic"
  | "screw"
  | "width";

export const MATE_KINDS: readonly MateKind[] = [
  "fasten",
  "coincident",
  "concentric",
  "distance",
  "angle",
  "parallel",
  "perpendicular",
  "tangent",
  "planar",
  "ball",
  "pin-slot",
  "slider",
  "cylindrical",
  "revolute",
  "prismatic",
  "screw",
  "width",
];

export const MATE_LABELS: Record<MateKind, string> = {
  fasten: "Fasten",
  coincident: "Coincident",
  concentric: "Concentric",
  distance: "Distance",
  angle: "Angle",
  parallel: "Parallel",
  perpendicular: "Perpendicular",
  tangent: "Tangent",
  planar: "Planar",
  ball: "Ball",
  "pin-slot": "Pin slot",
  slider: "Slider",
  cylindrical: "Cylindrical",
  revolute: "Revolute",
  prismatic: "Prismatic",
  screw: "Screw",
  width: "Width",
};

/** Approximate DOF removed by each mate. The solver reports the remainder. */
export const MATE_DOF: Record<MateKind, number> = {
  fasten: 6,
  coincident: 3,
  concentric: 2,
  distance: 1,
  angle: 1,
  parallel: 1,
  perpendicular: 1,
  tangent: 1,
  planar: 3,
  ball: 3,
  "pin-slot": 2,
  slider: 1,
  cylindrical: 2,
  revolute: 1,
  prismatic: 1,
  screw: 1,
  width: 1,
};

export interface MateRef {
  bodyId: string;
  ref: string; /* named face/edge/axis */
}

export interface Mate {
  id: string;
  kind: MateKind;
  a: MateRef;
  b: MateRef;
  value?: number; // distance/angle
  /** Disabled mates stay in the tree but do not solve. */
  enabled?: boolean;
  /** Suppressed mates stay in the tree as a deliberate, persisted state. */
  suppressed?: boolean;
  /** Optional travel limits for distance/angle/screw/width mates. */
  min?: number;
  max?: number;
  label?: string;
  /** Last solve error, localized to this mate. */
  error?: string;
}

export interface AssemblyInstanceMetadata {
  number?: string;
  description?: string;
  material?: string;
  revision?: string;
  vendor?: string;
}

export interface AssemblyAppearance {
  color?: string;
  opacity?: number;
}

/** A named, instance-local mate connector. Offsets are in metres. */
export interface AssemblyConnector {
  id: string;
  name: string;
  base: string;
  offset?: [number, number, number];
  flip?: boolean;
  /** Radius of a picked circular edge/axis, in metres. */
  radius?: number;
  /** Instance-local face normal for a picked connector orientation. */
  normal?: [number, number, number];
  /** What the user picked; axis/point are first-class connector picks. */
  kind?: "face" | "edge" | "axis" | "point";
  /** Picked axis direction for an edge/axis connector. */
  axis?: [number, number, number];
}

export interface AssemblyInstance {
  id: string;
  partId: string;
  /** Live scene element/body id backing this instance, when known. */
  bodyId?: string;
  /** Hidden instances stay in the assembly and BOM but are not placed. */
  visible?: boolean;
  /** Suppressed instances are omitted from solve, placement, interference and BOM. */
  suppressed?: boolean;
  /** A grounded instance is fixed during solving. */
  grounded?: boolean;
  /** Per-instance explode distance in millimetres. */
  explode?: number;
  /** Tree folder name. */
  folder?: string;
  /** Per-instance BOM/instance metadata overrides. */
  metadata?: AssemblyInstanceMetadata;
  /** Per-instance appearance override (display states and manual edits). */
  appearance?: AssemblyAppearance;
  /** User-authored named connectors in addition to the bounds defaults. */
  connectors?: AssemblyConnector[];
  /** Part Studio tab this instance is a linked reference to. */
  linkedTabId?: string;
  /** Display name for subassembly instances. */
  name?: string;
  /** Nested assembly. Its instances are local to this instance's transform. */
  subassembly?: Assembly;
  transform: number[]; // 4x4 column-major flattened
}

export type AssemblyFeatureKind =
  | "hole"
  | "cut"
  | "boss"
  | "revolve"
  | "fillet"
  | "chamfer";

/** A non-history assembly-context feature. Applied to one leaf instance. */
export interface AssemblyFeature {
  id: string;
  kind: AssemblyFeatureKind;
  instanceId: string;
  axis: "x" | "y" | "z";
  radius: number;
  depth: number;
  /** Local offsets from the body bounds centre. */
  offset: [number, number, number];
  label?: string;
  /** Source-history node created for this feature. */
  historyId?: string;
  /** Every source-history node owned by this feature (body + placement). */
  historyIds?: string[];
  /** Last rebuild error, if any. */
  error?: string;
}

export interface AssemblyFolder {
  id: string;
  name: string;
}

export interface AssemblyDisplayState {
  id: string;
  name: string;
  /** Instance id -> visibility. */
  visibility: Record<string, boolean>;
  /** Optional per-instance transform snapshots. */
  transforms?: Record<string, number[]>;
  /** Optional per-instance appearance overrides. */
  appearance?: Record<string, AssemblyAppearance>;
}

export interface AssemblyBomOverride {
  number?: string;
  description?: string;
  materialId?: string;
  revision?: string;
  vendor?: string;
}

export type BomColumnId =
  | "item"
  | "number"
  | "name"
  | "description"
  | "material"
  | "qty"
  | "revision"
  | "vendor";

export interface AssemblyBomColumn {
  id: BomColumnId;
  label: string;
  visible: boolean;
}

export const DEFAULT_BOM_COLUMNS: readonly AssemblyBomColumn[] = [
  { id: "item", label: "Item", visible: true },
  { id: "number", label: "Part number", visible: true },
  { id: "name", label: "Name", visible: true },
  { id: "description", label: "Description", visible: true },
  { id: "material", label: "Material", visible: true },
  { id: "qty", label: "Qty", visible: true },
  { id: "revision", label: "Revision", visible: false },
  { id: "vendor", label: "Vendor", visible: false },
];

export interface Assembly {
  id: string;
  name?: string;
  instances: AssemblyInstance[];
  mates: Mate[];
  /** Assembly-context cuts/holes. */
  features?: AssemblyFeature[];
  folders?: AssemblyFolder[];
  displayStates?: AssemblyDisplayState[];
  /** BOM overrides keyed by BOM row key (part id or body id). */
  bomOverrides?: Record<string, AssemblyBomOverride>;
  bomColumns?: AssemblyBomColumn[];
  /** Persisted BOM presentation mode for this assembly tab. */
  bomMode?: "structured" | "indented" | "flat";
}

export interface PlacedInstance {
  /** Leaf instance id. */
  instanceId: string;
  /** Nearest subassembly ancestor, if any. */
  parentId: string | null;
  bodyId?: string;
  partId: string;
  transform: number[];
  /** Root-relative instance path, used by the BOM and selection. */
  path: string[];
  depth: number;
  visible: boolean;
  instance: AssemblyInstance;
}

export function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

const g = (a: number[], i: number): number => a[i] ?? 0;

export function matMul(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] = (r[i * 4 + j] ?? 0) + g(a, i * 4 + k) * g(b, k * 4 + j);
  return r;
}

export function transformPoint(
  m: number[],
  p: [number, number, number],
): [number, number, number] {
  return [
    g(m, 0) * p[0] + g(m, 1) * p[1] + g(m, 2) * p[2] + g(m, 3),
    g(m, 4) * p[0] + g(m, 5) * p[1] + g(m, 6) * p[2] + g(m, 7),
    g(m, 8) * p[0] + g(m, 9) * p[1] + g(m, 10) * p[2] + g(m, 11),
  ];
}

export function addInstance(asm: Assembly, inst: AssemblyInstance): Assembly {
  return { ...asm, instances: [...asm.instances, inst] };
}

export function addMate(asm: Assembly, mate: Mate): Assembly {
  return { ...asm, mates: [...asm.mates, mate] };
}

// Naive DOF: each instance 6 DOF, each mate removes 1-3 depending on type.
export function dof(asm: Assembly): number {
  const active = asm.instances.filter(
    (i) => i.visible !== false && i.suppressed !== true,
  );
  const base = active.length * 6;
  const removed = asm.mates.reduce(
    (acc, m) =>
      m.enabled === false || m.suppressed === true
        ? acc
        : acc + (MATE_DOF[m.kind] ?? 0),
    0,
  );
  // An explicitly grounded instance is fixed; otherwise the first active
  // instance is the implicit ground, preserving the old assembly behavior.
  const ground = active.some((i) => i.grounded)
    ? active.filter((i) => i.grounded).length
    : active.length
      ? 1
      : 0;
  return Math.max(0, base - removed - ground * 6);
}

// Unconstrained DOF (before grounding) — used for over-constraint detection.
export function rawDof(asm: Assembly): number {
  const base = asm.instances.filter((i) => i.visible !== false).length * 6;
  const removed = asm.mates.reduce(
    (acc, m) => (m.suppressed === true ? acc : acc + (MATE_DOF[m.kind] ?? 0)),
    0,
  );
  return base - removed;
}

function duplicateMateIssues(asm: Assembly): string[] {
  const ids = new Set<string>();
  const constraints = new Set<string>();
  const msgs: string[] = [];
  for (const m of asm.mates) {
    if (m.enabled === false || m.suppressed === true) continue;
    if (ids.has(m.id)) msgs.push(`duplicate mate ${m.id}`);
    ids.add(m.id);
    const key = [
      m.kind,
      m.a.bodyId,
      m.a.ref,
      m.b.bodyId,
      m.b.ref,
      m.value ?? "",
    ].join("|");
    if (constraints.has(key)) msgs.push(`duplicate ${m.kind} constraint`);
    constraints.add(key);
  }
  return msgs;
}

function unknownInstanceIssues(asm: Assembly): string[] {
  const ids = new Set(asm.instances.map((i) => i.id));
  const msgs: string[] = [];
  for (const m of asm.mates) {
    if (m.enabled === false || m.suppressed === true) continue;
    if (!ids.has(m.a.bodyId)) msgs.push(`unknown instance ${m.a.bodyId}`);
    if (!ids.has(m.b.bodyId)) msgs.push(`unknown instance ${m.b.bodyId}`);
  }
  return msgs;
}

// ---- Ref frames (local named face/edge/axis reference per instance) ----

export interface RefSpec {
  transform: number[];
  /** Bounds-derived radius for tangent/axis mates; absent means a plane. */
  radius?: number;
} // 4x4 column-major, instance-local
export type RefMap = Record<string, Record<string, RefSpec>>; // instanceId -> refName -> local frame

// identity ref frame (instance at origin)
export function identityRef(): RefSpec {
  return { transform: identity() };
}

// build an identity ref map for every instance (usable default when ref geometry is unknown)
export function defaultRefs(asm: Assembly): RefMap {
  const out: RefMap = {};
  for (const inst of asm.instances) out[inst.id] = { body: identityRef() };
  return out;
}

// set a single ref frame (returns a new map)
export function setRef(
  asm: Assembly,
  instId: string,
  refName: string,
  frame: RefSpec,
): RefMap {
  const map = defaultRefs(asm);
  (map[instId] ??= {})[refName] = frame;
  return map;
}

export interface SolveResult {
  ok: boolean;
  dof: number;
  issues: string[];
  residual: number;
  assembly?: Assembly;
  iters?: number;
  converged?: boolean;
  /** Mate ids implicated by validation or a failed residual. */
  mateIds?: string[];
  /** Instance ids implicated by validation or a failed residual. */
  instanceIds?: string[];
}

// Solve and place: drives instance transforms to zero residual using ref frames.
// Falls back to the naive transform solver when no ref frame is supplied.
export function solve(asm: Assembly, refs?: RefMap): SolveResult {
  const activeMates = asm.mates.filter(
    (m) => m.enabled !== false && m.suppressed !== true,
  );
  const active: Assembly = { ...asm, mates: activeMates };
  const validation = validateMates(active);
  const issues = [
    ...duplicateMateIssues(active),
    ...unknownInstanceIssues(active),
    ...overConstrained(active),
    ...validation.map((v) => `${v.mateId}: ${v.message}`),
  ];
  const refMap: RefMap = refs ?? defaultRefs(active);
  const g = solveGeometry(active, refMap);
  const solved = g.assembly
    ? localizeMateErrors({ ...g.assembly, mates: asm.mates }, refMap)
    : undefined;
  const mateIds = [
    ...new Set([
      ...validation.map((v) => v.mateId),
      ...activeMates
        .filter(
          (mate) => solved?.mates.find((m) => m.id === mate.id)?.error ?? "",
        )
        .map((mate) => mate.id),
    ]),
  ];
  const instanceIds = [
    ...new Set(
      activeMates
        .filter((mate) => mateIds.includes(mate.id))
        .flatMap((mate) => [mate.a.bodyId, mate.b.bodyId]),
    ),
  ];
  return {
    ok: issues.length === 0 && g.converged,
    dof: dofAnalysis(active, refMap).assemblyDof,
    issues,
    residual: g.residual,
    ...(solved ? { assembly: solved } : {}),
    iters: g.iters,
    converged: g.converged,
    ...(mateIds.length ? { mateIds } : {}),
    ...(instanceIds.length ? { instanceIds } : {}),
  };
}

/** Per-mate limit/unit validation, shared by solve and the mate panel. */
export function validateMates(
  asm: Assembly,
): { mateId: string; message: string }[] {
  const instanceIds = new Set(asm.instances.map((inst) => inst.id));
  const out: { mateId: string; message: string }[] = [];
  const needsValue = new Set<MateKind>(["distance", "angle", "screw", "width"]);
  for (const mate of asm.mates) {
    if (mate.enabled === false || mate.suppressed === true) continue;
    if (!instanceIds.has(mate.a.bodyId))
      out.push({
        mateId: mate.id,
        message: `missing instance ${mate.a.bodyId}`,
      });
    if (!instanceIds.has(mate.b.bodyId))
      out.push({
        mateId: mate.id,
        message: `missing instance ${mate.b.bodyId}`,
      });
    if (needsValue.has(mate.kind)) {
      if (!Number.isFinite(mate.value))
        out.push({
          mateId: mate.id,
          message: `${mate.kind} needs a finite value`,
        });
      else if (mate.kind === "angle" && (mate.value! < 0 || mate.value! > 360))
        out.push({
          mateId: mate.id,
          message: "angle must be between 0 and 360 degrees",
        });
    }
    if (mate.min !== undefined && mate.max !== undefined && mate.min > mate.max)
      out.push({ mateId: mate.id, message: "minimum exceeds maximum" });
    if (
      mate.value !== undefined &&
      Number.isFinite(mate.value) &&
      ((mate.min !== undefined && mate.value < mate.min) ||
        (mate.max !== undefined && mate.value > mate.max))
    )
      out.push({ mateId: mate.id, message: "value is outside mate limits" });
  }
  return out;
}

/** Attach the residual of each mate to the mate row for tree error state. */
export function localizeMateErrors(asm: Assembly, refs?: RefMap): Assembly {
  const active = asm.mates.filter(
    (mate) => mate.enabled !== false && mate.suppressed !== true,
  );
  if (!active.length) return asm;
  const refMap = refs ?? defaultRefs(asm);
  const world = worldRefMap(asm, refMap);
  const validation = new Map(
    validateMates(asm).map((issue) => [issue.mateId, issue.message]),
  );
  const tol = 1e-4;
  return {
    ...asm,
    mates: asm.mates.map((mate) => {
      if (mate.enabled === false || mate.suppressed === true) return mate;
      const next = { ...mate };
      const geom: MateGeom = {
        id: mate.id,
        kind: mate.kind,
        aInst: mate.a.bodyId,
        aRef: mate.a.ref,
        bInst: mate.b.bodyId,
        bRef: mate.b.ref,
        ...(mate.value !== undefined ? { value: mate.value } : {}),
      };
      const residual = mateResidual(geom, world);
      const message =
        validation.get(mate.id) ??
        (residual > tol ? `residual ${residual.toFixed(5)}` : undefined);
      if (message) next.error = message;
      else delete next.error;
      return next;
    }),
  };
}

/** Compose local connector refs into world frames at the current transforms. */
export function worldRefMap(asm: Assembly, refs: RefMap): RefMap {
  const out: RefMap = {};
  for (const inst of asm.instances) {
    const local = refs[inst.id];
    if (!local) continue;
    const bucket: Record<string, RefSpec> = {};
    for (const [name, spec] of Object.entries(local))
      bucket[name] = {
        transform: matMul(inst.transform, spec.transform),
        ...(spec.radius !== undefined ? { radius: spec.radius } : {}),
      };
    out[inst.id] = bucket;
  }
  return out;
}

// ---- Real DOF: rank of the mate Jacobian, per instance and per assembly ----

export interface DofAnalysis {
  assemblyDof: number;
  rank: number;
  instanceDof: Record<string, number>;
  grounded: string[];
  constraints: number;
}

function rotateVector(
  v: [number, number, number],
  axis: 0 | 1 | 2,
  angle: number,
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (axis === 0) return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  if (axis === 1) return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function perturbInstanceRefs(
  refs: RefMap,
  instId: string,
  column: number,
  amount: number,
): RefMap {
  const bucket = refs[instId];
  if (!bucket) return refs;
  const next: Record<string, RefSpec> = {};
  for (const [name, spec] of Object.entries(bucket)) {
    const transform = [...spec.transform];
    if (column < 3) {
      const slot = 3 + column * 4;
      transform[slot] = (transform[slot] ?? 0) + amount;
    } else {
      const axis = (column - 3) as 0 | 1 | 2;
      const origin: [number, number, number] = [
        transform[3] ?? 0,
        transform[7] ?? 0,
        transform[11] ?? 0,
      ];
      for (let basis = 0; basis < 3; basis++) {
        const vector: [number, number, number] = [
          transform[basis * 4] ?? 0,
          transform[basis * 4 + 1] ?? 0,
          transform[basis * 4 + 2] ?? 0,
        ];
        const rotated = rotateVector(vector, axis, amount);
        transform[basis * 4] = rotated[0];
        transform[basis * 4 + 1] = rotated[1];
        transform[basis * 4 + 2] = rotated[2];
      }
      transform[3] = origin[0];
      transform[7] = origin[1];
      transform[11] = origin[2];
    }
    next[name] = { ...spec, transform };
  }
  return { ...refs, [instId]: next };
}

function matrixRank(columns: number[][]): number {
  if (!columns.length) return 0;
  const rows = columns[0]!.length;
  if (!rows) return 0;
  const matrix: number[][] = [];
  for (let row = 0; row < rows; row++)
    matrix.push(columns.map((column) => column[row] ?? 0));
  let rank = 0;
  let scale = 0;
  for (const row of matrix)
    for (const value of row) scale = Math.max(scale, Math.abs(value));
  const tolerance = Math.max(1e-10, scale * 1e-8);
  for (let column = 0; column < columns.length && rank < rows; column++) {
    let pivot = rank;
    for (let row = rank + 1; row < rows; row++)
      if (
        Math.abs(matrix[row]![column] ?? 0) >
        Math.abs(matrix[pivot]![column] ?? 0)
      )
        pivot = row;
    if (Math.abs(matrix[pivot]![column] ?? 0) <= tolerance) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot]!, matrix[rank]!];
    const divisor = matrix[rank]![column] ?? 1;
    for (let col = column; col < columns.length; col++)
      matrix[rank]![col] = (matrix[rank]![col] ?? 0) / divisor;
    for (let row = 0; row < rows; row++) {
      if (row === rank) continue;
      const factor = matrix[row]![column] ?? 0;
      if (Math.abs(factor) <= tolerance) continue;
      for (let col = column; col < columns.length; col++)
        matrix[row]![col] =
          (matrix[row]![col] ?? 0) - factor * (matrix[rank]![col] ?? 0);
    }
    rank++;
  }
  return rank;
}

export function dofAnalysis(asm: Assembly, refs?: RefMap): DofAnalysis {
  const active = asm.instances.filter(
    (inst) => inst.visible !== false && inst.suppressed !== true,
  );
  const activeIds = new Set(active.map((inst) => inst.id));
  const mates = asm.mates.filter(
    (mate) =>
      mate.enabled !== false &&
      mate.suppressed !== true &&
      activeIds.has(mate.a.bodyId) &&
      activeIds.has(mate.b.bodyId),
  );
  const local = refs ?? defaultRefs({ ...asm, instances: active });
  const world = worldRefMap({ ...asm, instances: active }, local);
  const geoms: MateGeom[] = mates.map((mate) => ({
    id: mate.id,
    kind: mate.kind,
    aInst: mate.a.bodyId,
    aRef: mate.a.ref,
    bInst: mate.b.bodyId,
    bRef: mate.b.ref,
    ...(mate.value !== undefined ? { value: mate.value } : {}),
  }));
  const base = geoms.map((geom) => mateResidual(geom, world));
  const step = 1e-4;
  const columns: number[][] = [];
  const owners: string[] = [];
  for (const inst of active) {
    for (let column = 0; column < 6; column++) {
      const perturbed = perturbInstanceRefs(world, inst.id, column, step);
      columns.push(
        geoms.map(
          (geom, index) =>
            (mateResidual(geom, perturbed) - (base[index] ?? 0)) / step,
        ),
      );
      owners.push(inst.id);
    }
  }
  const rank = matrixRank(columns);
  const grounded = active
    .filter((inst) => inst.grounded)
    .map((inst) => inst.id);
  const fixed = grounded.length
    ? grounded
    : active.length
      ? [active[0]!.id]
      : [];
  const instanceDof: Record<string, number> = {};
  for (const inst of active) {
    if (fixed.includes(inst.id)) {
      instanceDof[inst.id] = 0;
      continue;
    }
    const own = owners
      .map((owner, index) => (owner === inst.id ? index : -1))
      .filter((index) => index >= 0)
      .map((index) => columns[index]!);
    instanceDof[inst.id] = Math.max(0, 6 - matrixRank(own));
  }
  return {
    assemblyDof: Math.max(0, active.length * 6 - rank - fixed.length * 6),
    rank,
    instanceDof,
    grounded: fixed,
    constraints: mates.length,
  };
}

/** Identify constraints whose removal makes an otherwise failing solve pass. */
export function diagnoseConflicts(
  asm: Assembly,
  refs?: RefMap,
): { mateIds: string[]; issues: string[] } {
  const first = solve(asm, refs);
  if (first.ok) return { mateIds: [], issues: [] };
  const active = asm.mates.filter(
    (m) => m.enabled !== false && m.suppressed !== true,
  );
  const mateIds: string[] = [];
  for (const mate of active) {
    const without = { ...asm, mates: active.filter((m) => m.id !== mate.id) };
    if (solve(without, refs).ok) mateIds.push(mate.id);
  }
  return {
    mateIds: [...new Set(mateIds)],
    issues: first.issues.length
      ? first.issues
      : [
          `residual ${first.residual.toFixed(5)} after ${first.iters ?? 0} iterations`,
        ],
  };
}

// ---- Transform solving (naive, ref-geometry ignored) ----

function getInst(asm: Assembly, id: string): AssemblyInstance | undefined {
  return asm.instances.find((i) => i.id === id);
}

export function solveTransforms(asm: Assembly): {
  assembly: Assembly;
  residual: number;
} {
  const instances = asm.instances.map((i) => ({
    ...i,
    transform: [...i.transform],
  }));
  const working: Assembly = { ...asm, instances };
  let residual = 0;
  // iterate a few passes for stability
  for (let pass = 0; pass < 3; pass++) {
    residual = 0;
    for (const m of asm.mates) {
      if (m.enabled === false || m.suppressed === true) continue;
      const a = getInst(working, m.a.bodyId);
      const b = getInst(working, m.b.bodyId);
      if (!a || !b) {
        residual += 1;
        continue;
      }
      // coincident: align b origin to a origin
      if (m.kind === "coincident" || m.kind === "distance") {
        const t = [...b.transform];
        const ax = g(a.transform, 3),
          ay = g(a.transform, 7),
          az = g(a.transform, 11);
        const offset = m.kind === "distance" ? (m.value ?? 0) : 0;
        t[3] = ax + offset;
        t[7] = ay;
        t[11] = az;
        b.transform = t;
        residual += 0;
      } else if (
        m.kind === "concentric" ||
        m.kind === "parallel" ||
        m.kind === "angle"
      ) {
        // align rotation block (upper-left 3x3) of b to a
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++)
            b.transform[i * 4 + j] = g(a.transform, i * 4 + j);
        residual += 0;
      }
    }
  }
  // ground first instance
  if (instances.length > 0) {
    instances[0]!.transform = identity();
  }
  return { assembly: working, residual };
}

// ---- Nested placement -----------------------------------------------------

/**
 * Expand subassemblies into leaf instances with world transforms. A parent
 * instance transform is composed with each child transform. Leaf ids remain
 * stable so scene element lookup and mates keep working.
 */
export function flattenAssembly(
  asm: Assembly,
  parentTransform: number[] = identity(),
  depth = 0,
  path: string[] = [],
  parentId: string | null = null,
  parentVisible = true,
): PlacedInstance[] {
  const out: PlacedInstance[] = [];
  for (const inst of asm.instances) {
    const world = matMul(parentTransform, inst.transform);
    const nextPath = [...path, inst.id];
    const visible =
      parentVisible && inst.visible !== false && inst.suppressed !== true;
    if (inst.subassembly) {
      out.push(
        ...flattenAssembly(
          inst.subassembly,
          world,
          depth + 1,
          nextPath,
          inst.id,
          visible,
        ),
      );
    } else {
      out.push({
        instanceId: inst.id,
        parentId,
        ...(inst.bodyId ? { bodyId: inst.bodyId } : {}),
        partId: inst.partId,
        transform: world,
        path: nextPath,
        depth,
        visible,
        instance: inst,
      });
    }
  }
  return out;
}

function cloneInstance(inst: AssemblyInstance): AssemblyInstance {
  return {
    ...inst,
    transform: [...inst.transform],
    ...(inst.subassembly
      ? { subassembly: cloneAssembly(inst.subassembly) }
      : {}),
  };
}

function cloneAssembly(asm: Assembly): Assembly {
  return {
    ...asm,
    instances: asm.instances.map(cloneInstance),
    mates: asm.mates.map((m) => ({
      ...m,
      a: { ...m.a },
      b: { ...m.b },
    })),
    ...(asm.features ? { features: asm.features.map((f) => ({ ...f })) } : {}),
  };
}

function uniqueFeatures(
  features: readonly AssemblyFeature[],
): AssemblyFeature[] {
  const byId = new Map<string, AssemblyFeature>();
  for (const feature of features) byId.set(feature.id, { ...feature });
  return [...byId.values()];
}

function nextInstanceId(asm: Assembly, prefix: string): string {
  const used = new Set(asm.instances.map((i) => i.id));
  let id = prefix;
  let n = 2;
  while (used.has(id)) id = `${prefix}_${n++}`;
  return id;
}

/**
 * Group existing instances into a nested subassembly. Internal mates and
 * features move into the child. Cross-boundary mates cannot be represented by
 * a flat MateRef, so they are removed rather than silently rewired.
 */
export function groupSubassembly(
  asm: Assembly,
  instanceIds: readonly string[],
  name?: string,
): Assembly {
  const selected = new Set(instanceIds);
  const children = asm.instances.filter((i) => selected.has(i.id));
  if (!children.length) return asm;
  const remaining = asm.instances.filter((i) => !selected.has(i.id));
  const childMates = asm.mates.filter(
    (m) => selected.has(m.a.bodyId) && selected.has(m.b.bodyId),
  );
  const keptMates = asm.mates.filter(
    (m) => !selected.has(m.a.bodyId) && !selected.has(m.b.bodyId),
  );
  const childFeatures = uniqueFeatures(
    (asm.features ?? []).filter((f) => selected.has(f.instanceId)),
  );
  const keptFeatures = uniqueFeatures(
    (asm.features ?? []).filter((f) => !selected.has(f.instanceId)),
  );
  const subassembly: Assembly = {
    id: `${asm.id}_sub_${children.map((c) => c.id).join("_")}`,
    ...(name ? { name } : {}),
    instances: children.map(cloneInstance),
    mates: childMates,
    ...(childFeatures.length ? { features: childFeatures } : {}),
  };
  const parent: AssemblyInstance = {
    id: nextInstanceId(asm, `sub_${children[0]!.id}`),
    partId: subassembly.id,
    ...(name ? { name } : {}),
    transform: identity(),
    subassembly,
  };
  return {
    ...asm,
    instances: [...remaining, parent],
    mates: keptMates,
    ...(keptFeatures.length ? { features: keptFeatures } : {}),
  };
}

/** Dissolve one subassembly back into its parent (inverse of grouping). */
export function ungroupSubassembly(
  asm: Assembly,
  instanceId: string,
): Assembly {
  const target = asm.instances.find((i) => i.id === instanceId);
  if (!target?.subassembly) return asm;
  const children = target.subassembly.instances.map((inst) => ({
    ...cloneInstance(inst),
    transform: matMul(target.transform, inst.transform),
  }));
  const features = uniqueFeatures([
    ...(asm.features ?? []),
    ...(target.subassembly.features ?? []),
  ]);
  return {
    ...asm,
    instances: [
      ...asm.instances.filter((i) => i.id !== instanceId),
      ...children,
    ],
    mates: [...asm.mates, ...target.subassembly.mates],
    ...(features.length ? { features } : {}),
  };
}

export function findPlacedInstance(
  asm: Assembly,
  instanceId: string,
): PlacedInstance | null {
  return flattenAssembly(asm).find((i) => i.instanceId === instanceId) ?? null;
}

// ---- Assembly tree ----

export interface AssemblyNode {
  instanceId: string;
  children: AssemblyNode[];
}

export function buildTree(asm: Assembly): AssemblyNode | null {
  if (asm.instances.length === 0) return null;
  const root: AssemblyNode = { instanceId: asm.instances[0]!.id, children: [] };
  const byParent = new Map<string, string[]>();
  for (const m of asm.mates) {
    if (!byParent.has(m.a.bodyId)) byParent.set(m.a.bodyId, []);
    byParent.get(m.a.bodyId)!.push(m.b.bodyId);
  }
  function expand(node: AssemblyNode, seen: Set<string>) {
    const kids = byParent.get(node.instanceId) || [];
    for (const k of kids) {
      if (seen.has(k)) continue;
      seen.add(k);
      const child: AssemblyNode = { instanceId: k, children: [] };
      node.children.push(child);
      expand(child, seen);
    }
  }
  expand(root, new Set([root.instanceId]));
  return root;
}

export function countInstances(node: AssemblyNode | null): number {
  if (!node) return 0;
  return 1 + node.children.reduce((a, c) => a + countInstances(c), 0);
}

// ---- Placement helpers ----

export function moveInstance(
  asm: Assembly,
  id: string,
  transform: number[],
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id ? { ...i, transform: [...transform] } : i,
    ),
  };
}

export function setInstanceVisible(
  asm: Assembly,
  id: string,
  visible: boolean,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) => (i.id === id ? { ...i, visible } : i)),
  };
}

export function setInstanceSuppressed(
  asm: Assembly,
  id: string,
  suppressed: boolean,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id ? { ...i, suppressed } : i,
    ),
  };
}

export function setInstanceGrounded(
  asm: Assembly,
  id: string,
  grounded: boolean,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) => (i.id === id ? { ...i, grounded } : i)),
  };
}

export function setInstanceFolder(
  asm: Assembly,
  id: string,
  folder: string | null,
): Assembly {
  const name = folder?.trim() || null;
  const folders = [...(asm.folders ?? [])];
  if (name && !folders.some((f) => f.name === name))
    folders.push({ id: `folder_${Date.now().toString(36)}`, name });
  return {
    ...asm,
    instances: asm.instances.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i };
      if (name) next.folder = name;
      else delete next.folder;
      return next;
    }),
    ...(folders.length ? { folders } : {}),
  };
}

export function renameInstance(
  asm: Assembly,
  id: string,
  name: string,
): Assembly {
  const trimmed = name.trim();
  if (!trimmed) return asm;
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id ? { ...i, name: trimmed } : i,
    ),
  };
}

export function updateInstanceMetadata(
  asm: Assembly,
  id: string,
  patch: Partial<AssemblyInstanceMetadata>,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id ? { ...i, metadata: { ...(i.metadata ?? {}), ...patch } } : i,
    ),
  };
}

export function duplicateInstance(
  asm: Assembly,
  id: string,
  offset: [number, number, number] = [0, 0, 0],
): Assembly {
  const source = asm.instances.find((i) => i.id === id);
  if (!source) return asm;
  const nextId = nextInstanceId(asm, `${id}_copy`);
  const transform = [...source.transform];
  transform[3] = (transform[3] ?? 0) + offset[0];
  transform[7] = (transform[7] ?? 0) + offset[1];
  transform[11] = (transform[11] ?? 0) + offset[2];
  return {
    ...asm,
    instances: [
      ...asm.instances,
      {
        ...cloneInstance(source),
        id: nextId,
        transform,
        ...(source.name ? { name: `${source.name} copy` } : {}),
      },
    ],
  };
}

export function replaceInstance(
  asm: Assembly,
  id: string,
  replacement: { bodyId?: string; partId: string; name?: string },
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id
        ? {
            ...i,
            partId: replacement.partId,
            ...(replacement.bodyId ? { bodyId: replacement.bodyId } : {}),
            ...(replacement.name ? { name: replacement.name } : {}),
          }
        : i,
    ),
  };
}

export function setMateEnabled(
  asm: Assembly,
  id: string,
  enabled: boolean,
): Assembly {
  return {
    ...asm,
    mates: asm.mates.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, enabled };
      if (enabled) delete next.error;
      return next;
    }),
  };
}

export function setMateSuppressed(
  asm: Assembly,
  id: string,
  suppressed: boolean,
): Assembly {
  return {
    ...asm,
    mates: asm.mates.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, suppressed };
      if (suppressed) delete next.error;
      return next;
    }),
  };
}

/** Edit a mate in place, including its kind and both connector references. */
export function updateMate(
  asm: Assembly,
  id: string,
  patch: Partial<Omit<Mate, "id">>,
): Assembly {
  return {
    ...asm,
    mates: asm.mates.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      // A changed kind or connector invalidates the previous localized error.
      if (
        patch.kind !== undefined ||
        patch.a !== undefined ||
        patch.b !== undefined
      )
        delete next.error;
      return next;
    }),
  };
}

/** Translate an instance at any nesting depth, keeping the rest of the tree. */
export function dragInstance(
  asm: Assembly,
  id: string,
  delta: [number, number, number],
): Assembly {
  let found = false;
  const walk = (assembly: Assembly): Assembly => ({
    ...assembly,
    instances: assembly.instances.map((instance) => {
      if (instance.id === id) {
        found = true;
        const transform = [...instance.transform];
        transform[3] = (transform[3] ?? 0) + delta[0];
        transform[7] = (transform[7] ?? 0) + delta[1];
        transform[11] = (transform[11] ?? 0) + delta[2];
        return { ...instance, transform };
      }
      if (!instance.subassembly) return instance;
      const subassembly = walk(instance.subassembly);
      return subassembly === instance.subassembly
        ? instance
        : { ...instance, subassembly };
    }),
  });
  const next = walk(asm);
  return found ? next : asm;
}

export function saveDisplayState(asm: Assembly, name: string): Assembly {
  const trimmed = name.trim();
  if (!trimmed) return asm;
  const visibility: Record<string, boolean> = {};
  const transforms: Record<string, number[]> = {};
  for (const i of asm.instances) {
    visibility[i.id] = i.visible !== false && i.suppressed !== true;
    transforms[i.id] = [...i.transform];
  }
  const state: AssemblyDisplayState = {
    id: `state_${Date.now().toString(36)}`,
    name: trimmed,
    visibility,
    transforms,
  };
  return {
    ...asm,
    displayStates: [
      ...(asm.displayStates ?? []).filter((s) => s.name !== trimmed),
      state,
    ],
  };
}

export function applyDisplayState(asm: Assembly, id: string): Assembly {
  const state = (asm.displayStates ?? []).find((s) => s.id === id);
  if (!state) return asm;
  return {
    ...asm,
    instances: asm.instances.map((i) => ({
      ...i,
      ...(state.visibility[i.id] !== undefined
        ? { visible: state.visibility[i.id] }
        : {}),
      ...(state.transforms?.[i.id]
        ? { transform: [...state.transforms[i.id]!] }
        : {}),
    })),
  };
}

export function removeDisplayState(asm: Assembly, id: string): Assembly {
  return {
    ...asm,
    displayStates: (asm.displayStates ?? []).filter((s) => s.id !== id),
  };
}

export function setInstanceExplode(
  asm: Assembly,
  id: string,
  explode: number,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((i) =>
      i.id === id ? { ...i, explode: Math.max(0, explode) } : i,
    ),
  };
}

/** Auto-explode every top-level instance in list order. */
export function autoExplode(asm: Assembly, step = 10): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((inst, index) => ({
      ...inst,
      explode: index * Math.max(0, step),
    })),
  };
}

export function applyAssemblyPosition(
  asm: Assembly,
  position: {
    transforms?: Record<string, number[]>;
    visibility?: Record<string, boolean>;
  },
): Assembly {
  if (!position.transforms && !position.visibility) return asm;
  return {
    ...asm,
    instances: asm.instances.map((inst) => ({
      ...inst,
      ...(position.transforms?.[inst.id]
        ? { transform: [...position.transforms[inst.id]!] }
        : {}),
      ...(position.visibility?.[inst.id] !== undefined
        ? { visible: position.visibility[inst.id] }
        : {}),
    })),
  };
}

export function updateBomOverride(
  asm: Assembly,
  key: string,
  patch: Partial<AssemblyBomOverride>,
): Assembly {
  return {
    ...asm,
    bomOverrides: {
      ...(asm.bomOverrides ?? {}),
      [key]: { ...(asm.bomOverrides?.[key] ?? {}), ...patch },
    },
  };
}

export function setInstanceAppearance(
  asm: Assembly,
  id: string,
  appearance: AssemblyAppearance,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((inst) =>
      inst.id === id
        ? { ...inst, appearance: { ...(inst.appearance ?? {}), ...appearance } }
        : inst,
    ),
  };
}

export function clearInstanceAppearance(asm: Assembly, id: string): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((inst) => {
      if (inst.id !== id) return inst;
      const next = { ...inst };
      delete next.appearance;
      return next;
    }),
  };
}

export function addConnector(
  asm: Assembly,
  instanceId: string,
  connector: Omit<AssemblyConnector, "id"> & { id?: string },
): Assembly {
  const name = connector.name.trim();
  if (!name) return asm;
  return {
    ...asm,
    instances: asm.instances.map((inst) => {
      if (inst.id !== instanceId) return inst;
      const connectors = [...(inst.connectors ?? [])].filter(
        (item) => item.name !== name,
      );
      connectors.push({
        ...connector,
        id: connector.id ?? `conn_${Date.now().toString(36)}`,
        name,
      });
      return { ...inst, connectors };
    }),
  };
}

export function removeConnector(
  asm: Assembly,
  instanceId: string,
  connectorId: string,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((inst) =>
      inst.id === instanceId
        ? {
            ...inst,
            connectors: (inst.connectors ?? []).filter(
              (connector) => connector.id !== connectorId,
            ),
          }
        : inst,
    ),
  };
}

/** Insert a catalog part as a real instance backed by source geometry. */
export function insertCatalogInstance(
  asm: Assembly,
  input: {
    partId: string;
    bodyId?: string;
    name: string;
    metadata?: AssemblyInstanceMetadata;
    material?: string;
    transform?: number[];
  },
): Assembly {
  const id = nextInstanceId(
    asm,
    `inst_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  );
  return {
    ...asm,
    instances: [
      ...asm.instances,
      {
        id,
        partId: input.partId,
        ...(input.bodyId ? { bodyId: input.bodyId } : {}),
        name: input.name,
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        transform: input.transform ?? identity(),
      },
    ],
  };
}

/** Link a Part Studio tab by reference, one instance per persisted body. */
export function linkPartStudioBodies(
  asm: Assembly,
  tabId: string,
  tabName: string,
  bodies: readonly {
    bodyId: string;
    partId?: string;
    name?: string;
    metadata?: AssemblyInstanceMetadata;
  }[],
  offsetStep = 0.04,
): Assembly {
  if (!bodies.length) return asm;
  const base = asm.instances.length;
  const added: AssemblyInstance[] = bodies.map((body, index) => ({
    id: nextInstanceId(
      asm,
      `link_${body.bodyId.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    ),
    partId: body.partId ?? tabId,
    bodyId: body.bodyId,
    name: `${body.name ?? tabName} · ${tabName}`,
    linkedTabId: tabId,
    metadata: {
      ...(body.metadata ?? {}),
      description: body.metadata?.description ?? `Linked from ${tabName}`,
    },
    transform: [
      1,
      0,
      0,
      base * offsetStep + index * offsetStep,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ],
  }));
  return { ...asm, instances: [...asm.instances, ...added] };
}

/** Insert another assembly as a linked, nested reference. */
export function insertSubassemblyReference(
  asm: Assembly,
  source: Assembly,
  name: string,
  transform: number[] = identity(),
): Assembly {
  const id = nextInstanceId(asm, `ref_${source.id}`);
  return {
    ...asm,
    instances: [
      ...asm.instances,
      {
        id,
        partId: source.id,
        name: name.trim() || source.name || "Linked assembly",
        transform,
        subassembly: cloneAssembly(source),
      },
    ],
  };
}

/** Capture the current transforms, visibility and appearance by name. */
export function saveDisplayStateWithAppearance(
  asm: Assembly,
  name: string,
): Assembly {
  const trimmed = name.trim();
  if (!trimmed) return asm;
  const withState = saveDisplayState(asm, trimmed);
  const state = withState.displayStates?.find((item) => item.name === trimmed);
  if (!state) return withState;
  const appearance: Record<string, AssemblyAppearance> = {};
  for (const inst of asm.instances) {
    if (inst.appearance) appearance[inst.id] = { ...inst.appearance };
  }
  return {
    ...withState,
    displayStates: (withState.displayStates ?? []).map((item) =>
      item.id === state.id
        ? Object.keys(appearance).length
          ? { ...item, appearance }
          : item
        : item,
    ),
  };
}

/** Restore a display state including its appearance overrides. */
export function applyDisplayStateWithAppearance(
  asm: Assembly,
  id: string,
): Assembly {
  const state = (asm.displayStates ?? []).find((item) => item.id === id);
  const next = applyDisplayState(asm, id);
  if (!state?.appearance) return next;
  return {
    ...next,
    instances: next.instances.map((inst) => {
      const appearance = state.appearance?.[inst.id];
      if (!appearance) return inst;
      return {
        ...inst,
        appearance: { ...(inst.appearance ?? {}), ...appearance },
      };
    }),
  };
}

/** Instance metadata for a BOM row key, resolved across nested instances. */
export function inferBoundsFromInstances(
  asm: Assembly,
): Record<string, BodyBounds> {
  const out: Record<string, BodyBounds> = {};
  for (const leaf of flattenAssembly(asm)) {
    const key = leaf.bodyId ?? leaf.instanceId;
    out[key] = {
      min: { x: -0.01, y: -0.01, z: -0.01 },
      max: { x: 0.01, y: 0.01, z: 0.01 },
    };
  }
  return out;
}

export function setBomColumnVisible(
  asm: Assembly,
  id: BomColumnId,
  visible: boolean,
): Assembly {
  const columns = asm.bomColumns?.length
    ? [...asm.bomColumns]
    : DEFAULT_BOM_COLUMNS.map((c) => ({ ...c }));
  return {
    ...asm,
    bomColumns: columns.map((c) => (c.id === id ? { ...c, visible } : c)),
  };
}

/** Duplicate an instance along a world axis. The source instance is kept. */
export function patternLinear(
  asm: Assembly,
  id: string,
  axis: "x" | "y" | "z",
  count: number,
  spacing: number,
): Assembly {
  const source = asm.instances.find((i) => i.id === id);
  const n = Math.max(1, Math.min(64, Math.floor(count)));
  if (!source || n <= 1) return asm;
  const existing = new Set(asm.instances.map((i) => i.id));
  const copies: AssemblyInstance[] = [];
  for (let k = 1; k < n; k++) {
    let next = `${id}_${k + 1}`;
    let suffix = k + 1;
    while (existing.has(next)) next = `${id}_${++suffix}`;
    existing.add(next);
    const t = [...source.transform];
    const offset = spacing * k;
    if (axis === "x") t[3] = (t[3] ?? 0) + offset;
    if (axis === "y") t[7] = (t[7] ?? 0) + offset;
    if (axis === "z") t[11] = (t[11] ?? 0) + offset;
    copies.push({ ...source, id: next, transform: t });
  }
  return { ...asm, instances: [...asm.instances, ...copies] };
}

export function removeInstance(asm: Assembly, id: string): Assembly {
  return {
    ...asm,
    instances: asm.instances.filter((i) => i.id !== id),
    mates: asm.mates.filter((m) => m.a.bodyId !== id && m.b.bodyId !== id),
  };
}

export function removeMate(asm: Assembly, id: string): Assembly {
  return { ...asm, mates: asm.mates.filter((m) => m.id !== id) };
}

// ---- Over-constraint detection ----

export function overConstrained(asm: Assembly): string[] {
  const msgs: string[] = [];
  // Complementary mates on the same pair are valid (concentric + distance is
  // a normal shaft/stop combination). Only an exact duplicate constraint is
  // unambiguously redundant; the DOF estimate catches the rest.
  for (const issue of duplicateMateIssues(asm))
    if (issue.startsWith("duplicate")) msgs.push(issue);
  if (rawDof(asm) < 0) msgs.push(`over-constrained by ${-rawDof(asm)} DOF`);
  return msgs;
}

// ---- Serialization ----

export function toJSON(asm: Assembly): string {
  return JSON.stringify(asm);
}
export function fromJSON(s: string): Assembly {
  return JSON.parse(s) as Assembly;
}
