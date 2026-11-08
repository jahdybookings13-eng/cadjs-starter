# Phase 3 — Complete Remaining Work

Status: **in progress**
Scope source: `ONSHAPE_PARITY.md` § Phase 3
Last updated: 2026-11-07

This is the complete remaining Phase 3 backlog. It is not a wish list and it is
not a claim that any unchecked item is partially done. A checked item is only
checked when the behaviour, error path, persistence path and tests exist.

## 0. What Phase 3 actually requires

Phase 3 is **Part Studio core parity**: model a representative mechanical part
end to end with Onshape-level feature depth and tree behaviour.

### Exit gate

- [x] A **20+ feature mechanical part** is built from sketches and features.
- [x] That part is reordered, rolled back, edited, suppressed and restored.
- [x] Geometry is identical after save/reload.
- [x] Geometry is identical after export/re-import (bbox, volume drift <2%,
      face/edge topology; STEP ownership and recognition asserted).
- [x] Every tested feature failure produces a named error and no bogus body
      (degenerate sketch, unknown fillet edge, unresolved boolean target, shell
      with no faces, zero-diameter boss).
- [x] Feature-level interaction tests cover dialog, preview, apply and cancel
      for all 17 Phase 3 dialogs.
- [ ] All Phase 3 parity rows are `SHIPPED`, not merely backed by a button.
- [ ] No Phase 3 control is dead, unlabeled or a placeholder.
- [ ] The full Phase 3 regression suite passes in Chromium.
- [ ] The matrix has no stale `deferred` entries for features that have landed.

### Explicit non-goals

Do not pull these into Phase 3 unless the scope is deliberately changed:

- Sheet metal, frames and full surfacing (Phase 6).
- Configurations, Variable Studio and FeatureScript (Phase 7).
- Assemblies, mates, BOM and exploded views (Phase 4).
- Drawings and annotation (Phase 5).
- Cloud collaboration, release management and hosted translation (outside the
  frozen scope).

## 1. What is already landed

These slices exist and should not be rebuilt. They are listed so the remaining
work is unambiguous.

- History reorder, rename, suppress/unsuppress, rollback-to-feature, clear
  rollback, feature folders, drag reorder and named undo.
- Tree error badges, inline failure detail, affected-reference warnings on
  delete, and history-only rows for debug/action-bus features.
- All 12 catalog primitives: box, prism, pyramid, wedge, cylinder, cone, torus,
  pipe, sphere, ellipsoid, capsule and dome.
- Catalog defaults are applied by `buildShape`, so empty options do not create
  `NaN` geometry.
- Ellipsoid uses a real non-uniform scale node and keeps one body.
- Selected-body inspector with ownership, type, element id, world size, bbox,
  face/edge tags, position and visibility.
- Unit-correct bbox, volume, surface area and triangle count in the inspector.
- Split-both extra bodies appear as Browser rows; each row is selectable.
- Extra bodies have their own visibility eye and live inspector visibility.
- Per-body STL export from the inspector, including split/pattern extras.
- Measure mode already supports distance, edge length and angle, plus pinned
  and temporary measurements.

## 2. Remaining by workstream

### A. Extrude / revolve / sweep / loft

Current state: extrude consumes offset, second direction (including symmetric
with independent depths), thin wall, draft, `endBound`, through-all overshoot,
reverse direction and NEW/ADD/CUT/INTERSECT merge scope. Revolve now consumes a
second angle, one/two/symmetric directions, reverse, explicit axis origin/axis
direction, a body-edge axis and merge scope. Sweep samples lines, arcs,
circles, ellipses, elliptical arcs, splines, Beziers and conics, applies
orientation/corner mode/chordal tolerance, extends path ends and merges. Loft
supports >2 sections, closed/periodic sections, `loftType` and merge scope.
The kernel gaps called out earlier are closed. Sweep twist is a section loft along the path
(`sweepTwistedHelper`), and loft end conditions are enforced with extra end
sections from the section normal, tangent, curvature or a JSON direction
(`loftEndCondition.ts`). This OCC build has no native input for either, so both
are section-engine implementations, not flags on the pipe shell. 3D sketch
snapshots are still planar, but an explicit 3D `pathPoints` polyline is
supported. Sketch conversion now carries the exact OCC shape alongside the
triangle BRep, preserving inner wires; the extrude worker consumes every region
of a compound and unions them. Extrude draft accepts an explicit neutral face or
origin/normal and a selectable parting sketch edge; the executor resolves that
edge's endpoints and the kernel validates that it is perpendicular to the draft
pull and uses it to derive the neutral plane. Merge-target consumption covers
all four A operations. Revolve up-to, thin revolve/sweep/loft (including
open-profile thin extrude via a ribbon), multiple sweep guides (independent
rails driving guide-constrained sections through `ThruSections`), multiple loft
guides (still blended into one auxiliary spine), loft centerline (pipe shell
through the sections), loft twist/connectors, loft profile reversal and revolve
`cornerType` are wired.

End-condition depth is derived in `src/model/extrudeEndCondition.ts`; sweep path
sampling lives in `src/model/sweepPath.ts`. `PHASE3_A_TEST_PLAN.md` is the
tester handoff for the whole A slice, including the vendor OCC edits.

#### A1. Extrude

- [x] End condition: **blind** depth is proven.
- [x] End condition: **up to vertex** (depth solver + executor + viewport
      picker; the pick uses the nearest vertex on the clicked face).
- [x] End condition: **up to face** (same; plane intersection of the face
      polygon).
- [x] End condition: **up to surface** (same; farthest tessellation vertex, so
      exact on planar faces and an estimate on curved ones).
- [x] End condition: **through all** (farthest world vertex of the bodies ahead
      of the start plane).
- [x] End condition: **through all with start offset** (`hasOffset` moves the
      measured start plane; `endBoundOffset` overshoots the far end).
- [x] Offset from the sketch plane before extruding (explicit Offset toggle
      plus distance; negative values move against the plane normal).
- [x] Second-direction depth (forward + back extrusions fused with a boolean
      union).
- [x] True asymmetric two-sided extrude (independent forward/back depths).
- [x] Symmetric extrude with separate forward/back depths (forward and back
      extrude independently from the plane and union; `midplane` alone keeps the
      kernel's 2×-depth recentre path).
- [x] Symmetric extrude with a single depth (kernel extrudes 2x depth and
      recentres the body).
- [x] Thin feature / wall thickness (executor + feature map + audit).
- [x] Thin feature with an open profile (open chain → ribbon polygon in
      `openProfileWall.ts`; the wall is the extruded ribbon).
- [x] Draft angle (executor + feature map + audit).
- [x] Draft with an explicit neutral plane (picked face or origin/normal
      strings; the extrude worker builds the `gp_Pln` for the draft).
- [x] Draft with a parting line (`draftPartingEdge` stores a picked sketch
      edge; the executor passes its endpoints to OCC, which validates that the
      edge is perpendicular to the draft pull and uses its start point as the
      neutral-plane origin; `PARTING` then flips the angle by which side of the
      plane each lateral face lies on).
- [x] Merge scope: new body.
- [x] Merge scope: add to selected bodies.
- [x] Merge scope: cut selected bodies.
- [x] Merge scope: intersect selected bodies.
- [x] Remove/consume tools after a merge for extrude, revolve, sweep and loft
      (`sceneSync.toolElementIds` + the onRebuilt consumption branch). Browser
      proof remains part of the tester scenarios; the implementation no longer
      only covers boolean.
- [x] Profile rules for nested regions and multiple regions: sketch conversion
      now returns the exact OCC shape (inner wires preserved), and the extrude
      worker extrudes every region in a compound and unions the solids.
- [x] Deterministic named errors for open, self-intersecting and zero-area
      profiles (`profileRules.ts`, called by extrude and revolve).
- [x] Non-blind end conditions are rejected with a named error instead of
      silently extruding blind.
- [x] Extrude draft and non-NEW merge scopes run through the kernel; missing
      targets report a named error.
- [x] Extrude edit-in-place from the feature tree (depth + midplane, with
      preview, apply, cancel and one undo entry).
- [x] Reverse direction (`oppositeDirection`) is exposed in the dialog and
      drives both the kernel direction and the derived end-condition depth.
- [x] Extrude dialog: end-reference selection with a viewport face/vertex
      picker (`endBoundEntity` query written by the dialog).

Parameter audit: landed for the executor ops that have been read
(`KERNEL_CONSUMED_PARAMS` in `paramSupport.ts`). Extrude now audits
`operationType`, `targets`, `hasDraft`, `draftAngle`, `thinWall`,
`wallThickness`, `endBound`, `endBoundOffset`, `endBoundEntity` and
`oppositeDirection` as wired, alongside the existing depth/offset params.
Every A parameter in the map is now audited as kernel-wired. The open items are
kernel capabilities, not unreachable dialog rows.

#### A2. Revolve

- [x] One-direction angle is proven; second-direction angle is wired
      (`direction: two` with `angleBack`).
- [x] Symmetric revolve (`direction: symmetric` splits the total angle into two
      half sweeps around the same axis, in the kernel handler).
- [x] Revolve up to vertex/face (`revolveEndCondition.ts` solves the angle from
      the reference plane/polygon or vertex; the same picker writes
      `endBoundEntity`). Up-to-surface uses the picked face plane.
- [x] Thin revolve (inner profile offset, revolve the inner wall and subtract;
      closed profiles only).
- [x] Merge scope: new/add/cut/intersect through the shared merge helper.
- [x] Axis selection from sketch line, body edge, explicit datum axis
      (`axisOrigin`/`axisDir`) and origin normal.
- [x] Profile rules for open and nested profiles: open profiles fail with a
      named error, and nested loops use the exact sketch face so the inner wire
      becomes a hole rather than a filled region.
- [x] Direction flip with a visible preview (`oppositeDirection` negates the
      axis for the kernel and the preview).
- [x] `cornerType` behaviour for thin revolves: rounded/conical/transitional map
      to OCC's arc/intersection/tangent profile-offset joins. It is not a cone
      revolve mode; the non-thin revolve ignores it without pretending
      otherwise.
- [x] Named errors for zero-angle, missing second angle, unresolved axis, and
      kernel axis-on-profile/self-intersection failures.
- [x] Revolve dialog: preview, apply, cancel and edit through the generic
      feature dialog.

#### A3. Sweep

- [x] Path support beyond chained straight sketch lines: `src/model/sweepPath.ts`
      samples and chains lines, arcs, circles, ellipses, elliptical arcs,
      splines, Beziers and conics.
- [x] Explicit 3D path support through the `pathPoints` JSON polyline; sketch
      snapshots themselves are still planar.
- [x] Single guide curve (auxiliary spine via `SetMode_5`; the guide sketch is
      resolved through `guideSubqueries`).
- [x] Multiple guide curves: passed intact as `guideCurves`; the kernel builds
      guide-constrained sections through `BRepOffsetAPI_ThruSections` instead of
      averaging the guides into one auxiliary spine. This OCC build's
      `MakePipeShell.SetMode_5` accepts only one spine, so multi-guide is a
      section-engine path; the test plan records that distinction.
- [x] Twist along the path (`twist` sweeps rotated sections through
      `sweepTwistedHelper`; the pipe-shell API has no twist input).
- [x] Profile orientation: keep orientation / follow path
      (`keepProfileOrientation` → kernel `parallel`/`perpendicular`).
- [x] Chordal tolerance actually applied (`SetTolerance` on the pipe shell).
- [x] Thin sweep (inner profile offset, sweep the inner wall and subtract;
      closed profiles only).
- [x] Merge scope: new/add/cut/intersect through the shared merge helper.
- [x] Start/end offset (`pathStartOffset` / `pathEndOffset` extend the sampled
      path along its end tangents).
- [x] Self-intersection detection with a named error (kernel pipe status and
      fallback failures surface as the feature detail).
- [x] Sweep dialog: guide selection (the Guide Curve row has a viewport
      **Pick curve** action, adds each picked sketch curve to `guideSubqueries`,
      and has a Clear action; multiple guides are preserved as separate rails).
- [x] Sweep edit-in-place through the generic feature dialog.

Parameter audit: `keepProfileOrientation`, `cornerMode`, `chordalTolerance` and
`twist` now reach the kernel; the audit lists them as wired.

#### A4. Loft

- [x] Two-profile ruled loft is proven; the executor accepts an ordered list of
      any length >1.
- [x] Reorderable profile list UI (the dialog's Reverse button flips the
      `profiles` query order; the model order is the params array order).
- [x] Guide curves: one or more guides are blended by arc length into a spine,
      then the sections are piped along it (approximation; names the failure
      when the spine misses a section).
- [x] Centerline loft (the centerline becomes the spine of a pipe shell and
      every section is added along it; `ThruSections` has no spine input).
- [x] Twist control (`twist` rotates each section about its plane normal before
      `ThruSections`).
- [x] End conditions: normal, tangent, curvature and direction. Extra end
      sections enforce the departure (`loftEndCondition.ts`); curvature needs
      three sections to estimate the bend, otherwise it degrades to tangent.
- [x] Closed/periodic loft (`closed` re-adds the first section after the last;
      this OCC build has no `ThruSections::SetClosed`).
- [x] Thin loft (inner section offset, inner loft subtracted; closed profiles
      only).
- [x] Merge scope: new/add/cut/intersect through the shared merge helper.
- [x] Match connectors / vertex mapping (`connectors` vertex picks rotate each
      section seam before `ThruSections`).
- [x] Ruled vs fluid vs straight behaviour: `loftType: STRAIGHT` (or `ruled`)
      selects ruled sections; `FLUID` keeps smooth ThruSections.
- [x] Named errors for mismatched profiles and self-intersection (kernel
      diagnostic) and for unresolved or too-short guide chains.
- [x] Loft dialog: profile list with Reverse (scalar params and
      preview/apply/cancel are wired).
- [x] Loft edit-in-place through the generic feature dialog.

#### A5. Shared feature-dialog work

- [x] One typed dialog framework (`featureDialog.ts` + `FeatureDialog.tsx`).
      Extrude, revolve, sweep and loft all open, preview, apply, cancel and undo
      through the same dialog.
- [x] Persistent preview that updates on parameter edits.
- [x] Apply commits exactly one undo entry (rebuild syncs are non-undoable).
- [x] Cancel restores the pre-preview scene; selection is left untouched.
- [x] Escape cancels without leaving a partial feature (assertion added to
      `e2e/feature-dialog.spec.ts`; tester runs it).
- [x] Invalid parameters never enter the draft, so Apply stays disabled and the
      reason is shown inline.
- [x] Every parameter has a label, units and an accessible error message on
      the extrude, revolve, sweep and loft dialogs.
- [x] Dialog tests cover open, edit, preview, apply, cancel and undo.

### B. Fillet / chamfer / shell / draft / hole / thread

Current state: all six run on the kernel. The 2026-11-07 B-depth pass wired
the remaining implementable paths (NPT taper, tapped hole type, chamfer tangent
chains, thread end chamfers, face-normal hole placement, single-plane parting
draft, wrap cut/emboss beads). The unchecked items below are either end-pass
test evidence or kernel capabilities this OCC build does not expose.

#### B1. Fillet

- [x] Constant-radius fillet is proven (box edge, browser test).
- [x] Per-edge radii are proven (one positive value per selected edge,
      validated with a named error).
- [x] Variable-radius fillet (`Law_Linear` + `Add_4`).
- [x] Face blends (face selections blend every boundary edge).
- [x] Full tangent propagation across connected mesh edges.
- [x] Corner/setback handling (`cornerRadius` at contour vertices).
- [x] Cross-section choices beyond circular (`RATIONAL`, `QUASI_ANGULAR`,
      `POLYNOMIAL`).
- [x] Fillet across tangent chains.
- [x] Fillet failure recovery with out-of-range edge indices named and OCC
      contour/vertex diagnostics surfaced.
- [x] Fillet dialog: edge set, radius mode, preview, apply, cancel
      (generic feature dialog).
- [x] Modify Fillet in place without losing downstream references
      (`filletEdit.ts`).

#### B2. Chamfer

- [x] Distance-distance (one distance per edge; the kernel has no angle mode).
- [x] Distance-angle (`AddDA` with the adjacent face).
- [x] Angle-distance (the same real `AddDA` path, angle interpreted from the
      selected face).
- [x] Symmetric distances.
- [x] Per-edge distance overrides (validated with a named error).
- [x] Chamfer across tangent chains.
- [x] Named errors for impossible widths (positivity + OCC contour/vertex
      diagnostics).
- [x] Chamfer dialog: edge set, type, preview, apply, cancel (generic feature
      dialog).
- [x] Chamfer edit-in-place.

#### B3. Shell

- [x] Planar-cap shell is proven; curved-cap shell is available as the
      explicit, slower `curvedCap` path.
- [x] Multi-thickness shell (one positive thickness per removed face).
- [x] Remove selected faces and keep the correct shell/core.
- [x] Keep shell vs keep core semantics (`KEEP_CORE` returns the inner core
      for planar caps; curved caps reject it explicitly).
- [x] Thin-wall failure diagnostics.
- [x] Shell dialog: body, removed faces, thickness, preview, apply, cancel
      (generic feature dialog).
- [x] Shell edit-in-place.

#### B4. Draft

- [x] Draft angle is proven on the convex neutral-face heuristic.
- [x] Exact neutral plane selection (face or explicit origin/normal).
- [x] Parting-line draft (`draftPartingEdge` stores one picked sketch edge;
      the executor resolves its endpoints and the worker validates that it lies
      in the neutral plane before using its start point).
- [x] Multiple draft faces.
- [x] Step draft (neutral-plane side filtering).
- [x] Draft analysis / display (named status and side-aware draft result).
- [x] Named errors for ambiguous neutral geometry and invalid angles.
- [x] Draft dialog: faces, neutral plane, angle, preview, apply, cancel
      (generic feature dialog).

#### B5. Hole

- [x] Simple drilled hole is proven.
- [x] Standard hole sizes and fit tables (ISO metric, unified, NPT).
- [x] Counterbore (composed from a shallow large cut plus the main cut).
- [x] Countersink and tapped holes (real cone cutter and internal thread).
- [x] Clearance holes (ISO 273 close/normal/loose classes).
- [x] Through-all and blind depth (through-all uses the body diagonal with
      overdrive).
- [x] Through-all toggle is honoured from the dialog (boolean param) and from
      legacy builder nodes (string param).
- [x] Hole placement on a face/point selection (face centroid and inward
      normal, or sketch point).
- [x] Hole profile enums (simple, counterbore, countersink, tapped).
- [x] Named errors for invalid standard/size combinations.
- [x] Hole dialog: type, standard, size, depth, preview, apply, cancel
      (generic feature dialog).

#### B6. Thread

- [x] Current torus-stack groove approximation is documented as v1.
- [x] True helical thread geometry (opt-in `helical`; wasm-slow).
- [x] Cosmetic thread representation (shallow modeled visual thread).
- [x] ISO metric, unified and NPT behaviour.
- [x] Internal vs external thread.
- [x] Runout trimming and 45-degree chamfers at thread ends.
- [x] Thread failure diagnostics.
- [x] Thread dialog: face, standard, size, mode, preview, apply, cancel
      (generic feature dialog).

#### B7. Associated rebuild work

- [x] `wrap` cut/emboss modes (filled regions on closed loops; bead sweep on
      open curves).
- [x] `flange` / `hem` / `unfold` remain explicitly outside the Phase 3 exit
      gate; do not let them mask the Phase 6 scope.
- [x] No shell/draft/thread control remains a placeholder.

### C. Patterns / mirror / boolean / split / face editing

Current state: linear, circular, curve and feature patterns exist; booleans,
mirror, split and face editing exist. The missing work is mostly scope,
provenance and repair semantics.

#### C1. Patterns

- [x] Linear pattern.
- [x] Circular pattern.
- [x] Curve pattern.
- [x] Face pattern (selected faces transformed and returned as a compound surface result).
- [x] Body pattern.
- [x] Feature pattern, including join-to-source mode.
- [x] Spacing modes: spacing, extent, equal spacing.
- [x] Direction flip and second direction for linear/body patterns.
- [x] Instance suppression (`suppressedInstances`) for linear, circular, curve, face and feature patterns.
- [x] Seed selection from the provenance query list, plus an explicit suppression list for instances.
- [x] Merge/join mode (`join`); `separate` overrides it.
- [x] Separate-bodies mode and `${featureId}#k` body ownership.
- [x] Consumed-body semantics (the seed is replaced by the patterned result unless separate).
- [x] Provenance for every pattern instance (edge/face tags are registered per result body).
- [x] Named errors for missing seeds, zero spacing/extent, zero circular angle, bad path points,
      face mode without faces, and pattern union failures.
- [x] Pattern dialog: the generic feature dialog exposes type, seed/faces, direction, count,
      spacing mode, suppression, join/separate, preview, apply and cancel.

#### C2. Boolean

- [x] Add, subtract, intersect and common.
- [x] Target/tool selection.
- [x] Keep tools (scene consumption honours `keepTools`).
- [x] Make solid (`makeSolid=false` returns the boolean's face compound instead of claiming a solid).
- [x] Merge scope and consumed-body hiding.
- [x] Empty-result diagnostics (no solid/faces is a named error).
- [x] Non-manifold diagnostics (difference/common with no solid is a named error).
- [x] Boolean preview, apply, cancel and undo through the existing combine path.

#### C3. Split

- [x] Split by plane.
- [x] Split by surface (selected tool body/surface).
- [x] Keep positive, negative and both.
- [x] Split all intersecting solids in the target.
- [x] Split provenance and body ownership (`featureId` and `featureId#1`).
- [x] Consumed-body behavior; both halves become owned bodies.
- [x] Named errors for a plane/surface that misses the body or does not divide it.
- [x] Split dialog: target, tool, split-by, keep scope, preview, apply and cancel via the feature dialog.
- [x] Removed the stale "split twice for both halves" note.

#### C4. Move face / delete face

- [x] Planar trim and prism boss are proven.
- [x] Neighbor-follow extension for planar bodies through the cut/fuse boolean path.
- [x] Adjacent-merge heal (`mergeAdjacent` runs same-domain unification after the sewn cap).
- [x] Tangent-face handling through the selected face boundary and sewn refill.
- [x] Delete-face refill on curved boundaries (`BRepOffsetAPI_MakeFilling` fallback).
- [x] Named errors for unrecoverable face deletion and non-closed healed shells.
- [x] Preview, apply, cancel and undo through the generic feature dialog.
- [x] Downstream-reference preservation: healing re-registers face/edge tags for the new body.

#### C5. Transform / copy semantics

- [x] Body move.
- [x] Body rotate around the body centre.
- [x] Body copy.
- [x] Copy vs move ownership (move updates the source element; copy creates an owned body).
- [x] Patterned/copied body provenance (new tags and `${featureId}#k` for extras).
- [x] Undo labels for each transform (normal feature-history entry).
- [x] Selection preservation for move/rotate by updating the existing body element; copy exposes a new body row.

### D. Feature tree

Current state: D is closed as of 2026-11-07. Structural operations, rollback,
failure handling and the row/action model are implemented and covered.

- [x] Folders are landed. Non-contiguous members are allowed: every row with the
      same folder groups into one folder at its first member's position, and
      children keep history order.
- [x] Reorder must warn about downstream references that would break
      (context menu names them; guarded move stops before the dependent).
- [x] Reorder offers repair: `moveWithDependents` / `stepWithDependents` move a
      feature and every transitive dependent as one block, exposed as “Move with
      Dependents Up/Down”. This is repair by block move, not literal repointing:
      feature ids never change, so downstream references stay valid.
- [x] Suppress must explain dependent features that will also be suppressed.
- [x] Suppression cascade must be reversible in one undo step.
- [x] Rename must handle duplicate names and name collisions.
- [x] Rollback supports editing at an earlier feature, then rolling forward
      (dialog preview/apply at the rollback position, plus a Forward step).
- [x] Insert-here semantics: a drop lands before or after the target row based
      on the cursor half. The rollback bar is draggable onto any feature row.
- [x] Rollback state survives save/reload and tab switches (persisted as
      `rollbackIndex` in the document blob and restored with the nodes).
- [x] Error isolation: a failed feature produces no body, and later unrelated
      features still evaluate.
- [x] Per-feature retry/recovery: “Retry Feature” clears the stale error and
      rebuilds; a genuinely broken feature stays ERROR with its detail.
- [x] Downstream error cascade names the originating feature (the executor
      records `origin` and reports “depends on failed …”, naming the direct
      parent for transitive failures).
- [x] Affected-reference warnings cover delete, reorder, suppress and parameter
      edits (context menus plus the dialog's “Used by N” warning).
- [x] Feature and Browser selection stay synchronized for multi-body extras:
      an extra body row highlights its owning feature row, and an element maps
      back through `featureForElement` to the owner row.
- [x] Feature dialog: open, edit, live preview, apply, cancel and undo.
- [x] Feature context menu shows the same actions for history-only, extra-body
      and cadjs rows. History rows are no longer re-decorated by their shared
      body element (which previously retargeted a failed fillet row at its
      source box); failed features keep a visible row for retry.
- [x] Tree tests cover reorder, rollback, suppress, delete, rename, folder,
      failure and recovery (15 model tests + 3 Chromium tree tests).

### E. Multi-body / part semantics

Current state: **closed 2026-11-07**. A persisted `ScadgenParts` registry owns
parts and body metadata; the inspector exposes parts/materials/mass properties
and body actions; the Browser groups by part. Proof and manual scenarios are in
`PHASE3_E_TEST_PLAN.md`.

Tester pass 2026-11-07: E typecheck clean, 27 focused unit tests and 12
Chromium specs pass. Two defects found and fixed — removed bodies could enter
part and selection STL exports (`exportableBodies` now filters
`state === "removed"`), and a failed feature's row reported the source body's
`OK` instead of its own `ERROR` (the clicked row's feature now drives the
inspector's provenance). Multi-select and error ownership are covered by
`e2e/parts.spec.ts`. Project-wide `tsc` currently fails only in `featuresF.ts`
(workstream F, in flight), not in E.

- [x] **Parts**: named containers that own one or more bodies.
- [x] **Composite parts** (derived from membership; >1 body).
- [x] Part naming, part number and description.
- [x] Body naming independent of feature name.
- [x] Body membership in a part.
- [x] Material assignment per part/body (density drives mass).
- [x] Appearance per part/body, persisted and reapplied after rebuild.
- [x] Body state: keep, remove, hide, show, isolate, transparent.
- [x] Visibility persistence across save/reload.
- [x] Body delete/keep semantics for split and pattern extras.
- [x] Per-body measurement from the inspector.
- [x] Center of mass.
- [x] Moments of inertia.
- [x] Body transform/copy.
- [x] Consumed-body provenance.
- [x] Multi-select body properties.
- [x] Body-level error ownership.
- [x] Browser grouping by part.
- [x] Body/part tests cover create, rename, assign, hide, persist and export.

### F. New modelling features

Current state: **implemented and tester-verified, with listed limits**
(2026-11-07). All F features are wired through builders, executor, feature
map, menus and the action bus; see `PHASE3_F_TEST_PLAN.md` for the measured
results. Remaining limits are sketch-entity picking, threads/wrap using the
true helix, BREP feature-history inference for imports, and a real tab picker
for Derive.

Tester pass 2026-11-07: `tsc` clean, 39 focused unit tests and 22 Chromium
checks pass (11 existing, body-properties and the new `features-f.spec.ts`
with 10). Two defects were found and fixed: F bodies were missing from the 3D
view/Browser because `sceneSync.COMMITTABLE` omitted their feature types, and
`enclose` surfaces reused the target's element instead of owning their own.
Geometry notes: STL recognition reports `mesh` with the triangulated count, a
rib may split caps (12 faces for a simple rib), and a two-edge fill is an open
surface rather than a face.

#### F1. Rib / gusset

- [x] Rib from a sketch line or arc (endpoints passed in; viewport picking is
      still explicit).
- [x] Thickness.
- [x] Depth/extent.
- [x] Merge into a target body.
- [x] Draft.
- [x] Rib direction flip.
- [x] Gusset variant.
- [x] Named errors for zero/negative thickness, depth and zero-length profile.
- [x] Rib/gusset dialog: profile, thickness, extent, merge, preview, apply,
      cancel.
- [ ] Viewport picking of a sketch line/arc to derive the endpoints.
- [ ] Distinct non-intersecting-target error (kernel reason is surfaced).

#### F2. Web

- [x] Web feature definition (rectangular wall between two points).
- [x] Thickness and extent.
- [x] Merge scope.
- [x] Draft and flip.
- [x] Named errors.
- [ ] Dedicated two-rail selection rules.
- [x] Dialog and interaction tests: `e2e/features-f.spec.ts › F2: web dialog
commits a thickness change`.

#### F3. Boss / emboss

- [x] Boss on a face (top-centre default when x/y/z are omitted).
- [x] Emboss text/logo on a face.
- [x] Height/depth.
- [x] Draft.
- [x] Merge scope.
- [x] Wrap cut/emboss modes.
- [x] Named errors.
- [x] Dialog params and a Chromium boss-dialog commit test.

#### F4. Helix / coil / spring

- [x] Helix curve feature (edge-only 3D curve, same path as the coil).
- [x] Coil solid feature (3D helix swept profile).
- [x] Spring presets (compression/extension/torsion).
- [x] Pitch, revolutions, start/end angle, taper.
- [x] Left/right hand.
- [x] Merge scope.
- [ ] True helix path for threads and wrap.
- [x] Named errors.
- [x] Dialog and unit coverage, plus a Chromium coil-dialog commit test.

#### F5. Dome feature

- [x] Modelling dome feature: radius, height, placement, optional merge.
- [x] Dialog params, expansion test and a Chromium dome-dialog commit test.

#### F6. Derived Part Studio

- [x] Source Part Studio selection by tab id.
- [x] Derived body import via an isolated executor over the tab design.
- [x] Merge/context behavior (optional union with the target).
- [x] Update propagation on every rebuild through the tab resolver.
- [x] Named errors for missing source tab, malformed design, missing body.
- [ ] Dialog tab picker (currently a string tab id).
- [x] Params persist on the node; the Chromium test creates a second tab and
      checks source-edit propagation.

#### F7. Imported feature recognition

- [x] Preserve imported bodies when recognition fails.
- [x] No silent geometry loss (recognition is metadata only).
- [x] Classify box/cylinder/mesh with dimensions and confidence.
- [ ] Editable feature-history inference from the BREP.
- [x] Recognition metadata on the `insertedBody` node; a Chromium round-trip
      test confirms it and that the imported geometry is unchanged.

#### F8. Feature-map gaps

- [x] `fitSpline`.
- [x] `bridgingCurve`.
- [x] `enclose` / endcap.
- [x] `rib`.
- [x] `gusset`.
- [x] `derive`.

### G. Measure / inspect

Current state: **G complete (2026-11-07).** Measure mode supports distance,
edge length and angle, with temporary and pinned measurements. The body
inspector adds a G inspect block backed by `src/model/inspect.ts` and
`BodyPropertiesPanel`. All G checklist items are closed; G7's named error is
unit-tested because the live app has no selectable zero-triangle body.

Landed (uncommitted):

- Radius/diameter and curvature from a circle fit over smooth-edge rings. This
  is a tessellation estimate; no analytic OCC surface query is wired.
- Thickness from bidirectional inward rays.
- Interference/clearance between selected bodies from triangle tests.
- XY section area/perimeter through the selection bbox centre.
- mm/in units and 1–4 decimal display precision in the inspector. The unit
  switch covers dimensions, volume, area, mass, CoM and inertia.
- A visible accuracy policy states that values are mesh-derived, curved fits
  reject >2% RMS, and display precision is not a geometric tolerance.
- Empty/failed bodies report a named `inspect:` error instead of throwing.
- Unit tests in `src/model/__tests__/inspect.test.ts` (9/9).
- G1–G6/G8 browser coverage in `e2e/body-properties.spec.ts` and distance/
  edge-length/angle plus pin persistence in `e2e/measure.spec.ts` (12/12 pass
  on the isolated port 3300 server, 2026-11-07). G7 remains unit-only.

- [x] Radius (circle fit over smooth-edge rings; mesh estimate).
- [x] Diameter.
- [x] Thickness (ray-based).
- [x] Interference between bodies (triangle tests).
- [x] Clearance between bodies (triangle tests).
- [x] Curvature (from the fitted radius).
- [x] Section analysis as an inspect workflow (bbox-centre XY section; the
      arbitrary-plane Section feature is unchanged).
- [x] Mass properties in Measure mode (the inspector panel already renders in
      every non-sketch mode, including Measure).
- [x] Center of mass (existing inspector field).
- [x] Per-body and multi-body measurement (single fields plus selection totals
      and interference/clearance).
- [x] Measurement on split/pattern extras (`F1#1` inspect test; scene maps body
      ids through their owner).
- [x] Measurement on hidden/isolated bodies with clear state (existing Visible
      row; inspection still runs).
- [x] Unit selection and consistent mm/in display. The switch covers inspect
      fields and mass properties (volume/area/mass/CoM/inertia).
- [x] Measurement precision/tolerance policy. Display precision is selectable
      and the mesh-derived accuracy policy is shown in the panel and documented
      here.
- [x] Measurement persistence and pin/unpin across rebuilds. Browser test
      `measure: distance, pin and unpin survive a rebuild`.
- [x] Named errors when a selection cannot be measured (`inspection.error` is
      shown as `inspect: …`). G7's live path stays unit-only because no
      zero-triangle body is selectable.
- [x] Measure tests cover every measurement type and unit. Real browser tests
      cover distance, edge length and angle; inspect tests cover mm/in and
      mm³/in³; `cheapWins.test.ts` covers the model helpers.

### H. Deterministic rebuild, serialization and acceptance

Current state: the H exit evidence exists. Export names are deterministic; STL
and STEP round-trips assert bbox, volume, topology, ownership and recognition;
named failures publish no body; and all 17 Phase 3 dialogs are covered. The
former H1/H2 Torus blocker is fixed: the torus profile is now two semicircular
arcs instead of one periodic circle, whose full-turn mesh came back empty. The
primitive catalog is 2/2 and H1/H2 is 1/1 on the isolated HMR-free server.

Acceptance tooling and the browser spec landed 2026-11-07: canonical project
JSON (`canonicalProjectJson` / `stableJson.ts`), a quantized order-independent
BREP digest and bbox summary (`geometryDigest.ts`), a 20+ feature coverage audit
(`acceptanceAudit.ts`), and `e2e/phase3-acceptance.spec.ts` (35-feature part,
save/reload, STL/STEP round-trips, named failure). The scene exposes
`window.__scadgen.phase3.{audit,geometry,projectJson}` plus the sweep/loft/
boolean and per-body export hooks the spec uses.

Acceptance run 2026-11-07 (dedicated `E2E_PORT=3100`, `--retries=1`): **5/5**
after adding a body-state save/reload test. H1 and H5/H6 each needed one retry
(Vite reloads from concurrent workstreams, not app defects); port 3000 failed
outright with `ERR_CONNECTION_REFUSED` (dead shared server, environmental).
Focused H scenarios: **12/12 green**. Full Chromium suite: **green in four
bounded chunks — 80 tests, 74 passed, 5 flaky-passed on retry, 1 pre-existing
`test.fixme` skip, 0 failed**. The extrude dialog test was corrected, not
weakened: `executor.ts` consumes `operationType` (boolean against targets) and
`hasDraft`/`draftAngle`, so those controls are legitimately enabled. Those gaps are closed: export names are derived from the body/part instead of a
timestamp, STEP asserts volume/topology/ownership/recognition, and the dialog
matrix covers all 17 Phase 3 dialogs. H1/H2 are currently blocked only by the
concurrent executor/revolve regression noted above.

- [x] Build a single 20+ feature mechanical part (35 features).
- [x] Include sketches, extrude/revolve/sweep/loft, fillet/chamfer, shell,
      draft, hole, pattern, boolean, split and at least one new feature.
- [x] Reorder features and verify geometry (12/12 focused scenarios).
- [x] Roll back to an early feature and edit it.
- [x] Roll forward and verify downstream geometry.
- [x] Suppress and restore features.
- [x] Rename and folder-organize features.
- [x] Save and reload the document.
- [x] Verify byte-stable or geometry-stable serialization.
- [x] Export STL and re-import it; compare bbox, volume and topology
      (`H_close_acceptance3`).
- [x] Export STEP and re-import it; compare bodies, volume, topology,
      ownership and recognition (`H_close_acceptance3`).
- [x] Verify units and filenames are deterministic (`scadgen_<slug>.stl`,
      identical across exports and reload; `H_close_acceptance3`).
- [x] Verify tested feature failures produce a named error and no bogus body
      (`H_close_acceptance2`; four failure classes).
- [x] Verify one undo entry per dialog apply (12/12 focused scenarios).
- [x] Verify cancel leaves no partial geometry.
- [x] Verify preview does not mutate persisted history.
- [x] Verify multi-body extras survive reload and export (H4/H8 body-state
      test: 2 bodies after reload; `multi-body.spec.ts` exports body 2).
- [x] Verify appearance and visibility survive reload (H4/H8 body-state test).
- [x] Verify mass properties survive reload (material + mass text stable).
- [x] Add feature-dialog tests for every feature in the Phase 3 set
      (`e2e/phase3-dialogs.spec.ts`, 17/17).
- [x] Add full Chromium regression coverage for the 20+ feature part
      (acceptance spec runs inside the 80-test Chromium suite).
- [x] Archive the exit evidence with commands and results
      (`results/H_*_2026-11-07.log`, rerun matrix in
      `PHASE3_H_TEST_PLAN.md`).

## 3. Cross-cutting correctness work

- [ ] Audit every `featureMap.ts` parameter against every executor op. The
      audit table and the disabled-with-reason UI exist
      (`paramSupport.ts`, `featureDialog.ts`); expand `KERNEL_CONSUMED_PARAMS`
      as each remaining executor case is read.
- [ ] Remove stale `primitive.*` `status: "deferred"` entries; those features
      have landed.
- [ ] Remove stale split note "split twice for both halves"; `keep=both`
      exists.
- [ ] Audit every `operationMenu.ts` `ready` entry for a real handler.
- [ ] Audit every `PLACEHOLDER` ActionBus action; no placeholder may be exposed
      as a shipped Phase 3 control.
- [ ] Ensure every feature has a typed parameter schema, a dialog and a named
      failure path.
- [ ] Ensure every feature creates exactly one history node per user action
      unless the operation intentionally emits a helper chain that the Browser
      deduplicates.
- [ ] Ensure every helper chain is hidden from body counts where it is not a
      body.
- [ ] Ensure all feature creation paths (desk toolbar, ActionBus, debug hook,
      VR, voice) produce the same history shape.
- [ ] Ensure all feature edits are undoable and named.
- [ ] Ensure all feature edits preserve downstream references or report exactly
      which references broke.
- [ ] Ensure all units crossing UI, scene, kernel, export and re-import are
      explicit (metres vs millimetres).
- [ ] Keep the control inventory at zero dead and zero unlabeled controls.
- [ ] Increase direct test evidence for Phase 3 controls; a handler alone is not
      evidence.
- [ ] Keep the parity matrix honest: no `SHIPPED` row without a real test.

## 4. Recommended order

1. **Parameter audit and dialog harness.** _Landed for the audited ops and
   extrude: `paramSupport.ts`, `featureDialog.ts`, `FeatureDialog.tsx`, and
   `e2e/feature-dialog.spec.ts`. Remaining: wire the other feature dialogs and
   grow the audit table._
2. **Finish A and B depth.** Extrude end conditions, thin/draft/merge; then
   fillet/chamfer/shell/draft/hole completeness.
3. **Finish C correctness.** Pattern join/face/body modes, split-surface,
   face-healing and transform/copy.
4. **Add F features.** Rib/gusset, web, boss/emboss, helix/coil/spring,
   derived Part Studio and recognized imports.
5. **Add E part semantics.** Parts, composite parts, materials, appearances,
   persistent body state and per-body measurement.
6. **Expand G inspect.** Radius, thickness, interference, curvature, section
   analysis and full mass properties.
7. **Build the 20+ feature exit part and H acceptance suite.**
8. **Run the full gate, archive evidence, and update the parity matrix.**

## 5. Definition of done for this document

This backlog is complete only when every checkbox above is either:

- checked with a testable implementation and evidence, or
- explicitly moved out of Phase 3 by changing `ONSHAPE_PARITY.md` and recording
  why.

Until then, Phase 3 remains **in progress**, regardless of how many controls or
green tests exist.
