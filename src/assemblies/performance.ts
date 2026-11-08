// Measured large-assembly performance budget. The model benchmark is pure, so
// the same check can run in the UI, from the action bus, and in the test/CI
// path without a browser. The viewport reports its own placement time through
// `AssemblyWorkspace`.
//
// This is deliberately a projection of the cost the viewport pays on an
// assembly change: flatten the full instance tree, compute real DOF, build the
// BOM and run the broad-phase interference report. It is not a GPU frame-time
// measurement, and the report says so.

import { assemblyBom } from "./bom";
import { collisionReport } from "./interference";
import { dofAnalysis, flattenAssembly, identity, type Assembly } from "./model";
import type { BodyBounds } from "./connectors";

export interface AssemblyBudget {
  /** Full assembly-change budget in milliseconds. */
  openMs: number;
  /** Per-change/orbit projection budget in milliseconds. */
  orbitMs: number;
  /** The benchmark must contain at least this many leaf instances. */
  minInstances: number;
}

export const ASSEMBLY_BUDGET: AssemblyBudget = {
  openMs: 120,
  orbitMs: 16.7,
  minInstances: 20,
};

export interface AssemblyPerformanceReport {
  openMs: number;
  orbitMs: number;
  instances: number;
  levels: number;
  triangles: number;
  bounds: AssemblyBudget;
  openOk: boolean;
  orbitOk: boolean;
  instanceOk: boolean;
  ok: boolean;
  measuredAt: number;
}

function translated(x: number, y: number, z: number): number[] {
  const transform = identity();
  transform[3] = x;
  transform[7] = y;
  transform[11] = z;
  return transform;
}

/**
 * A deterministic three-level assembly with 21 leaf instances and mixed
 * mates. Two subassembly levels exercise nested transforms; the mates span
 * coincident, distance, concentric, parallel, angle, tangent and width kinds.
 */
export function buildThreeLevelBenchmark(): {
  assembly: Assembly;
  bounds: Record<string, BodyBounds>;
} {
  const bounds: Record<string, BodyBounds> = {};
  const leaf = (id: string, x: number, y: number, z: number) => {
    bounds[id] = {
      min: { x: -0.012, y: -0.012, z: -0.012 },
      max: { x: 0.012, y: 0.012, z: 0.012 },
    };
    return {
      id,
      partId: `bench-part-${id}`,
      bodyId: id,
      name: id,
      transform: translated(x, y, z),
    };
  };
  const inner = {
    id: "bench_inner",
    instances: [
      leaf("bench_i0", 0.0, 0.0, 0.06),
      leaf("bench_i1", 0.05, 0.0, 0.06),
      leaf("bench_i2", 0.1, 0.0, 0.06),
      leaf("bench_i3", 0.15, 0.0, 0.06),
      leaf("bench_i4", 0.2, 0.0, 0.06),
      leaf("bench_i5", 0.25, 0.0, 0.06),
      leaf("bench_i6", 0.3, 0.0, 0.06),
    ],
    mates: [
      {
        id: "bi_m0",
        kind: "parallel" as const,
        a: { bodyId: "bench_i0", ref: "axis-x" },
        b: { bodyId: "bench_i1", ref: "axis-x" },
      },
      {
        id: "bi_m1",
        kind: "distance" as const,
        a: { bodyId: "bench_i2", ref: "center" },
        b: { bodyId: "bench_i3", ref: "center" },
        value: 0.05,
      },
    ],
  };
  const middle = {
    id: "bench_middle",
    instances: [
      leaf("bench_m0", 0.0, 0.08, 0.0),
      leaf("bench_m1", 0.05, 0.08, 0.0),
      leaf("bench_m2", 0.1, 0.08, 0.0),
      leaf("bench_m3", 0.15, 0.08, 0.0),
      leaf("bench_m4", 0.2, 0.08, 0.0),
      leaf("bench_m5", 0.25, 0.08, 0.0),
      leaf("bench_m6", 0.3, 0.08, 0.0),
      {
        id: "bench_inner_ref",
        partId: "bench_inner",
        name: "Inner",
        transform: translated(0.34, 0.08, 0.0),
        subassembly: inner,
      },
    ],
    mates: [
      {
        id: "bm_m0",
        kind: "coincident" as const,
        a: { bodyId: "bench_m0", ref: "center" },
        b: { bodyId: "bench_m1", ref: "center" },
      },
      {
        id: "bm_m1",
        kind: "angle" as const,
        a: { bodyId: "bench_m2", ref: "axis-z" },
        b: { bodyId: "bench_m3", ref: "axis-z" },
        value: 15,
      },
    ],
  };
  const root = {
    id: "bench_root",
    name: "Benchmark 3-level assembly",
    instances: [
      leaf("bench_r0", 0.0, 0.0, 0.0),
      leaf("bench_r1", 0.05, 0.0, 0.0),
      leaf("bench_r2", 0.1, 0.0, 0.0),
      leaf("bench_r3", 0.15, 0.0, 0.0),
      leaf("bench_r4", 0.2, 0.0, 0.0),
      leaf("bench_r5", 0.25, 0.0, 0.0),
      leaf("bench_r6", 0.3, 0.0, 0.0),
      {
        id: "bench_middle_ref",
        partId: "bench_middle",
        name: "Middle",
        transform: translated(0.0, 0.06, 0.0),
        subassembly: middle,
      },
    ],
    mates: [
      {
        id: "br_m0",
        kind: "concentric" as const,
        a: { bodyId: "bench_r0", ref: "axis-z" },
        b: { bodyId: "bench_r1", ref: "axis-z" },
      },
      {
        id: "br_m1",
        kind: "tangent" as const,
        a: { bodyId: "bench_r2", ref: "axis-y" },
        b: { bodyId: "bench_r3", ref: "axis-y" },
      },
      {
        id: "br_m2",
        kind: "width" as const,
        a: { bodyId: "bench_r4", ref: "center" },
        b: { bodyId: "bench_r5", ref: "center" },
        value: 0.04,
        min: 0.01,
        max: 0.1,
      },
      {
        id: "br_m3",
        kind: "distance" as const,
        a: { bodyId: "bench_r6", ref: "center" },
        b: { bodyId: "bench_r0", ref: "center" },
        value: 0.03,
      },
    ],
  };
  return { assembly: root, bounds };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Measure the model-side open and orbit projections on a provided assembly. */
export function measureAssemblyPerformance(
  assembly: Assembly,
  bounds: Record<string, BodyBounds>,
  iterations = 9,
): AssemblyPerformanceReport {
  let instances = 0;
  let levels = 0;
  const leaves = flattenAssembly(assembly);
  instances = leaves.length;
  const visit = (asm: Assembly, depth: number) => {
    levels = Math.max(levels, depth);
    for (const inst of asm.instances)
      if (inst.subassembly) visit(inst.subassembly, depth + 1);
  };
  visit(assembly, 1);
  const parts = leaves.map((leaf) => ({
    id: leaf.partId,
    name: leaf.partId,
    number: "",
    description: "",
    bodyIds: [],
  }));
  const bodies = leaves.map((leaf) => ({
    id: leaf.bodyId ?? leaf.instanceId,
    name: leaf.instanceId,
    partId: leaf.partId,
    materialId: null,
    appearance: {},
    state: "keep" as const,
    hidden: false,
    transparent: false,
  }));

  const openRuns: number[] = [];
  const orbitRuns: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const openStart = performance.now();
    flattenAssembly(assembly);
    dofAnalysis(assembly);
    assemblyBom(assembly, bodies, parts);
    collisionReport(assembly, bounds, 0);
    openRuns.push(performance.now() - openStart);

    const orbitStart = performance.now();
    // Orbit projection: nested matrix composition + broad phase on every
    // assembly change, not a rendered frame.
    flattenAssembly(assembly);
    collisionReport(assembly, bounds, 0);
    orbitRuns.push(performance.now() - orbitStart);
  }
  const openMs = median(openRuns);
  const orbitMs = median(orbitRuns);
  const instanceOk = instances >= ASSEMBLY_BUDGET.minInstances;
  const openOk = openMs <= ASSEMBLY_BUDGET.openMs;
  const orbitOk = orbitMs <= ASSEMBLY_BUDGET.orbitMs;
  return {
    openMs,
    orbitMs,
    instances,
    levels,
    triangles: instances * 12,
    bounds: ASSEMBLY_BUDGET,
    openOk,
    orbitOk,
    instanceOk,
    ok: openOk && orbitOk && instanceOk,
    measuredAt: Date.now(),
  };
}

/** The CI/test gate: a performance report must pass every budget check. */
export function assertAssemblyBudget(report: AssemblyPerformanceReport): void {
  if (!report.instanceOk)
    throw new Error(
      `assembly performance: ${report.instances} instances, needs >= ${ASSEMBLY_BUDGET.minInstances}`,
    );
  if (!report.openOk)
    throw new Error(
      `assembly performance: open ${report.openMs.toFixed(2)} ms exceeds ${ASSEMBLY_BUDGET.openMs} ms`,
    );
  if (!report.orbitOk)
    throw new Error(
      `assembly performance: orbit ${report.orbitMs.toFixed(2)} ms exceeds ${ASSEMBLY_BUDGET.orbitMs} ms`,
    );
}
