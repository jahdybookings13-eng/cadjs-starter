#!/usr/bin/env node
// parity-matrix.mjs — Phase 0 matrix ownership and status instrumentation.
//
// Parses the capability matrix out of ONSHAPE_PARITY.md section 4, applies the
// section owner/evidence mapping in parity/owners.json, validates every row's
// status, and writes:
//
//   parity/matrix.json    machine-readable rows + summary
//   PARITY_STATUS.md      live status dashboard
//
// `--check` fails when a matrix row has an unknown status, no owner, no
// acceptance evidence, or when a section disappears. It does not claim a row is
// implemented; it only enforces that every row is tracked.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const DOC = resolve(ROOT, "ONSHAPE_PARITY.md");
const OWNERS = resolve(ROOT, "parity/owners.json");
const OUT_JSON = resolve(ROOT, "parity/matrix.json");
const OUT_MD = resolve(ROOT, "PARITY_STATUS.md");
const CHECK = process.argv.includes("--check");

const VALID = new Set(["SHIPPED", "PARTIAL", "MISSING", "STUDIO"]);
const WEIGHT = { SHIPPED: 1, PARTIAL: 0.5, MISSING: 0, STUDIO: 0 };

if (!existsSync(DOC)) {
  console.error("parity-matrix: ONSHAPE_PARITY.md not found");
  process.exit(1);
}
if (!existsSync(OWNERS)) {
  console.error("parity-matrix: parity/owners.json not found");
  process.exit(1);
}

const owners = JSON.parse(readFileSync(OWNERS, "utf8"));
const lines = readFileSync(DOC, "utf8").split("\n");

const rows = [];
const sections = new Map();
let section = null;
let inSection4 = false;
let counter = 0;

for (const line of lines) {
  if (/^## 4\./.test(line)) {
    inSection4 = true;
    continue;
  }
  if (/^## 5\./.test(line)) {
    inSection4 = false;
    section = null;
    continue;
  }
  if (!inSection4) continue;

  const heading = /^### (4\.\d+)\s+(?:—\s*)?(.+)$/.exec(line);
  if (heading) {
    section = { id: heading[1], title: heading[2].trim() };
    sections.set(section.id, section);
    counter = 0;
    continue;
  }
  if (!section) continue;
  if (!line.startsWith("|")) continue;
  if (/^\|\s*-/.test(line)) continue;

  const cells = line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  if (cells.length !== 4) continue;
  if (cells[0] === "Capability") continue;
  if (/^status$/i.test(cells[3])) continue;

  const [capability, current, required, status] = cells;
  counter += 1;
  rows.push({
    id: `${section.id}.${counter}`,
    section: section.id,
    sectionTitle: section.title,
    capability,
    current,
    required,
    status,
  });
}

const errors = [];
if (!rows.length) errors.push("no matrix rows parsed from section 4");

const byStatus = {};
for (const row of rows) {
  if (!VALID.has(row.status)) {
    errors.push(`${row.id} ${row.capability}: invalid status "${row.status}"`);
    continue;
  }
  byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  const owner = owners[row.section];
  if (!owner) {
    errors.push(`${row.id}: no owner mapping for section ${row.section}`);
    continue;
  }
  row.owner = owner.owner;
  row.evidence = owner.evidence ?? [];
  if (!row.owner) errors.push(`${row.id}: empty owner`);
  if (!Array.isArray(row.evidence) || row.evidence.length === 0)
    errors.push(`${row.id}: no acceptance evidence for section ${row.section}`);
}

for (const [id, section] of sections) {
  if (!owners[id])
    errors.push(`section ${id} (${section.title}) has no owner mapping`);
  if (!rows.some((row) => row.section === id))
    errors.push(`section ${id} (${section.title}) has no rows`);
}

const total = rows.length;
const score = rows.reduce((sum, row) => sum + (WEIGHT[row.status] ?? 0), 0);
const coverage = total ? score / total : 0;
const summary = {
  generatedAt: new Date().toISOString(),
  rows: total,
  sections: sections.size,
  byStatus,
  rowCoverage: Number(coverage.toFixed(4)),
  rowCoveragePct: `${(coverage * 100).toFixed(1)}%`,
  errors,
};

if (CHECK) {
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error("\nparity matrix: FAIL");
    process.exit(1);
  }
  console.log(
    `parity matrix: PASS — ${total} rows in ${sections.size} sections, ` +
      `${summary.rowCoveragePct} row coverage`,
  );
  process.exit(0);
}

mkdirSync(resolve(ROOT, "parity"), { recursive: true });
writeFileSync(
  OUT_JSON,
  JSON.stringify({ summary, rows, owners }, null, 2) + "\n",
);

const linesOut = [
  "# PARITY STATUS",
  "",
  "Generated from `ONSHAPE_PARITY.md` section 4 and `parity/owners.json` by",
  "`scripts/parity-matrix.mjs`. Do not edit by hand.",
  "",
  `Generated: ${summary.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Capability rows: **${total}** across **${sections.size}** sections`,
  `- Row coverage (SHIPPED=1, PARTIAL=0.5): **${summary.rowCoveragePct}**`,
  `- SHIPPED: **${byStatus.SHIPPED ?? 0}**`,
  `- PARTIAL: **${byStatus.PARTIAL ?? 0}**`,
  `- MISSING: **${byStatus.MISSING ?? 0}**`,
  `- STUDIO: **${byStatus.STUDIO ?? 0}**`,
  "",
  "> Row coverage is a tracking score, not functional depth. A `PARTIAL` row",
  "> counts half even when only a fraction of the Onshape behaviour exists.",
  "",
  "## Ownership",
  "",
  "| Section | Owner | Acceptance evidence |",
  "| --- | --- | --- |",
];

for (const [id, section] of sections) {
  const owner = owners[id];
  linesOut.push(
    `| ${id} ${section.title} | ${owner?.owner ?? "MISSING"} | ${
      (owner?.evidence ?? []).map((e) => `\`${e}\``).join("<br>") || "MISSING"
    } |`,
  );
}

linesOut.push(
  "",
  "## Rows",
  "",
  "| ID | Capability | Status | Owner | Evidence |",
  "| --- | --- | --- | --- | --- |",
);
for (const row of rows) {
  linesOut.push(
    `| ${row.id} | ${escapeCell(row.capability)} | ${row.status} | ${
      row.owner ?? "MISSING"
    } | ${(row.evidence ?? []).map((e) => `\`${e}\``).join("<br>") || "MISSING"} |`,
  );
}
writeFileSync(OUT_MD, linesOut.join("\n") + "\n");

function escapeCell(text) {
  return String(text).replaceAll("|", "\\|");
}
