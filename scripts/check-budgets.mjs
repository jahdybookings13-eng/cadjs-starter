#!/usr/bin/env node
// check-budgets.mjs — Phase 0 performance/browser budgets.
//
// Validates parity/budgets.json and, when parity/measurements.json exists,
// compares every recorded measurement against its budget. The Playwright spec
// e2e/perf-budget.spec.ts records the browser-side numbers; this script is the
// CI gate that fails on a regression.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const BUDGETS = resolve(ROOT, "parity/budgets.json");
const MEASUREMENTS = resolve(ROOT, "parity/measurements.json");

if (!existsSync(BUDGETS)) {
  console.error("check-budgets: parity/budgets.json missing");
  process.exit(1);
}

const config = JSON.parse(readFileSync(BUDGETS, "utf8"));
const errors = [];

if (config.version !== 1) errors.push("version must be 1");
if (!config.browsers || typeof config.browsers !== "object")
  errors.push("browsers mapping missing");
if (!Array.isArray(config.viewports) || config.viewports.length === 0)
  errors.push("viewports must be a non-empty array");
if (!config.budgets || typeof config.budgets !== "object")
  errors.push("budgets object missing");

for (const [name, value] of Object.entries(config.budgets ?? {})) {
  if (value === null) continue;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    errors.push(`budget ${name} must be a positive number or null`);
}

const measurements = existsSync(MEASUREMENTS)
  ? JSON.parse(readFileSync(MEASUREMENTS, "utf8"))
  : null;

const rows = [];
for (const [name, budget] of Object.entries(config.budgets ?? {})) {
  const measured = measurements ? measurements[name] : undefined;
  if (budget === null) {
    rows.push({ name, budget, measured, status: "n/a" });
    continue;
  }
  if (measured === undefined) {
    rows.push({ name, budget, measured: "—", status: "not recorded" });
    if (name.startsWith("studio")) {
      errors.push(`${name}: studio budget has no recorded measurement`);
    }
    continue;
  }
  const lowerIsBetter = name.endsWith("Ms") || name.endsWith("Bytes");
  const pass = lowerIsBetter ? measured <= budget : measured >= budget;
  rows.push({ name, budget, measured, status: pass ? "PASS" : "FAIL" });
  if (!pass)
    errors.push(
      `${name}: ${measured} ${lowerIsBetter ? ">" : "<"} budget ${budget}`,
    );
}

console.log("performance budgets");
for (const row of rows) {
  console.log(
    `  ${row.name.padEnd(24)} ${String(row.measured).padStart(10)} / ${String(
      row.budget,
    ).padStart(10)}  ${row.status}`,
  );
}
console.log(
  `browsers: ${Object.entries(config.browsers ?? {})
    .map(([name, level]) => `${name}=${level}`)
    .join(", ")}`,
);
console.log(
  `viewports: ${(config.viewports ?? [])
    .map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`)
    .join(", ")}`,
);

if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exit(1);
}
console.log("budget check: PASS");
