# Phase 7 — Test plan and acceptance evidence contract

Status: **Compiled, unexecuted.** No Phase 7 test has been run for this plan.
`PHASE7_REMAINING.md` stays at **0 of 42** until the evidence below exists.

This document is the concrete test trail for **Phase 7 — Configurations,
Variable Studio and FeatureScript**. It covers every checklist item in
`PHASE7_REMAINING.md`, including the three exit checks. It does not replace that
checklist and it does not upgrade a checkbox on code inspection alone.

The current working tree is treated as frozen for this test pass. If code
changes while executing this plan, rerun the affected case and replace the
evidence.

## 1. Rules for counting a Phase 7 test as passed

1. The named test must exist in the named file.
2. The command must exit `0`.
3. No relevant test may be skipped, `fixme`d or filtered out.
4. The assertion must exercise the behavior named in the checklist item, not a
   mock that bypasses it.
5. Save/reload evidence must come from an actual page reload or an actual
   document round-trip, not from reading the in-memory object back.
6. Browser evidence must include the test name, the viewport, and a screenshot
   or DOM assertion output for the final state.
7. Record the result in the evidence table in §10. A green test with no record
   is not evidence for this checklist.

## 2. Test files to create

None of these files exist yet. Create only these focused files; do not run the
whole Playwright suite for Phase 7.

| File                                                 | Purpose                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/phase7/__tests__/fixtures/phase7.ts`            | Shared document, variable, configuration, FeatureScript and assembly fixtures.                                                                         |
| `src/phase7/__tests__/phase7-expression.test.ts`     | `P7-VS-04`; shared expression/unit/diagnostic assertions.                                                                                              |
| `src/phase7/__tests__/phase7-variables.test.ts`      | `P7-VS-02` through `P7-VS-05`, `P7-VS-07`, `P7-VS-08` model half, `P7-VS-09` model half.                                                               |
| `src/phase7/__tests__/phase7-configurations.test.ts` | `P7-CF-01` through `P7-CF-09`, `P7-CF-11` model half, `P7-RT-03`/`P7-RT-05` model half.                                                                |
| `src/phase7/__tests__/phase7-featurescript.test.ts`  | `P7-FS-03`, `P7-FS-05` through `P7-FS-07`, `P7-FS-10` model half, `P7-FS-11`, `P7-FS-12`.                                                              |
| `src/phase7/__tests__/phase7-feature-studio.test.ts` | `P7-FS-04`, `P7-FS-08`, `P7-FS-09`, `P7-FS-13`, `P7-RT-04`.                                                                                            |
| `src/phase7/__tests__/phase7-roundtrip.test.ts`      | `P7-RT-01` through `P7-RT-05`, `P7-EXIT-01` model half.                                                                                                |
| `e2e/phase7-variable-studio.spec.ts`                 | `P7-VS-01`, `P7-VS-06`, `P7-VS-07` UI half, `P7-VS-09` UI half.                                                                                        |
| `e2e/phase7-configurations.spec.ts`                  | `P7-CF-03` UI half, `P7-CF-04`, `P7-CF-05` UI half, `P7-CF-07`, `P7-CF-08` UI half, `P7-CF-09` UI half, `P7-CF-10`, `P7-CF-11` UI half.                |
| `e2e/phase7-feature-studio.spec.ts`                  | `P7-FS-01` through `P7-FS-04`, `P7-FS-08` UI half, `P7-FS-09` UI half, `P7-FS-10` UI half, `P7-FS-11` UI half, `P7-FS-12` UI half, `P7-FS-13` UI half. |
| `e2e/phase7-exit.spec.ts`                            | `P7-EXIT-01`, `P7-EXIT-02`, `P7-EXIT-03`.                                                                                                              |

The Vitest config includes `src/**/*.test.ts`; the Playwright config includes
`e2e/*.spec.ts`. The suggested names match both configs.

## 3. Commands

Run these from the repository root, in this order. Do not substitute a whole
suite run for a focused failure.

```bash
npx tsc -p tsconfig.json --noEmit

npx vitest run \
  src/phase7/__tests__/phase7-expression.test.ts \
  src/phase7/__tests__/phase7-variables.test.ts \
  src/phase7/__tests__/phase7-configurations.test.ts \
  src/phase7/__tests__/phase7-featurescript.test.ts \
  src/phase7/__tests__/phase7-feature-studio.test.ts \
  src/phase7/__tests__/phase7-roundtrip.test.ts \
  --reporter=verbose

E2E_PORT=3407 npx playwright test e2e/phase7-variable-studio.spec.ts \
  --project=chromium --reporter=line --retries=0
E2E_PORT=3407 npx playwright test e2e/phase7-configurations.spec.ts \
  --project=chromium --reporter=line --retries=0
E2E_PORT=3407 npx playwright test e2e/phase7-feature-studio.spec.ts \
  --project=chromium --reporter=line --retries=0
E2E_PORT=3407 npx playwright test e2e/phase7-exit.spec.ts \
  --project=chromium --reporter=line --retries=0
```

Record the exact commands, exit codes and test counts. If the app cannot start,
record the failure as a Phase 7 blocker; do not mark the affected item passed.

## 4. Shared fixtures

Put these in `src/phase7/__tests__/fixtures/phase7.ts` and reuse them from the
browser specs through the public UI, not by importing app internals into the
test page.

### 4.1 Variable Studio fixture

```ts
const variables = [
  { name: "width", type: "length", expression: "80 mm", scope: "document" },
  {
    name: "height",
    type: "length",
    expression: "width * 2",
    scope: "document",
  },
  { name: "angle", type: "angle", expression: "45 deg", scope: "document" },
  { name: "enabled", type: "boolean", expression: "true", scope: "document" },
  { name: "label", type: "string", expression: '"frame"', scope: "document" },
  { name: "localOnly", type: "number", expression: "5", scope: "local" },
];
```

Cycle fixture: `a = b + 1`, `b = a + 1`.
Type-error fixture: `badLength` of type `length` with expression `true`.
Duplicate fixture: two variables named `width`, one uppercase `Width` (names are
case-insensitive for uniqueness).

### 4.2 Configuration fixture

Part Studio geometry:

```ts
window.__cadDebug!.scadgen!.box(80, 40, 10);
```

The box returns a feature id. Use that id as the target for a
`featureParameter` input on the extrude's `depth` parameter.

Three-row table:

| Row     | depth | material | vendor      | visible condition |
| ------- | ----: | -------- | ----------- | ----------------- |
| Default |    10 | aluminum | Base vendor | `true`            |
| Wide    |    20 | steel    | Wide vendor | `true`            |
| Tall    |    30 | steel    | Tall vendor | `depth > 20`      |

Use the exact row names `Default`, `Wide`, `Tall` in browser selectors.

Assembly fixture: one instance `inst_a`, one instance `inst_b`, and one nested
subassembly containing `inst_nested`. Use a mate `mate_a` with a numeric value.
The unit test must assert `inst_b`, `inst_nested`, and `mate_a` independently;
do not clone only the top level.

### 4.3 FeatureScript fixtures

Valid source (`FS_VALID`):

```featurescript
FeatureScript 1;

// Phase 7 fixture.
export feature FramePlate {
  label "Frame Plate";
  description "A parameterised mounting plate.";
  parameter width is length label "Width" description "Overall width" = 80 mm;
  parameter height is length label "Height" = 40 mm;
  parameter count is number label "Count" options ["1", "2", "4"] = 2;
  result = [width, height, count];
}
```

Broken source (`FS_BROKEN`), expected parse failure at line 4:

```featurescript
FeatureScript 1;
export feature Broken {
  parameter width is length = 10 mm;
  result = width + ;
}
```

Notice source (`FS_NOTICE`):

```featurescript
FeatureScript 2;
import("cloud::Frame") as Frame;
export feature Legacy {
  parameter width is length = 10 mm;
  result = debug(width);
}
```

Missing-API source (`FS_MISSING_API`):

```featurescript
FeatureScript 1;
export feature Missing {
  parameter width is length = 10 mm;
  result = notARealApi(width);
}
```

### 4.4 Pre-Phase-7 document fixture

```json
{
  "v": 1,
  "savedAt": 1700000000000,
  "nodes": [],
  "assets": []
}
```

It has no `phase7` key. Also create one fixture with a legacy `variable` feature
node:

```json
{
  "featureId": "Flegacy_var",
  "featureType": "variable",
  "name": "Legacy width",
  "parameters": [
    { "kind": "string", "parameterId": "varName", "value": "legacyWidth" },
    {
      "kind": "quantity",
      "parameterId": "value",
      "value": 0.0127,
      "units": "m",
      "expression": "12.7 mm"
    },
    { "kind": "enum", "parameterId": "varType", "value": "distance" }
  ],
  "subFeatures": [],
  "suppressed": false
}
```

## 5. Browser setup helpers

Use these exact entry points in all Phase 7 browser specs. They are stable and
already rendered by the app.

| Action                  | Selector                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Create a tab            | `getByTestId("document-tab-add")` then `getByTestId("document-tab-create-<kind>")`              |
| Variable Studio         | `getByTestId("variable-studio-workspace")`                                                      |
| Feature Studio          | `getByTestId("feature-studio-workspace")`                                                       |
| Add variable            | `getByRole("button", { name: "+ Add variable" })`                                               |
| Variable name           | `getByLabel("Variable name <name>")`                                                            |
| Variable type           | `getByLabel("Variable type <name>")`                                                            |
| Variable scope          | `getByLabel("Variable scope <name>")`                                                           |
| Variable expression     | `getByLabel("Variable expression <name>")`                                                      |
| Filter variables        | `getByLabel("Filter variables")`                                                                |
| Variable Apply/Cancel   | `getByRole("button", { name: "Apply" })` / `"Cancel"`                                           |
| Configurations          | `getByTestId("configurations-toggle")` then `getByTestId("configuration-panel")`                |
| Config table select     | `getByLabel("Active configuration table")`                                                      |
| Add table               | `getByRole("button", { name: "+ Table" })`                                                      |
| Add input               | `getByRole("button", { name: "+ Add input" })`                                                  |
| Add row                 | `getByRole("button", { name: "+ Add row" })`                                                    |
| Input kind              | `getByLabel("Configuration input kind")`                                                        |
| Target feature          | `getByLabel("Configuration target feature")`                                                    |
| Target parameter        | `getByLabel("Configuration target parameter")`                                                  |
| Target name             | `getByLabel("Configuration target name")`                                                       |
| Activate row            | `getByLabel("Activate <row name>")`                                                             |
| Condition               | `getByRole("button", { name: "+ Condition" })`, `getByLabel("Visibility condition expression")` |
| Feature Studio source   | `getByLabel("FeatureScript source")`                                                            |
| Compile and apply       | `getByRole("button", { name: "Compile & apply" })`                                              |
| Insert custom feature   | `getByRole("button", { name: "Insert" })`                                                       |
| Feature tree row        | `locator('[data-feature-id="<featureId>"]')`                                                    |
| Drawing BOM description | `getByLabel("BOM description <row key>")`                                                       |
| Reload                  | `page.reload()`, then wait for `cad-canvas` again                                               |

Every browser case starts with `loadAppReady(page)` from `e2e/helpers.ts` and
sets a deterministic viewport (`1800 × 1200`) before creating tabs.

## 6. Acceptance cases

### A. Variable Studio — 9 items

#### P7-VS-01 — First-class Variable Studio tab

**Test:** `P7T-VS-01` — Playwright, `e2e/phase7-variable-studio.spec.ts`.

**Steps**

1. Load the app and create a Variable Studio with the tab menu.
2. Add `tabProbe` as a length with value `10 mm`; Apply.
3. Rename the tab to `Variables A` through the tab menu.
4. Duplicate, switch to the copy, then delete the copy.
5. Reload the page and reopen the tab.

**Expected:** the tab has a real workspace, not a disabled entry. The name,
variable and value survive reload. Duplicating creates an independent tab;
deleting it leaves the original tab intact.

**Evidence:** tab count/name, workspace screenshot, value after reload.

#### P7-VS-02 — Document-level variable model and migration

**Test:** `P7T-VS-02` — Vitest, `phase7-variables.test.ts`.

**Assertions**

- Explicit IDs remain byte-identical through
  `serializeVariableStudio` → `parseVariableStudio`.
- Parsing legacy variables without IDs produces deterministic
  `var_legacy_*` IDs; parsing twice returns the same IDs.
- `migrateSketchVariables` copies `name`, type, `expression` and value without
  rounding; a second migration reports `skipped` and does not create a duplicate.
- `collectDocumentVariables` publishes only `scope: "document"` values.
  `scope: "local"` values stay inside their studio.
- Two studios declaring the same document name produce a named issue containing
  both studio names; no last-one-wins value is published.

**Evidence:** exact output values and issue messages.

#### P7-VS-03 — Typed variables

**Test:** `P7T-VS-03` — Vitest, `phase7-variables.test.ts`.

For each type (`number`, `length`, `angle`, `boolean`, `string`):

- create and resolve a valid expression;
- assert the `P7Value.kind`;
- assert display output (`80 mm`, `45 deg`, `true`, `"frame"`, `3`);
- replace the expression with an incompatible type and assert a
  `variables.type` diagnostic;
- round-trip the studio and assert the type and expression are unchanged.

Also assert `p7DisplayNumber` converts lengths to inches and angles to radians,
and that an incompatible value is not silently coerced.

#### P7-VS-04 — Expression engine completion

**Test:** `P7T-VS-04` — Vitest, `phase7-expression.test.ts`.

Success table:

| Expression                       | Expected          |
| -------------------------------- | ----------------- |
| `1 + 2 * 3`                      | number `7`        |
| `(1 + 2) * 3`                    | number `9`        |
| `-2 + 3`                         | number `1`        |
| `1 mm + 2 cm`                    | length `0.021` m  |
| `1 in + 1 in`                    | length `0.0508` m |
| `sin(90 deg)`                    | number `1`        |
| `sqrt(9)`                        | number `3`        |
| `min(4, 2, 8)`                   | number `2`        |
| `max(4, 2, 8)`                   | number `8`        |
| `abs(-3)`                        | number `3`        |
| `pow(2, 3)`                      | number `8`        |
| `clamp(5, 1, 4)`                 | number `4`        |
| `width / 2` with `width = 80 mm` | length `0.04` m   |

Error table:

- `1 +` → parse diagnostic, line/column present.
- `missingName` → `expression.unknownIdentifier`.
- `1 mm + 1` → type diagnostic.
- `!1` → type diagnostic.
- `sqrt("text")` → argument/type diagnostic.
- malformed unit (`1 zz`) → parse or unknown-unit diagnostic.

Also assert `identifiersInP7Expression` excludes units, `true`, `false`, `pi`
and built-ins, and `collectP7Identifiers` returns each named reference once.

#### P7-VS-05 — Scope and unit resolution

**Test:** `P7T-VS-05` — Vitest, `phase7-variables.test.ts` plus
`phase7-configurations.test.ts`.

**Assertions**

- Duplicate names are case-insensitive and reported by
  `validateVariableStudio` and `createStudioVariable`.
- A `length` variable cannot accept a boolean/string; an `angle` cannot accept a
  bare string. Each failure names the variable and both types.
- Document-scope values are published once; local values are not.
- `configurationVariableScope` preserves a base `length` or `angle` kind when
  the configuration value is numeric. A numeric override for a length is not
  converted into a unitless number.
- `withConfigurationVariables(base, override)` makes the configuration value win
  without mutating `base`.
- A configuration variable target that does not exist in the document scope is
  reported by `validateConfigurationTable(table, nodes, variableNames)`.

#### P7-VS-06 — Variable table UI

**Test:** `P7T-VS-06` — Playwright, `e2e/phase7-variable-studio.spec.ts`.

**Steps**

1. Open a Variable Studio and add three variables using the UI.
2. Set `width` length `80 mm`, `height` length `width * 2`, `enabled` boolean
   `true`, `localOnly` number `5` local using the name/type/scope/expression
   controls.
3. Reorder `height` above `width`; assert the row order changed.
4. Filter for `height`; assert only matching rows are visible.
5. Edit an expression, click Cancel, and assert the draft reverted.
6. Reapply the edit, click Apply, reload, and assert values and scopes survive.
7. Assert disabled-state reasons: the last delete action is disabled, a
   read-only document disables Apply, and a duplicate name shows a message
   rather than applying.

**Expected:** every table operation changes the draft only; Apply publishes it;
Cancel restores the applied document; reload preserves applied state.

#### P7-VS-07 — Dependency display and where-used navigation

**Test:** `P7T-VS-07` — Vitest plus Playwright.

**Unit:** create `a = 1`, `b = a + 1`, `c = b + 1`, `d = c + 1`, `e = a + 1`.

- `a` direct dependencies: none.
- `a` transitive used-by: `b`, `e`, `c`, `d` (order deterministic by variable
  order).
- `d` transitive dependencies: `c`, `b`, `a`.
- Cycle fixture `x = y`, `y = x` produces a `variables.cycle` diagnostic and a
  non-empty `cycles` list.
- `variableRowsForDisplay` carries dependency/error strings.

**Browser:** select `a`; assert the Direct/Transitive/Used-by panels show the
names above. Click `c`; assert the details panel switches to `c` and its
dependencies. Do not click a dependency and leave the old selection visible.

#### P7-VS-08 — Variable propagation

**Test:** `P7T-VS-08` — Vitest integration plus Playwright persistence.

**Model integration**

1. `setDocumentVariableValues({ width: lengthValueMM(80) })`.
2. Build a real box/extrude node, replace the extrude depth expression with
   `"width"`, attach the nodes to `scadgenHistory`, and attach the executor.
3. Rebuild and assert the resulting body depth/bounds is `0.08 m`.
4. Set `width` to `120 mm`, call `requestRebuild`, and assert the rebuilt body
   depth is `0.12 m`.
5. Clear the values and assert the base/default depth is used.

The test must fail if only `documentVariableScope()` is asserted; it must observe
a rebuilt consumer.

**Browser:** create a Variable Studio and a Part Studio in one document, make a
consumer that uses `width`, change `width`, reload, and assert the consumer's
result and the Variable Studio value both persisted. If the current UI cannot
author an expression-linked feature parameter, record that as an implementation
blocker instead of downgrading the test to a scope-only pass.

#### P7-VS-09 — Variable undo and persistence

**Test:** `P7T-VS-09` — Playwright plus Vitest round-trip.

**Browser**

1. Add `width`, edit to `80 mm`, press local Undo, assert the prior expression.
2. Press Redo, apply, reload, assert value/type/scope.
3. Switch to another tab and back; assert values and dependency links.
4. Repeat with a name change and a scope change.

**Unit:** save/reload preserve stable IDs, order, values, types, scopes,
expressions and dependency links. Project-level undo restores the document
without leaving stale document-scope values.

### B. Configurations — 11 items

#### P7-CF-01 — Configuration schema

**Test:** `P7T-CF-01` — Vitest, `phase7-configurations.test.ts`.

- `emptyConfigurationTable` has schema, version `1`, a default row and one
  active row.
- Build a table with inputs, rows, values and conditions; serialize, parse and
  compare canonical JSON.
- `configurationTablesRoundTrip` succeeds.
- A future version and malformed JSON fail with named errors; no partial table
  is accepted.
- Stable IDs survive parse/serialize.

#### P7-CF-02 — Part Studio configuration inputs

**Test:** `P7T-CF-02` — Vitest plus browser smoke.

For every `ConfigurationInputKind`:

- feature parameter;
- variable;
- feature suppression;
- feature visibility;
- property;
- material;
- vendor;
- BOM field;
- assembly instance visibility;
- assembly instance suppression;
- mate value.

Add the input through `addConfigurationInput`, set a non-default value in a row,
and assert:

- `configurationOverrides` places the value in the correct override map;
- `applyConfigurationToNodes` changes only the target parameter/feature;
- an unknown target, missing parameter, duplicate input, empty option and
  duplicate option are named errors.

Browser smoke: add one feature-parameter input targeting the box extrude depth
and one BOM material input; assert the columns appear and the row value commits.

#### P7-CF-03 — Configuration table editing

**Test:** `P7T-CF-03` — Vitest plus Playwright.

**Unit:** add/duplicate/delete/reorder rows and columns; set default; reject
empty/duplicate option names; reject deleting the last row; verify stable IDs
and value carry-over on duplicate.

**Browser:** create a table, add a feature input, add two rows, duplicate a row,
copy/paste it, reorder it, set Default, rename a row and edit its description.
Reload and assert the table/rows/order/default survive.

#### P7-CF-04 — Part Studio configurations

**Test:** `P7T-CF-04` — Playwright plus model check.

Create three rows `Default`, `Wide`, `Tall` with extrude depths `10`, `20`, `30`.
Activate each row and assert:

- the scene reports a distinct body bounding box for each row;
- the base history is unchanged before switching;
- returning to `Default` restores the original bounds and suppression states;
- no row mutates the base nodes array.

Use `describeScene().bodies[].bbox` or the existing geometry digest; do not infer
geometry from the table values alone.

#### P7-CF-05 — Assembly configurations

**Test:** `P7T-CF-05` — Vitest, `phase7-configurations.test.ts`.

Use the assembly fixture in §4.2. Add inputs for `inst_a` visibility,
`inst_b` suppression, `inst_nested` visibility and `mate_a` value.

- `applyConfigurationToAssembly` updates the top-level and nested instances.
- The base assembly and its nested subassembly are not mutated.
- `assemblyBom` on the configured assembly excludes suppressed/hidden instances
  according to existing BOM rules.
- `applyConfigurationToBomRows` applies material/vendor/description overrides.
- Three rows produce three distinct BOM row sets or field values.

Repeat against a cloned subassembly to prove recursion. Browser smoke may use
the benchmark assembly, but the authoritative comparison is the unit/BOM
fixture because the configuration panel is shared from the Part Studio.

#### P7-CF-06 — Property and BOM configurations

**Test:** `P7T-CF-06` — Vitest.

- Build a base BOM row with material/vendor/name/number/description/revision.
- Add `property`, `material`, `vendor` and `bomField` inputs.
- Assert row override wins over base metadata (`resolveConfiguredProperty` and
  `applyConfigurationToBomRow`).
- Assert an unset row value falls back to the input default, then to base.
- Round-trip the table and reapply; values and precedence are unchanged.
- Verify the configured values appear in both the assembly BOM and drawing BOM
  consumers (drawing half in `P7T-CF-07`).

#### P7-CF-07 — Configured tabs and drawings

**Test:** `P7T-CF-07` — Playwright, `e2e/phase7-configurations.spec.ts`.

1. Create a Part Studio box and a configuration table with `Default` and `Wide`.
2. Create an assembly from the source body; add the configured BOM fields.
3. Create a drawing linked to the assembly; enable the BOM table.
4. Activate `Wide`; assert the drawing BOM description/material/vendor reflect
   the configured values, not the base row.
5. Switch to another Part Studio tab, activate a different row, return, and
   assert the per-tab selection is restored.
6. Reload and assert the active configuration and drawing BOM selection survive.

Use `BOM description <key>`, `BOM material <key>` and `BOM vendor <key>` labels.
The drawing must consume the selected configuration, not the base values.

#### P7-CF-08 — Visibility conditions

**Test:** `P7T-CF-08` — Vitest truth table plus Playwright.

Condition truth table:

| Row value    | Condition     | Expected               |
| ------------ | ------------- | ---------------------- |
| `depth = 10` | `depth > 20`  | hidden                 |
| `depth = 30` | `depth > 20`  | visible                |
| `true`       | `true`        | visible                |
| `true`       | `1`           | diagnostic, hidden     |
| `true`       | `missingName` | diagnostic, hidden     |
| `true`       | `` (empty)    | visible, no diagnostic |

Apply to feature, assembly-instance, BOM-row and annotation targets. Assert
`applyConfigurationToNodes` sets hidden/suppressed, `applyConfigurationToAssembly`
sets visible/suppressed, and `applyConfigurationConditionsToBomRows` removes
hidden rows without mutating the base.

**Browser:** add `+ Condition`, target the box feature, set `depth > 20`, assert
the row shows `hidden` for `Default` and `visible` for `Tall`; set `1` and assert
a localized red error appears; delete the condition and assert the feature is
restored.

#### P7-CF-09 — Non-destructive switching

**Test:** `P7T-CF-09` — Vitest plus Playwright.

- Snapshot base nodes, assembly and BOM rows.
- Apply `Wide`; apply `Tall`; apply `Default`.
- Assert deep equality with the base snapshot after each switch back.
- Assert no partial transform, suppression, hidden flag or BOM override remains.
- Assert a failed activation (missing table/row) leaves the current state
  unchanged.

**Browser:** switch Default → Wide → Default and compare body count, bounds,
feature suppression/visibility and BOM text. A switch is not passed if only the
active radio changes.

#### P7-CF-10 — Configuration UI

**Test:** `P7T-CF-10` — Playwright.

Create a table; add a feature-parameter input and a BOM input; add rows; edit
name/description; duplicate/copy/paste/delete rows; move columns; set default;
activate rows. Assert every control has a visible label or title and disabled
actions explain why they are disabled. Reload and assert the table editor
restores the same state.

#### P7-CF-11 — Configuration validation and undo

**Test:** `P7T-CF-11` — Vitest plus Playwright.

Validation matrix:

- duplicate input key;
- missing feature/parameter/variable target;
- default value of the wrong type;
- empty or duplicate options;
- duplicate row/input IDs;
- missing variable target when `variableNames` is supplied;
- a variable whose studio chain is cyclic (integration with `resolveVariableStudio`).

Assert each issue has a path/message and no geometry mutation occurs.

**Undo/autosave:** edit a table, Undo, Redo; reload; assert the final table and
active row. Every edit must participate in the editor undo stack and in
`persistProject`.

### C. FeatureScript and Feature Studio — 13 items

#### P7-FS-01 — First-class Feature Studio tab

**Test:** `P7T-FS-01` — Playwright, `e2e/phase7-feature-studio.spec.ts`.

Create, rename, duplicate, delete and switch a Feature Studio tab; reload.
Assert the source and custom-feature registry survive. The tab must be a real
workspace (`feature-studio-workspace`), not a disabled menu item.

#### P7-FS-02 — Source editor

**Test:** `P7T-FS-02` — Playwright.

- Assert the line-number gutter grows with the source.
- Assert the highlighted `<pre>` contains keyword/string/number spans.
- Press Ctrl+Space after a prefix and assert the completion list appears; choose
  an item and assert it is inserted at the caret.
- Hover a keyword and assert its documentation tooltip appears.
- Type in Find and assert the matching-line count updates.
- Use Ctrl+Z / Ctrl+Shift+Z and assert the textarea source changes.

Do not assert only that the textarea exists.

#### P7-FS-03 — Diagnostics

**Test:** `P7T-FS-03` — Vitest plus Playwright.

Parse error: `FS_BROKEN` line 4. Type/evaluation errors: wrong parameter type and
unknown identifier. For each diagnostic assert severity, code, line, column and
message. In the browser, assert the diagnostics panel lists the error; click it
and assert the editor selection moves to that line/column. The document must
remain loadable and the last good registry must remain visible.

#### P7-FS-04 — Local source history

**Test:** `P7T-FS-04` — Vitest plus Playwright.

- Apply valid source v1, then v2; assert two versions with distinct IDs/hashes.
- Restore v1; assert source and compiled features revert while v2 remains in
  history.
- Apply 51 valid changes; assert only the latest `MAX_FEATURE_STUDIO_VERSIONS`
  (50) are retained.
- Reload and assert history IDs, labels, hashes and source survive.
- Restore an unknown version ID and assert a named diagnostic.

#### P7-FS-05 — Lexer/parser/AST

**Test:** `P7T-FS-05` — Vitest, `phase7-featurescript.test.ts`.

Corpus:

- valid `FS_VALID`;
- comments (`//`), strings with escapes, numbers with units;
- identifiers, calls, arithmetic/comparison/logical operators;
- imports, consts, functions, feature declarations;
- invalid: missing `;`, unmatched brace, bad parameter type, duplicate feature,
  unterminated string.

For each valid program assert declarations and source spans; for each invalid
program assert at least one diagnostic with a span. Do not use `eval` or a
regex-only pass as the oracle.

#### P7-FS-06 — Type checker and evaluator

**Test:** `P7T-FS-06` — Vitest.

Use a table of numbers, lengths, angles, booleans, strings, lists, functions and
scopes. Assert deterministic results for `min`, `max`, `abs`, `sqrt`, trig,
`size`, `vector`, `toString`, `round`, `floor`, `ceil`, `pow`, `clamp` and user
functions. Assert named errors for wrong arity, wrong type, unknown identifier,
unknown API and a function body that references an undefined name. Check exact
line/column for at least two failures.

#### P7-FS-07 — Standard library and custom-feature declarations

**Test:** `P7T-FS-07` — Vitest.

Assert `FS_VALID` compiles to one feature with:

- stable feature ID;
- `label`, `description`, parameter labels/descriptions/options;
- defaults `80 mm`, `40 mm`, `2`;
- result `[0.08 m, 0.04 m, 2]`;
- `sourceHash` equal to `hashString(source)`;
- no parse/type/evaluation diagnostics.

Pure evaluation must pass without a kernel. Kernel geometry execution is the
separate `P7-EXIT-02` gate and must not be inferred from this test.

#### P7-FS-08 — Custom feature registration

**Test:** `P7T-FS-08` — Vitest plus Playwright.

- Compile `FS_VALID`; assert the feature is registered once with a stable ID and
  parameter schema/defaults.
- Recompile identical source; assert the ID/source hash are stable and no
  duplicate appears.
- Recompile changed source; assert a new source hash and stale-definition
  detection for old nodes.
- Browser: click Insert; assert the button is disabled before Compile & apply,
  enabled after, and Apply/Cancel on the custom feature panel behave correctly.

#### P7-FS-09 — Custom feature insertion

**Test:** `P7T-FS-09` — Playwright plus Vitest.

Open a Part Studio, create a Feature Studio, compile `FS_VALID`, click Insert.
Assert:

- a `customFeature` node is appended to the Part Studio history;
- the node has `definitionId`, `sourceHash`, `sourceVersionId`, parameter values
  and an `extensions.featureScript` result/diagnostics payload;
- a `[data-feature-id]` tree row appears after switching back;
- reload preserves the row and its stable IDs.

Deleting the Feature Studio tab must not silently delete the inserted row; the
panel should report the missing definition.

#### P7-FS-10 — Custom feature edit and rebuild

**Test:** `P7T-FS-10` — Playwright plus Vitest.

- Select the inserted feature row; open `custom-feature-panel`.
- Change a length and count; Apply; assert the tree row keeps its feature ID and
  the stored parameter values/result change.
- Undo; assert values and result revert.
- Suppress and unsuppress; roll back and forward; assert unrelated features are
  unchanged.
- Edit the source to a new hash; assert the old node shows the stale warning and
  Apply is disabled until the definition is updated.

#### P7-FS-11 — Localized custom-feature errors

**Test:** `P7T-FS-11` — Vitest plus Playwright.

Insert a feature built from `FS_VALID`, then break the Feature Studio source.
Assert:

- the Feature Studio diagnostics show line/column;
- the selected custom-feature panel shows the source diagnostics with
  line/column;
- the feature row stays present and linked;
- the document still reloads;
- no partial geometry or parameter mutation occurs.

Also assert the missing-definition path: delete the Feature Studio tab, reopen
the row, and assert “Custom feature unavailable” (or the named equivalent)
instead of a crash.

#### P7-FS-12 — Notices and compatibility

**Test:** `P7T-FS-12` — Vitest plus Playwright.

Using `FS_NOTICE` and `FS_MISSING_API`, assert visible notices for:

- version mismatch (`FeatureScript 2` vs local 1);
- import resolved against local stdlib;
- deprecated `debug` API;
- missing FeatureScript API name;
- broken source retaining the last good registry;
- source without a version header.

The notices must be non-empty and appear in the Feature Studio notice area, not
only in a console log.

#### P7-FS-13 — Source import/export and persistence

**Test:** `P7T-FS-13` — Playwright plus Vitest.

Browser: import a `.fs` file through the file chooser; assert source, label and
diagnostics update. Export; read the download and assert it equals
`featureStudioSourceFile(studio)` with a trailing newline. Apply and reload.

Unit: `featureStudioRoundTrip` returns canonical equality for source, versions,
compiled features and metadata. Import CRLF source and assert it normalizes to
LF without changing the hash of the normalized text.

### D. Migration, round-trip and evidence — 6 items

#### P7-RT-01 — Schema migration

**Test:** `P7T-RT-01` — Vitest, `phase7-roundtrip.test.ts`.

Load the pre-Phase-7 fixture with no `phase7` key; assert:

- nodes, parts and assets are unchanged;
- `scadgenPhase7Part.restore(undefined)` yields empty tables, null active IDs and
  null base;
- missing `configurations`/`base` fields become explicit defaults;
- an older version is migrated, a future version is refused;
- the legacy variable node is migrated without altering its expression/value.

#### P7-RT-02 — Variable Studio round-trip

**Test:** `P7T-RT-02` — Vitest plus Playwright.

Assert types, expressions, resolved values, scopes, order, stable IDs and
dependency links survive:

- serialize/parse;
- `saveDocument`/load through the document store;
- tab switch and reload;
- local undo/redo and project undo.

#### P7-RT-03 — Configuration round-trip

**Test:** `P7T-RT-03` — Vitest plus Playwright.

Assert inputs, tables, rows, defaults, active row, visibility conditions and
per-tab selection survive save/reload and tab switch. Include a condition with a
diagnostic; it must survive as invalid, not be silently dropped or coerced.

#### P7-RT-04 — Feature Studio round-trip

**Test:** `P7T-RT-04` — Vitest plus Playwright.

Assert source, source hash, version history, compiled custom features, notices,
diagnostics and references survive save/reload. Insert a custom feature first;
after reload assert its `sourceHash`/`sourceVersionId` still match the studio.

#### P7-RT-05 — Cross-tab references

**Test:** `P7T-RT-05` — Vitest plus Playwright.

Create stable links between:

- a configuration variable input and a Variable Studio variable;
- a custom feature row and a Feature Studio definition;
- a drawing/assembly and its source Part Studio;
- a tab selection and its configuration row.

Then delete or rename each target and assert a named error in the consumer. No
fallback to an empty value, no silent base geometry, no crash. Recreate the
target and verify the link recovers only when the stable ID matches.

#### P7-RT-06 — Acceptance evidence

**Test:** `P7T-RT-06` — Evidence audit, not a single test.

This item passes only when §10 is filled with executed evidence for all 42
items, the focused unit/browser commands exited `0`, and the parity matrix rows
`4.3.27`, `4.3.28`, `4.3.29` have been updated **after** that evidence. Do not
check this item from code presence.

### E. Phase 7 exit evidence — 3 items

#### P7-EXIT-01 — Three-configuration part family

**Test:** `P7T-EXIT-01` — Playwright, `e2e/phase7-exit.spec.ts`.

Build one Part Studio box, one assembly and one drawing. Create three rows:
`Default` (depth 10, aluminum, vendor A), `Wide` (depth 20, steel, vendor B),
`Tall` (depth 30, steel, vendor C). For each row capture:

- body count, bounding box and feature states;
- assembly BOM rows (material/vendor/description);
- drawing BOM rows and export verification.

Save/reload between rows. Return to Default and assert byte-equivalent base
geometry/BOM, no leftover suppression or hidden rows. Three rows must produce
three distinct results, not just three active labels.

#### P7-EXIT-02 — Authored custom feature

**Test:** `P7T-EXIT-02` — Playwright plus kernel check.

Author `FS_VALID` in Feature Studio, compile, insert, edit width/count, apply,
suppress/unsuppress, undo, reload. The inserted feature must rebuild geometry
from the edited values and survive reload with its definition/source hash.

**Kernel boundary:** pure parser/evaluator tests do not satisfy this exit. If the
current build only inserts metadata and does not execute custom-feature geometry,
record this as a failed exit gate with the exact missing executor path. Do not
mark `P7-FS-07` or `P7-EXIT-02` complete from a metadata-only insertion.

#### P7-EXIT-03 — Error integrity

**Test:** `P7T-EXIT-03` — Playwright plus Vitest.

Load `FS_BROKEN`, compile it, and assert:

- the error names line 4 and a column;
- the last good feature registry is retained;
- the document remains loadable and reloads without partial geometry;
- fixing the source clears the diagnostic and restores insertion.

Also inject a corrupt Feature Studio payload and a corrupt configuration payload;
assert named recovery, no crash, and no silent data loss.

## 7. Negative and edge-case matrix

These cases are required in addition to the item tests above.

| Case                                      | Expected                                    |
| ----------------------------------------- | ------------------------------------------- |
| Duplicate variable name (`width`/`Width`) | named duplicate error, no apply             |
| Invalid identifier (`2width`)             | named name error                            |
| Empty expression                          | named expression error                      |
| Type mismatch                             | named expected/actual type error            |
| Variable cycle                            | `variables.cycle`, dependent values omitted |
| Duplicate config input key                | named duplicate input error                 |
| Missing feature/parameter target          | named target error                          |
| Empty/duplicate options                   | named option errors                         |
| Configuration default type mismatch       | named default error                         |
| Non-boolean visibility condition          | localized visibility error, target hidden   |
| Missing variable target in config         | named variable reference error              |
| Future schema version                     | refused, no partial state                   |
| Corrupt JSON                              | named parse error, document loadable        |
| Missing custom-feature definition         | unavailable panel, row retained             |
| Stale custom-feature source               | stale warning, Apply disabled               |
| Missing FeatureScript API                 | unknown identifier + compatibility notice   |
| Imported source with CRLF                 | normalized LF, deterministic hash           |
| Read-only document                        | all mutating controls disabled with reasons |

## 8. Evidence to capture per test

Store artifacts under `test-results/phase7/` (create the directory only when
running tests).

- Unit: Vitest output, test count, failed assertion text if any.
- Browser: Playwright trace on failure; screenshots at the final state for
  `P7-VS-06`, `P7-CF-10`, `P7-FS-02`, `P7-FS-09`, `P7-EXIT-01` and
  `P7-EXIT-02`.
- Save/reload: downloaded document JSON or a `page.evaluate` dump of the
  persisted tab designs; do not use the in-memory React state.
- Geometry: `describeScene()` body count, bbox and states before/after.
- BOM: row key, material, vendor, description and quantity before/after.
- Diagnostics: code, severity, line, column and message.

## 9. Execution order

1. `P7T-VS-02`–`P7T-VS-05` and `P7T-VS-07` (model/expression first).
2. `P7T-VS-01`, `P7T-VS-06`, `P7T-VS-09`.
3. `P7T-VS-08` propagation.
4. `P7T-CF-01`–`P7T-CF-09`; then `P7T-CF-10`–`P7T-CF-11`.
5. `P7T-FS-05`–`P7T-FS-07`; then `P7T-FS-01`–`P7T-FS-04` and
   `P7T-FS-08`–`P7T-FS-13`.
6. `P7T-RT-01`–`P7T-RT-05`; then `P7T-RT-06` evidence audit.
7. `P7T-EXIT-01` and `P7T-EXIT-03`; `P7T-EXIT-02` last because it owns the
   kernel boundary.

Do not upgrade `parity/matrix.json` or `PHASE7_REMAINING.md` before its named
evidence is recorded.

## 10. Evidence ledger

Fill one row per checklist item after execution. Leave `Result` empty until the
test actually runs.

| Item       | Test ID     | Command | Result | Evidence artifact |
| ---------- | ----------- | ------- | ------ | ----------------- |
| P7-VS-01   | P7T-VS-01   |         |        |                   |
| P7-VS-02   | P7T-VS-02   |         |        |                   |
| P7-VS-03   | P7T-VS-03   |         |        |                   |
| P7-VS-04   | P7T-VS-04   |         |        |                   |
| P7-VS-05   | P7T-VS-05   |         |        |                   |
| P7-VS-06   | P7T-VS-06   |         |        |                   |
| P7-VS-07   | P7T-VS-07   |         |        |                   |
| P7-VS-08   | P7T-VS-08   |         |        |                   |
| P7-VS-09   | P7T-VS-09   |         |        |                   |
| P7-CF-01   | P7T-CF-01   |         |        |                   |
| P7-CF-02   | P7T-CF-02   |         |        |                   |
| P7-CF-03   | P7T-CF-03   |         |        |                   |
| P7-CF-04   | P7T-CF-04   |         |        |                   |
| P7-CF-05   | P7T-CF-05   |         |        |                   |
| P7-CF-06   | P7T-CF-06   |         |        |                   |
| P7-CF-07   | P7T-CF-07   |         |        |                   |
| P7-CF-08   | P7T-CF-08   |         |        |                   |
| P7-CF-09   | P7T-CF-09   |         |        |                   |
| P7-CF-10   | P7T-CF-10   |         |        |                   |
| P7-CF-11   | P7T-CF-11   |         |        |                   |
| P7-FS-01   | P7T-FS-01   |         |        |                   |
| P7-FS-02   | P7T-FS-02   |         |        |                   |
| P7-FS-03   | P7T-FS-03   |         |        |                   |
| P7-FS-04   | P7T-FS-04   |         |        |                   |
| P7-FS-05   | P7T-FS-05   |         |        |                   |
| P7-FS-06   | P7T-FS-06   |         |        |                   |
| P7-FS-07   | P7T-FS-07   |         |        |                   |
| P7-FS-08   | P7T-FS-08   |         |        |                   |
| P7-FS-09   | P7T-FS-09   |         |        |                   |
| P7-FS-10   | P7T-FS-10   |         |        |                   |
| P7-FS-11   | P7T-FS-11   |         |        |                   |
| P7-FS-12   | P7T-FS-12   |         |        |                   |
| P7-FS-13   | P7T-FS-13   |         |        |                   |
| P7-RT-01   | P7T-RT-01   |         |        |                   |
| P7-RT-02   | P7T-RT-02   |         |        |                   |
| P7-RT-03   | P7T-RT-03   |         |        |                   |
| P7-RT-04   | P7T-RT-04   |         |        |                   |
| P7-RT-05   | P7T-RT-05   |         |        |                   |
| P7-RT-06   | P7T-RT-06   |         |        |                   |
| P7-EXIT-01 | P7T-EXIT-01 |         |        |                   |
| P7-EXIT-02 | P7T-EXIT-02 |         |        |                   |
| P7-EXIT-03 | P7T-EXIT-03 |         |        |                   |

## 11. Phase 7 tie-off gate

Phase 7 can be marked complete only when all of these are true:

- [ ] All 42 checklist items have executed evidence in §10.
- [ ] Focused Vitest command exits `0`.
- [ ] All four focused Playwright specs exit `0`.
- [ ] `npx tsc -p tsconfig.json --noEmit` exits `0`.
- [ ] Save/reload evidence exists for Variable Studio, configurations,
      Feature Studio and the three-configuration part family.
- [ ] The three exit scenarios pass, including the kernel-backed custom-feature
      rebuild.
- [ ] `parity/matrix.json` rows `4.3.27`, `4.3.28`, `4.3.29` are updated only
      from that evidence.
- [ ] `PHASE7_REMAINING.md` checkboxes are updated only after the evidence row is
      filled.

Until then, this document is a test contract, not a completion claim.
