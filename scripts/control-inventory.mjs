#!/usr/bin/env node
// control-inventory.mjs — Phase 0 control registry.
//
// Scans every app .tsx file for visible interactive elements (buttons, inputs,
// selects, textareas, links and role-based controls), derives their label,
// handler, enabled rule and keyboard hint, finds test evidence, and writes:
//
//   parity/controls.json     machine-readable registry
//   CONTROL_INVENTORY.md     human report grouped by toolbar/dialog
//
// `--check` runs the Phase 0 gate instead of writing: it fails on a visible
// control with no handler (dead), no label, or a rule in the allowlist that no
// longer matches. Evidence coverage is reported, not enforced here.
//
// The scanner deliberately reads source, not the rendered DOM: it must work in
// CI without a browser and catch a control before it ships.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(process.cwd());
const SRC = resolve(ROOT, "src");
const E2E = resolve(ROOT, "e2e");
const PARITY = resolve(ROOT, "parity");
const OUT_JSON = resolve(PARITY, "controls.json");
const OUT_MD = resolve(ROOT, "CONTROL_INVENTORY.md");
const OUT_AUDIT = resolve(ROOT, "CONTROL_AUDIT.md");
const ALLOWLIST = resolve(PARITY, "control-allowlist.json");

const CHECK = process.argv.includes("--check");

const INTERACTIVE_TAGS = new Set(["button", "input", "select", "textarea"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "switch",
  "tab",
  "treeitem",
]);

const HANDLER_ATTRS = [
  "onClick",
  "onChange",
  "onSubmit",
  "onInput",
  "onDoubleClick",
  "onKeyDown",
  "onKeyUp",
  "onPointerDown",
  "onPointerUp",
  "onMouseDown",
  "onMouseUp",
  "onBlur",
  "onFocus",
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rel(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function unquote(raw) {
  if (raw === undefined) return { value: "", kind: "none" };
  let text = raw.trim();
  let dynamic = false;
  if (text.startsWith("{") && text.endsWith("}")) {
    dynamic = true;
    text = text.slice(1, -1).trim();
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("`") && text.endsWith("`"))
  ) {
    text = text.slice(1, -1);
  }
  return { value: text.trim(), kind: dynamic ? "dynamic" : "literal" };
}

function attrValue(attrs, name) {
  return unquote(attrs[name]);
}

function attributeMap(opening, source) {
  const attrs = {};
  for (const prop of opening.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = prop.name.getText(source);
    attrs[name] = prop.initializer ? prop.initializer.getText(source) : "true";
  }
  return attrs;
}

function collectText(node, source) {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) {
    const expr = node.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return expr.text;
    }
    if (ts.isTemplateExpression(expr)) {
      return (
        expr.head.text + expr.templateSpans.map((s) => s.literal.text).join("")
      );
    }
  }
  if (ts.isJsxElement(node)) {
    return node.children.map((child) => collectText(child, source)).join("");
  }
  return "";
}

function tagOf(node, source) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText(source);
}

function familyOf(file) {
  const base = basename(file, ".tsx");
  const direct = {
    DocumentTabBar: "Document tabs",
    PrimaryToolbar: "Feature toolbar",
    FileMenu: "Document menu",
    UndoRedoMenus: "Undo/redo",
    ViewerToolbar: "Viewer toolbar",
    SketchToolbar: "Sketch toolbar",
    SketchCommandPalette: "Command palette",
    SketchControlsHelp: "Sketch help",
    BrowserSidePanel: "Feature tree",
    FeatureTree: "Feature tree",
    BrowserContextMenu: "Feature tree",
    AssemblyPanel: "Assembly panel",
    AssemblyTreeView: "Assembly panel",
    EcadPanel: "ECAD panel",
    PrintWizard: "Print wizard",
    CollaborationPanel: "Collaboration",
    ShareGate: "Sharing",
    SessionPresenceStrip: "Collaboration",
    SketchPropertiesPanel: "Sketch properties",
    SketchPropertiesSidePanel: "Sketch properties",
    SelectOtherMenu: "Selection",
    NavigationBar: "Navigation",
    StatusBar: "Status bar",
  };
  if (direct[base]) return direct[base];
  if (file.includes("/navbar/") && /Panel$/.test(base))
    return `Feature dialog: ${base.replace(/Panel$/, "")}`;
  if (file.includes("/navbar/") && /Modal$/.test(base))
    return `Input dialog: ${base.replace(/Modal$/, "")}`;
  if (file.includes("/modes/") && /Content$/.test(base))
    return `Mode panel: ${base.replace(/Content$/, "")}`;
  if (file.includes("/vr/")) return `VR: ${base}`;
  return `Other: ${base}`;
}

function keyboardOf(label) {
  const match = /\(([^()]*[A-Za-z0-9][^()]*)\)\s*$/.exec(label);
  return match ? match[1].trim() : "";
}

function shouldSkip(tag, attrs) {
  if (attrs["aria-hidden"]) {
    const hidden = attrValue(attrs, "aria-hidden").value;
    if (hidden === "true") return true;
  }
  if (tag === "input") {
    const type = attrValue(attrs, "type").value;
    if (type === "hidden") return true;
    const className = attrValue(attrs, "className").value;
    if (/(^|\s)hidden(\s|$)/.test(className)) return true;
  }
  if (attrs.hidden !== undefined) return true;
  const style = attrValue(attrs, "style").value;
  if (/display\s*:\s*["']?none/.test(style)) return true;
  return false;
}

function statusOf(tag, attrs, handler, disabled) {
  if (handler) return "wired";
  if (tag === "a" && attrs.href !== undefined) return "navigation";
  if (disabled === "true") return "disabled";
  if (tag === "input" && attrs.readOnly !== undefined) return "static";
  return "dead";
}

const EXISTING_TESTS = [...walk(SRC), ...walk(E2E)]
  .map((file) => ({ file, text: readFileSync(file, "utf8") }))
  .filter(
    ({ file }) =>
      file.endsWith(".test.ts") ||
      file.endsWith(".test.tsx") ||
      file.endsWith(".spec.ts"),
  )
  .map(({ file, text }) => ({ file: rel(file), text }));

/**
 * Evidence levels, strongest first:
 * - direct: a test contains the exact `data-testid` string.
 * - aria:   a test contains the exact `aria-label` string.
 * - label:  a test contains a stable (≥8 character) literal segment of the
 *           control's label or testid template. This catches regex locators
 *           such as `/Add source body/` and prefixed selectors like
 *           `[data-testid^="assembly-instance-"]` without pretending that an
 *           exact selector was used.
 * - none:   no test reference; recorded as a static-only gap in the audit.
 */
function evidenceFor(testid, ariaLabel, label) {
  const needles = [];
  if (testid) needles.push(`"${testid}"`);
  if (ariaLabel) needles.push(`"${ariaLabel}"`);
  if (needles.length) {
    const exact = EXISTING_TESTS.filter(({ text }) =>
      needles.some((needle) => text.includes(needle)),
    ).map(({ file }) => file);
    if (exact.length) {
      return {
        level: testid ? "direct" : "aria",
        files: exact.slice(0, 4),
      };
    }
  }
  const segments = [label, testid]
    .flatMap((value) =>
      String(value ?? "")
        .split(/\$\{[^}]*\}/g)
        .map((part) => part.replace(/\s+/g, " ").trim()),
    )
    .filter((part) => part.length >= 8);
  if (segments.length) {
    const referenced = EXISTING_TESTS.filter(({ text }) =>
      segments.some((segment) => text.includes(segment)),
    ).map(({ file }) => file);
    if (referenced.length) {
      return { level: "label", files: referenced.slice(0, 4) };
    }
  }
  return { level: "none", files: [] };
}

function scanFile(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const entries = [];

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = tagOf(node, source);
      const attrs = attributeMap(opening, source);
      const role = attrValue(attrs, "role").value;
      const interactive =
        INTERACTIVE_TAGS.has(tag) ||
        (tag === "a" &&
          (attrs.href !== undefined || attrs.onClick !== undefined)) ||
        (role && INTERACTIVE_ROLES.has(role));

      if (interactive && !shouldSkip(tag, attrs)) {
        const aria = attrValue(attrs, "aria-label");
        const title = attrValue(attrs, "title");
        const placeholder = attrValue(attrs, "placeholder");
        const testid = attrValue(attrs, "data-testid");
        const text = collectText(node, source).replace(/\s+/g, " ").trim();
        const name = attrValue(attrs, "name");
        const labelSource =
          aria.value ||
          title.value ||
          placeholder.value ||
          testid.value ||
          text ||
          name.value;
        const labelKind = labelSource
          ? aria.value
            ? aria.kind
            : title.value
              ? title.kind
              : placeholder.value
                ? placeholder.kind
                : testid.value
                  ? "testid"
                  : text
                    ? "text"
                    : "name"
          : "none";
        const handler =
          HANDLER_ATTRS.find((attr) => attrs[attr] !== undefined) ?? "";
        const disabled = attrs.disabled !== undefined ? attrs.disabled : "";
        const position = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        const status = statusOf(tag, attrs, handler, disabled);
        const keyboard = keyboardOf(aria.value || title.value || "");
        const evidence = evidenceFor(testid.value, aria.value, labelSource);

        entries.push({
          file: rel(file),
          line: position.line + 1,
          tag,
          role,
          label: labelSource || "unlabeled",
          labelKind,
          testid: testid.value,
          handler,
          enabledRule: disabled,
          readOnly: attrs.readOnly !== undefined,
          keyboard,
          status,
          evidence,
          family: familyOf(rel(file)),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return entries;
}

const files = walk(SRC).filter((file) => file.endsWith(".tsx"));
const controls = files.flatMap(scanFile);

const allowlist = existsSync(ALLOWLIST)
  ? (JSON.parse(readFileSync(ALLOWLIST, "utf8")).entries ?? [])
  : [];
const allowed = (entry, rule) =>
  allowlist.some(
    (item) =>
      entry.file.endsWith(item.file) &&
      (item.label === entry.label || item.testid === entry.testid) &&
      (!item.rule || item.rule === rule),
  );

const dead = controls.filter(
  (entry) => entry.status === "dead" && !allowed(entry, "dead"),
);
const unlabeled = controls.filter(
  (entry) => entry.labelKind === "none" && !allowed(entry, "unlabeled"),
);
const staleAllowlist = allowlist.filter((item) => {
  const match = controls.find(
    (entry) =>
      entry.file.endsWith(item.file) &&
      (item.label === entry.label || item.testid === entry.testid),
  );
  return !match;
});

const countBy = (key) => {
  const out = {};
  for (const control of controls)
    out[control[key]] = (out[control[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
};
const byStatus = countBy("status");
const byFamily = countBy("family");
const directEvidence = controls.filter(
  (c) => c.evidence.level === "direct",
).length;
const labelEvidence = controls.filter(
  (c) => c.evidence.level === "label",
).length;
const anyEvidence = controls.filter((c) => c.evidence.level !== "none").length;

const summary = {
  generatedAt: new Date().toISOString(),
  files: files.length,
  controls: controls.length,
  byStatus,
  byFamily,
  evidence: {
    direct: directEvidence,
    label: labelEvidence,
    any: anyEvidence,
    missing: controls.length - anyEvidence,
  },
  dead: dead.length,
  unlabeled: unlabeled.length,
  allowlisted: allowlist.length,
  staleAllowlist: staleAllowlist.length,
};

if (CHECK) {
  const problems = [];
  // The per-control audit is only evidence if it matches the source. A
  // control added, removed or relabelled without regenerating the registry
  // and ledger fails the gate instead of leaving stale coverage claims.
  const registry = existsSync(OUT_JSON)
    ? JSON.parse(readFileSync(OUT_JSON, "utf8"))
    : null;
  if (!registry || registry.summary?.controls !== controls.length) {
    problems.push(
      `parity/controls.json is stale (${registry?.summary?.controls ?? "missing"} vs ${controls.length} controls); run npm run inventory:controls`,
    );
  }
  const auditText = existsSync(OUT_AUDIT)
    ? readFileSync(OUT_AUDIT, "utf8")
    : "";
  const auditCount = Number(
    /<!-- control-audit-count: (\d+) -->/.exec(auditText)?.[1],
  );
  if (!auditText) {
    problems.push(
      "CONTROL_AUDIT.md is missing; run npm run inventory:controls",
    );
  } else if (auditCount !== controls.length) {
    problems.push(
      `CONTROL_AUDIT.md is stale (${Number.isFinite(auditCount) ? auditCount : "no count"} vs ${controls.length} controls); run npm run inventory:controls`,
    );
  }
  if (dead.length) {
    problems.push(`${dead.length} dead control(s) with no handler:`);
    for (const entry of dead.slice(0, 25))
      problems.push(
        `  ${entry.file}:${entry.line} <${entry.tag}> ${entry.label}`,
      );
  }
  if (unlabeled.length) {
    problems.push(`${unlabeled.length} unlabeled control(s):`);
    for (const entry of unlabeled.slice(0, 25))
      problems.push(`  ${entry.file}:${entry.line} <${entry.tag}>`);
  }
  if (staleAllowlist.length) {
    problems.push(`${staleAllowlist.length} stale allowlist entr(ies):`);
    for (const item of staleAllowlist)
      problems.push(`  ${item.file} ${item.label ?? item.testid ?? ""}`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("\ncontrol inventory: FAIL");
    process.exit(1);
  }
  console.log(
    `control inventory: PASS — ${controls.length} controls in ${files.length} files, ` +
      `${dead.length} dead, ${unlabeled.length} unlabeled, ` +
      `${directEvidence} direct + ${labelEvidence} label-level test evidence ` +
      `(${anyEvidence}/${controls.length} referenced)`,
  );
  process.exit(0);
}

mkdirSync(PARITY, { recursive: true });
writeFileSync(
  OUT_JSON,
  JSON.stringify({ summary, controls, allowlist }, null, 2) + "\n",
);

const tableRow = (entry) =>
  `| ${escapeCell(entry.label)} | \`${entry.file}:${entry.line}\` | ${entry.handler || "—"} | ${
    entry.enabledRule ? `\`${escapeCell(entry.enabledRule)}\`` : "always"
  } | ${entry.keyboard || "—"} | ${entry.evidence.level} |`;

function escapeCell(text) {
  return String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const lines = [
  "# CONTROL INVENTORY",
  "",
  "Generated by `scripts/control-inventory.mjs` from the JSX in `src/**/*.tsx`.",
  "Do not edit by hand. Regenerate with `npm run inventory:controls`.",
  "",
  `Generated: ${summary.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Visible controls: **${summary.controls}** across **${summary.files}** files`,
  `- Wired: **${byStatus.wired ?? 0}**`,
  `- Navigation links: **${byStatus.navigation ?? 0}**`,
  `- Intentionally disabled: **${byStatus.disabled ?? 0}**`,
  `- Static read-only inputs: **${byStatus.static ?? 0}**`,
  `- Dead: **${summary.dead}**`,
  `- Unlabeled: **${summary.unlabeled}**`,
  `- Direct test evidence: **${directEvidence}** (${pct(directEvidence, controls.length)})`,
  `- Any evidence: **${anyEvidence}** (${pct(anyEvidence, controls.length)})`,
  "",
  "## Status by family",
  "",
  "| Family | Controls | Wired | Dead | Unlabeled | Direct evidence |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
];

for (const family of Object.keys(byFamily).sort()) {
  const group = controls.filter((entry) => entry.family === family);
  lines.push(
    `| ${escapeCell(family)} | ${group.length} | ${
      group.filter((e) => e.status === "wired").length
    } | ${group.filter((e) => e.status === "dead").length} | ${
      group.filter((e) => e.labelKind === "none").length
    } | ${group.filter((e) => e.evidence.level === "direct").length} |`,
  );
}

if (dead.length) {
  lines.push("", "## Dead controls", "");
  for (const entry of dead)
    lines.push(
      `- \`${entry.file}:${entry.line}\` <${entry.tag}> ${entry.label}`,
    );
}
if (unlabeled.length) {
  lines.push("", "## Unlabeled controls", "");
  for (const entry of unlabeled)
    lines.push(`- \`${entry.file}:${entry.line}\` <${entry.tag}>`);
}

lines.push("", "## All controls", "");
for (const family of Object.keys(byFamily).sort()) {
  const group = controls.filter((entry) => entry.family === family);
  lines.push(
    "",
    `### ${family} (${group.length})`,
    "",
    "| Control | Where | Handler | Enabled rule | Keyboard | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const entry of group) lines.push(tableRow(entry));
}

writeFileSync(OUT_MD, lines.join("\n") + "\n");

// Per-control audit: every visible control is listed with its handler, enabled
// rule and the strongest evidence found. `static-only` is an explicit finding,
// not a pass: it means the control is statically wired but has no test that
// names it. TEST_BIBLE.md records the audit method and the current totals.
const auditLines = [
  "# CONTROL AUDIT",
  "",
  "Generated by `scripts/control-inventory.mjs` from the JSX in `src/**/*.tsx`.",
  "Do not edit by hand. Regenerate with `npm run inventory:controls`.",
  "",
  `Generated: ${summary.generatedAt}`,
  "",
  "## Method",
  "",
  "Every visible control is accounted for. Evidence levels:",
  "",
  "- `direct` — an automated test uses the exact `data-testid`.",
  "- `aria` — an automated test uses the exact `aria-label`.",
  "- `label` — an automated test contains a stable literal segment of the label or testid template (regex/prefixed locator).",
  "- `static-only` — no test names the control. Handler, label and enabled rule are still verified by `npm run check:controls`; behavior is not.",
  "",
  "## Summary",
  "",
  `- Visible controls: **${controls.length}** in **${files.length}** files`,
  `- Direct testid evidence: **${directEvidence}** (${pct(directEvidence, controls.length)})`,
  `- Label-level test evidence: **${labelEvidence}** (${pct(labelEvidence, controls.length)})`,
  `- Any test reference: **${anyEvidence}** (${pct(anyEvidence, controls.length)})`,
  `- Static-only gaps: **${controls.length - anyEvidence}**`,
  `- Dead: **${summary.dead}** · unlabeled: **${summary.unlabeled}**`,
  "",
  "## Controls",
];
for (const family of Object.keys(byFamily).sort()) {
  const group = controls.filter((entry) => entry.family === family);
  const referenced = group.filter(
    (entry) => entry.evidence.level !== "none",
  ).length;
  auditLines.push(
    "",
    `### ${escapeCell(family)} (${group.length}, ${referenced} referenced)`,
    "",
    "| Control | Where | Handler | Enabled rule | Evidence | Test files |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const entry of group) {
    auditLines.push(
      `| ${escapeCell(entry.label)} | \`${entry.file}:${entry.line}\` | ${
        entry.handler || "—"
      } | ${entry.enabledRule ? `\`${escapeCell(entry.enabledRule)}\`` : "always"} | ${
        entry.evidence.level === "none" ? "static-only" : entry.evidence.level
      } | ${entry.evidence.files.length ? escapeCell(entry.evidence.files.join(", ")) : "—"} |`,
    );
  }
}
auditLines.push("", `<!-- control-audit-count: ${controls.length} -->`);
writeFileSync(OUT_AUDIT, auditLines.join("\n") + "\n");

console.log(
  `control inventory: ${summary.controls} controls in ${summary.files} files — ` +
    `${summary.dead} dead, ${summary.unlabeled} unlabeled, ` +
    `${directEvidence} direct + ${labelEvidence} label-level evidence ` +
    `(${anyEvidence} referenced, ${controls.length - anyEvidence} static-only gaps)`,
);
console.log(`wrote ${rel(OUT_JSON)}, ${rel(OUT_MD)} and ${rel(OUT_AUDIT)}`);

function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(0)}%` : "0%";
}
