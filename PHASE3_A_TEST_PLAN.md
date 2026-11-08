# Phase 3 A — Tester handoff and acceptance plan

**Status:** A implementation complete for every path the OCC build supports,
2026-11-07. A tester pass ran the automated commands on 2026-11-07: the A unit
suite is **67/67**, the full 22-test parity spec passes, and four real issues
were fixed (open-chain ordering, revolve face test data, stale query-list
expectation, torus full-turn profile). Picker scenarios 27/38/42/44 pass; the
44 manual scenarios were not all driven, so subjective visual/tessellation
review remains. Results and the isolated-server setup are recorded in the
Verification log.

## Tester brief

- **Section:** Phase 3 A — extrude / revolve / sweep / loft.
- **Implemented:** extrude end conditions and merge scope; revolve second angle,
  symmetric, axis sources, reverse and merge; sweep sampled curved paths,
  orientation, corner mode, chordal tolerance, path offsets and merge; loft
  multi-section, closed, ruled/fluid and merge. Vendor OCC helpers were edited
  where the executor needed a capability.
- **Covered by this pass:** exact sketch shape retention for nested regions,
  multi-region extrude, profile-rule errors, extrude draft neutral plane and
  picked parting edge, the Draft feature's picked parting edge, merge-target
  consumption for all four A operations, the sweep guide picker, thin
  revolve/sweep/loft, revolve up-to bounds, sweep/loft guide curves, sweep twist,
  loft end conditions/connectors, revolve `cornerType`.
- **Kernel approximations still to probe:** section-engine twist/end conditions,
  blended loft guides, centerline pipe sections, and multi-guide sweep sections.
  Nested-hole face construction and edge-based parting draft were executed in a
  focused OCC pass; results are in the pre-handoff evidence below.
- **Deliverable:** pass/fail for every row, real-kernel evidence for the manual
  scenarios, and fixes for anything real.
- **No commit or push was made.** Keep the working tree intact.

## What changed (review map)

### App model / executor

| File                                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/extrudeEndCondition.ts`                | Pure extrude depth solver: through-all, through-all-with-offset, up-to vertex/face/surface, named failures.                                                                                                                                                                                                                                                                                                                       |
| `src/model/sweepPath.ts`                          | Pure path sampler/chainer: lines, arcs, circles, ellipses, elliptical arcs, splines, Beziers, conics, plus `extendPathEnds`.                                                                                                                                                                                                                                                                                                      |
| `src/model/profileRules.ts`                       | Pure profile validator: zero-area, self-intersection and shared named-error text for extrude/revolve.                                                                                                                                                                                                                                                                                                                             |
| `src/model/executor.ts`                           | Extrude derives `depth` from `endBound`; shared `mergeOperation` helper applies NEW/ADD/CUT/INTERSECT for extrude/revolve/sweep/loft; revolve axis resolution (sketch line, body edge, explicit axis) and direction modes; sweep sampled path + offsets + orientation/tolerance; loft closed/ruled and guide rejection; exact sketch shape retention, multi-region extrude, draft neutral/parting inputs and profile-rule guards. |
| `src/model/featureMap.ts`                         | New rows: extrude `endBound`, `endBoundOffset`, `endBoundEntity`, `oppositeDirection`; revolve `angleBack`, `direction`, `oppositeDirection`, `operationType`, `targets`; sweep `cornerMode`, `guideSubqueries`, `pathStartOffset`, `pathEndOffset`, `operationType`, `targets`; loft `closed`, `operationType`, `targets`; draft `draftPartingEdge` replaces the JSON-point `partingLine`.                                       |
| `src/model/paramSupport.ts`                       | Audit marks the new params kernel-wired; revolve `cornerType` stays unwired (kernel has no cone/transitional mode).                                                                                                                                                                                                                                                                                                               |
| `src/model/sceneSync.ts`                          | `toolElementIds` hides consumed `targets` for extrude/revolve/sweep/loft merges, so a merged result is not drawn on top of its source body.                                                                                                                                                                                                                                                                                       |
| `src/model/paramPanel.ts`                         | Query-list rows are committable: `panelEditToParameter` / `applyPanelEdit` write `queries`, so a viewport pick survives the dialog draft.                                                                                                                                                                                                                                                                                         |
| `src/components/FeatureDialog.tsx`                | End Reference/Neutral Face rows get a **Pick face** button; Guide Curve gets **Pick curve**/Clear and Parting Edge gets **Pick edge**; while picking, the backdrop ignores pointer events and Escape cancels the pick before the dialog.                                                                                                                                                                                          |
| `src/scenes/simpleCadScene.tsx`                   | Body picks raycast and resolve to `FACE`/`VERTEX` queries. Guide and parting-edge picks sample sketch curves, project them to screen space, and hit-test within 12 px; a picked parting curve is stored as `draftPartingEdge`, not a point. The picker rejects the feature's own result.                                                                                                                                          |
| `src/model/onshapeHistory.ts`                     | `buildExtrudeNode` / `buildRevolveNode` / `buildSweepNode` / `buildLoftNode` write safe defaults for every new param.                                                                                                                                                                                                                                                                                                             |
| `src/model/__tests__/extrudeEndCondition.test.ts` | 12 solver tests.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/model/__tests__/sweepPath.test.ts`           | 7 path sampling/offset tests.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/model/__tests__/featureDialog.test.ts`       | Audit assertions extended to the new extrude params, plus a query-list end-reference commit test.                                                                                                                                                                                                                                                                                                                                 |

### Vendor kernel (`vendor/cadjs`)

| File                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/occ-revolve-loft.ts`         | `loftShapesHelper` gains `isClosed` (first section re-added; no `SetClosed` here), `twistRadians` and per-section `connectors`; `loftAlongCenterlineHelper` builds a pipe shell through every section.                                                                                                                                                                                                                    |
| `src/workers/occ-worker-handlers.ts`       | Revolve handler splits `symmetric` into two half sweeps and unions; loft passes `isClosed`; sketch faces are built from connected wires with nested loops as inner wires (direct child wires are reversed so they cut a hole), while disjoint loops remain separate faces; sweep dispatches >1 guide to `sweepMultiGuideHelper`.                                                                                          |
| `src/services/occ-extrude.ts`              | Sweep pipe shell applies `SetTolerance(chordalTolerance, ...)` and uses `SetMode_5` for a single guide; `sweepMultiGuideHelper` builds guide-constrained sections through `ThruSections` for multiple guides; edge-based draft validates the parting line and avoids double-deleting OCC property objects; `offsetProfileFace` builds the inner face for thin sweep/revolve/loft with rounded/conical/transitional joins. |
| `src/workers/occ-worker-types.ts`          | `SweepRequest.chordalTolerance`, `LoftRequest.isClosed`.                                                                                                                                                                                                                                                                                                                                                                  |
| `src/scene-operations/loft-operations.ts`  | `loftBReps(profiles, isRuled, isClosed)` forwards the closed flag.                                                                                                                                                                                                                                                                                                                                                        |
| `src/scene-operations/sweep-operations.ts` | `SweepOptions.chordalTolerance` forwarded to the worker.                                                                                                                                                                                                                                                                                                                                                                  |

`@vitekk02/cadjs` is a `file:vendor/cadjs` dependency. If the tester's install
copied rather than symlinked the package, run `npm install` (or the project's
usual vendor refresh) before testing so the kernel edits are the ones executed.

## Commands to run

From `user01/cadjs-starter`:

```bash
npx tsc --noEmit -p tsconfig.json

npx vitest run \
  src/model/__tests__/extrudeEndCondition.test.ts \
  src/model/__tests__/sweepPath.test.ts \
  src/model/__tests__/featureDialog.test.ts \
  src/model/__tests__/paramPanel.test.ts \
  src/model/__tests__/paramSupport.test.ts \
  src/model/__tests__/executor.test.ts \
  src/model/__tests__/geometry.test.ts

npx playwright test \
  e2e/feature-dialog.spec.ts \
  e2e/primitives.spec.ts \
  e2e/parity-ops.spec.ts \
  --project=chromium --reporter=line

npx eslint \
  src/model/extrudeEndCondition.ts \
  src/model/sweepPath.ts \
  src/model/executor.ts \
  src/model/featureMap.ts \
  src/model/paramSupport.ts \
  src/model/onshapeHistory.ts \
  src/model/__tests__/extrudeEndCondition.test.ts \
  src/model/__tests__/sweepPath.test.ts \
  vendor/cadjs/src/services/occ-extrude.ts \
  vendor/cadjs/src/services/occ-revolve-loft.ts \
  vendor/cadjs/src/workers/occ-worker-handlers.ts

npx prettier --check PHASE3_A_TEST_PLAN.md \
  src/model/extrudeEndCondition.ts \
  src/model/sweepPath.ts \
  src/model/__tests__/extrudeEndCondition.test.ts \
  src/model/__tests__/sweepPath.test.ts

git diff --check
```

## Checklist and coverage

| #   | Requirement                                                             | Implementation                                                                        | Automated coverage                               |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | BLIND extrude unchanged                                                 | `extrudeDepthOf` behind `endBound === "BLIND"`                                        | existing extrude tests/e2e                       |
| 2   | THROUGH_ALL reaches the farthest body vertex ahead                      | `solveExtrudeEndBound` + world-vertex projection                                      | `extrudeEndCondition.test.ts`; scenario 1        |
| 3   | THROUGH_ALL with overshoot; negative rejected                           | `endBoundOffset`                                                                      | unit tests; scenario 2                           |
| 4   | THROUGH_ALL measures from a start offset                                | executor adds `offsetDistance` along the plane normal                                 | unit tests; scenario 3                           |
| 5   | Reverse direction flips kernel direction and derived depth              | `oppositeDirection` in map/audit/solver                                               | unit test; scenario 4                            |
| 6   | Through-all with nothing ahead is named                                 | `through-all found no body ahead of the sketch plane`                                 | unit test; scenario 5                            |
| 7   | Face parallel to / behind the direction is named                        | solver reasons                                                                        | unit tests                                       |
| 8   | Midplane + non-blind bound is rejected                                  | executor guard                                                                        | scenario 6                                       |
| 9   | UP_TO_FACE / SURFACE / VERTEX depth + picker                            | plane intersection / farthest vertex / point projection; Pick face → `endBoundEntity` | unit tests; `featureDialog.test.ts`; scenario 27 |
| 10  | Extrude merge scope NEW/ADD/CUT/INTERSECT                               | shared `mergeOperation`                                                               | scenario 7                                       |
| 11  | Symmetric extrude with independent forward/back depths                  | two extrudes + union when `symmetric` and `hasSecondDirection`                        | scenario 8                                       |
| 12  | Revolve second angle                                                    | `direction: two` + `angleBack` into the worker                                        | scenario 9                                       |
| 13  | Symmetric revolve                                                       | handler splits total angle and unions half sweeps                                     | scenario 10                                      |
| 14  | Revolve axis from sketch line / body edge / explicit axis / normal      | executor axis resolution                                                              | scenarios 11–12                                  |
| 15  | Revolve reverse and merge scope                                         | `oppositeDirection`, `mergeOperation`                                                 | scenario 13                                      |
| 16  | Revolve named errors: zero angle, missing second angle, unresolved axis | executor guards + kernel diagnostics                                                  | scenario 14                                      |
| 17  | Sweep path beyond straight lines                                        | `sweepPath.ts` sampling/chaining                                                      | `sweepPath.test.ts`; scenario 15                 |
| 18  | Sweep start/end offsets                                                 | `extendPathEnds`                                                                      | unit tests; scenario 16                          |
| 19  | Sweep orientation and corner mode                                       | `keepProfileOrientation`, `cornerMode`                                                | scenario 17                                      |
| 20  | Chordal tolerance reaches the kernel                                    | `SetTolerance` on `MakePipeShell`                                                     | scenario 18 (visual/tessellation)                |
| 21  | Sweep merge scope                                                       | `mergeOperation`                                                                      | scenario 19                                      |
| 22  | Loft >2 sections                                                        | ordered profile list                                                                  | scenario 20                                      |
| 23  | Closed/periodic loft                                                    | `closed` re-adds the first section after the last                                     | scenario 21                                      |
| 24  | Ruled vs fluid loft                                                     | `loftType` / `ruled`                                                                  | scenario 22                                      |
| 25  | Loft merge scope                                                        | `mergeOperation`                                                                      | scenario 23                                      |
| 26  | Loft guides blend into a spine                                          | named error                                                                           | scenario 24                                      |
| 27  | Every new dialog row is live except documented gaps                     | audit list; every A row kernel-wired                                                  | `featureDialog.test.ts`; scenario 25             |
| 28  | Existing dialog lifecycle (preview/apply/cancel/undo)                   | unchanged                                                                             | `e2e/feature-dialog.spec.ts`                     |
| 29  | Sweep single guide curve                                                | `guideSubqueries` → auxiliary spine (`SetMode_5`)                                     | scenario 26                                      |
| 30  | Escape cancels the dialog with no partial state                         | `FeatureDialog` key handler + cancel restore                                          | `e2e/feature-dialog.spec.ts` (new assertion)     |
| 31  | End-reference picker writes a real FACE/VERTEX query                    | dialog Pick face → raycast → `resolveHitToTag` → `endBoundEntity`                     | `featureDialog.test.ts`; scenario 27             |

| 32 | Thin revolve/sweep/loft wall | inner profile offset + boolean difference in each worker handler | scenario 28 |
| 33 | Revolve up-to face/vertex | `revolveEndCondition.ts` + shared reference picker | unit tests; scenario 29 |
| 34 | Multiple sweep guides | independent `guideCurves` → guide-constrained sections (`sweepMultiGuideHelper`) | scenario 30 |
| 35 | Loft twist and connectors | section seam rotation before `ThruSections` | scenario 31 |
| 36 | Loft centerline | centerline becomes the pipe-shell spine with every section added | scenario 32 |
| 37 | Sweep twist | rotated sections lofted along the path (`sweepTwistedHelper`) | scenario 36 |
| 38 | Loft end conditions | extra endpoint sections from normal/tangent/curvature/direction | scenario 37 |
| 39 | Extrude draft neutral plane / parting line | `draftMode`, `draftNeutralFace`, origin/normal and picked `draftPartingEdge` → validated edge endpoints → OCC `DraftAngle` | scenario 38 |
| 40 | Nested and multiple extrude regions | exact sketch `occBrep` + per-face extrude/union | scenario 39 |
| 41 | Named profile errors | `profileRules.ts`: open, zero-area, self-intersecting | scenario 40 |
| 42 | Revolve open/nested profile rules | open rejection + exact face retention | scenario 41 |
| 43 | Sweep guide picker | Guide Curve row **Pick curve** (viewport hit-test) adds each curve; Clear removes all | scenario 42 |
| 44 | Merge/consume all four A operations | `sceneSync` consumption for extrude/revolve/sweep/loft | scenario 43 |
| 45 | Draft feature parting edge | `draftPartingEdge` → endpoint-resolved neutral plane; worker validates edge in plane | scenario 44 |

Rows 1–44 are implemented in this slice. The pickers are UI code: the model
side is unit-tested where possible, but raycast and dialog interactions need the
tester's browser run. 3D sketch snapshots are planar, though an explicit
`pathPoints` polyline works.

## Manual acceptance scenarios

1. **Through-all NEW** — extrude a 20 mm box, sketch a smaller rectangle on the
   same plane, `THROUGH_ALL`; the new body ends at the box’s far face (±
   tessellation), not at the default depth.
2. **Through-all + offset** — `THROUGH_ALL_WITH_OFFSET`, `Through All Offset =
5 mm`; bbox length exceeds the far face by ~5 mm.
3. **Start offset + through-all** — `Offset` on, `Offset Distance = 2 mm`,
   `THROUGH_ALL`; the solid starts 2 mm off the plane and still reaches the far
   face.
4. **Reverse direction** — through-all down onto a body below the sketch, plus a
   BLIND reverse regression.
5. **Nothing ahead** — sketch only, `THROUGH_ALL`: row `ERROR` with
   `extrude: through-all found no body ahead of the sketch plane`, no body.
6. **Midplane conflict** — `Midplane` + `THROUGH_ALL`: named error, no body.
7. **Extrude merge** — extrude `ADD` onto a box with a target selected: one
   body; `CUT` leaves the box with the cut; `INTERSECT` keeps only the overlap.
8. **Symmetric independent depths** — `Symmetric` + `Second Direction` with
   forward 10 mm / back 4 mm; 14 mm total, 10 mm above the plane.
9. **Revolve second direction** — profile beside an axis, `direction = two`,
   120° forward / 60° back; total 180° swept.
10. **Symmetric revolve** — `direction = symmetric`, 90°; 45° each side of the
    profile.
11. **Revolve axis sources** — revolve around (a) a sketch line, (b) a body edge
    from the Browser/selection, (c) `axisOrigin`/`axisDir` explicit axis, (d)
    the plane normal. All four produce solids; a wrong/degenerate axis gives a
    named error, not an empty body.
12. **Revolve reverse** — same profile with `Reverse Direction`; the sweep goes
    the other way around the axis.
13. **Revolve merge** — `ADD` onto an existing body: one body, union visible;
    `CUT` removes the swept volume.
14. **Revolve errors** — zero angle, `two` with zero second angle, axis lying in
    the profile plane: each is `ERROR` with a named detail and no body.
15. **Curved sweep path** — path built from a line + arc (and separately a
    spline); the sweep follows the sampled curve end to end. Circle path closes
    the sweep.
16. **Sweep offsets** — `Start Offset = 5 mm`, `End Offset = 5 mm`; the solid
    starts before and ends beyond the sketch path.
17. **Orientation/corner** — `Keep Orientation` and `Corner Mode = round`; the
    section orientation stays fixed / corners round off respectively.
18. **Chordal tolerance** — set a large tolerance, then a small one; small
    tolerance increases tessellation on curved paths (no geometry change on
    straight paths).
19. **Sweep merge** — `ADD`/`CUT` against a target body.
20. **Loft three sections** — three parallel profiles in order; a smooth solid
    through all three; reorder the `profiles` query list and confirm the shape
    follows the new order.
21. **Closed loft** — three or more sections, `Closed Loft`; the last section
    joins the first into a periodic solid.
22. **Ruled vs fluid** — same sections with `Type = STRAIGHT` vs `FLUID`; the
    straight loft is faceted between sections, the fluid one is smooth.
23. **Loft merge** — `ADD`/`CUT` against a target.
24. **Loft guides** — one or two guide sketches in `guideSubqueries`: they are
    blended by arc length into a spine and the loft follows it. A guide that
    misses the sections fails with `loft: centerline pipe failed` by name.
25. **Dialog surface** — open extrude/revolve/sweep/loft dialogs: every new
    scalar/enum row is editable, no amber “not read by the kernel” note; Apply
    adds exactly one undo entry; Cancel restores.
26. **Sweep guide curve** — sweep with `profiles`, `path` and one
    `guideSubqueries` sketch. The section follows the guide. A guide that misses
    the profile plane fails with a named kernel error (not a silent fallback).
    With two or more guides, use the multi-guide path in scenario 30.
27. **End-reference picker** — extrude a small rectangle over a box, open the
    extrude dialog, click **Pick face** on End Reference, then click the box's
    top face. The row shows one selected tag and End Condition switches to
    `UP_TO_FACE`; the preview ends at that face. Repeat with End Condition
    `UP_TO_VERTEX` and click near a corner: the row names a `_V*` tag and the
    extrude ends at that vertex. Escape during pick leaves the dialog open but
    exits pick mode; clicking this feature's own result shows the "another
    body" warning and stores nothing.
28. **Thin revolve/sweep/loft** — a closed profile with `Thin Wall` on and
    `Wall Thickness = 2 mm`: the result is a wall (a bore through the middle),
    not a solid. A wall thicker than the profile reports the offset failure by
    name. On a thin revolve, `cornerType` changes the profile-offset joins.
29. **Revolve up-to** — revolve a profile toward a box and pick the box face:
    the angle stops at that plane; with `UP_TO_VERTEX` it stops at the picked
    vertex. No pick reports the named missing-reference error.
30. **Multiple sweep guides** — two guide sketches in `guideSubqueries`: both
    rails are kept as `guideCurves` and the kernel builds sections that follow
    their centroid, axis and spread along the path; they are not averaged into a
    single spine. Inspect both sides of the result: with left/right rails the
    swept body should reach both guides rather than splitting the difference.
    One guide still uses the single-spine `SetMode_5` path.
31. **Loft twist/connectors** — two rectangular sections, `Twist = 90°`: the
    result rotates from first to last section. Pick a vertex on each section in
    `Connectors`: the seam vertices line up instead of OCC choosing a seam.
32. **Loft centerline** — a sketch curve through two or more sections in
    `Centerline`: the loft follows the spine. A centerline that misses a section
    fails with `loft: centerline pipe failed` by name.
33. **Open-profile thin extrude** — a single open sketch line/chain with
    `Thin Wall` and `2 mm` thickness: a wall is extruded along the chain. Thin
    off reports `extrude: an open profile needs a thin wall`; a non-blind end
    condition reports `extrude: open thin wall supports blind depth only`.
34. **3D sweep path** — set the sweep `3D Path (JSON)` to a zig-zag polyline
    with varying Z; the section follows the true 3D path. Malformed JSON fails
    with `sweep: pathPoints needs >=2 {x,y,z} points`.
35. **Loft profile reverse** — two or more sections in `Profiles`; press
    **Reverse** in the loft dialog and apply: the shape follows the reversed
    order (and the old first section becomes the last).
36. **Sweep twist** — a rectangular profile swept along a straight or curved
    path with `Twist = 90°`: the section visibly rotates from first to last.
    Twist plus a guide reports `sweep: twist cannot combine with guide curves`.
37. **Loft end conditions** — three sections with `End Condition = NORMAL`: the
    loft leaves the last section perpendicular to it instead of easing flat.
    `DIRECTION` with `[1,0,0]` leaves along +X; a zero/invalid vector reports the
    named direction error. `CURVATURE` uses two end sections; with only two
    profiles it behaves as tangent.
38. **Extrude draft plane** — turn Draft on, pick a Neutral Face on another
    body (or set origin/normal strings): the taper pivots about that plane, not
    the sketch plane. With `Draft Plane = PARTING`, click **Pick edge** and
    select a sketch line: the row stores one `draftPartingEdge` query, lateral
    faces on opposite sides taper in opposite directions, and the neutral plane
    passes through the picked edge. A missing/zero-length edge, or an edge that
    is not perpendicular to the draft pull, is a named error.
39. **Nested / multiple regions** — a rectangle with a circle inside extrudes as
    a ring (the circle is a hole), not a solid disc. Two disjoint closed regions
    in one sketch both extrude; the result is one body union and neither region
    silently disappears.
40. **Profile errors** — an open line chain with Thin off reports `extrude: an
open profile needs a thin wall`; a zero-area/degenerate loop reports
    `profile has zero area`; a bow-tie/self-crossing loop reports `profile is
self-intersecting`. Each is an `ERROR` row with no bogus body.
41. **Revolve profile rules** — an open chain reports `revolve: profile is open;
revolve needs a closed profile`; a nested profile revolves with its inner
    wire preserved as a hole, not a filled disc.
42. **Sweep guide picker** — open a sweep dialog, click **Pick curve** on Guide
    Curve, and click sketch curves in the viewport. Each click adds one curve;
    the row lists the selected tags and **Clear** removes them. Clicking empty
    space warns and adds nothing. Apply carries the query list into the sweep.
43. **Merge consumption** — apply ADD/CUT/INTERSECT for extrude, revolve, sweep
    and loft against a target. The target body is hidden/replaced by the merged
    result and returns when the feature is deleted or rolled back.
44. **Draft feature parting edge** — open a Draft feature, set Mode to
    `PARTING`, click **Pick edge**, and select a sketch line. The row stores one
    `draftPartingEdge` query; the draft is built about the neutral plane through
    that edge. Missing/zero-length edges and an edge not lying in the neutral
    plane each produce a named error. This is the Draft feature (B4), separate
    from the extrude dialog's draft row in scenario 38.

## High-risk spots to probe first

- **Vendor resolution**: `@vitekk02/cadjs` is `file:vendor/cadjs`. Confirm the
  running app and Vitest load the edited source (symlink or reinstall), not a
  stale copy. If `SetTolerance`/`SetClosed`/symmetric revolve appear missing,
  this is the first thing to check.
- **Symmetric revolve union seam**: two half sweeps are unioned; a full 360°
  symmetric revolve may leave a seam or fail to merge. Expect either one valid
  solid or a named error — not two bodies.
- **Closed loft with two sections**: this workspace has no `SetClosed`; the
  kernel re-adds the first section after the last. With only two distinct
  sections the duplicated pair is degenerate — confirm a named failure, not a
  zero-thickness solid.
- **Through-all coincidence**: the far end lands exactly on the farthest vertex.
  Watch for zero-thickness slivers in a `CUT` through-all.
- **Offset + reverse extrude**: `Offset Distance` is along the plane normal, not
  the reversed direction; the negative-offset + reverse case is the most likely
  sign error.
- **Section-engine twist / end conditions**: sweep twist and loft end conditions
  are built from rotated/extra sections because this OCC build has no native
  input. Check that a 90° twist is not applied twice (section index fraction is
  0..1) and that a zero direction reports the named error, not a silent NONE.
- **Arc sweep direction**: arcs store only start/end, so the shorter sweep is
  assumed. A clockwise arc >180° will follow the wrong side; record it as a
  known limitation, not a new bug.
- **Sweep point count**: curves sample at 32 points per turn. A tight curve with
  a large profile may facet; `chordalTolerance` changes the kernel tolerance but
  not the sampled path density.
- **Guide curve contact**: `SetMode_5` uses `BRepFill_NoContact`. A guide that
  does not cross the profile plane returns `PlaneNotIntersectGuide`; confirm that
  reaches the feature detail rather than the simple-pipe fallback.
- **Merge operand order**: `CUT` is `targets − tool`; confirm extrude/revolve/
  sweep/loft cuts remove material rather than inverting.
- **Picker raycast**: the pick reuses `createSubPrimSelector`, whose vertex
  threshold is 3 mm and edge threshold 5 mm in scene units. Clicking near an
  edge still resolves to a face; clicking empty space or a helper must not
  commit. Confirm the `endBoundEntity` value is a query with
  `entityType: "FACE"` (or `"VERTEX"`) and the picked body's feature id.
- **Self-reference**: picking the extrude's own output is rejected; make sure
  the warning appears instead of a cyclic rebuild.
- **Thin wall offset**: thin is outer-minus-inner, so thickness is measured
  inward from the profile. Too thick a wall or a self-intersecting offset must
  fail by name, not return the outer solid alone. Check the inner face is not
  picked up as a separate body.
- **Multi-guide sections**: sweep guides are no longer averaged into one
  auxiliary spine. `sweepMultiGuideHelper` builds a section at every path
  station from the rails' centroid, axis and spread, then lofts them with
  `ThruSections`. This is a section-engine implementation because this OCC
  build's `SetMode_5` takes only one spine; strongly disagreeing guides can
  still distort or fail. Record the actual result rather than calling it exact.
- **Loft centerline**: the pipe shell needs the centerline to cross every
  section; a centerline that only approximates the sections fails by name.

## Pre-handoff evidence (not a substitute for the tester’s run)

- `npx tsc -p tsconfig.json --noEmit` — **exit 0** after the final edits.
- `cd vendor/cadjs && npx tsc -p tsconfig.json --noEmit` — **exit 2**, but every
  reported error is pre-existing and outside the edited files: `occ-facade.ts`
  (`GeomAbs_Shape`), `occ-fillet-chamfer.ts` (`TopoDS_Face`, `EdgeOpBuilder`),
  and `occ-worker-handlers.ts` surface/flange lines. A grep of the log shows
  **no errors in `occ-extrude.ts`, `occ-revolve-loft.ts`, `occ-worker-types.ts`,
  `sweep-operations.ts` or `loft-operations.ts`** after the fixes.
- A focused `vite-node` run exercised the real OCC build for the two
  previously unproven kernel paths. Nested 10×8 profile with a 6×4 inner loop:
  **1 face, 2 wires, area 56, 1 solid, volume 280, valid=true**. Parting draft
  at 5° using a picked edge: **valid=true**. Two-guide sweep with left/right
  rails: **valid=true** and bbox spans x≈−2…12, so both rails influenced the
  result.- **Pre-handoff note:** no Vitest, Playwright or browser run existed when this
  document was written. The 2026-11-07 tester pass below ran the A unit suite
  and a subset of Playwright; the picker's screen-space hit-test and dialog
  interaction are still unverified until scenarios 27, 38, 42 and 43 run.
- All other geometry claims remain implementation + typecheck until the tester
  runs the commands. Treat all suites as unverified.

## Tester report format

For each failure: command, test name or manual step, expected, actual,
screenshot/trace path. Keep fixes scoped to A; record behaviour changes here and
in the A rows of `PHASE3_REMAINING.md`.

## Verification log

Tester pass — 2026-11-07. Final failures were rerun against the isolated,
HMR-free verification server on `https://localhost:3300`
(`npx vite --config vite.verify.config.mts`); the earlier parity/picker pass used
the shared tree on `E2E_PORT=3100`.

### Commands and results

| Command                                                                   | Result                                                                         | Evidence                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| `npx vitest run` on the nine A unit files                                 | **67/67 pass**                                                                 | `results/A_unit_final_2026-11-07.log` |
| `npx playwright test e2e/parity-ops.spec.ts -g "extrude honors midplane"` | **1/1 pass**                                                                   | `results/A_pw_extrude_2026-11-07.log` |
| `npx playwright test e2e/feature-dialog.spec.ts`                          | **4/4 pass** (chamfer included)                                                | `results/fix_final_dialog.log`        |
| `npx playwright test e2e/primitives.spec.ts`                              | **2/2 pass** (Torus included)                                                  | `results/fix_final_primitives.log`    |
| `npx playwright test e2e/parity-ops.spec.ts` in three chunks               | **22/22 pass** (8 + 8 + 6)                                                     | `results/A_parity_g{1,2,3}_2026-11-07.log` |
| `npx tsc --noEmit`                                                        | **exit 0**                                                                     | `results/A_tsc_final4_2026-11-07.log` |
| `npx vitest run src/model/__tests__/sceneSync.test.ts`                    | **7/7 pass**, including NEW/ADD/CUT/INTERSECT target consumption for extrude, revolve, sweep and loft | `results/A_scenesync_final_2026-11-07.log` |
| `npx playwright test e2e/phase3-a-pickers.spec.ts`                        | **4/4 pass, no retries** (end reference, extrude draft face+edge, Draft-feature parting edge, sweep guide add/dedupe/clear) | `results/A_pickers_final2_2026-11-07.log`, `results/A_pick_*.log` |

### Failures found and fixed

1. **Open-chain ordering (real bug).** `chainPathLoops` seeded the component
   from the last segment and `chainSegments` picked any free-ended segment,
   reversing it. A two-line chain produced two points in the wrong order, and
   the extrude/sweep path helpers inherited it. `chainSegments` now prefers a
   segment with a free **start** and reverses only when the chain must run from
   its free end. `sweepPath.test.ts` and `geometry.test.ts` pass without
   assertion changes.
2. **Revolve up-to-face test data (stale test).** The polygon described the
   `y = 0` plane while the assertion expected a quarter turn from `+X` about
   `+Z`; that plane is reached at half a turn. The data now describes the
   `x = 0` plane with the hit strictly inside, matching the scenario's intent.
   `solveRevolveEndAngle` is unchanged.
3. **Param-panel query-list expectation (stale test).** Query lists became
   committable when the A pickers started writing `queries`. The test now
   asserts a query-list commit keeps its queries and still rejects `NaN`.
4. **Torus full-turn profile (real bug).** A single periodic circle profile
   revolved 360° produced a valid OCC solid but its BREP-to-JSON mesh came back
   with zero faces, so the executor reported `revolve produced no solid faces`.
   Both torus builders now use two offset semicircular arcs. Every catalog
   torus size builds (`results/fix_final_primitives.log`) and the 35-feature
   acceptance part builds and restores (`results/fix_final_h1.log`).

### Picker automation (scenarios 27, 38, 42, 43, 44)

`e2e/phase3-a-pickers.spec.ts` drives the real viewport pick layer. It moves the
centered panel aside during picking (test-only layout, no picker logic change)
and asserts the element at each projected point is
`end-reference-pick-layer`. Results:

- **27 / end reference:** clicking a separate reference body's top face stores a
  FACE query; Apply writes one `endBoundEntity` and `UP_TO_FACE`.
- **38 / extrude draft:** Pick edge stores a sketch-line query and Pick face
  stores a face query on a reference body; Apply persists both plus
  `draftMode = PARTING`.
- **42 / sweep guide:** each Pick curve adds one guide; a second click on the
  same curve does not duplicate it (`guideSubqueries` is 1 after Apply); Clear
  removes it (0 after Apply).
- **44 / Draft feature:** Mode `PARTING` + Pick edge stores one
  `draftPartingEdge` query after Apply.
- **43 / merge consumption:** covered by `sceneSync.test.ts` for all four A
  operations (target hidden, NEW leaves it visible). Browser visibility proof of
  the hidden target remains a manual visual check.

An earlier full-file run was 3 pass + 1 flaky: the reference body shared the
extrude's z=0 base, so the ray could reach the feature's own result and the
self-reference guard correctly rejected it. The reference cylinder is now moved
clear in X and the click uses its own top-face centre. The final full-file run
passes 4/4 without retries. Dev-only seams added for these tests: `projectWorld`,
`featureParam`, `extrudeRect` and `fitView` in `__cadDebug`.

### Not covered by this pass

- Manual scenarios 1–26, 28–37 and 39–41 (subjective geometry/visual checks)
  were not driven in the browser; visual tessellation and draft-taper appearance
  remain visual review, not automated assertions.
- Concurrent shared-tree edits still trigger full page reloads on the shared
  dev server, which killed long acceptance runs mid-flight. The final runs used
  the separate HMR-free server on port 3300; tsc, unit, primitive, dialog and
  H1 checks are green there.
