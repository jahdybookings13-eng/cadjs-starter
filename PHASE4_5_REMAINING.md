# Phase 4 + Phase 5 — completion list

Status: **Phase 4 complete: 45/45 implemented.** All 11 formerly partial
items are implemented and covered by the targeted Phase 4 checks below. Phase 5
keeps its own status in `PHASE5_TEST_PLAN.md`.

Verified on 2026-11-07:

- `npx tsc --noEmit` exit 0.
- `npx vitest run src/assemblies/__tests__` 61/61 pass (11 files).
- `npm run check:assembly-budget` PASS: 21 leaves / 3 levels; open 0.52/120 ms;
  orbit 0.31/16.7 ms; 23 BOM rows round-tripped.
- `e2e/phase4.spec.ts` pass (Chromium): connector kinds, mate suppression/edit,
  pointer drag, list focus, source rollback, feature-tree rows, the 21-leaf
  fixture and save/reload with BOM.
- `e2e/phase4-5.spec.ts` and `e2e/phase5.spec.ts` pass.
- `npm run build` pass. ESLint 0 errors (5 pre-existing hook warnings);
  Prettier clean.

Source of the phase definitions: `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`
sections 8 and 9, and `ONSHAPE_PARITY.md` Phase 4/5.

Already landed in the vertical slice (not remaining work):

- Assembly: 17 mate kinds, geometry-aware solve, group/ungroup subassemblies,
  hole/cut/boss/revolve/fillet/chamfer assembly features, AABB/face/BRep
  interference, structured/indented/flat BOM with CSV, explode slider, named
  explode positions, patterns, visibility.
- Drawing: persisted multi-sheet workspace, A4/A3, ISO/ANSI templates, zones,
  front/top/right/iso, section, detail, auxiliary, broken-out views, balloons,
  notes, GD&T, surface finish, welds, body/edge dimensions, native DXF/DWG
  dimensions, PDF/DXF/DWG/SVG export.

---

## Phase 4 — Assembly parity

**Definition of done:** a three-level assembly with 20+ instances and mixed
mates, an exploded view, diagnostics and a BOM that round-trips through
save/reload, plus a passing large-assembly performance budget.

Verification: the model-side `check:assembly-budget` gate builds the
3-level/21-leaf benchmark, asserts the open/orbit projections and round-trips a
serialized payload with 23 BOM rows. The browser path now reports placement plus
real `renderer.render` frame time, and `e2e/phase4.spec.ts` verifies the
21-instance fixture and its save/reload round-trip.

### P4-A. Insertion and instance management

Remaining:

- [x] Standard-content library: fasteners, bearings and other catalog parts,
      with search, insert and configuration.
- [x] Insert a Part Studio or another assembly as a linked reference, not only
      individual source bodies.
- [x] Instance tree with folders, rename, duplicate, replace and delete.
- [x] Instance suppression separate from visibility.
- [x] Grounded/floating state per instance, exposed in the tree.
- [x] Instance metadata editing in the assembly list.
- [x] Selection and editing that work for nested subassembly children, not only
      top-level rows.

### P4-B. Mate connectors and mates

Remaining:

- [x] Connector picking from real BRep faces, edges, axes and points. Picked
      edges/axes snap to the nearest BRep edge; points snap to the nearest
      BRep vertex.
- [x] Connector offsets, orientation flips and multiple named connectors per
      instance.
- [x] Mate creation between any chosen instances/connectors, not just the first
      two instances.
- [x] Edit, enable/disable and suppress existing mates.
- [x] Mate limits: minimum, maximum and angle range.
- [x] Full unit/validation handling for distance, angle, screw and width mates.
- [x] Mate feature-tree rows with error state and navigation to the offending
      instance/connector.

### P4-C. Solver and over-constraint diagnosis

Remaining:

- [x] Real per-instance/per-assembly DOF calculation. The current DOF is the
      naive `6 × visible instances − MATE_DOF` estimate.
- [x] Robust convergence for cyclic, redundant and complementary constraint
      sets.
- [x] Over-constraint diagnosis that names the conflicting constraint set, not
      only a negative DOF count.
- [x] Mate limits and disabled mates included in the solve.
- [x] Drag-with-mates in the viewport with live residual feedback.
- [x] Solver failure localized to the instance/mate that failed.
- [x] Solve result persistence: transforms, residual, convergence and issues
      survive save/reload.

### P4-D. Diagnostics, exploded views and display states

Remaining:

- [x] Clearance report, separate from interference: positive minimum clearance,
      contact and clearance violations.
- [x] Persistent interference markers/bodies and list-to-viewport navigation.
- [x] Auto-explode and per-instance explode steps, not one global exploded
      offset.
- [x] Display states: hide/show and appearance overrides, saved by name.
- [x] Named positions that capture transforms and display state, not only the
      explode value.
- [x] Collision/contact report that distinguishes touching from penetrating.

### P4-E. BOM

Remaining:

- [x] Edit BOM metadata in the assembly: part number, description, material,
      revision and vendor.
- [x] Per-row overrides and column configuration.
- [x] Persist BOM column/mode settings with the assembly tab.
- [x] Item-number/balloon linkage that the drawing can consume.
- [x] Export the current BOM mode, edited metadata and column configuration.

### P4-F. In-context editing

Remaining:

- [x] Open and edit the source Part Studio from an assembly context, including
      rollback and return-to-assembly.
- [x] Select faces/edges for assembly feature inputs instead of entering an axis
      plus offsets.
- [x] Edit, delete and rebuild existing assembly features.
- [x] Assembly feature rows in the feature tree with dependency/error state.
- [x] Source-model changes propagate to placed instances and their BOM rows.

### P4-G. Large-assembly performance

Remaining:

- [x] Level-of-detail and lightweight instance representations.
- [x] Instancing/merge and culling for repeated parts.
- [x] Measured open/orbit budgets on a 20+ instance, three-level assembly.
- [x] Performance gate in the test/CI path so the budget cannot silently
      regress.

### Phase 4 exit gate

- [x] Three-level assembly with 20+ instances and mixed mates.
- [x] Exploded view and BOM round-trip through save/reload.
- [x] Over-constraint and interference report the offending instances.
- [x] Large-assembly performance budget passes.

### Status correction (2026-11-07)

All 45 Phase 4 items above are now implemented. The formerly partial 11 are
checked and backed by the unit, browser, budget and save/reload checks in the
header. Phase 5 checkboxes are tracked separately.

---

## Phase 5 — Drawing parity

**Definition of done:** a production drawing package generated from an assembly,
kept associative, with multi-sheet export and verified sheet count, scale, BOM
rows and visual regression.

### P5-A. Workspace, sheets and title block

> Phase 5 implementation and focused verification are complete. See `PHASE5_TEST_PLAN.md` for the test map and manual visual checklist.

Remaining:

- [x] Custom sheet formats/templates and title-block variants, not only the
      ISO/ANSI frame choice.
- [x] Editable title-block fields: revision, date, drawn by, checked/approved,
      material, finish and weight.
- [x] Sheet management beyond add/remove/switch: duplicate, reorder and rename.
- [x] Real sheet scale plus per-view scale for standard/projected/section views,
      not a display-only `scale` string.
- [x] Persist all sheet and title-block properties per sheet.

### P5-B. Views

Remaining:

- [x] Aligned views.
- [x] Exploded assembly view.
- [x] Projected-view placement and alignment controls relative to a parent view.
- [x] Per-view scale.
- [x] View suppression, rename, reposition and lock.
- [x] Custom/named view orientations.
- [x] Section direction/depth and section hatching controls.
- [x] Stable view IDs across model rebuilds so annotations do not detach.

### P5-C. Annotation

Remaining:

- [x] Ordinate dimensions.
- [x] Angular, radius and diameter dimensions.
- [x] Dimension tolerances, fits and limits.
- [x] Edit/move existing dimensions and annotations, not only add/delete.
- [x] Editable leaders, landing lines and text styles.
- [x] Balloon renumbering and automatic balloon-to-BOM-item linking.
- [x] Stable face/edge topology IDs for annotation anchors across rebuilds.

### P5-D. BOM and local fields

Remaining:

- [x] BOM table editing: columns, row order, item numbers and overrides.
- [x] Local revision/title fields: revision, date, drawn/checked/approved,
      material, finish and weight.
- [x] BOM updates after an assembly change.
- [x] BOM/balloon consistency check before export.

### P5-E. Drawing properties and associative updates

Remaining:

- [x] Drawing properties and per-view scales that persist.
- [x] Associative update after a Part Studio or Assembly change.
- [x] Preserve annotations, view placement and BOM links while geometry
      rebuilds.
- [x] Stale/out-of-date drawing indicator and explicit update action.
- [x] Test the exit-gate case: change a model dimension and see views and
      dimensions update.

### P5-F. Export and print

Remaining:

- [x] Print/plot path with sheet size, orientation and scale.
- [x] Plot style/line-weight handling.
- [x] Export verification for sheet count, scale and BOM rows in PDF and DWG.
- [x] Visual-regression checklist for the two-sheet drawing package.

### Phase 5 exit gate

- [x] Two-sheet drawing generated from an assembly.
- [x] Change a model dimension and see the views and dimensions update.
- [x] Export PDF/DWG and verify sheet count, scale and BOM rows.
- [x] Checklist and visual-regression pass.

---

## Dependency note

Phase 4 and Phase 5 are defined as depending on Phase 3. Phase 3 workstreams
are tracked separately in `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`.
Phase 4 is **not complete**: 34/45 items are implemented and 11 are partial. See
`PHASE4_TEST_PLAN.md` for the exact item status and known gaps. Phase 5 has its
own status in `PHASE5_TEST_PLAN.md`. Nothing in this document should be read as
a test pass.
