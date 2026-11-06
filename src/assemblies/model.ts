// Assembly model (Phase 5) — pure, no core deps.

import { solveGeometry } from "./geometry";

export type MateKind =
  | "coincident"
  | "concentric"
  | "parallel"
  | "distance"
  | "angle";

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
}

export interface AssemblyInstance {
  id: string;
  partId: string;
  transform: number[]; // 4x4 column-major flattened
}

export interface Assembly {
  id: string;
  instances: AssemblyInstance[];
  mates: Mate[];
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
  const base = asm.instances.length * 6;
  const removed = asm.mates.reduce((acc, m) => {
    switch (m.kind) {
      case "coincident":
        return acc + 3;
      case "concentric":
        return acc + 2;
      case "parallel":
        return acc + 1;
      case "distance":
        return acc + 1;
      case "angle":
        return acc + 1;
      default:
        return acc;
    }
  }, 0);
  // fix one instance to ground
  const ground = asm.instances.length > 0 ? 6 : 0;
  return Math.max(0, base - removed - ground);
}

// Unconstrained DOF (before grounding) — used for over-constraint detection.
export function rawDof(asm: Assembly): number {
  const base = asm.instances.length * 6;
  const removed = asm.mates.reduce((acc, m) => {
    switch (m.kind) {
      case "coincident":
        return acc + 3;
      case "concentric":
        return acc + 2;
      case "parallel":
        return acc + 1;
      case "distance":
        return acc + 1;
      case "angle":
        return acc + 1;
      default:
        return acc;
    }
  }, 0);
  return base - removed;
}

function duplicateMateIssues(asm: Assembly): string[] {
  const ids = new Set<string>();
  const msgs: string[] = [];
  for (const m of asm.mates) {
    if (ids.has(m.id)) msgs.push(`duplicate mate ${m.id}`);
    ids.add(m.id);
  }
  return msgs;
}

function unknownInstanceIssues(asm: Assembly): string[] {
  const ids = new Set(asm.instances.map((i) => i.id));
  const msgs: string[] = [];
  for (const m of asm.mates) {
    if (!ids.has(m.a.bodyId)) msgs.push(`unknown instance ${m.a.bodyId}`);
    if (!ids.has(m.b.bodyId)) msgs.push(`unknown instance ${m.b.bodyId}`);
  }
  return msgs;
}

// ---- Ref frames (local named face/edge/axis reference per instance) ----

export interface RefSpec {
  transform: number[];
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
}

// Solve and place: drives instance transforms to zero residual using ref frames.
// Falls back to the naive transform solver when no ref frame is supplied.
export function solve(asm: Assembly, refs?: RefMap): SolveResult {
  const issues = [
    ...duplicateMateIssues(asm),
    ...unknownInstanceIssues(asm),
    ...overConstrained(asm),
  ];
  const refMap: RefMap = refs ?? defaultRefs(asm);
  const g = solveGeometry(asm, refMap);
  return {
    ok: issues.length === 0 && g.converged,
    dof: dof(asm),
    issues,
    residual: g.residual,
    assembly: g.assembly,
    iters: g.iters,
    converged: g.converged,
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
  // a second mate between the same instance pair is redundant (same-kind
  // is exact-duplicate; mixed-kind still over-determines the relative
  // placement), so flag the pair and its kinds.
  const pairs = new Map<string, string[]>();
  for (const m of asm.mates) {
    const key = [m.a.bodyId, m.b.bodyId].sort().join("|");
    const list = pairs.get(key) ?? [];
    list.push(m.kind);
    pairs.set(key, list);
  }
  for (const [key, kinds] of pairs) {
    if (kinds.length > 1) {
      const uniq = [...new Set(kinds)].join("/");
      msgs.push(`redundant mates (${uniq}) between ${key}`);
    }
  }
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
