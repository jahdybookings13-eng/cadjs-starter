# Onshape Parity — Full Phase Status

**Snapshot date:** 2026-11-07  
**Repository:** `cadjs-starter`  
**Branch:** `wip/vr-toolbelt`  
**HEAD:** `1d84d61` — `test: update phase 2 acceptance controls`  
**HEAD date:** 2026-11-06 22:14:45 -0500  
**Current phase:** Phase 3 — Part Studio core parity  
**Current position:** B, C, D and E are closed and green. Phase 3 is **not** closed.

> **Commit truth:** Phases 0, 1 and 2.1–2.5 are committed. **No Phase 3 work is committed.** Everything from the Phase 3 depth pass remains in the working tree: 35 modified tracked files, 21 untracked files, +5,709/−461 tracked lines. This document is itself a new untracked file. No commit or push was made in this session.

This document is a phase-by-phase ledger, not a replacement for the contracts. The source documents remain:

- `ONSHAPE_PARITY.md` — frozen scope, phase definitions, exit gates, matrix contract.
- `PHASE3_REMAINING.md` — detailed Phase 3 backlog and current checkboxes.
- `UNDONE.md` — historical and subsystem-level honesty log.
- `PARITY_STATUS.md` — generated matrix report (see the stale-row warning below).

---

## 1. How to read this document

The plan is a **Phase 0 measurement/contract phase plus nine delivery phases (1–9)**. The user-facing shorthand “9-phase plan” means Phases 1–9; Phase 0 is the measurement foundation that gates them.

Status vocabulary used here:

| Status                         | Meaning                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Committed complete**         | Implementation and evidence exist in a named commit.                                              |
| **Committed with limits**      | The phase slice is committed, but a documented compatibility/evidence gap remains.                |
| **Uncommitted implementation** | Code exists and targeted checks pass, but no commit exists.                                       |
| **Partial precursor**          | Some code from an earlier subsystem exists, but the phase’s own workspace/exit gate is not built. |
| **Not started**                | No phase-level implementation or exit evidence exists.                                            |

The Phase 3 checklist currently reports:

| Area                                                  | Checked |    Open |
| ----------------------------------------------------- | ------: | ------: |
| A. Extrude / revolve / sweep / loft                   |      15 |      57 |
| B. Fillet / chamfer / shell / draft / hole / thread   |      57 |       0 |
| C. Patterns / mirror / boolean / split / face editing |      48 |       0 |
| D. Feature tree                                       |      17 |       0 |
| E. Multi-body / part semantics                        |      19 |       0 |
| F. New modelling features                             |      48 |       7 |
| G. Measure / inspect                                  |       0 |      17 |
| H. Deterministic rebuild / serialization / acceptance |       0 |      22 |
| **Total**                                             | **204** | **128** |

A checked box means the behaviour, error path, persistence path and tests exist. It does not mean the entire phase exit gate is satisfied.

---

## 2. One-screen phase status

| Phase | Contract status                     | Committed?                 | Evidence today                                                                                   | Next gate                                                         |
| ----- | ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 0     | **Complete**                        | Yes — `237ffec`, `4a3a780` | 255 controls, 0 dead/unlabeled; 97 owned matrix rows; measured browser budgets; Phase 0 demo     | Keep inventory/gates green                                        |
| 1     | **Complete with documented limits** | Yes — `4a3a780`            | 26 document tests; Documents page/tabs/snapshots; 40 Chromium tests, 1 skipped; full gate passed | Five-toolbar-family work and screenshot capture remain later work |
| 2.1   | **Complete**                        | Yes — `d6f6644`            | Polyline, hatch, blocks, layers, DXF layers, sketch controls                                     | Matrix rows are stale and still say MISSING                       |
| 2.2   | **Complete**                        | Yes — `e4be384`            | H/V/perp/parallel/tangent/coincident inference; named conflicts; 15-constraint solver test       | —                                                                 |
| 2.3   | **Complete**                        | Yes — `30b411e`            | Driving/reference dimensions, expressions, variables, limits; undo/reload                        | —                                                                 |
| 2.4   | **Core complete**                   | Yes — `837f459`            | Associative edge/vertex include, face/custom planes, include metadata                            | Silhouettes and mate-connector planes are explicit gaps           |
| 2.5   | **Complete**                        | Yes — `1237a37`, `1d84d61` | Text, underlay rotate/re-attach, sketch analysis, acceptance controls                            | Screenshot baselines remain a release capture task                |
| 3     | **In progress**                     | **No**                     | B, C, D and E implemented; C/D/E evidence closed; F implemented with listed limits; A partial    | Finish A depth, G/H, 20+ feature exit part                        |
| 4     | **Not started**                     | No                         | Basic assembly instances/mates/DOF precursor exists                                              | Full mate set, diagnostics, BOM, exploded views                   |
| 5     | **Not started**                     | No                         | DXF/manufacturing export precursor exists; no drawing workspace/tab                              | Real associative drawing workspace                                |
| 6     | **Not started**                     | No                         | Flange/hem/unfold/wrap and some surface ops are precursors                                       | Rules, flat pattern, frames, complete surfacing                   |
| 7     | **Not started**                     | No                         | Sketch variables/expressions are a precursor                                                     | Variable Studio, configurations, FeatureScript                    |
| 8     | **Not started**                     | No                         | ECAD/RF/VR subsystems exist independently                                                        | Render, simulation, CAM, PCB Studio, translation                  |
| 9     | **Not started**                     | No                         | Continuous gates exist (inventory, budgets, smoke)                                               | Accessibility, full cross-browser, release gate                   |

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5. Phase 3 is the current gate. Phases 6 and 7 can run in parallel with 4 and 5 only after Phase 3 lands. Phase 8 consumes the earlier workspaces. Phase 9 gates release continuously.

---

## 3. Commit ledger — what is actually committed

The last parity-relevant commits on `wip/vr-toolbelt` are:

| Commit    | Date       | Message                                                                   | What it establishes                                                                                                                                          |
| --------- | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `237ffec` | 2026-11-06 | `checkpoint: document tabs, parity contract, and current subsystem state` | Freezes the parity contract, document-tab baseline, test bible and subsystem state. This is the checkpoint before the phase closure commits.                 |
| `4a3a780` | 2026-11-06 | `feat: complete phase 1 local document shell`                             | Phase 0 control inventory/matrix/budget tooling plus Phase 1 documents page, tabs, panel, snapshots, persistence, recovery, browser specs and demo evidence. |
| `d6f6644` | 2026-11-06 | `feat: complete phase 2.1 sketch entities and layers`                     | Polyline, hatch, blocks, layers/linetypes, DXF layer mapping, sketch toolbar/rendering/selection changes.                                                    |
| `e4be384` | 2026-11-06 | `feat: complete phase 2.2 constraint inference`                           | Horizontal/vertical/perpendicular/parallel/tangent/coincident inference; named conflict sets; solver coverage.                                               |
| `30b411e` | 2026-11-06 | `feat: complete phase 2.3 dimensions`                                     | Driving/reference dimensions, expressions, sketch variables, min/max limits, dimension UI and solver persistence.                                            |
| `837f459` | 2026-11-06 | `feat: complete phase 2.4 associative include`                            | `includeSource` metadata, associative edge/vertex include, face/custom-normal planes.                                                                        |
| `1237a37` | 2026-11-06 | `feat: complete phase 2.5 sketch analysis`                                | Underlay rotate/re-attach, sketch analysis panel, text/acceptance work.                                                                                      |
| `1d84d61` | 2026-11-06 | `test: update phase 2 acceptance controls`                                | Final Phase 2 acceptance-control adjustment. This is HEAD.                                                                                                   |

### What this means

- The committed parity work stops at **Phase 2.5 acceptance**.
- There is **no Phase 3 commit**: not for B depth, not for C patterns/split/face work, not for the D feature-tree slice.
- The Phase 3 work is real and tested, but it is **working-tree work**. A clean clone at `1d84d61` will not contain it.
- No push was made in this session. Remote state should not be assumed.

---

## 4. Phase 0 — Contract and control inventory

**Status:** Complete 2026-11-06.  
**Committed in:** `237ffec` (contract/checkpoint) and `4a3a780` (inventory and gates).  
**Outcome:** make “all the buttons” countable and prevent dead controls from entering the app.

### Delivered

- `scripts/control-inventory.mjs` scans JSX and generates `CONTROL_INVENTORY.md` plus `parity/controls.json`.
- `scripts/parity-matrix.mjs`, `parity/owners.json` and `PARITY_STATUS.md` assign an owner and acceptance evidence to every capability row.
- `scripts/check-budgets.mjs`, `parity/budgets.json` and `e2e/perf-budget.spec.ts` define browser budgets for boot, document reload, box regeneration and orbit.
- `parity/phase-demos/phase-0.md` defines the demo-script format and records the run.
- `npm run check:controls`, `npm run check:parity` and the full gate fail on untracked/unsafe state.

### Phase 0 evidence

- **255 visible controls in 63 files; 0 dead, 0 unlabeled.**
- The audit initially found **2 dead and 38 unlabeled** controls and failed; after fixes it passed.
- **97 capability rows in 8 sections**, every row owned with acceptance evidence.
- Matrix row coverage at Phase 0: **31.4%** (`SHIPPED=1`, `PARTIAL=0.5`).
- Direct test evidence: 4 controls (2%) at that checkpoint; that gap was explicitly handed to Phase 1.
- Chromium baseline over two runs: boot **8.41–9.58 s** (budget 12 s), document reload **5.55–10.64 s** (budget 15 s), box regeneration **242–726 ms** (budget 5 s), orbit **56–61 fps** (budget ≥30).
- These are dev-server numbers, not production or headset numbers.

### What Phase 0 did not do

It did not implement missing product controls. Measurement came first. The low direct-evidence percentage was deliberately carried forward rather than hidden.

---

## 5. Phase 1 — Document shell and local Documents page

**Status:** Complete for the local document shell, with documented limits.  
**Committed in:** `4a3a780`.  
**Goal:** a real local document environment: create, open, organise, save and recover documents, with every tab type backed by a real workspace.

### Delivered

- `src/document/` models a persisted `CadDocument` with tabs, active tab, migration from the old single-design blob, and repair on read.
- IndexedDB (`scadgen.documents`) is the durable store, with a localStorage mirror/fallback. Boot hydrates before the scene resolves its active tab; newest `updatedAt` wins during migration.
- Part Studio tabs support create, rename, duplicate, move, delete, switch, search, multi-select, drag reorder and keyboard reorder. Each tab owns its own serialized design; switching flushes and restores the same path as reload.
- Documents page supports grid/list, create, import, open, rename, duplicate, export, trash/restore, permanent delete, recent, search, kind filter and sort.
- Document panel supports properties, tab multi-select, named snapshots (newest 20), where-used assets, design size and storage status.
- Document toolbar supports explicit save, export, panel/display state and help.
- Save state, autosave and storage failures are visible. A corrupt localStorage mirror falls back to the good IndexedDB copy; quota failure preserves the last good serialized save.
- Named snapshot created before reload survives and restores the scene to the snapshotted geometry.

### Phase 1 evidence

Recorded in `parity/phase-demos/phase-1.md`:

- **26 document tests passed** in `src/document/__tests__`.
- Full `npm run test:bible` passed: **603 unit tests passed, 4 skipped**; typecheck, lint (0 errors, 27 pre-existing warnings), production build, bundle budget, control inventory, parity matrix and budget schema passed.
- Chromium: `e2e/documents-page.spec.ts` and `e2e/document-tabs.spec.ts` pass.
- Non-VR Chromium regression chunk: **40 passed, 1 skipped**. The 8 existing VR specs were not rerun in that Phase 1 pass and are outside Phase 1.
- Controls: **295 in 66 files; 0 dead, 0 unlabeled**, 8 with direct test evidence.
- Generated matrix after Phase 1: **35.1%** row coverage; **6 SHIPPED, 56 PARTIAL, 31 MISSING, 4 STUDIO**.
- Performance: boot **7.96 s**, document reload **5.44 s**, box regeneration **216 ms**, orbit **61 fps**.

### Phase 1 limits

- The five-toolbar-family rebuild and full keyboard-map customization did **not** land. The document toolbar landed; feature/sketch context toolbars remain the existing surfaces, so matrix row 4.1.3 stays `PARTIAL`.
- The document panel reports design size/storage status, not per-operation timings, so 4.1.4 stays `PARTIAL`.
- Quota failure is simulated at the storage API boundary; real quota exhaustion/private-mode behavior is not exercised.
- Corrupt IndexedDB records are dropped by normalization rather than quarantined/repaired.
- Document import and bulk tab delete have unit coverage but no browser test.
- Firefox/WebKit still run smoke only; Documents/tab specs are Chromium-only.
- Only Part Studio tabs are offered. Assembly/Drawing/Variable Studio/Feature Studio remain disabled with a stated reason rather than opening empty mock tabs.

---

## 6. Phase 2 — Sketch parity

**Status:** Code-complete across 2.1–2.5; committed.  
**Committed in:** `d6f6644`, `e4be384`, `30b411e`, `837f459`, `1237a37`, `1d84d61`.  
**Goal:** every Onshape sketch entity, constraint, dimension and modify tool, with inference and conflict feedback.

Phase 2 is five internal sequencing slices, not five extra global phases.

### 6.1 Phase 2.1 — Entities and layers

**Commit:** `d6f6644` — 32 files, +2,437/−142.

Landed:

- Polyline as a chain of real lines sharing `polylineId`, so solver, render, BRep and shared-point vertex editing use existing paths.
- Hatch as a first-class `SketchHatch` with ordered boundary line ids, pattern, spacing, angle and layer metadata. Solid/line/cross rendering; excluded from BRep; deleting a boundary line cascades to the hatch.
- Blocks: snapshot definitions, inserted clones with remapped point/line/hatch/polyline ids, nested instance paths, explode back to ordinary geometry, whole-instance selection.
- Layers: colour, visibility, continuous/dashed/dotted/center styles, assignment dialog, renderer visibility and DXF `LAYER` import.
- DXF import maps layer colours/linetypes/visibility and entity layer codes; LWPOLYLINE segments group by `polylineId`.
- Sketch toolbar and rendering/selection paths updated for the new entities.

Evidence:

- Closed-loop hatch creation, layer assignment, block define/insert/explode, nested block paths, block hatch remapping, polyline vertices and DXF layers covered by focused tests.
- `test:bible` and the Chromium sketch-controls spec passed at commit time.

**Known evidence defect:** the generated `PARITY_STATUS.md` still marks polyline, hatch, blocks and layers as `MISSING`. That is stale matrix data, not missing implementation. Do not use those rows as Phase 2.1 truth until the matrix generator/owners are corrected.

### 6.2 Phase 2.2 — Constraints and inference

**Commit:** `e4be384` — 4 files, +124/−18.

Landed:

- Automatic inference for horizontal, vertical, perpendicular, parallel, tangent and coincident relationships.
- Existing endpoint, midpoint, centre, quadrant and intersection snap glyphs retained.
- Solver reports named redundant/conflicting constraint ids.
- Feedback panel names the set and offers a remove action per conflicting constraint.
- DOF and fully/under/over-constrained status come from planegcs.
- 18-type constraint registry: 12 geometric, 6 dimensional.
- Vendor solver coverage includes a sketch with **15 independent constraints** and a deliberate conflict assertion.

### 6.3 Phase 2.3 — Dimensions

**Commit:** `30b411e` — 15 files, +587/−74.

Landed:

- Dimensional constraints persist source `expression`, optional inclusive `min`/`max` and the existing `driving` flag through undo and project save/load.
- Dimension overlay accepts arithmetic and unit expressions, resolves sketch-local variables, validates limits before submit and preserves the expression when reopened.
- Reference dimensions (`driving: false`) are re-measured after every solve; they follow dragged geometry without adding solver equations. Driving dimensions still enforce their value.
- Layers dialog includes sketch variables (`name = value`) usable in every dimension expression in that sketch.
- `DimensionInput` and `NumberInput` updated; solver coverage expanded.

### 6.4 Phase 2.4 — Associative include and planes

**Commit:** `837f459` — 8 files, +235/−28.

Landed:

- Included geometry carries `includeSource` metadata (source node and offset), so moving/undoing the upstream body re-projects points instead of leaving stale geometry.
- Include projects body section edges plus selected-body vertices; stored on the sketch and survives project save/load.
- Plane picker keeps XY/XZ/YZ, body-face selection and offsets, and accepts a custom normal vector.
- Existing trim/extend/split/offset/fillet/chamfer and transform/pattern paths remain the modify implementation.

**Explicit gaps:** silhouette include and mate-connector planes remain documented compatibility gaps for a later slice.

### 6.5 Phase 2.5 — Text, underlay, analysis and acceptance

**Commits:** `1237a37` — 9 files, +301/−18; `1d84d61` — 2 files, +2/−1.

Landed:

- Image underlays rotate around the sketch normal and re-attach to a selected sketch point; rotation persists with the sketch.
- Sketch analysis reports open/closed profile counts, line intersections and maximum circle/arc curvature through a dedicated panel.
- Text insertion emits editable single-stroke geometry and remains part of the profile pipeline.
- Acceptance is recorded in `TEST_BIBLE.md`; final acceptance controls updated.

**Open evidence:** screenshot baselines are a release capture task, not claimed from a static check.

### 6.6 Phase 2 exit state

`ONSHAPE_PARITY.md` now says Phase 2 is code-complete across 2.1–2.5. The phase section heading still says “in progress: Phase 2.1 complete”; that heading is stale text, not current status. The remaining Phase 2 gaps are:

- Screenshot/visual regression baseline capture.
- Silhouette include.
- Mate-connector planes.
- The matrix rows for 2.1 need regeneration/fixing.

---

## 7. Phase 3 — Part Studio core parity

**Status:** In progress. **Uncommitted.**  
**Goal:** model a representative mechanical part end to end with Onshape-level feature depth and tree behavior.  
**Depends on:** Phase 2.  
**Exit gate:** a 20+ feature mechanical part, reordered/rolled back/edited/suppressed/restored, identical after save/reload and export/re-import, every failure named, every feature dialog/preview/apply/cancel covered, all Phase 3 rows `SHIPPED`, no dead/unlabeled controls, full Phase 3 Chromium regression green, no stale `deferred` entries.

### 7.1 Exact current position

- **A — partial.** Extrude now consumes offset, second-direction, thin wall, draft and NEW/ADD/CUT/INTERSECT merge scope; all are audited as wired. Up-to-\* end conditions, neutral-plane/parting-line draft, and most revolve/sweep/loft depth remain open: the executor still reads only `angleForward` for revolve, straight `pathPoints` for sweep, and `profiles`/`ruled` for loft.
- **B — complete on the checklist.** Fillet, chamfer, shell, draft, hole and thread depth landed in the uncommitted B pass.
- **C — closed.** Patterns, boolean, split, move/delete face and transform/copy are implemented, and the previously missing dedicated browser evidence is now green.
- **D — closed.** Collision-safe rename, dependent-aware reorder, reversible cascade suppression, rollback edit/forward, failure isolation/recovery and tree tests are done.
- **E — closed.** Persisted parts/body metadata, composite membership, naming/material/appearance, body state and visibility persistence, mass properties, transform/copy, provenance, multi-select and Browser part grouping.
- **F — implemented with limits.** Rib/gusset, web, boss/emboss, coil/spring, helix curve, dome feature, derived Part Studio, import recognition metadata and the F8 gaps are wired through builders, executor, feature map, menus and the action bus. Open limits: sketch-entity picking for rib/web, true helix for threads/wrap, BREP feature-history inference, a tab picker for Derive, and the delegated browser tests. See `PHASE3_F_TEST_PLAN.md`.
- **G — implemented with limits.** Distance, edge length, angle and body mass properties already existed. The inspector now adds mesh-based radius/diameter, thickness, curvature, XY section metrics, interference/clearance, mm/in display units and named empty-body errors (`src/model/inspect.ts`, `BodyPropertiesPanel`). Open: analytic OCC radius/curvature, consistent mm/in for mass properties, persistence/pin across rebuilds, and the full measure-mode test matrix. See `PHASE3_G_TEST_PLAN.md`.
- **H — acceptance green, full suite still running.** Canonical project JSON, an order-independent BREP digest/bbox summary and a 20+ feature coverage audit are implemented and unit-tested, with `window.__scadgen.phase3` as the tester surface. Acceptance is **4/4 across the retry** (H1 and H5/H6 failed once; H5/H6 is flaky), and the 12 focused H scenarios are **12/12 green**. The full 79-test Chromium suite is running with one feature-dialog failure awaiting retry. H9 dialog coverage, the full-suite result and the archive remain open; see `PHASE3_H_TEST_PLAN.md`.

**Checklist ledger:** 239 checked, 93 open. Sections B, C, D and E are fully checked; F is 49/55 with the limits listed above; A is 21/72; G is 13/17; H is 12/22 with the full-suite/H9/archive items still open.

### 7.2 A — Extrude / revolve / sweep / loft

**Current state:** the four kernel operations run, but only a narrow subset of Onshape’s feature definition is wired.

#### Extrude

Landed:

- Blind depth is the proven mode.
- Explicit offset from the sketch plane, including negative offset against the normal.
- Second-direction depth (forward + back fused by boolean union).
- True asymmetric two-sided extrude with independent forward/back depths.
- Symmetric extrude with a single depth (kernel extrudes 2× and recentres).
- New-body merge scope; ADD/CUT/INTERSECT report named errors instead of silently doing the wrong thing.
- Non-blind end conditions are rejected with named errors rather than silently extruding blind.
- Draft and non-NEW merge scopes are rejected with named errors.
- Extrude edit-in-place from the feature tree (depth + midplane, preview, apply, cancel, one undo entry).
- Boundary: `KERNEL_CONSUMED_PARAMS` covers `symmetric`, `hasOffset`, `offsetDistance`. `hasDraft`, `operationType`, `cornerType`, `loftType`, `keepProfileOrientation` and `chordalTolerance` stay disabled with a reason where unaudited.

Open:

- Up-to-vertex, up-to-face, up-to-surface, through-all, through-all with start offset.
- Symmetric extrude with separate forward/back depths.
- Thin feature and thin feature with open profile.
- Draft angle, explicit neutral plane and parting line.
- Merge add/cut/intersect to selected bodies, tool consumption.
- Nested/multiple profile rules.
- Named errors for open, self-intersecting and zero-area profiles.
- Extrude dialog selection and direction flip.

#### Revolve

Open: second-direction angle, symmetric revolve, up-to-vertex/face/surface, thin revolve, merge scopes, axis selection from sketch line/body edge/datum axis/origin, open/nested profile rules, direction flip with preview, `cornerType` (rounded/conical/transitional), named errors for axis-on-profile/self-intersection/zero-angle, dialog/edit.

#### Sweep

Open: path support beyond chained straight sketch lines, arcs/splines/3D paths, guide curves and multiple guides, twist, profile orientation, chordal tolerance, thin sweep, merge scopes, start/end offset, self-intersection errors, full dialog/edit.

**Parameter audit gap:** `keepProfileOrientation` and `chordalTolerance` exist in the feature map; prove they reach the kernel or remove them from the shipped UI.

#### Loft

Open: more than two profiles with reorderable list, guide curves, centerline/path loft, twist, end conditions, closed/periodic loft, thin loft, merge scopes, match connectors/vertex mapping, actual ruled/fluid/straight behavior, named mismatch/self-intersection errors, full dialog/edit.

#### Shared feature dialog

Landed:

- One typed framework: `featureDialog.ts` + `FeatureDialog.tsx`.
- Persistent preview updating on parameter edits.
- Apply commits exactly one undo entry; rebuild syncs are non-undoable.
- Cancel restores the pre-preview scene and leaves selection untouched.
- Invalid parameters never enter the draft; Apply stays disabled with inline reason.
- Labels, units and accessible error messages on the extrude dialog.
- Dialog tests cover open, edit, preview, apply, cancel and undo.
- Extrude is the first wired proof; other operations still need wiring.

Open: Escape-cancel e2e assertion; dialogs for the remaining operations.

### 7.3 B — Fillet / chamfer / shell / draft / hole / thread

**Current state:** all six run on OCC; the 2026-11-07 B-depth pass wired the remaining implementable paths. The checklist is 57/57 checked. Evidence is both unit and real-kernel browser coverage.

#### Fillet

- Constant radius, per-edge radii, variable radius (`Law_Linear` + `Add_4`).
- Face blends over every boundary edge; tangent propagation; corner/setback radius.
- Cross-sections `RATIONAL`, `QUASI_ANGULAR`, `POLYNOMIAL`.
- Failure recovery with named out-of-range indices and OCC contour/vertex diagnostics.
- Generic dialog and in-place modify without losing downstream references.

#### Chamfer

- Distance-distance, distance-angle (`AddDA`), angle-distance (same real path).
- Symmetric distances, per-edge overrides, tangent chains.
- Named impossible-width diagnostics.
- Generic dialog and edit-in-place.

#### Shell

- Planar-cap shell plus explicit slower curved-cap path.
- Multi-thickness, remove faces, keep shell vs keep core.
- Thin-wall diagnostics.
- Generic dialog and edit-in-place.

#### Draft

- Convex neutral-face heuristic; exact neutral plane from face or origin/normal.
- Parting-line draft, multiple faces, step draft, side-aware analysis.
- Named ambiguous-neutral and invalid-angle errors.
- Generic dialog.

#### Hole

- Simple drilled, standard ISO/unified/NPT tables.
- Counterbore, countersink and tapped holes; clearance classes (ISO 273 close/normal/loose).
- Through-all with body-diagonal overdrive and blind depth.
- Face/point placement using centroid + inward normal or sketch point.
- Profile enums and named invalid-standard/size errors.
- Generic dialog.

#### Thread

- Torus-stack v1 and opt-in true helix.
- Cosmetic shallow modeled thread, ISO/unified/NPT, internal/external.
- Runout trimming, 45° end chamfers, failure diagnostics.
- Generic dialog.

#### Associated rebuild

- `wrap` cut/emboss: filled closed-loop regions and bead sweep on open curves.
- `flange`/`hem`/`unfold` remain explicitly outside the Phase 3 exit gate.
- No shell/draft/thread control remains a placeholder.

### 7.4 C — Patterns / mirror / boolean / split / face editing

**Current state:** complete on the Phase 3 checklist (48/48), with the previously missing browser evidence now present.

#### C1 Patterns

- Linear, circular, curve, face, body and feature patterns.
- Feature pattern including join-to-source.
- Spacing/extent/equal modes; direction flip and second direction.
- Instance suppression for linear, circular, curve, face and feature patterns.
- Seed selection from the provenance query list; explicit suppression list.
- Merge/join plus separate-body override.
- Separate bodies and `${featureId}#k` ownership.
- Consumed-body semantics: seed replaced unless separate.
- Per-instance provenance: edge/face tags registered per result body.
- Named errors for missing seeds, zero spacing/extent/angle, bad path points, face mode without faces, union failure.
- Generic dialog exposes type, seed/faces, direction, count, spacing mode, suppression, join/separate, preview, apply, cancel.

#### C2 Boolean

- Add, subtract, intersect and common.
- Target/tool selection; keep tools honored by scene consumption.
- `makeSolid=false` returns the boolean’s face compound instead of claiming a solid.
- Merge scope and consumed-body hiding.
- Named empty-result and non-manifold diagnostics.
- Preview/apply/cancel/undo through the existing combine path.

#### C3 Split

- By plane and by selected surface/tool body.
- Keep positive, negative or both.
- All intersecting solids in the target; provenance and ownership (`featureId`, `featureId#1`).
- Both halves become owned bodies.
- Named miss/non-dividing errors.
- Generic dialog covers target, tool, split-by, keep scope, preview, apply, cancel.
- Removed the stale “split twice for both halves” note.

#### C4 Move face / delete face

- Planar trim and prism boss; neighbor-follow extension through cut/fuse boolean path.
- Adjacent-merge heal (`mergeAdjacent` same-domain unification after sewn cap).
- Tangent faces through selected boundary and sewn refill.
- Curved-boundary delete-face refill via `BRepOffsetAPI_MakeFilling`.
- Named unrecoverable/non-closed-shell errors.
- Preview/apply/cancel/undo through the generic dialog.
- Downstream face/edge tags re-registered for the healed body.

#### C5 Transform / copy

- Body move, rotate around body centre, copy.
- Copy vs move ownership: move updates existing element; copy creates owned body.
- Patterned/copied body provenance and `${featureId}#k` extras.
- Undo labels through normal feature history.
- Selection preservation for move/rotate; copy exposes a new body row.

#### C closure evidence

Final green run:

- `e2e/parity-ops.spec.ts` C-focused selection: **8 passed** against the real OCC kernel in Chromium, including `face pattern and split-by-surface run on the real kernel`.
- `e2e/feature-dialog.spec.ts`: **4 passed**, including `pattern and split dialogs edit the C parameters` (face pattern seed + separate body; split plane/surface + both-sides scope).
- The face-pattern worker lifetime bug (`TopoDS_Shape instance already deleted`) found by the new coverage was fixed by removing premature deletion of `worldShape` sub-faces and the result compound.
- There is **no remaining C evidence gap**. C is not blocked on deferred tests.

### 7.5 D — Feature tree

**Current state:** closed 2026-11-07, uncommitted. Checklist 17/17.

Landed across the two D slices:

- **Collision-safe rename.** `uniqueName` / `rename` produce `Box`, `Box (2)`, …; empty names are rejected.
- **Dependent-aware reorder plus repair.** `reorderPlan` / `moveSafely` stop a feature before its dependent; `moveWithDependents` / `stepWithDependents` carry the feature and every transitive dependent as one block (“Move with Dependents Up/Down”). Feature ids never change, so this repairs the move without rewriting references.
- **Cascade suppression.** `setSuppressedCascade` suppresses the selected feature and every transitive dependent, stamps `extensions.suppressedBy`, and restores only that cascade in one undo step.
- **Folders.** Non-contiguous members group into one folder at the first member's position; child order follows history.
- **Rollback editing and forward.** The dialog edits at the rollback position with live preview/apply/cancel, and the banner steps the bar forward one feature. The bar is draggable onto any row; drops on a feature row roll back after that feature.
- **Insert-here reorder.** A drag lands before or after a row from the cursor half.
- **Rollback persistence.** `rollbackIndex` is saved in the document blob (`documentStore`) and restored with the nodes, covering save/reload and tab switches.
- **Failure isolation and attribution.** A failed feature produces no body while later unrelated features still evaluate. The executor records `origin` and reports “depends on failed ‘…’” for downstream features, naming the direct parent when the failure is transitive.
- **Retry/recovery.** “Retry Feature” clears a stale ERROR state and rebuilds; a genuinely broken feature stays ERROR with its detail.
- **Warning matrix and dialog.** Delete, reorder, suppress and parameter edits all explain affected dependents; the feature dialog shows “Used by N: …”.
- **Selection and row identity.** Multi-body extras resolve back to their owner feature row (`featureForElement` + `selectedFeatureId`). History rows are no longer re-decorated by their shared body element, which previously retargeted a failed fillet row at its source box; failed features keep a visible row so they can be retried.
- **Context-menu parity.** cadjs, history-only and extra-body rows expose the same feature actions.

D evidence:

- `src/model/__tests__/featureEngine.test.ts` — **15 tests** (block reorder, rollback step, retry clear, persisted rollback, cascade, rename, folders, undo snapshot).
- `src/model/__tests__/executor.test.ts` — **8 tests**, including failure isolation and downstream origin attribution.
- `src/model/__tests__/featureDialog.test.ts` — **9 tests**, including the dependent warning payload.
- `src/model/__tests__/documentStore.test.ts` — rollback round-trip; `src/components/__tests__/featureTreeGroups.test.ts` — non-contiguous folder grouping.
- `e2e/feature-tree.spec.ts` — **3 passed** in Chromium: cascade/rename/reorder, rollback edit/forward + bar drag + retry + persistence, folders/references/undo/delete.
- `e2e/feature-dialog.spec.ts` — **4 passed**; `e2e/multi-body.spec.ts` — **1 passed** with the extra-row selection assertion.

No D item is left open. Explicit repointing is intentionally replaced by block-move repair; feature ids are never rewritten.

### 7.6 E — Multi-body / part semantics

**Current state:** **closed 2026-11-07**. A persisted `ScadgenParts` registry owns named and composite parts plus per-body metadata; the inspector exposes materials, mass properties, state, provenance and multi-select actions; the Browser groups by part. Tester evidence is in `PHASE3_E_TEST_PLAN.md`.

Landed:

- Split-both and separate-pattern extras (`F#1`, `F#2`, …) appear as selectable Body rows.
- Extra rows share parent status/rollback state and have their own visibility eye.
- Selected-body inspector: owning feature, type, element id, world size, bbox, face/edge tags, position, visibility.
- Unit-correct bbox, volume, surface area and triangle count; scene metres → mm at the shared boundary.
- Per-body STL export, including split/pattern extras.
- `bodyPropertiesOf` pure projection and Chromium coverage.
- Named parts owning one or more bodies; composite parts.
- Part naming, part number, description; body names independent of feature names.
- Part/body membership.
- Per-part/body material and appearance, persisted and reapplied after rebuild.
- Body state keep/remove/hide/show/isolate/transparent; visibility persistence across reload.
- Delete/keep semantics for split/pattern extras.
- Per-body measurement, center of mass, moments of inertia.
- Body transform/copy and consumed-body provenance.
- Multi-select body properties; body-level error ownership; Browser grouping by part.
- Body/part tests for create, rename, assign, hide, persist and export.

Tester pass 2026-11-07: E typecheck clean, 27 focused unit tests and 12 Chromium specs pass. Two defects were fixed during the pass — removed bodies stayed in part and selection STL exports (`exportableBodies` now filters `state === "removed"`), and a failed feature's row reported the source body's `OK` instead of its own `ERROR` (the clicked row's feature now drives the inspector's provenance). Multi-select and error ownership are covered by `e2e/parts.spec.ts`. Project-wide `tsc` currently fails only in `featuresF.ts` (workstream F, in flight).

### 7.7 F — New modelling features

**Current state:** the primitive dome exists; the modelling features below do not. `featureMap.ts` has explicit gaps for fit-spline, bridging curve, enclose and rib/gusset.

Open:

- **F1 Rib/gusset:** sketch line/arc profile, thickness, depth/extent, merge, draft, direction flip, gusset variant, named open/non-intersecting errors, dialog.
- **F2 Web:** selection rules, thickness/extent, merge scope, draft, named errors, dialog.
- **F3 Boss/emboss:** boss on face, emboss text/logo, height/depth, draft, merge, wrap cut/emboss modes, named errors, dialog.
- **F4 Helix/coil/spring:** helix curve, coil solid, presets, pitch/revolutions/start-end angle/taper, handedness, merge, true helix path for threads/wrap, named errors, dialog.
- **F5 Dome feature:** the primitive exists; add a modelling dome with direction, height, merge and optional draft.
- **F6 Derived Part Studio:** source selection, derived body import, merge/context, update propagation, missing-source errors, persistence.
- **F7 Imported feature recognition:** recognize history where possible, preserve bodies on failure, no silent loss, round-trip tests.
- **F8 Feature-map gaps:** `fitSpline`, `bridgingCurve`, `enclose`/endcap, `rib`, `gusset`, `derive`.

### 7.8 G — Measure / inspect

**Current state:** Measure supports distance, edge length and angle, with temporary and pinned measurements. The body inspector shows mass properties. The broader inspect set is missing.

Open:

- Radius, diameter, thickness.
- Interference and clearance between bodies.
- Curvature; section analysis as an inspect workflow (not only a Section feature).
- Volume/surface area/mass in Measure mode; center of mass.
- Per-body and multi-body measurement; split/pattern extras; hidden/isolated bodies with clear state.
- Unit selection and consistent mm/in display; precision/tolerance policy.
- Persistence and pin/unpin across rebuilds.
- Named unmeasurable-selection errors; tests for every type/unit.

### 7.9 H — Deterministic rebuild, serialization and acceptance

**Current state:** many focused tests exist, and the first acceptance run on 2026-11-07 built a 35-feature part, passed audit, save/reload, STL/STEP geometry/bbox and a named-failure check. One stale spec assertion (`"pattern"` vs `"featurePattern"`) stopped the stability/suppress/rollback checks, and the full Chromium suite is still unrun. Acceptance tooling: canonical project JSON, order-independent BREP digest/bbox and a 20+ feature audit, exposed as `window.__scadgen.phase3`; see `PHASE3_H_TEST_PLAN.md`.

Open:

- Build one 20+ feature mechanical part using sketches, extrude/revolve/sweep/loft, fillet/chamfer, shell, draft, hole, pattern, boolean, split and at least one new feature.
- Reorder, roll back to an early feature and edit, roll forward, verify downstream geometry.
- Suppress/restore, rename, folder-organize.
- Save/reload with geometry-stable serialization.
- Export STL and re-import; compare bbox/volume/topology.
- Export STEP and re-import; compare bodies/ownership.
- Deterministic units/filenames.
- Every failure named with no bogus body.
- One undo entry per dialog apply; cancel leaves no partial geometry; preview does not mutate persisted history.
- Multi-body extras, appearance, visibility and mass properties survive reload.
- Feature-dialog tests for every Phase 3 feature.
- Full Chromium regression for the 20+ feature part.
- Archive commands and results.

### 7.10 Phase 3 exit checklist — still open

- [ ] 20+ feature mechanical part.
- [ ] Reorder/rollback/edit/suppress/restore.
- [ ] Geometry identical after save/reload.
- [ ] Geometry identical after export/re-import.
- [ ] Every feature failure named, never a bogus body.
- [ ] Feature-level dialog/preview/apply/cancel tests for every feature.
- [ ] All Phase 3 parity rows `SHIPPED`, not button-backed.
- [ ] No dead/unlabeled/placeholder Phase 3 control.
- [ ] Full Phase 3 Chromium regression green.
- [ ] No stale `deferred` matrix entries.

**Phase 3 is therefore in progress.** B, C, D and E are done; A, F, G and H are not.

---

## 8. Phase 4 — Assembly parity

**Status:** **Not started as a phase.**  
**Depends on:** Phase 3.  
**Size:** 6–9 months.  
**Goal:** build and drive a multi-level assembly with real mates, diagnostics, interference and a BOM.

### Existing precursor

The baseline already contains a basic assembly model: instances, mates, DOF/residual checks and a small solver, with instances/mate model/DOF/drag rows marked `PARTIAL` in the matrix. That is a precursor, not Phase 4 completion. There is no full mate set, exploded view, display states, BOM workspace, in-context editing or large-assembly budget evidence.

### Required workstreams

- **A. Insertion:** parts, Part Studios, subassemblies and standard content; instance list with folders, rename, suppression and visibility.
- **B. Mate connectors and full mate set:** fasten, coincident, concentric, distance, angle, parallel, perpendicular, tangent, planar, ball, pin slot, slider, cylindrical, revolute, prismatic, screw and width, with limits.
- **C. Solver:** robust convergence, DOF display, over-constrained diagnosis, mate limits, drag with mates.
- **D. Diagnostics and views:** collision/interference/clearance reports, exploded views, named positions, display states.
- **E. BOM:** structured/indented/flat modes, metadata editing, export.
- **F. In-context editing:** Part Studio editing and assembly features (cut/extrude/hole).
- **G. Large-assembly performance:** level of detail, lightweight instances, measured open/orbit budgets.

### Exit gate

- Three-level assembly, 20+ instances, mixed mates, exploded view and BOM round-trip through save/reload.
- Over-constraint and interference report the offending instances.
- Large-assembly budget passes.

**Not in this phase:** cloud collaboration or shared assemblies.

---

## 9. Phase 5 — Drawing parity

**Status:** **Not started as a phase.**  
**Depends on:** Phases 3 and 4.  
**Size:** 6–9 months.  
**Goal:** produce a production drawing package from a model and keep it associative.

### Existing precursor

Manufacturing exports exist: DXF drawing sheets, USPTO patent sheets, STL/STEP/SVG. There is no Drawing tab/workspace, associative view system, annotation toolset, multi-sheet drawing, BOM table or drawing-specific export path. The docs page explicitly disables Drawing tabs because the workspace does not exist.

### Required workstreams

- **A. Drawing workspace:** tab, sheet sizes, borders, zones, title blocks, templates.
- **B. Views:** standard, projected, aligned, auxiliary, section, detail, exploded and broken-out.
- **C. Annotation:** dimensions, ordinate dimensions, GD&T, surface finish, weld symbols, notes, balloons.
- **D. BOM and fields:** BOM table linked to assembly; local revision/title fields; no cloud release workflow.
- **E. Drawing properties and updates:** scales, multi-sheet navigation, associative update after model changes.
- **F. Export:** PDF, DWG, DXF, SVG; print.

### Exit gate

- Two-sheet drawing from an assembly.
- Change a model dimension and see views/dimensions update.
- Export PDF/DWG and verify sheet count, scale and BOM rows.
- Checklist and visual regression pass.

**Not in this phase:** release approvals and cloud revision control.

---

## 10. Phase 6 — Sheet metal, frames and surfaces

**Status:** **Feature-complete; integration/exit gates remain (63/67).**  
**Depends on:** Phase 3.  
**Size:** 6–9 months.  
**Goal:** manufacturable sheet metal and frames, plus complete surface modelling.

### Implemented

- **A. Sheet metal:** rules/styles, base flange, edge flange, bend, relief, corner treatment, hem, louver, true flat pattern, bend table and flat-pattern DXF export.
- **B. Frames:** profile libraries, groups, miter/trim/cope, weld gaps, cut lists, BOM and assembly placement.
- **C. Surfaces:** boundary, loft, fill, ruled, offset, knit/stitch, trim, extend, thicken, replace face and curvature analysis.
- **D. Conversion:** solid↔surface bodies with closure, manifold, gap and volume diagnostics.

### Matrix rows

| Row | Capability | Status |
| --- | --- | --- |
| 4.3.18 | Surface features | SHIPPED |
| 4.3.19 | Sheet metal | SHIPPED |
| 4.3.20 | Frames | SHIPPED |

### Remaining exit gate

Still open as Phase 6 integration/exit evidence:

- P6-EXIT-01: sheet-metal enclosure unfolds to a manufacturable flat pattern exported as DXF and reopened.
- P6-EXIT-02: frame assembly produces a cut list verified through BOM/drawing.
- P6-EXIT-03: surface model knits, thickens and converts to a solid without gaps.
- P6-EXIT-04: lifecycle/no-placeholder audit.

**Not in this phase:** CAM toolpaths from the flat pattern (Phase 8).

---

## 11. Phase 7 — Configurations, Variable Studio and FeatureScript

**Status:** **Not started as a phase.**  
**Depends on:** Phases 3 and 4.  
**Size:** 6–12 months.  
**Goal:** author part families and custom features entirely in the browser.

### Existing precursor

Sketch variables and expressions are real (Phase 2.3). They are scoped to sketch dimension evaluation, not a document-level Variable Studio, configuration table or FeatureScript runtime.

### Required workstreams

- **A. Variable Studio:** types, units, expressions, tables, document-level variables, dependency display.
- **B. Configurations:** Part Studio, Assembly and property configurations; configuration tables; visibility conditions; configured tabs and BOM columns.
- **C. FeatureScript:** editor with highlighting, completion, errors, docs and local history; parser/evaluator; custom feature definition/insertion/configuration; notices and compatibility behavior.
- **D. Migration and round-trip:** configured documents and custom features.

### Exit gate

- Part family with three configurations switching geometry and BOM data.
- Custom feature authored in Feature Studio inserts, edits and rebuilds.
- Errors point at the offending line and do not corrupt the document.

**Not in this phase:** publishing custom features to an App Store.

---

## 12. Phase 8 — Specialized studios and translation

**Status:** **Partially implemented. Render Studio is shipped and browser-verified;
Simulation, CAM, PCB and broad translation remain open.**  
**Depends on:** Phases 5, 6, 7.  
**Size:** 18–24+ months.  
**Goal:** the remaining browser studios, each with local compute and its own acceptance suite.

### Existing precursor

The repository has substantial ECAD simulation, firmware/MCU emulation, RF, VR and manufacturing/patent subsystems. Those are separate product capabilities, not completed Onshape-style studio parity surfaces. Render Studio is now built and browser-verified. Simulation Studio, CAM Studio, a full PCB Studio (schematic, board layout, libraries, DRC, 3D board integration) and broad translation are not built.

### Required tracks

- **A. Render Studio:** PBR materials/appearances, environments/lights, cameras, local/worker render, image export.
- **B. Simulation:** meshing, linear static, modal, thermal, buckling, contacts, results, reports, local solver budget.
- **C. CAM Studio:** stock, tools, operations, toolpaths, simulation, post-processors, setup sheets.
- **D. PCB Studio:** schematic, board layout, libraries, DRC, 3D board integration.
- **E. Translation:** IGES, Parasolid, ACIS, JT, 3MF, PDF; imported-history editing.

### Exit gate

- Each studio has a demo model, automated suite and performance budget.
- Imported files open, measure and edit without silent geometry loss.

**Not in this phase:** cloud rendering, cloud solving or hosted translation.

---

## 13. Phase 9 — Hardening and release

**Status:** **Not started as a phase.**  
**Depends on:** continuous; gates release after all preceding phases.  
**Goal:** make the whole designer dependable enough to call parity.

### Existing continuous controls

- `scripts/control-inventory.mjs` + `CONTROL_INVENTORY.md` keep dead/unlabeled controls countable.
- `scripts/check-budgets.mjs` + `e2e/perf-budget.spec.ts` define boot/reload/regenerate/orbit budgets.
- Chromium full suite plus Firefox/WebKit smoke matrix exist.
- `npm run test:bible` aggregates typecheck, lint, unit, build, bundle, inventory, parity and budget schema.
- Named undo labels, document recovery and quota reporting exist from Phases 1–3.

These are building blocks, not the Phase 9 exit gate. There is no complete accessibility audit, no full three-browser suite, no long-session/quota stress campaign, no release evidence archive and no fully evidenced release gate report.

### Required workstreams

- **A. Accessibility:** keyboard-only operation, focus order, labels, contrast, reduced motion.
- **B. Local data:** recovery, quota handling, migration, long-session stability.
- **C. Performance:** boot, orbit, regenerate, large assembly, drawing open, all against measured budgets.
- **D. Cross-browser:** full Chromium, Firefox and WebKit suites at supported widths/devices.
- **E. Control audit:** zero dead controls.
- **F. Release gate:** execute and archive evidence.

### Release gate (section 8 of `ONSHAPE_PARITY.md`)

1. Every matrix row `SHIPPED` or explicitly approved out of scope.
2. Every visible control has a handler, correct enabled/disabled rule and an automated test or `TEST_BIBLE.md` line; no dead/mock controls.
3. 1:1 UI blueprint passes visual regression at supported viewport sizes.
4. Chromium, Firefox and WebKit pass the full browser suite, not only smoke.
5. Multi-tab document with features, sketches and a local snapshot survives save/reload/recovery/re-import with identical state.
6. Representative part, assembly, drawing and sheet-metal part can be authored, edited, exported and re-imported.
7. Performance budgets pass.
8. Keyboard-only and accessibility checks pass.
9. No parity row is backed only by a button, mock or screenshot.

---

## 14. Current working tree — the uncommitted Phase 3 slice

At snapshot time:

- **35 modified tracked files**, **+5,709/−461** tracked lines.
- **21 untracked files** before this document; this document adds one more.
- Branch `wip/vr-toolbelt`; HEAD `1d84d61`; no Phase 3 commit.

### Major modified areas

- **Feature model/executor:** `src/model/executor.ts`, `featureEngine.ts`, `featureMap.ts`, `primitives.ts`, `primitiveLibrary.ts`, `actionBus.ts`, `operationMenu.ts`, `sceneSync.ts`.
- **Feature UI/tree:** `FeatureTree.tsx`, `BrowserContextMenu.tsx`, `BrowserSidePanel.tsx`, `PrimaryToolbar.tsx`.
- **OCC kernel:** `vendor/cadjs/src/workers/occ-worker-handlers.ts`, `occ-dispatch.ts`, `occ-extrude.ts`, `occ-fillet-chamfer.ts`, `parity-operations.ts`, `fillet-operations.ts`, `resize-operations.ts`.
- **Undo bridge:** `vendor/cadjs/src/contexts/CoreContext.tsx`, `useUndoStack.ts`, `undo-types.ts`, new `undo-extras.ts`.
- **Scene/debug:** `src/scenes/simpleCadScene.tsx`, `e2e/helpers.ts`.
- **Docs:** `ONSHAPE_PARITY.md`, `UNDONE.md`.

### New untracked implementation/tests

- Feature engine/dialog/audit: `featureEngine.test.ts`, `featureDialog.ts`, `FeatureDialog.tsx`, `featureDialog.test.ts`, `paramSupport.ts`, `paramSupport.test.ts`.
- Tree/folders/undo: `featureTreeGroups.ts`, `featureTreeGroups.test.ts`, `undoExternal.test.ts`.
- Body semantics: `bodyProperties.ts`, `BodyPropertiesPanel.tsx`, `bodyProperties.test.ts`, `body-properties.spec.ts`, `multi-body.spec.ts`.
- C evidence: `e2e/feature-dialog.spec.ts`, `e2e/feature-tree.spec.ts`, additions to `e2e/parity-ops.spec.ts`.
- Standards/export: `holeStandards.ts`, `exportSelection.test.ts`.
- Phase 3 backlog: `PHASE3_REMAINING.md`.

### What is not committed

Everything above. A clean clone at `1d84d61` has Phase 0–2.5 only. If Phase 3 work must be preserved or shared, it needs a commit; this snapshot does not claim otherwise.

---

## 15. Verification log for the current position

### Final targeted run after the D slice

Command set run from `cadjs-starter`:

- `npx tsc -p tsconfig.json --noEmit` — **0 errors**.
- `npx vitest run` on:
  - `featureDialog.test.ts`
  - `featureEngine.test.ts`
  - `paramSupport.test.ts`
  - `primitives.test.ts`
  - `executor.test.ts`
  - `sceneSync.test.ts`  
    — **54 passed**.
- `npx playwright test e2e/parity-ops.spec.ts --grep "pattern|delete-face and split|move-face"` — **8 passed** on the real OCC kernel.
- `npx playwright test e2e/feature-dialog.spec.ts` — **4 passed**.
- `npx playwright test e2e/feature-tree.spec.ts` — **2 passed**.
- `git diff --check` — clean.

### What this proves

- Typecheck is clean for the changed tree.
- The focused model suite is green.
- C face-pattern, split-by-surface and dialog paths are real-kernel browser-tested.
- D collision rename, cascade suppression/undo and reorder clamp are browser-tested.
- Existing feature-tree folder/reference/reorder/delete paths still pass.

### What this does **not** prove

- The full unit suite was not rerun in this snapshot; 603/619 figures are historical phase evidence, not current full-suite claims.
- The full Chromium suite was not rerun.
- Firefox and WebKit were not run.
- `npm run test:bible`, production build and bundle budget were not rerun.
- No screenshot/visual regression baseline was captured.
- No 20+ feature Phase 3 acceptance part exists yet.
- Phase 3 is not committed, so CI has not seen this work.

---

## 16. Documentation and matrix inconsistencies to resolve

These are real and should not be papered over.

1. **Phase 2 heading is stale.** `ONSHAPE_PARITY.md` top status says Phase 2 complete, while the Phase 2 section heading says “in progress: Phase 2.1 complete.” The sub-phase narratives and commits support code-complete 2.1–2.5, with screenshot baselines open.
2. **Phase 2.1 matrix rows are stale.** `PARITY_STATUS.md` (generated 2026-11-07T01:36) still marks polyline, hatch, blocks and layers `MISSING`, despite commit `d6f6644` and passing tests. Regenerate/fix the matrix before using row coverage as evidence.
3. **Two coverage numbers exist.** `ONSHAPE_PARITY.md` §9 mentions 39.7% after Phase 2.2; `PARITY_STATUS.md` and the Phase 1 demo report 35.1%. Use the generated report with the stale-row caveat, or regenerate; do not quote both as current.
4. **Phase 3 is uncommitted.** Any claim that Phase 3 C/D is “committed” is false at this snapshot.
5. **`PHASE3_REMAINING.md` is untracked.** It is the detailed Phase 3 source of truth but is not in git yet.
6. **Phase 3 parameter audit is partial.** `KERNEL_CONSUMED_PARAMS` covers only audited executor ops. Unaudited parameters remain editable until read; do not treat their presence as implementation.
7. **Primitive `deferred` entries are stale.** `PHASE3_REMAINING.md` still has an open item to remove stale `primitive.* status: "deferred"` entries because those primitives landed.
8. **Split stale note is still listed as an open audit item** even though the C checklist says the note was removed. Confirm the source before closing the cross-cutting item.

---

## 17. Exactly where the work left off

**HEAD:** `1d84d61` (`test: update phase 2 acceptance controls`).  
**Working tree:** dirty with the entire Phase 3 pass, including B/C/D.  
**Current phase:** Phase 3.  
**Current sub-slice:** D — feature tree, closed; A is the next depth area.  
**Last completed action:** D semantics/rollback/failure pass verified green (15 model tests, 3 Chromium tree tests, dialog and multi-body suites); docs updated in the working tree.  
**No commit was made.**

### Resume here

1. **Preserve the work.** The immediate risk is that 35 modified + 21 untracked files are only in the working tree. Commit only when the user asks; do not silently commit.
2. **Return to A.** B, C and D are done, so A is the largest open depth area.
3. **D is closed.** Re-open it only if A/E/F/G/H changes tree behaviour; the remaining work is not D.
4. **A next items:** extrude end conditions/thin/draft/merge scopes, then revolve/sweep/loft depth, then wire the remaining feature dialogs.
5. **After A/D:** E parts/materials, F new features, G inspect, then H’s 20+ feature acceptance part and Phase 3 exit gate.
6. **Only then:** Phase 4 assembly, Phase 5 drawing, Phase 6 sheet metal/frames/surfaces, Phase 7 configurations/FeatureScript, Phase 8 studios, Phase 9 release hardening.

### Current claim that is safe to make

> Phases 0–2.5 are committed and evidenced. Phase 3 B and C are implemented in the working tree, C has real-kernel browser evidence, and D’s first reference-safety slice is implemented and browser-tested. Phase 3 is not complete, and none of the Phase 3 work is committed.

Any stronger claim would be false at this snapshot.
