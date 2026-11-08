# Phase 7 — Configurations, Variable Studio and FeatureScript

Status: **Not started as a phase. 0 of 42 counted items complete.**

This document is the Phase 7 completion checklist. An item is checked only when
the implementation exists, its named acceptance check has run, and the evidence
is recorded here. A workstream heading is not a completion item.

Test contract: `PHASE7_TEST_PLAN.md` — compiled, unexecuted. It covers all 42
items and the three exit gates; it does not change the count below.

## Scope resolution

The current parity contract defines Phase 7 as **Configurations, Variable Studio
and FeatureScript**:

- `ONSHAPE_PARITY.md` §“Phase 7”, lines 999–1027.
- `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md` §11.
- Matrix rows `4.3.27` Configurations, `4.3.28` Variables, `4.3.29`
  FeatureScript/custom features.

Two other documents use “Phase 7” for unrelated subsystem plans:

- `SCADGEN_MASTER_PLAN.md` — Phase 7 Voice Layer.
- `SCADGEN_SUBSYSTEMS_PLAN.md` / `UNDONE.md` — Phase 7 Flux Parity.

They are **not** part of this count. Voice and Flux have their own plans and
tests.

Phase 7 depends on Phases 3 and 4 per the parity contract. Phase 6 remains a
separate open phase (32/67) and is not claimed here.

## Exact completion count

| Workstream                            |  Items |
| ------------------------------------- | -----: |
| A. Variable Studio                    |      9 |
| B. Configurations                     |     11 |
| C. FeatureScript and Feature Studio   |     13 |
| D. Migration, round-trip and evidence |      6 |
| E. Phase 7 exit evidence              |      3 |
| **Total**                             | **42** |
| — of which implementation             |     39 |
| — of which exit evidence              |      3 |

**Phase 7 completion requires all 42 items.** The 39 implementation items are
not optional polish: the three exit checks cannot pass without them.

## Current baseline — what exists, and why it does not count

Audited from the working tree on 2026-11-07.

- `src/document/model.ts` already has `variablestudio` and `featurestudio` tab
  kinds and labels, but `DocumentTabBar.tsx` keeps both creation entries
  disabled. DocumentsPage can list the kinds; there is no workspace behind them.
- `src/model/variables.ts` has sketch-scoped variable definitions, panel rows and
  a `usedBy` dependency walk. `src/model/expression.ts` has a real but small
  arithmetic/units evaluator. This is a precursor, not a document-level Variable
  Studio.
- Configurations have no model, table, UI, persistence path or tests. Matrix row
  `4.3.27` is `MISSING`.
- FeatureScript has no parser, evaluator, editor, Feature Studio workspace,
  custom-feature definition or insertion path. Matrix row `4.3.29` is `MISSING`.
- Matrix row `4.3.28` says Variables are `PARTIAL`, which matches the precursor.
- No Phase 7 unit, browser, migration, round-trip or performance evidence exists.

## Kernel sequencing rule

Do all non-kernel work first. The only kernel-dependent completion items are:

- `P7-FS-07` — FeatureScript standard-library geometry execution.
- `P7-EXIT-02` — custom feature authored in Feature Studio rebuilds geometry.

Until those are reached, Phase 7 work is limited to models, tables, expression
parsing/evaluation, editor/diagnostics, serialization, migration and UI. Do not
put kernel changes ahead of the Variable Studio, configuration, parser or
round-trip work.

## A. Variable Studio — 9 items

- [ ] **P7-VS-01 — First-class Variable Studio tab.** Create, open, rename,
      duplicate, delete, switch and reload a Variable Studio tab as a real
      workspace, not a disabled menu entry or empty mock tab.
      **Acceptance:** tab lifecycle browser test survives reload.
- [ ] **P7-VS-02 — Document-level variable model.** Stable variable IDs, names,
      scopes and definitions stored outside Part Studio feature history; migrate
      existing sketch variables without changing their values.
      **Acceptance:** model test proves scope isolation and migration.
- [ ] **P7-VS-03 — Typed variables.** Number, length, angle, boolean and string
      types with unit-aware defaults, display and invalid-type errors.
      **Acceptance:** each type round-trips and rejects an incompatible value.
- [ ] **P7-VS-04 — Expression engine completion.** Arithmetic, parentheses,
      unary operators, unit literals, named references, functions (`min`, `max`,
      `abs`, `sqrt`, trig where applicable), cycle detection and source-positioned
      errors.
      **Acceptance:** parser/evaluator table tests cover success and every error.
- [ ] **P7-VS-05 — Scope and unit resolution.** Defined precedence between
      studio variables, configuration values, feature-local values and units;
      duplicate names and dimensional mismatches are named errors.
      **Acceptance:** precedence and failure tests.
- [ ] **P7-VS-06 — Variable table UI.** Add, delete, rename, reorder, filter and
      inline-edit rows; apply/cancel; disabled-state reasons.
      **Acceptance:** browser test edits a table and reloads it.
- [ ] **P7-VS-07 — Dependency display.** Direct and transitive dependencies and
      where-used navigation for variables and their consumers.
      **Acceptance:** model test and browser navigation test.
- [ ] **P7-VS-08 — Variable propagation.** Changes rebuild sketches, features,
      assemblies, drawings and BOM values through stable references without stale
      copies.
      **Acceptance:** cross-workspace propagation test.
- [ ] **P7-VS-09 — Variable undo and persistence.** Undo/redo and save/reload
      preserve values, types, scopes and dependency links.
      **Acceptance:** undo and round-trip tests.

## B. Configurations — 11 items

- [ ] **P7-CF-01 — Configuration schema.** Configuration inputs, input types,
      defaults, allowed options, table rows, per-row values and stable IDs with a
      document schema version.
      **Acceptance:** schema validation and version test.
- [ ] **P7-CF-02 — Part Studio configuration inputs.** Select feature parameters,
      variables, suppression and visibility as configurable inputs; values are
      validated against their owning feature.
      **Acceptance:** model test switches each input kind.
- [ ] **P7-CF-03 — Configuration table.** Add/duplicate/delete rows and columns,
      set the default configuration, reorder rows and reject empty or duplicate
      option names.
      **Acceptance:** table model tests and browser edit test.
- [ ] **P7-CF-04 — Part Studio configurations.** Switching the active
      configuration rebuilds every selected Part Studio input without mutating the
      base document.
      **Acceptance:** three configurations produce three distinct feature results.
- [ ] **P7-CF-05 — Assembly configurations.** Configure instance
      visibility/suppression, mate values/suppression, referenced part
      configurations and resulting BOM rows.
      **Acceptance:** assembly batch switches and BOM comparison.
- [ ] **P7-CF-06 — Property and BOM configurations.** Configure metadata,
      material, vendor and BOM-visible fields with documented override precedence.
      **Acceptance:** property/BOM round-trip test.
- [ ] **P7-CF-07 — Configured tabs and drawings.** Persist an active
      configuration per tab; drawing BOM and annotations consume the selected
      configuration instead of the base values.
      **Acceptance:** save/reload with a configured drawing.
- [ ] **P7-CF-08 — Visibility conditions.** Evaluate conditions on features,
      instances, annotations and BOM rows; invalid conditions report a localized
      error.
      **Acceptance:** condition truth-table and error tests.
- [ ] **P7-CF-09 — Non-destructive switching.** Configuration switches are
      previewable, cancellable and reversible; returning to Default restores the
      original state and never leaves partial transforms or suppressed features.
      **Acceptance:** switch-back equality test.
- [ ] **P7-CF-10 — Configuration UI.** Table editor, input picker, row/column
      actions, copy/paste, naming/description and disabled-state reasons.
      **Acceptance:** browser test creates and edits a configuration.
- [ ] **P7-CF-11 — Configuration validation and undo.** Localized errors for
      duplicate, missing, incompatible and cyclic values; every edit participates
      in undo/redo and autosave.
      **Acceptance:** error, undo and autosave tests.

## C. FeatureScript and Feature Studio — 13 items

- [ ] **P7-FS-01 — First-class Feature Studio tab.** Create, open, rename,
      duplicate, delete, switch and reload a Feature Studio workspace.
      **Acceptance:** tab lifecycle browser test survives reload.
- [ ] **P7-FS-02 — Source editor.** Line numbers, FeatureScript syntax
      highlighting, completion, hover documentation, find and editor undo.
      **Acceptance:** browser editor test covers highlight/completion/hover.
- [ ] **P7-FS-03 — Diagnostics.** Parse, type and evaluation errors show
      severity, line/column and a navigable error list.
      **Acceptance:** each diagnostic class has a browser-visible error.
- [ ] **P7-FS-04 — Local source history.** Per-Feature-Studio version snapshots
      with restore and diff-safe history; no cloud dependency.
      **Acceptance:** edit/restore/reload test.
- [ ] **P7-FS-05 — Lexer/parser/AST.** Comments, strings, numbers and units,
      identifiers, function calls, operators and source spans.
      **Acceptance:** parser test corpus includes valid and invalid programs.
- [ ] **P7-FS-06 — Type checker and evaluator.** Numbers, units, booleans,
      strings, lists, functions and scopes with deterministic evaluation and named
      type errors.
      **Acceptance:** evaluator table tests and error-position tests.
- [ ] **P7-FS-07 — Standard library and custom-feature declarations.** Feature
      definitions declare parameters, types, defaults and UI metadata; pure
      FeatureScript evaluation works without the CAD kernel. **Kernel-dependent
      geometry execution is the final implementation item, not this parser work.**
      **Acceptance:** declaration and pure-evaluation tests.
- [ ] **P7-FS-08 — Custom feature registration.** Register a FeatureScript
      feature by stable ID with name, parameter schema, defaults, preview metadata
      and apply/cancel behavior.
      **Acceptance:** registry test and insertion UI test.
- [ ] **P7-FS-09 — Custom feature insertion.** Insert a registered custom
      feature into a Part Studio feature tree with a stable node, source hash and
      version reference.
      **Acceptance:** feature-tree row and reload test.
- [ ] **P7-FS-10 — Custom feature edit/rebuild.** Edit parameters or source,
      rebuild, suppress/unsuppress, roll back and undo without corrupting unrelated
      features.
      **Acceptance:** edit/rebuild/suppress/undo browser test.
- [ ] **P7-FS-11 — Localized custom-feature errors.** Parser, type, evaluation
      and runtime failures point at the offending line and the owning feature row;
      the document stays loadable.
      **Acceptance:** failure test proves line and feature-row linkage.
- [ ] **P7-FS-12 — Notices and compatibility.** Version notices, deprecations,
      missing APIs and incompatible source produce visible notices instead of
      silent behavior changes.
      **Acceptance:** compatibility fixture tests.
- [ ] **P7-FS-13 — Source import/export and persistence.** Persist source,
      compiled metadata, custom features and references; import/export a source file
      with deterministic round-trip.
      **Acceptance:** file and document round-trip tests.

## D. Migration, round-trip and evidence — 6 items

- [ ] **P7-RT-01 — Schema migration.** Version and migrate older documents with
      no silent geometry or data change; missing new state gets explicit defaults.
      **Acceptance:** pre-Phase-7 fixtures load and compare.
- [ ] **P7-RT-02 — Variable Studio round-trip.** Types, expressions, values,
      scopes and dependency links survive save/reload and tab switch.
- [ ] **P7-RT-03 — Configuration round-trip.** Inputs, tables, rows, active
      configuration, conditions and per-tab selections survive save/reload.
- [ ] **P7-RT-04 — Feature Studio round-trip.** Source, history, compiled
      metadata, custom features and references survive save/reload.
- [ ] **P7-RT-05 — Cross-tab references.** Stable IDs connect variables,
      configurations, features and tabs; deleted/missing references report a named
      error instead of falling back silently.
- [ ] **P7-RT-06 — Acceptance evidence.** Focused unit tests, browser specs,
      migration/round-trip tests, performance measurements and matrix updates for
      `4.3.27`, `4.3.28` and `4.3.29` are recorded. No row is upgraded on code alone.

## E. Phase 7 exit evidence — 3 items

- [ ] **P7-EXIT-01 — Three-configuration part family.** One part family switches
      geometry and BOM data across three configurations, survives save/reload, and
      returns to Default without residue.
- [ ] **P7-EXIT-02 — Authored custom feature.** A custom feature authored in
      Feature Studio inserts, edits, rebuilds and survives reload. **Kernel
      execution work for this item is last.**
- [ ] **P7-EXIT-03 — Error integrity.** A deliberately broken FeatureScript
      program reports the offending line and does not corrupt or partially mutate
      the document.

## Execution order

1. **Variable Studio foundations:** `P7-VS-01` → `P7-VS-05`.
2. **Variable Studio UI and propagation:** `P7-VS-06` → `P7-VS-09`.
3. **Configuration schema and Part Studio:** `P7-CF-01` → `P7-CF-04`.
4. **Assembly, properties, tabs and drawings:** `P7-CF-05` → `P7-CF-11`.
5. **FeatureScript without kernel:** `P7-FS-01` → `P7-FS-06`, then
   `P7-FS-08` → `P7-FS-13`.
6. **Persistence and acceptance:** `P7-RT-01` → `P7-RT-06`.
7. **Kernel boundary last:** `P7-FS-07` geometry execution and `P7-EXIT-02`.
8. **Exit evidence:** `P7-EXIT-01` and `P7-EXIT-03` can run before the kernel
   item; `P7-EXIT-02` closes the phase.

## Explicit non-goals

- Voice Layer and Flux Parity (separate Phase 7 documents).
- Publishing custom features to an App Store.
- Cloud collaboration, hosted FeatureScript execution or cloud rendering.
- Claiming Phase 6 sheet metal/frames/surfaces from this document.
- Upgrade of parity matrix rows before their named evidence runs.
