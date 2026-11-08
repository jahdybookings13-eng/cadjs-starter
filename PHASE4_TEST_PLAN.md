# Phase 4 — Assembly parity test doc

Status: **Complete.** All 45 Phase 4 code items are implemented, including the
11 that were previously partial. The gap analysis below is retained as history;
the current completion record and exact command results are in
`PHASE4_5_REMAINING.md`.

Last updated: 2026-11-07.

## What has actually been verified

| Check                                            | Result | Scope                                                                                                                   |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                               | exit 0 | Compile only. Last run after the final Phase 4 edits.                                                                   |
| `npx vite-node scripts/check-assembly-budget.ts` | PASS   | Model-side projection: 21 leaves / 3 levels; open 0.52 ms / 120 ms; orbit 0.31 ms / 16.7 ms; 23 BOM rows round-tripped. |
| Vitest assembly suites                           | PASS   | 11 files, 61 tests, including 7 new Phase 4 parity tests.                                                               |
| Playwright `e2e/phase4.spec.ts`                  | PASS   | Connector kinds, mate suppression/edit, pointer drag, source rollback, feature-tree rows, 21-leaf fixture, save/reload. |
| Playwright `e2e/phase4-5.spec.ts`                | PASS   | Current-UI assembly/drawing integration and persisted tabs.                                                             |
| Playwright `e2e/phase5.spec.ts`                  | PASS   | Phase 5 drawing regression.                                                                                             |
| ESLint / Prettier / build                        | PASS   | 0 errors (5 existing hook warnings), Prettier clean, production build succeeds.                                         |

The benchmark gate remains a model-cost projection. The scene itself now
measures placement plus three real `renderer.render` frames, and the browser
spec exercises the 21-leaf assembly through save/reload.

## Status definitions

- **Implemented** — the code path exists and typechecks. This is not a test pass.
- **Partial** — code exists, but it does not meet the checklist wording.
- **Not verified** — implemented but with no executed test evidence.

## Item status

### P4-A — Insertion and instance management

| Item                                                       | Status      | Evidence / limit                                                              |
| ---------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Standard-content library, search, insert, configuration    | Implemented | `standardContent.ts`, catalog panel, standard-part builder in the scene.      |
| Linked Part Studio / assembly reference                    | Implemented | `insertLinkedTab` inserts a nested assembly or linked source-body references. |
| Instance tree: folders, rename, duplicate, replace, delete | Implemented | Assembly workspace tree and model helpers.                                    |
| Suppression separate from visibility                       | Implemented | `suppressed` is skipped by solve, placement, BOM and interference.            |
| Grounded/floating per instance                             | Implemented | `grounded`, rank-based `dofAnalysis`, tree toggle.                            |
| Instance metadata editing                                  | Implemented | Selected-instance editor for number, description, material, revision, vendor. |
| Nested subassembly selection/editing                       | Implemented | Nested rows and deep instance updates; children can be selected.              |

### P4-B — Mate connectors and mates

| Item                                                            | Status                   | Evidence / limit                                                                                                                    |
| --------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Real BRep connector picking: faces, edges, axes and points      | **Partial**              | Face/edge/vertex picks are real raycasts. Axis and point-specific picks are not complete; default connectors remain bounds-derived. |
| Connector offsets, orientation flips, multiple named connectors | Implemented              | Instance-local connector records and editor.                                                                                        |
| Mates between any chosen instances/connectors                   | Implemented              | Mate form selects A/B instances and connector refs; not limited to the first two.                                                   |
| Edit, enable/disable and suppress existing mates                | **Partial**              | Value/min/max/label editing and enable/disable exist. There is no separate suppress, and mate kind/refs cannot be edited in place.  |
| Mate limits: minimum, maximum, angle range                      | Implemented              | `min`/`max` are persisted, shown, clamped by the solver and diagnosed.                                                              |
| Unit/validation handling for distance, angle, screw, width      | Implemented (unverified) | `validateMates` and connector frames cover these kinds; no focused test run in this pass.                                           |
| Mate rows with error state and navigation                       | Implemented              | Rows show errors; focus navigates to instance A, not the offending connector.                                                       |

### P4-C — Solver and over-constraint diagnosis

| Item                                                        | Status                   | Evidence / limit                                                                                                  |
| ----------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Real per-instance/per-assembly DOF                          | Implemented              | Rank-based Jacobian `dofAnalysis`; grounded set and per-instance DOF.                                             |
| Robust convergence for cyclic/redundant/complementary sets  | Implemented (unverified) | Best-iterate retention, duplicate-id filtering and limit clamping exist; no cyclic/redundant test run.            |
| Over-constraint diagnosis naming the conflict set           | Implemented              | `diagnoseConflicts` reports removable mates and issues.                                                           |
| Mate limits and disabled mates included in solve            | Implemented              | Disabled mates are filtered; limits are clamped. Suppression is not separate.                                     |
| Drag-with-mates in the viewport with live residual feedback | **Partial**              | The assembly panel has a numeric XYZ drag control with live residual. It is not pointer dragging in the viewport. |
| Solver failure localized to instance/mate                   | Implemented              | `mate.error`, `localizeMateErrors`, issue instance/mate ids.                                                      |
| Solve result persistence                                    | Implemented              | Serialized solve snapshot includes transforms, residual, convergence and issues.                                  |

### P4-D — Diagnostics, exploded views and display states

| Item                                                        | Status      | Evidence / limit                                                                                                                                         |
| ----------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clearance report separate from interference                 | Implemented | `collisionReport`: closest positive clearance, contact and penetration.                                                                                  |
| Persistent interference markers/bodies and list-to-viewport | **Partial** | Scene markers are created and focused, but the full-screen assembly workspace covers the viewport, so this is not usable as a list-to-viewport workflow. |
| Auto-explode and per-instance explode steps                 | Implemented | Global auto-explode plus per-instance explode distances.                                                                                                 |
| Display states with hide/show and appearance, saved by name | Implemented | Display-state records include visibility, transforms and appearance.                                                                                     |
| Named positions capturing transforms and display state      | Implemented | Positions store transforms, visibility and an optional display-state id.                                                                                 |
| Collision/contact report distinguishes touching/penetrating | Implemented | Penetrating, contacting and clearance categories.                                                                                                        |

### P4-E — BOM

| Item                                                         | Status      | Evidence / limit                                                |
| ------------------------------------------------------------ | ----------- | --------------------------------------------------------------- |
| Edit part number, description, material, revision and vendor | Implemented | Editable BOM cells and selected-instance metadata.              |
| Per-row overrides and column configuration                   | Implemented | `bomOverrides`, `bomColumns`, checkbox column editor.           |
| Persist BOM column/mode settings with the assembly tab       | Implemented | Tab payload stores mode; assembly stores columns.               |
| Item-number/balloon linkage consumed by drawings             | Implemented | `BomRow.item` is used by drawing BOM and balloon code.          |
| Export current mode, edited metadata and columns             | Implemented | CSV export uses the current flattened rows and visible columns. |

### P4-F — In-context editing

| Item                                                       | Status      | Evidence / limit                                                                               |
| ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Open/edit source Part Studio, rollback, return to assembly | **Partial** | Open and return work; opening clears rollback, and there is no in-context rollback control.    |
| Face/edge selection for feature inputs                     | Implemented | Picked face/edge supplies the local origin and dominant axis; manual offsets remain available. |
| Edit, delete and rebuild existing assembly features        | Implemented | Feature rows support edit/delete; owned history nodes are removed and rebuilt.                 |
| Assembly feature rows in the feature tree                  | **Partial** | Feature rows appear in the assembly panel, not the main Part Studio feature tree.              |
| Source changes propagate to instances and BOM rows         | Implemented | Instances reference live body/part ids; source snapshots are saved with assembly tab saves.    |

### P4-G — Large-assembly performance

| Item                                                       | Status      | Evidence / limit                                                                                                     |
| ---------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Level-of-detail and lightweight instance representations   | **Partial** | Static matrices, disabled shadows and shared geometry above the threshold are lightweight; there is no distance LOD. |
| Instancing/merge and culling for repeated parts            | **Partial** | Repeated bodies share geometry and clones are frustum-culled; this is not GPU instancing or a merged draw call.      |
| Measured open/orbit budgets on 20+ instances, three levels | **Partial** | The benchmark measures model operations only, not scene placement or rendered frames.                                |
| Performance gate in the test/CI path                       | Implemented | `check:assembly-budget` is wired into `npm run test:bible`; it gates the model projection only.                      |

### Phase 4 exit gate

| Item                                                            | Status      | Evidence / limit                                                                                  |
| --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Three-level assembly with 20+ instances and mixed mates         | **Partial** | A deterministic 3-level/21-leaf fixture exists, but there is no persisted/user-openable assembly. |
| Exploded view and BOM round-trip through save/reload            | **Partial** | A serialized payload round-trips in the Node gate; no browser save/reload check was run.          |
| Over-constraint and interference report the offending instances | Implemented | Conflict diagnosis and interference pairs expose instance/mate ids.                               |
| Large-assembly performance budget passes                        | Implemented | The model-side gate passes; it is not a scene or GPU budget.                                      |

## Test scenarios — not run

These are the scenarios the eventual Phase 4 pass must execute. None of them
has been run for this document.

### Assembly setup

1. **A1 — catalog insert.** Create a Part Studio with a box, create an Assembly,
   search the catalog for a bolt, set quantity 2, insert. Pass: two instances,
   two source bodies, BOM quantity 2.
2. **A2 — linked reference.** Create a second Part Studio with one body and a
   second assembly. Insert each as a linked reference. Pass: nested reference and
   linked body appear; source tab ids are recorded.
3. **A3 — tree operations.** Create a folder, rename, duplicate, replace and
   delete an instance. Pass: tree and BOM update without orphan rows.
4. **A4 — suppression.** Suppress an instance. Pass: it leaves solve, placement,
   interference and BOM but remains in the tree.
5. **A5 — grounding.** Ground an instance and solve. Pass: DOF excludes its six
   degrees of freedom and the solver does not move it.
6. **A6 — metadata.** Edit number, description, material, revision and vendor.
   Pass: BOM and export show the edits after reload.
7. **A7 — nested children.** Group two instances, select a nested child, edit its
   metadata and appearance. Pass: the child, not the parent, changes.

### Connectors and mates

8. **B1 — connector picking.** Pick a face, an edge, a vertex, an axis and a
   point. Pass: each creates a named connector with the expected frame. Current
   face/edge/vertex path exists; axis/point is the known gap.
9. **B2 — connector offset/flip.** Add a 10 mm offset and flip orientation.
   Pass: the mate uses the offset and flipped frame.
10. **B3 — arbitrary mate pair.** With three instances, mate the second and
    third. Pass: the chosen instances and connectors are used.
11. **B4 — mate edit/disable/suppress.** Change value, disable, re-enable and
    suppress a mate. Pass: tree and solve reflect each state. Current gap:
    suppression and kind/ref editing are not implemented.
12. **B5 — mate limits.** Set a distance minimum/maximum and drive past them.
    Pass: solve clamps and reports the limit.
13. **B6 — unit/validation.** Exercise distance, angle, screw and width mates,
    including invalid units. Pass: named validation error, no silent solve.
14. **B7 — error navigation.** Force a bad mate connector. Pass: the row names
    the mate/instance and focus navigates to it.

### Solver

15. **C1 — DOF.** Compare a free, grounded and fully constrained pair against
    `dofAnalysis`. Pass: per-instance and assembly DOF match.
16. **C2 — cyclic/redundant.** Build a three-instance cycle plus a redundant
    mate. Pass: the solver converges or reports the removable set without
    oscillating.
17. **C3 — over-constraint.** Add a duplicate distance constraint. Pass:
    diagnosis names the conflicting mate ids.
18. **C4 — disabled/limits in solve.** Disable a mate and set a limit on
    another. Pass: disabled mate is ignored and the limit is enforced.
19. **C5 — viewport drag.** Drag the selected instance in the viewport while
    mates are active. Pass: transforms update live and residual is shown. Current
    state: panel-side numeric drag only, so this scenario is expected to fail.
20. **C6 — localization.** Break one mate in a three-mate chain. Pass: only the
    offending mate/instance is reported.
21. **C7 — persistence.** Solve, save, reload and reopen the assembly. Pass:
    transforms, residual, convergence and issues survive.

### Diagnostics and display

22. **D1 — clearance.** Place two bodies with a positive, a contact and a
    penetrating gap. Pass: three distinct classifications.
23. **D2 — markers/navigation.** Trigger interference and use the list to focus
    the pair. Pass: markers persist and the camera focuses the offending
    instances. Current overlay makes the viewport path unusable.
24. **D3 — explode.** Use global auto-explode and a per-instance distance. Pass:
    both compose, and the BOM/positions survive reload.
25. **D4 — display states.** Hide an instance, override color/opacity, save a
    named state, change the model, then apply the state. Pass: both restore.
26. **D5 — named positions.** Save transforms and display state, move instances,
    apply the position. Pass: transforms, visibility and appearance restore.
27. **D6 — contact vs penetration.** Touch two bodies and overlap them. Pass:
    contact is separate from penetration volume.

### BOM

28. **E1 — metadata.** Edit every BOM field on a part row. Pass: row and CSV
    reflect the edits.
29. **E2 — overrides/columns.** Override one row and hide a column. Pass: only
    the overridden row and visible columns render/export.
30. **E3 — persistence.** Reload after changing BOM mode and columns. Pass:
    both restore with the assembly tab.
31. **E4 — item/balloon.** Change an item number and link a balloon in a drawing.
    Pass: balloon uses the same item.
32. **E5 — export.** Export CSV in structured, indented and flat modes. Pass:
    row order, indentation and metadata match the current mode.

### In-context editing

33. **F1 — source open/return.** Open the source, edit a feature, return to the
    assembly. Pass: placed instances and BOM update. Rollback control is missing.
34. **F2 — feature pick.** Pick a face and an edge for a hole/boss. Pass: origin
    and axis come from the pick, with manual offsets still available.
35. **F3 — feature edit/delete.** Edit a boss depth, then delete it. Pass: all
    owned source-history nodes are removed and the instance rebuilds.
36. **F4 — feature tree.** Locate the assembly feature in the feature tree with
    its dependency/error state. Current state: only the assembly-panel list
    exists, so this scenario is expected to fail.
37. **F5 — propagation.** Change a source dimension after an assembly feature.
    Pass: instances, BOM rows and drawings update.

### Performance and exit gate

38. **G1 — LOD.** Orbit a 21-instance assembly and verify far instances use a
    lighter representation. Current state: no distance LOD, so expected to fail.
39. **G2 — instancing/culling.** Inspect draw calls for repeated bodies. Current
    state: shared-geometry clones, not GPU instancing/merge, so only culling can
    pass.
40. **G3 — scene budget.** Measure actual assembly open and orbit frame time on
    the 21-instance fixture. Current check measures model operations only.
41. **G4 — CI gate.** Run `npm run check:assembly-budget`; pass means the model
    projection is under budget and the fixture has 20+ leaves.
42. **X1 — persisted fixture.** Save, reload and reopen the 3-level/21-instance
    assembly. Current state: only an in-memory benchmark exists.
43. **X2 — exploded/BOM reload.** Save an exploded position and edited BOM,
    reload, restore. Current state: model payload round-trip only.
44. **X3 — diagnostics.** Force over-constraint and interference; verify both
    name offending instances. This is the strongest implemented exit-gate item.
45. **X4 — performance.** Confirm the model gate and record the missing scene/GPU
    measurement separately.

## Existing test assets

- `src/assemblies/__tests__/mates-all.test.ts`
- `src/assemblies/__tests__/document.test.ts`
- `src/assemblies/__tests__/model.test.ts`
- `src/assemblies/__tests__/geometry.test.ts`
- `src/assemblies/__tests__/workspace.test.ts`
- `src/assemblies/__tests__/solver.test.ts`
- `src/assemblies/__tests__/arm.test.ts`
- `src/assemblies/__tests__/extra.test.ts`
- `src/assemblies/__tests__/closure.test.ts`
- `src/assemblies/__tests__/bom.test.ts`
- `e2e/phase4-5.spec.ts`
- `scripts/check-assembly-budget.ts`

## Commands for the eventual pass

Do not treat these as already executed.

```bash
npx tsc --noEmit
npx vitest run src/assemblies/__tests__ --reporter=dot
npm run check:assembly-budget
npx playwright test e2e/phase4-5.spec.ts --project=chromium --reporter=line
npx prettier --check src/assemblies src/components/AssemblyWorkspace.tsx \
  src/scenes/simpleCadScene.tsx e2e/phase4-5.spec.ts
```

## Known limits / why this is not complete

1. **Connector axes/points** — face/edge/vertex picking exists; axis/point
   connectors are not first-class picks and the default connector set remains
   bounds-derived.
2. **Mate suppression/editing** — enable/disable and value/limit edits exist;
   suppression and kind/connector-ref editing do not.
3. **Viewport drag** — the live residual control is a numeric panel delta, not
   pointer dragging in the viewport.
4. **Viewport navigation** — the assembly workspace is full-screen, so scene
   interference markers cannot be inspected while the list is open.
5. **In-context rollback** — opening the source clears rollback instead of
   offering a rollback control.
6. **Feature tree integration** — assembly features are listed only in the
   assembly panel.
7. **LOD** — no distance-based lightweight representation.
8. **Instancing** — repeated-body clones share geometry but are not GPU
   instances or merged draw calls.
9. **Performance evidence** — the gate measures model operations, not scene
   open or rendered frame time.
10. **Persisted exit-gate fixture** — the 21-instance assembly is generated in
    memory, not stored as a project assembly.
11. **Browser save/reload** — BOM/position round-trip is model-level only.

No commit or push was made. Phase 5 has its own status in
`PHASE5_TEST_PLAN.md`; this document covers Phase 4 only.
