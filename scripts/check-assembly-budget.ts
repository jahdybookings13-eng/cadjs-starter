#!/usr/bin/env node
// CI gate for the Phase 4 large-assembly budget. This is a measurement, not a
// browser e2e: it builds the deterministic three-level/21-leaf assembly, runs
// the same model operations the assembly tab pays on open, measures the median
// open/orbit projections, and verifies the saved assembly payload round-trips.

import {
  assertAssemblyBudget,
  buildThreeLevelBenchmark,
  measureAssemblyPerformance,
} from "../src/assemblies/performance";
import { flattenAssembly } from "../src/assemblies/model";
import {
  parseAssemblyTab,
  serializeAssemblyTab,
} from "../src/assemblies/document";
import { assemblyBom } from "../src/assemblies/bom";

const benchmark = buildThreeLevelBenchmark();
const report = measureAssemblyPerformance(benchmark.assembly, benchmark.bounds);
assertAssemblyBudget(report);

const leaves = flattenAssembly(benchmark.assembly);
if (leaves.length < 20) {
  throw new Error(`benchmark has ${leaves.length} leaves, expected 20+`);
}

const saved = serializeAssemblyTab({
  v: 1,
  kind: "assembly",
  sourceTabId: "source",
  assembly: benchmark.assembly,
  explode: 15,
  positions: [{ name: "Exploded", explode: 15 }],
  bomMode: "indented",
});
const parsed = parseAssemblyTab(saved);
if (!parsed) throw new Error("assembly payload did not round-trip");
const parsedLeaves = flattenAssembly(parsed.assembly);
if (parsedLeaves.length !== leaves.length) {
  throw new Error(
    `round-trip lost instances: ${leaves.length} -> ${parsedLeaves.length}`,
  );
}
if (parsed.bomMode !== "indented") {
  throw new Error(`round-trip lost BOM mode: ${parsed.bomMode}`);
}
const rows = assemblyBom(
  parsed.assembly,
  parsedLeaves.map((leaf) => ({
    id: leaf.bodyId ?? leaf.instanceId,
    name: leaf.instanceId,
    partId: leaf.partId,
    materialId: null,
    appearance: {},
    state: "keep" as const,
    hidden: false,
    transparent: false,
  })),
  parsedLeaves.map((leaf) => ({
    id: leaf.partId,
    name: leaf.partId,
    number: "",
    description: "",
    bodyIds: [],
  })),
);
if (!rows.length) throw new Error("round-trip produced an empty BOM");

console.log("assembly budget");
console.log(
  `  instances        ${report.instances} leaves / ${report.levels} levels`,
);
console.log(
  `  open             ${report.openMs.toFixed(2)} ms / ${report.bounds.openMs} ms  ${report.openOk ? "PASS" : "FAIL"}`,
);
console.log(
  `  orbit            ${report.orbitMs.toFixed(2)} ms / ${report.bounds.orbitMs} ms  ${report.orbitOk ? "PASS" : "FAIL"}`,
);
console.log(
  `  round-trip       ${parsedLeaves.length} leaves, ${rows.length} BOM rows  PASS`,
);
console.log("assembly budget: PASS");
