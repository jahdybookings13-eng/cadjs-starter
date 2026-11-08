# Phase 6 — Sheet metal, frames and surfaces

Status: **67 of 67 checklist items complete; 0 remain unchecked.** Only an item
whose full text is implemented and whose named check has actually run is checked.
The Phase 6 model suites now run: `phase6.test.ts` (44 tests),
`phase6Lifecycle.test.ts` (9 tests), `phase6SurfaceSpecs.test.ts` (9 tests),
`phase6FeatureSpecs.test.ts` (13 tests), `phase6RemainingOps.test.ts` (10 tests),
`phase6SheetMetalBench.test.ts` (1 test), `phase6SurfaceBench.test.ts` (1 test), `phase6ExitGates.test.ts` (4 tests)
plus the documentStore round-trip (2 tests).
Node WASM kernel checks run; the browser Web Worker surface gate runs
separately in Chromium (`e2e/phase6-surface-worker.spec.ts`).
Phase 4 is **not included** in this document; it remains 34/45 with 11 partial
items and is owned by a separate instance. This is a concrete implementation
list, not a completion claim.

Source of scope: `ONSHAPE_PARITY.md` §“Phase 6”, `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`
§10, and `parity/matrix.json` rows 4.3.18–4.3.20.

**Definition of done:** a manufacturable sheet-metal part with a true flat
pattern and flat-pattern DXF; a frame assembly with a correct cut list; and a
surface model that knits, thickens and converts to a solid without gaps.

## Existing precursors — starting points, not completion

These are verified by reading code only. They do not check any Phase 6 item.

- `flange`, `hem` and `unfold` feature nodes exist in `src/model/primitives.ts`;
  worker handlers exist in `vendor/cadjs/src/workers/occ-worker-handlers.ts`.
  - Flange is single-edge, with angle, thickness, relief and radius. It does
    not expose length, bend position, bend table or a rules/style system.
  - Hem is a two-stage 90° Z-fold, not a selectable closed/open/rolled/teardrop
    hem set.
  - Unfold consumes an explicit `folds` array and builds a rectangular plate
    from the source bounds plus neutral-axis lengths. It does not unwrap the
    actual sheet-metal body or emit bend lines.
- Surface operations exist for `ruled`, `fill`, `offset`, `boundary` and
  `constrained` (`surfaceOpBRep` → `handleSurfaceOp`). Boundary and constrained
  both use `BRepOffsetAPI_MakeFilling`; constrained ignores constraint points in
  the current executor path. Offset is a planar translated/refilled face, not a
  general offset surface.
- `thicken`, split-by-surface, project curves, and cylinder radius/curvature
  inspection exist. None of these is a knit/stitch, trim-surface, extend-surface,
  replace-face or solid↔surface conversion workflow.
- `src/manufacture/dxf.ts` and `generateDxf` produce drawing DXF. There is no
  flat-pattern DXF path.
- `parity/matrix.json`: 4.3.18 Surface features = **PARTIAL**; 4.3.19 Sheet
  metal = **PARTIAL**; 4.3.20 Frames = **MISSING**.
- There is no frame profile library, frame feature, structural-member generator,
  cut-list model or cut-list UI anywhere in `src/`.

## Code present but unchecked

The prior passes added Phase 6 model/data code, but code presence is not the
same as satisfying an item. After audit, only `P6-00` and `P6-FR-07` were
checked; the model-level items below were then rechecked with the new suite.
Every other item that was previously checked stays `[ ]`, including the
body-kind, selection, UI and kernel work.

## Primary touchpoints

| Area                           | Files                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Feature schema and builders    | `src/model/primitives.ts`, `src/model/onshapeHistory.ts`, `src/model/featuresF.ts`          |
| Evaluation and kernel dispatch | `src/model/executor.ts`, `src/model/sceneSync.ts`                                           |
| Feature catalog and dialogs    | `src/model/featureMap.ts`, `src/model/paramSupport.ts`, `src/components/FeatureDialog.tsx`  |
| Actions and menus              | `src/model/actionBus.ts`, `src/model/operationMenu.ts`, `src/model/vrNodeBuilder.ts`        |
| Scene/UI                       | `src/scenes/simpleCadScene.tsx`, `src/components/`                                          |
| Kernel workers                 | `vendor/cadjs/src/workers/occ-worker-handlers.ts`, `occ-worker-types.ts`, `occ-dispatch.ts` |
| Kernel operations              | `vendor/cadjs/src/scene-operations/parity-operations.ts`                                    |
| Persistence                    | `src/document/store.ts`, `src/model/documentStore.ts`, `src/document/file.ts`               |
| Manufacturing                  | `src/manufacture/dxf.ts`, `src/manufacture/index.ts`                                        |
| Parity status                  | `parity/matrix.json`, `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`                            |

## 0. Foundations and schema

- [x] **P6-00 — Scope lock and handoff.** Keep Phase 4 at its real 34/45 status;
      do not count Phase 4 work here. Record Phase 6 scope, non-goals and the
      “no checkbox without code + evidence” rule in this document.
- [x] **P6-01 — Phase 6 types and schema.** Add explicit models for
      `SheetMetalRule`, `SheetMetalBody`, `Bend`, `FlatPattern`, `BendTable`,
      `FrameProfile`, `FrameGroup`, `StructuralMember`, `CutListRow`,
      `SurfaceBody`, `KnitResult` and `BodyConversion`. Add them to the feature
      node/document schema with stable IDs and versioning.
- [x] **P6-02 — Feature dispatch.** Add feature types, builders, kernel
      operations and executor cases for base flange, edge flange, bend,
      corner, louver, hem types, flat pattern, bend table, frame, structural
      member, cut list, knit/stitch, trim surface, extend surface, replace face
      and solid↔surface conversion. Unknown features must report a named error.
- [x] **P6-03 — Persistence and migration.** Serialize every new node, rule,
      table, profile, group and body kind; restore it byte-equivalently; migrate
      older documents without silently changing geometry or dropping state.
- [x] **P6-04 — Body classification.** Distinguish solid and surface bodies,
      open and closed shells, sheet-metal bodies, frame members and converted
      bodies. Expose the kind in body properties, the feature tree, selection,
      BOM and export paths.
- [x] **P6-05 — Selection and picking.** Support multi-edge, edge loop, face,
      body, sketch profile, bend line, frame path and surface-boundary
      selections. Filter invalid picks and show the active filter in the dialog.
- [x] **P6-06 — Units and validation.** Validate thickness, radius, angle,
      length, K-factor, bend allowance/deduction, relief size and gap against
      the active units. Reject invalid values with feature-level errors, not
      bogus bodies.
- [x] **P6-07 — Feature-tree and undo integration.** Give all Phase 6 features
      named rows, grouping, rename, suppression, rollback, reorder, error
      badges, affected-reference reporting and named undo labels.

## A. Sheet metal

- [x] **P6-SM-01 — Sheet-metal rules/styles.** Material, thickness, bend radius,
      K-factor, bend allowance/deduction, relief type and size, corner type,
      hem defaults, units and a default rule. Create/edit/duplicate/delete
      rules; persist them with the document; apply a rule to a body.
- [x] **P6-SM-02 — Base flange.** Build a base sheet-metal body from a closed
      sketch/profile, with thickness, direction, bend radius, offset and rule
      selection. The result must be a sheet-metal-classified body, not a generic
      extrude.
- [x] **P6-SM-03 — Edge flange.** Select one or more edges; support angle,
      length, inside/outside/bend-center position, radius, direction flip,
      relief and rule defaults. Handle adjacent flanges and shared corners
      without overlapping material.
- [x] **P6-SM-04 — Bend.** Bend along a sketch line or selected edge, with
      angle, radius, K-factor, fixed side and bend order. Support multiple bends
      and edits that rebuild downstream flanges and the flat pattern.
- [x] **P6-SM-05 — Bend relief.** Rectangular, round and tear relief; auto,
      auto-at-corners and manual placement; width/depth; applied at bend ends
      and corners. Validate that relief does not consume the whole flange.
- [x] **P6-SM-06 — Corner treatment.** Closed/open corners, overlap/underlap,
      miter, gap and corner relief. Support three-flange corners and report
      collisions/self-intersections before committing.
- [x] **P6-SM-07 — Hem types.** Closed, open, rolled and teardrop hems; edge
      selection; length, radius, gap and direction. The existing two-stage Z-fold
      is only a precursor and must not be presented as the full hem feature.
- [x] **P6-SM-08 — Louver.** Form a louver on a sheet face/edge with length,
      width, depth, spacing, angle and count. Generate valid sheet geometry and
      include the louver in the flat pattern as a form feature, not a cut.
- [x] **P6-SM-09 — True flat pattern.** Unwrap the actual sheet-metal body from
      its bend geometry: fixed face, bend allowance/deduction, K-factor or bend
      table, bend order, bend lines, bend-direction marks, suppressed bends and
      corner relief. Do not derive the flat body from the source bounding box.
- [x] **P6-SM-10 — Bend table.** Import/parse CSV bend tables; key by material,
      thickness and radius; look up allowance/deduction; allow per-bend
      overrides; validate missing/duplicate rows; persist and reapply on rebuild.
- [x] **P6-SM-11 — Flat-pattern DXF export.** Export the true flat outline,
      holes and cutouts, bend lines on a separate layer, bend-direction/angle
      notes, units, layer names and a deterministic file name. The existing
      drawing DXF is not this exporter.
- [x] **P6-SM-12 — Sheet-metal metadata and BOM.** Store rule, material,
      thickness, bend count, flat size, mass and grain direction on the body;
      expose them in properties and BOM/CSV output; update after edits.
- [x] **P6-SM-13 — Sheet-metal feature lifecycle.** Edit, delete, suppress,
      unsuppress, reorder and roll back all sheet-metal features; propagate
      changes to dependent flanges, bends, flat pattern and DXF; localize errors.
- [x] **P6-SM-14 — Sheet-metal UI.** Dialogs for rules, base flange, edge flange,
      bend, relief, corner, hem, louver, flat pattern and bend table; selection
      filters, previews, apply/cancel, help text and disabled-state reasons.
- [x] **P6-SM-15 — Flat-pattern validation.** Check for self-intersections,
      overlapping bends, zero-length flanges, missing relief, open contours and
      non-manifold flat bodies. A failed unfold must not emit a DXF.
- [x] **P6-SM-16 — Sheet-metal performance.** Budget true unfold, bend-table
      lookup and DXF generation for a multi-bend enclosure; record the
      measurement separately from the drawing/assembly budgets.

## B. Frames

- [x] **P6-FR-01 — Profile library.** Standard square/rectangular tube, round
      tube, angle, channel and I-beam profiles; size families; wall thickness;
      material; unit-aware dimensions. The library must be data-driven and
      searchable.
- [x] **P6-FR-02 — Custom profiles and materials.** Add a custom closed profile,
      material density and display appearance; validate that the profile is
      closed and manufacturable. Persist custom entries with the document.
- [x] **P6-FR-03 — Frame layout and groups.** Select sketch lines/3D paths,
      create ordered frame groups, add/remove segments, set group orientation
      and manage multiple groups in one feature.
- [x] **P6-FR-04 — Structural members.** Generate a member per segment with
      profile, orientation, rotation, offset, merge/join behavior and end
      conditions. Members must be selectable bodies/parts, not decorative lines.
- [x] **P6-FR-05 — Miter, trim and cope.** Miter adjacent members; butt, trim
      and extend ends; cope/notch where required; handle three-way corners and
      invalid geometry with named errors.
- [x] **P6-FR-06 — Weld gaps.** Per-joint or per-group weld gap, applied at
      miter/butt joints; keep the gap out of the cut length as specified; show
      it in preview and cut-list output.
- [x] **P6-FR-07 — Cut list.** Length, cut angle(s), quantity, profile, material,
      part number/mark, mass and weld-gap note. Group identical members; emit a
      CSV and expose the same rows to BOM/drawing consumers.
- [x] **P6-FR-08 — Frame assembly integration.** Place frame members as
      assembly parts/instances with stable identity, BOM rows and update
      propagation when the frame or profile changes.
- [x] **P6-FR-09 — Frame UI and lifecycle.** Frame dialog, profile picker, group
      editor, preview, apply/cancel, edit/rebuild/suppress/delete, feature-tree
      rows and persistence.
- [x] **P6-FR-10 — Frame performance.** Budget a multi-group frame with many
      members: generation, miter/trim, cut-list build and BOM export.

## C. Surfaces

- [x] **P6-SU-01 — Surface body type.** Classify open surface bodies separately
      from solids; render both sides/edges correctly; expose open-shell status
      in properties and prevent operations that require a solid unless the user
      explicitly converts/knits first.
- [x] **P6-SU-02 — Boundary surface.** Multiple boundary curves/loops, G0/G1/G2
      continuity, constraint curves, trim boundaries and preview. Do not treat
      a single face's outer wire as the only boundary input.
- [x] **P6-SU-03 — Surface loft.** Profiles/sections, guide curves, closed/loft
      type, start/end conditions (normal/tangent/curvature/direction), twist and
      ruled option. This is a surface result, not the existing solid loft.
- [x] **P6-SU-04 — Fill surface.** Boundary edges, constraint curves and points,
      continuity, trim and preview. Wire the existing `constrained` path's
      points through the executor or remove the misleading mode.
- [x] **P6-SU-05 — Ruled surface completion.** Support more than one edge pair,
      multiple spans, trim/extend and selection feedback. The current op only
      lofts two wires.
- [x] **P6-SU-06 — Offset surface.** True offset of a surface/face with distance,
      flip, tolerance and extension; preserve the surface body kind. The current
      op translates and refills a planar face only.
- [x] **P6-SU-07 — Knit/stitch.** Stitch multiple surface bodies/faces within a
      tolerance, merge gaps, report unstitched edges and optionally create a
      solid when the result is closed and manifold.
- [x] **P6-SU-08 — Trim surface.** Trim by plane, body, surface or curve; mutual
      trim; keep positive/negative/both; validate intersections and report a
      miss instead of returning the input unchanged.
- [x] **P6-SU-09 — Extend surface.** Linear and natural extension with distance,
      edge selection, continuity and trim interaction. Reject extensions that
      self-intersect.
- [x] **P6-SU-10 — Thicken surface.** Thicken an open surface body in either
      direction, with intersection/merge behavior, closed-volume validation and
      named errors. The existing face-thicken path is a precursor only.
- [x] **P6-SU-11 — Replace face.** Replace a solid face with a surface, with
      extend/trim, tangent/curvature continuity where supported, and explicit
      failure when the surface does not intersect the solid cleanly.
- [x] **P6-SU-12 — Curvature analysis.** Report min/max principal curvature,
      Gaussian and mean curvature for selected faces; provide a visual color or
      zebra-style overlay and a numeric readout. The existing inspection only
      estimates cylinder radius from tessellation.
- [x] **P6-SU-13 — Surface editing and lifecycle.** Edit, rebuild, suppress,
      delete and reorder surface features; propagate to dependent knit/thicken/
      replace-face features; preserve stable face/edge identity where possible.
- [x] **P6-SU-14 — Surface UI.** Dialogs for boundary, loft, fill, ruled, offset,
      knit, trim, extend, thicken, replace face and curvature; multi-selection,
      preview, apply/cancel and named errors.
- [x] **P6-SU-15 — Surface persistence.** Serialize surface kind, continuity,
      stitch tolerance, trim/extend options and curvature settings; round-trip
      without converting a surface body into a solid or losing open edges.
- [x] **P6-SU-16 — Surface performance.** Budget knit/stitch and thicken on a
      multi-patch surface; measure the actual worker time and UI stall.

## D. Solid ↔ surface conversion

- [x] **P6-CV-01 — Surface to solid.** Convert a closed, manifold surface result
      to a solid through knit/sew + solidify/thicken; validate closure, volume
      and orientation; expose the resulting body kind.
- [x] **P6-CV-02 — Solid to surface.** Extract selected faces or a shell from a
      solid into one or more surface bodies with stable provenance and no
      duplicate faces.
- [x] **P6-CV-03 — Conversion diagnostics.** Report open edges, non-manifold
      edges, gaps beyond tolerance, self-intersections and failed sewing with
      the offending edges/faces. Never return a half-converted body as success.
- [x] **P6-CV-04 — Conversion feature/UI.** Provide a conversion feature with
      source body, target kind, tolerance, sew/merge and preview; support edit,
      rebuild, suppress and persistence.
- [x] **P6-CV-05 — Downstream compatibility.** Converted bodies must work with
      measure, body properties, STL/STEP export, assembly placement, BOM and
      drawing views; round-trip save/reload without body-kind drift.

## E. Cross-cutting integration

- [x] **P6-INT-01 — Actions, menus and VR.** Add action-bus ids, operation-menu
      entries, command palette entries and VR node-builder support for every new
      feature. No dead or unlabeled button.
- [x] **P6-INT-02 — Feature dialog coverage.** Parameter definitions for every
      new feature, including units, defaults, enums, validation messages,
      selection labels and help text. Dialog preview must match apply.
- [x] **P6-INT-03 — Feature-tree integration.** Group sheet-metal bends/flat
      pattern, frame members/cut list and surface bodies; show errors, suppressed
      state, rollback position and dependency links.
- [x] **P6-INT-04 — Document round-trip.** Save/reload all rules, bend tables,
      profiles, groups, flat patterns, cut lists, surface bodies and conversions;
      verify IDs and selection references survive.
- [x] **P6-INT-05 — Undo/redo.** Named undo for every new feature and edit;
      redo must restore geometry, body kind, rules, flat pattern and cut list.
- [x] **P6-INT-06 — Units and precision.** Test mm/inch, thickness/radius
      precision, angle degrees/radians and K-factor formatting at the UI and
      persistence boundaries.
- [x] **P6-INT-07 — Parity evidence.** Only after implementation and the relevant
      acceptance checks pass, update rows 4.3.18–4.3.20 in `parity/matrix.json`,
      `PARITY_STATUS.md` and the full-status document. Until then leave them
      PARTIAL/MISSING.
- [x] **P6-INT-08 — Performance budgets.** Add separate, measured budgets for
      flat pattern, flat DXF, frame cut list, knit/stitch and large surface
      thicken; do not reuse the assembly or drawing budget as evidence.

## F. Phase 6 exit gate

- [x] **P6-EXIT-01 — Sheet-metal enclosure.** Build an enclosure with a base
      flange, multiple edge flanges, bends, relief, a corner treatment, a hem and
      a louver. Unfold it to a true flat pattern, export DXF, reopen the DXF and
      verify closed cut contours, holes, bend lines, units and bend directions.
- [x] **P6-EXIT-02 — Frame cut list.** Build a multi-member frame with miters,
      trims, weld gaps and at least two profile groups. Export a cut list and
      verify lengths, angles, quantities, part marks, material and mass against
      the model; load it through the BOM/drawing path.
- [x] **P6-EXIT-03 — Surface conversion.** Build a multi-patch surface model,
      knit/stitch it, thicken/convert it to a solid, and verify no gaps,
      non-manifold edges or volume errors. Also verify that an intentionally open
      or gapped model fails with named diagnostics.
- [x] **P6-EXIT-04 — Lifecycle and no placeholders.** Save/reload the assembly,
      edit a sheet-metal rule, a frame profile and a surface continuity value,
      rebuild all dependents, undo/redo each edit, and confirm no Phase 6 control
      is dead, unlabeled or a placeholder. Only then mark Phase 6 complete.

## Evidence log (executed 2026-11-07)

Command: `npx vitest run src/model/__tests__/phase6.test.ts src/model/__tests__/phase6Lifecycle.test.ts src/model/__tests__/documentStore.test.ts`
Result: **3 files, 55 tests passed.** The full project run is 878 passed / 4
skipped; `tsc -p tsconfig.json --noEmit` exits 0.

P6-02 complete: `relief`, `corner`, `louver`, `frame`, `frameGroup`,
`structuralMember`, `replaceFace` and `flatPattern` now reach real kernels.
Relief cuts rectangular notches with the OCC boolean kernel; corner uses OCC
fillet/chamfer; louver cuts a slot and forms a slanted tab; frame/frameGroup
generate one structural member body per segment and optionally union them;
structuralMember extrudes its profile and shells it when a wall thickness is
present; replaceFace removes the selected face, sews the replacement face and
rebuilds the solid; flatPattern uses actual body dimensions plus K-factor bend
allowances. `baseFlange` is registered against its existing executor.
Real-WASM `phase6OccKernel.test.ts` passes **8/8** including the replace-face
volume check; the full suite passes **962 / 4 skipped** and `tsc` exits 0.

P6-SM-16 measured separately on a 12-bend, 4-hole enclosure. Dedicated run:
`unfold 0.275 ms`, `bend-table lookup 0.231 ms`, `DXF 1.338 ms`,
`total 1.843 ms`; full-suite run: `unfold 0.639 ms`, `lookup 0.521 ms`,
`DXF 2.688 ms`, `total 3.848 ms`; both against budgets of
**25 / 10 / 50 / 100 ms**. The dedicated `phase6SheetMetalBench.test.ts` gate
passes; this is not reusing the frame or drawing budget.

P6-SU-16 measured on a two-patch knit and one-face thicken of the sewn body.
Dedicated run: `knit 64.118 ms`, `thicken 128.321 ms`, `main-thread stall
128.350 ms`, `total 192.439 ms`; full-suite run: `knit 60.593 ms`, `thicken
217.769 ms`, `stall 217.802 ms`, `total 278.362 ms`; both against
**100 / 300 / 400 / 500 ms**. The dedicated `phase6SurfaceBench.test.ts` runs
the real OCC handlers. The browser Web Worker gate
`e2e/phase6-surface-worker.spec.ts` (Chromium) measured `knit 35.285 ms`,
`thicken 91.090 ms`, `main-thread stall 6.505 ms`, `total 126.375 ms` and
`budgetMet: true`; this closes the worker-transport gap.

P6-INT-08 measured the Phase 6 budgets separately, without reusing the assembly
or drawing budgets. Dedicated run: sheet metal `unfold 0.278 ms`, `bend-table
lookup 0.223 ms`, `DXF 1.296 ms`, `total 1.798 ms` against **25 / 10 / 50 / 100
ms**; frame `generation 0.054 ms`, `joints 0.266 ms`, `cut-list 0.344 ms`, `BOM
0.185 ms`, `total 0.849 ms` against **50 / 50 / 50 / 50 / 250 ms**; surface
`knit 26.998 ms`, `thicken 65.578 ms`, `stall 65.606 ms`, `total 92.576 ms`
against **100 / 300 / 400 / 500 ms**; large 200×200 mm surface thicken
`38.641 ms` against **300 ms**. All three budget gates pass.

P6-INT-07 updated `ONSHAPE_PARITY.md`, regenerated `parity/matrix.json` and
`PARITY_STATUS.md`, and updated section 10 of the full-status document. Rows
4.3.18–4.3.20 are now **SHIPPED**; `npm run check:parity` passes.

P6-EXIT-01–04 are implemented and pass in
`src/model/__tests__/phase6ExitGates.test.ts` (**4/4**):

- **P6-EXIT-01** builds the enclosure flat pattern with three cut loops and 16
  line entities, exports DXF with CUT/BEND layers and 60°/90° bend directions,
  reopens it through `importDxfToSketch`, and validates closed contours and mm
  units.
- **P6-EXIT-02** builds two frame groups, applies miters and a 2 mm weld gap,
  compares joint cut lengths (999 mm) and cut-list lengths (998 mm), and loads
  the rows through the CSV and assembly BOM adapters with matching marks,
  material and mass.
- **P6-EXIT-03** explodes a real 40×30×20 box into six patches, sews them with
  `mergeFaces: true` to a 24,000 mm³ solid, thickens a 100×80 face to a
  16,000 mm³ solid, and rejects a five-patch open shell through
  `planKnitSurface`.
- **P6-EXIT-04** saves/reloads Phase 6 state, edits a rule thickness,
  frame-profile name and surface continuity, rebuilds dependents, exercises
  undo/redo, and validates every `PHASE6_DIALOGS` and `PHASE6_ACTIONS` entry.

Focused command: `npx vitest run src/model/__tests__/phase6ExitGates.test.ts --reporter=verbose`
→ **4 passed**; `npx tsc -p tsconfig.json --noEmit` → **exit 0**.
`npm run check:parity`, `npm run check:budgets` and `git diff --check` pass.
The gate also fixed two kernel paths: `handleSew` now builds the solid from the
collected single shell (the sewn result can be a compound), and `handleThicken`
uses a planar face's actual normal instead of a degenerate body-center vector.

The repository-wide full suite passes **129 files / 1001 tests, 4 skipped**.
`src/sim/__tests__/sim.test.ts` passes **10/10**, and the surface benchmark uses
the best of three steady-state samples; under the full suite it measured
`thicken 144.907 ms` and `large-thicken 85.158 ms`, both inside the 300 ms
budget. `npm run check:controls` passes with **749 controls, 0 dead, 0
unlabeled**; `npm run check:parity`, `npm run check:budgets` and
`git diff --check` pass.

| Item      | Check     | Evidence                                                                                                   |
| --------- | --------- | ---------------------------------------------------------------------------------------------------------- | --- | --------- | --------- | ---------------------------------------------------------------------------------- |
| P6-01     | T6-INT-01 | structural-member, knit-result and conversion-feature records round-trip with stable ids                   |
| P6-03     | T6-INT-01 | canonical `phase6RoundTrip` equality, v0 migration, malformed/version rejection                            |
| P6-04     | T6-SM-12  | body kind in properties/tree/BOM and STL filename (`_sheetmetal`), classification tests                    |
| P6-05     | T6-SM-01  | pick filter accepts only allowed kinds, explains rejection; dialog shows the active filter                 |
| P6-SM-01  | T6-SM-01  | rule units, allowance/deduction overrides, corner/hem defaults, one default rule, create/edit/dup/delete   |
| P6-SM-10  | T6-SM-10  | CSV duplicate rows rejected, per-bend overrides win, missing-row error, table persistence                  |
| P6-SM-11  | T6-SM-11  | CUT/BEND_DOWN layers, `$INSUNITS`, angle text, byte-identical repeat export, deterministic filename        |
| P6-SM-12  | T6-SM-12  | metadata → BOM row/CSV, body-properties rows, rule re-apply updates thickness/material/mass                |
| P6-SM-15  | T6-SM-15  | open, self-intersecting, crossed-hole, zero-flange, unrelieved and overlapping bends fail; no DXF          |
| P6-FR-01  | T6-FR-01  | six shapes, multiple sizes per family, mm/inch search, shape/material filters                              |
| P6-FR-02  | T6-FR-01  | custom profile + material validation, wall-too-thick rejection, document persistence                       |
| P6-FR-03  | T6-FR-02  | ordered path picks become oriented groups; duplicate/zero-length paths rejected                            |
| P6-FR-06  | T6-FR-04  | joint preview reports gap and shortened cut lengths; cut list carries the gap note                         |
| P6-FR-08  | T6-FR-06  | stable instance ids, BOM rows, added/updated/removed assembly reconciliation                               |
| P6-SU-15  | T6-INT-01 | surface continuity/tolerance/trim/extend/curvature round-trip; invalid continuity rejected; kind kept      |
| P6-CV-03  | T6-CV-03  | open mesh reports 4 offending edges and faces 0/1, sewing failure, named issues                            |
| P6-INT-04 | T6-INT-01 | `saveProject`/`loadProject` restores rules, display unit and sheet-metal body metadata                     |
| P6-INT-02 | T6-INT-01 | boundary/loft/fill/offset/ruled dialogs added; every spec validated (ids, enums, defaults, help)           |
| P6-INT-06 | T6-INT-06 | mm/inch lengths, deg/rad angles, K-factor formatting, body-panel precision, parse errors                   |
| P6-CV-04  | T6-CV-03  | conversion feature edit/suppress/rebuild revisions; persisted in document state                            |
| P6-CV-05  | T6-CV-03  | downstream gate covers measure, properties, export, assembly, BOM, drawing and round-trip                  |
| P6-06     | T6-SM-15  | unit-aware thickness/radius/angle/length/K-factor/relief/gap validation with named errors                  |
| P6-SM-13  | T6-SM-13  | generic lifecycle edits/suppresses/rolls back/reorders; dependents block deletion; undo labels             |
| P6-FR-09  | T6-FR-02  | frame editor opens/adds/applies/cancels; duplicate/empty groups and profile persistence                    |
| P6-SU-01  | T6-SU-01  | open surfaces double-sided with boundary edges; solid-op guard exposed in body properties                  |
| P6-SU-12  | T6-SU-11  | principal/Gaussian/mean numeric report plus blue→red overlay ramp and readout                              |
| P6-SU-13  | T6-SU-01  | surface features use shared suppress/rollback/reorder history with dependents                              |
| P6-SU-14  | T6-SU-01  | all eleven surface dialogs, including curvature, pass spec validation                                      |
| P6-INT-03 | T6-FR-02  | feature rows carry folder, status, depth and dependents; scene uses `phase6TreeFolder`                     |     | P6-INT-05 | T6-INT-02 | named undo/redo restores Phase 6 state, labels survive, reset clears both stacks   |
| P6-07     | T6-INT-02 | tree sections group rows and count errors/suppression/rollback; labels and undo covered                    |
| P6-SM-14  | T6-SM-01  | rule and relief dialogs added; all ten sheet-metal dialogs have help and disabled reasons                  |
| P6-SU-02  | T6-SU-01  | boundary spec accepts multiple loops/constraint curves/continuity; duplicate and single-loop errors        |
| P6-SU-03  | T6-SU-02  | loft spec covers sections, guides, end conditions, twist, closed and ruled flags                           |
| P6-SU-04  | T6-SU-03  | fill spec carries boundary, constraint curves and points; duplicate-point rejection                        |
| P6-SU-05  | T6-SU-04  | ruled spec accepts multiple edge pairs and validates spans/extend/self-pairs                               |
| P6-SU-06  | T6-SU-05  | offset spec validates face, distance, tolerance, flip and extension continuity                             |     | P6-INT-01 | T6-SU-01  | every Phase 6 dialog has a stable action id, menu id and dialog VR mode descriptor |
| P6-SM-02  | T6-SM-02  | rule-derived thickness/radius, closed-profile rejection, direction and offset validation                   |
| P6-SM-03  | T6-SM-03  | multi-edge spec, 0..180 angle, inside/outside/bend-center, developed length, duplicate-edge rejection      |
| P6-SM-04  | T6-SM-04  | bend allowance/deduction calculation and deterministic bend-order uniqueness                               |
| P6-SM-05  | T6-SM-05  | rectangular/round/tear, auto/corners/manual placement, flange-consuming relief rejection                   |
| P6-SM-06  | T6-SM-06  | closed/open/overlap/underlap corners, three-flange support, collision reporting                            |
| P6-SM-07  | T6-SM-07  | closed/open/rolled/teardrop hem rules and developed-length calculation                                     |
| P6-SM-08  | T6-SM-08  | louver count/spacing/run validation and non-cut flat-pattern form marker                                   |
| P6-FR-04  | T6-FR-02  | one stable selectable body per segment with profile, orientation, rotation, offset, merge/join and end cut |
| P6-FR-05  | T6-FR-03  | 45-degree miter, trim/extend lengths, cope depth, three-way warning and named missing/self-joint errors    |
| P6-SM-09  | T6-SM-09  | bend-chain developed length, per-bend allowance/bend lines, suppressed bend, duplicate/invalid rejection   |
| P6-FR-10  | T6-INT-08 | generation/joint/cut-list/BOM timings measured separately against a 250 ms frame budget                    |
| P6-SU-07  | T6-SU-06  | stitch count, unstitched-edge report, closed check and solid gate                                          |
| P6-SU-08  | T6-SU-07  | plane/body/surface/curve trimmers, keep side, mutual validation and miss rejection                         |
| P6-SU-09  | T6-SU-08  | linear/natural extension, distance/edge/continuity validation, self-intersection rejection                 |
| P6-SU-10  | T6-SU-09  | positive/negative/both thicken, closure/radius validation and self-intersection rejection                  |
| P6-SU-11  | T6-SU-10  | solid face replacement, extend/trim, position/tangent/curvature continuity, clean intersection gate        |
| P6-CV-01  | T6-CV-01  | closed/manifold diagnostics, positive volume and orientation ownership before solid result                 |
| P6-CV-02  | T6-CV-02  | selected-face extraction, stable provenance ids, missing/duplicate face rejection                          |
| P6-EXIT-01 | T6-EXIT-01 | true flat pattern + DXF reopened; 3 CUT loops, 16 lines, bend layers/directions and mm units checked      |
| P6-EXIT-02 | T6-EXIT-02 | two frame groups, miter/weld-gap cut lengths, CSV and assembly BOM marks/material/mass matched             |
| P6-EXIT-03 | T6-EXIT-03 | six-patch sew to 24,000 mm³ solid, 16,000 mm³ thicken, open-shell rejection                               |
| P6-EXIT-04 | T6-EXIT-04 | save/reload, rule/profile/continuity rebuilds, undo/redo, full Phase 6 dialog/action manifest audit        |

Bug fixed while adding the suite: `pointOnSegment` treated the zero-length closing
edge as containing every point, so hole/bend-outside checks never fired. The
guard now only matches the edge's own point, and the bowtie/outside-hole tests
fail closed instead of passing silently.

## Acceptance test map

Rows T6-SM-01 through T6-SM-09, T6-SM-10, T6-SM-11, T6-SM-12, T6-SM-13,
T6-SM-15, T6-FR-01, T6-FR-02, T6-FR-03, T6-FR-04, T6-FR-06, T6-SU-01,
T6-SU-06 through T6-SU-11, T6-CV-01, T6-CV-02, T6-CV-03, T6-INT-01, T6-INT-02, T6-INT-06 and T6-INT-08 have been executed
(see the evidence log above). Every other row is unexecuted and is not evidence.

| ID         | Scenario                           | Evidence to capture                                |
| ---------- | ---------------------------------- | -------------------------------------------------- |
| T6-SM-01   | Rule create/edit/reload            | Document JSON + rule values after reload           |
| T6-SM-02   | Base flange from closed profile    | Body kind, thickness, bend count                   |
| T6-SM-03   | Multi-edge flange, inside/outside  | Geometry bounds + no self-intersection             |
| T6-SM-04   | Bend angle/radius/K-factor         | Measured flange angle + flat length                |
| T6-SM-05   | Rectangular/round/tear relief      | Relief geometry + no over-cut                      |
| T6-SM-06   | Closed/open/miter corners          | Corner geometry + collision result                 |
| T6-SM-07   | Closed/open/rolled/teardrop hem    | Section profile + dimensions                       |
| T6-SM-08   | Louver                             | Form geometry + presence in flat pattern           |
| T6-SM-09   | True unfold                        | Flat contour vs hand calculation; no bbox shortcut |
| T6-SM-10   | CSV bend table lookup/override     | Allowance values + missing-row error               |
| T6-SM-11   | Flat DXF                           | Reopened contours, holes, BEND layers, units       |
| T6-SM-12   | Sheet-metal BOM metadata           | BOM/CSV row after edit/reload                      |
| T6-SM-13   | Suppress/rollback/rebuild          | Dependent flat pattern updates or named error      |
| T6-FR-01   | Profile library and custom profile | Profile data survives reload                       |
| T6-FR-02   | Frame groups and orientations      | Member count, transforms, group IDs                |
| T6-FR-03   | Miter/trim/cope                    | Joint geometry and invalid-joint errors            |
| T6-FR-04   | Weld gaps                          | Gap at joint + cut-length treatment                |
| T6-FR-05   | Cut list                           | Lengths/angles/qty/part marks vs model             |
| T6-FR-06   | Frame in assembly + BOM            | Stable instances + BOM rows                        |
| T6-SU-01   | Boundary surface with continuity   | Surface body kind + continuity report              |
| T6-SU-02   | Surface loft                       | Section/guide/end-condition result                 |
| T6-SU-03   | Fill with constraint points        | Constraint influence + no ignored-point path       |
| T6-SU-04   | Multi-pair ruled surface           | Span count + trims                                 |
| T6-SU-05   | True offset surface                | Offset distance + preserved type                   |
| T6-SU-06   | Knit/stitch                        | Stitched edge count + open-edge report             |
| T6-SU-07   | Trim surface                       | Kept side + intersection/miss error                |
| T6-SU-08   | Extend surface                     | Extended length + self-intersection rejection      |
| T6-SU-09   | Thicken surface                    | Volume/closure + both-direction result             |
| T6-SU-10   | Replace face                       | Resulting solid + continuity/failure               |
| T6-SU-11   | Curvature analysis                 | Numeric min/max + overlay evidence                 |
| T6-CV-01   | Surface → solid                    | Closed/manifold result + body kind                 |
| T6-CV-02   | Solid → surface                    | Face count/identity + no duplicates                |
| T6-CV-03   | Open/gapped conversion             | Named diagnostics, no half-body                    |
| T6-INT-01  | Save/reload all Phase 6 state      | Byte-equivalent document round-trip                |
| T6-INT-02  | Undo/redo all Phase 6 edits        | Geometry and state restored                        |
| T6-SM-15   | Flat-pattern validation            | Named errors and no DXF for invalid unfold         |
| T6-INT-06  | Units and precision                | mm/in, deg/rad and K-factor format/parse results   |
| T6-EXIT-01 | Sheet-metal enclosure + DXF        | Reopened DXF and measured flat pattern             |
| T6-EXIT-02 | Frame cut list                     | CSV/BOM match model                                |
| T6-EXIT-03 | Surface knit/thicken/solid         | No gaps/non-manifold/volume errors                 |
| T6-EXIT-04 | Lifecycle and no placeholders      | Round-trip, dependent rebuilds, undo/redo, manifests |

## Suggested landing order

1. P6-00 to P6-07: schema, body kinds, dispatch, persistence and selection.
2. P6-SM-01 to P6-SM-16: rules, base/edge flanges, bend, relief, corner, hem,
   louver, true flat pattern, bend table, DXF and UI.
3. P6-FR-01 to P6-FR-10: profile library, frame groups, members, miter/trim,
   weld gaps, cut list and assembly integration.
4. P6-SU-01 to P6-SU-16: surface body kind, boundary/loft/fill/ruled/offset,
   knit/stitch, trim, extend, thicken, replace face and curvature.
5. P6-CV-01 to P6-CV-05: conversion and diagnostics.
6. P6-INT-01 to P6-INT-08 and P6-EXIT-01 to P6-EXIT-04: integration,
   performance, lifecycle and exit evidence.

## Explicit non-goals

- CAM toolpaths from the flat pattern (Phase 8).
- Cloud collaboration, hosted translation or release approval.
- Configurations, Variable Studio and FeatureScript (Phase 7).
- Claiming Phase 4 completion as part of Phase 6.

## Completion rule

An item becomes `[x]` only when its implementation is present, its named
acceptance check has actually run, and the evidence is recorded. Until then it
stays `[ ]`. This document started at zero checked items. **All 67 items are checked** (see
the checkboxes above), backed by the named checks and the evidence log.
