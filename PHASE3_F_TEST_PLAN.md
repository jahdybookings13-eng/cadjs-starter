# Phase 3 F — Tester handoff and acceptance plan

**Status:** implemented slice complete and tester-verified, 2026-11-07. This
document records the handoff, the measured results and the limits that remain
by design.

## Tester brief

- **Implemented:** F1 rib/gusset, F2 web, F3 boss/emboss, F4 coil/spring plus a
  standalone helix curve, F5 dome feature, F6 derived Part Studio, F7 import
  recognition metadata, and all remaining F8 feature-map gaps (`fitSpline`,
  `bridgingCurve`, `enclose`, `derive`).
- **Deliberate limits:**
  - Rib/web profiles are passed as endpoints/params, not picked from a sketch
    line in the viewport; non-intersecting-target detection is not a separate
    error.
  - Threads and Wrap keep their existing helical/surface paths.
  - Import recognition classifies a body as `box`/`cylinder`/`mesh` with
    dimensions and confidence; it does **not** reconstruct an editable feature
    history. The imported body is never replaced or dropped.
  - Curve features (`helixCurve`, `fitSpline`, `bridgingCurve`) evaluate to
    edge-only profiles, not solids. Verify how they render in the Browser/3D
    view.
  - Derive resolves a Part Studio **tab id** stored as a string parameter; the
    tab picker UI is still a plain string field.
- **Deliverable:** pass/fail for the implemented features, fixes, and a clear
  note on any geometry/UI issue.
- **No commit or push** was made.

## What changed

| File                                    | Purpose                                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/featuresF.ts`                | Builders + expanders for rib, gusset, web, boss, dome, emboss, coil, helix curve, fit spline, bridging curve, enclose, derive; import recognition.                                |
| `src/model/executor.ts`                 | `executeMacro` expands macro params into fresh helpers on every rebuild; `executeCoil` sweeps a 3D helix; `executeCurve` builds edge-only curves; `executeDerive` resolves a tab. |
| `src/model/featureMap.ts`               | Implemented entries for all new features and params.                                                                                                                              |
| `src/model/paramSupport.ts`             | New macro/curve params marked wired so dialogs accept edits.                                                                                                                      |
| `src/model/operationMenu.ts`            | Ready ops: Rib, Gusset, Web, Boss, Emboss, Coil, Dome Feature, Helix Curve, Derive, Fit Spline, Bridging Curve, Enclose.                                                          |
| `src/model/actionBus.ts`                | Bus mappings for every new op.                                                                                                                                                    |
| `src/model/onshapeHistory.ts`           | `insertedBody` gains the `recognition` metadata parameter.                                                                                                                        |
| `src/scenes/simpleCadScene.tsx`         | Debug/bus hooks for all new features; derive resolver reads `documentRef.current.tabs`; recognition reader hook.                                                                  |
| `src/model/__tests__/featuresF.test.ts` | Node shape, expansion, placement, coil path/presets, helix/fit/bridge/enclose/derive params, recognition, named errors, map coverage.                                             |

## Commands

From `user01/cadjs-starter`:

```bash
npx tsc --noEmit -p tsconfig.json

npx vitest run src/model/__tests__/featuresF.test.ts \
  src/model/__tests__/featureDialog.test.ts \
  src/model/__tests__/operationMenu.test.ts \
  src/model/__tests__/paramSupport.test.ts \
  src/model/__tests__/actionBus.test.ts

npx playwright test e2e/parts.spec.ts e2e/multi-body.spec.ts \
  e2e/feature-tree.spec.ts e2e/feature-dialog.spec.ts \
  --project=chromium --reporter=line

npx eslint src/model/featuresF.ts src/model/executor.ts \
  src/model/featureMap.ts src/model/paramSupport.ts \
  src/model/operationMenu.ts src/model/actionBus.ts \
  src/scenes/simpleCadScene.tsx src/model/__tests__/featuresF.test.ts

npx prettier --check PHASE3_F_TEST_PLAN.md src/model/featuresF.ts \
  src/model/executor.ts src/model/featureMap.ts \
  src/model/operationMenu.ts src/model/__tests__/featuresF.test.ts

git diff --check
```

## Implemented checklist

### F1 — Rib / gusset

- [x] Rib profile support (line endpoints in the sketch plane; arc input can be
      passed as a tessellated line).
- [x] Thickness parameter.
- [x] Depth/extent parameter.
- [x] Merge into a target body (boolean union when `merge` and a target exist).
- [x] Draft (extrude draft angle).
- [x] Direction flip.
- [x] Gusset variant (closed triangular profile).
- [x] Named errors: zero/negative thickness, zero/negative depth, zero-length
      profile.
- [x] Rib/gusset dialog via the feature-map params (thickness, depth, draft,
      flip, merge) plus preview/apply/cancel lifecycle from `FeatureDialog`.
- [ ] Selecting a sketch line/arc directly in the viewport and deriving the
      endpoints automatically (current creation passes endpoints).
- [ ] A distinct "target does not intersect" error (union failure surfaces the
      kernel reason).

### F2 — Web

- [x] Web feature definition (rectangular web between two points).
- [x] Thickness and depth.
- [x] Merge scope (`merge` + target).
- [x] Draft and flip.
- [x] Named errors.
- [x] Dialog interaction test in Chromium: `e2e/features-f.spec.ts › F2: web
dialog commits a thickness change`.
- [ ] Dedicated two-rail selection rules (current creation uses start/end).

### F3 — Boss / emboss

- [x] Boss on a face (defaults to the target's top-face centre when x/y/z are
      omitted).
- [x] Emboss text/logo on a face (Wrap EMBOSS mode, polylines input).
- [x] Height/depth.
- [x] Draft (boss extrude draft).
- [x] Merge scope.
- [x] Wrap cut/emboss modes (existing audited Wrap path).
- [x] Named errors (diameter/height > 0, empty/invalid polylines).
- [x] Dialog params exposed and committed through the real dialog in
      Chromium (`F3: boss dialog commits a diameter change`).

### F4 — Helix / coil / spring

- [x] Coil solid feature (circular profile swept along a 3D helix).
- [x] Spring presets (compression, extension, torsion) with explicit values
      overriding the preset.
- [x] Pitch, revolutions, start/end angle, taper.
- [x] Left/right hand.
- [x] Merge scope.
- [x] Named errors (pitch/revolutions/taper/wire radius).
- [x] Standalone helix **curve** feature using the same 3D path
      (`helixCurve`, edge-only profile).
- [x] Dialog params, coil/helix unit tests and a Chromium coil dialog test
      (`F4: coil dialog commits a revolutions change`).
- [ ] True helix path for threads and wrap (threads keep their existing
      helical option; wrap remains the audited surface mapping).

### F5 — Dome feature

- [x] Modelling dome feature: radius, height, placement, optional merge.
- [x] Dialog params, expansion test and a Chromium dome dialog test
      (`F5: dome dialog commits a height change`).

### F6 — Derived Part Studio

- [x] Source Part Studio selection by tab id (`sourceTab` string param).
- [x] Derived body import: the source tab's persisted design is parsed and
      evaluated in an isolated executor.
- [x] Merge/context behavior: optional union with the selected target.
- [x] Update propagation: the resolver runs on every rebuild, so source edits
      are re-read rather than copied once.
- [x] Named errors for a missing source tab, malformed source design, and a
      missing source body/feature.
- [ ] A tab picker in the dialog (the parameter is a free-text tab id).
- [x] Chromium derive test: creates a second Part Studio through the tab UI,
      checks the derived body, edits the source and sees the derived body
      update; a bad tab id produces the named error.

### F7 — Imported feature recognition

- [x] Preserve imported bodies when recognition fails or is inconclusive.
- [x] No silent geometry loss: recognition is metadata on the `insertedBody`
      node, never a replacement body.
- [x] Classification: `box` (6 faces), `cylinder` (3 faces), otherwise `mesh`,
      with bounding dimensions and confidence.
- [ ] Editable feature-history inference from the BREP.
- [x] Chromium round-trip: insert an STL, read `recognition(fid)`, and confirm
      the metadata (shape/faces/dimensions/confidence) with unchanged geometry.

### F8 — Feature-map gaps

- [x] `rib` entry implemented.
- [x] `gusset` entry implemented.
- [x] `fitSpline` (Catmull-Rom through the fit points).
- [x] `bridgingCurve` (3D line between two points).
- [x] `enclose` / endcap (surface `kind: "fill"` over the opening edges).
- [x] `derive` (shared with F6).

## Open F work (by design, not unfinished wiring)

- Sketch-entity picking for rib/web and the two-rail web selection.
- Threads/Wrap switching to the true helix path.
- BREP feature-history inference for imports.

## Manual scenarios for the implemented slice

1. **Merged rib**
   Create a box. Run the `rib` hook with the box id and a line across its top
   face. The Browser gains one `Rib` feature and one body; the rib is fused to
   the box. Change thickness/depth in the feature dialog and apply: geometry
   updates, one undo entry, no extra helper rows.
2. **Standalone rib / unmerged**
   Set `merge: false` with no target. The rib remains its own body. Invalid
   thickness/depth/zero-length line produces a named error and no body.
3. **Gusset**
   Create a gusset; the profile is a closed triangle and the resulting body has
   three side faces plus caps. Draft/flip/merge behave as in the rib.
4. **Web**
   Create a web between two points. It uses the thicker web defaults, unions
   with the target when merge is on, and its dialog edits rebuild the wall.
5. **Boss**
   Select a box and create a boss without x/y/z. It sits at the top-face centre
   and unions into the box. Diameter/height/draft edits rebuild. Zero diameter
   or height produces a named error.
6. **Emboss**
   Pass a logo polyline to `emboss` on a body. The result is a Wrap node in
   EMBOSS mode; switching the mode to CUT engraves instead. Empty or malformed
   polylines produce a named error.
7. **Dome**
   Create a dome with radius/height; it is a closed quarter-ellipse revolve,
   optionally unioned to the target. Zero radius/height errors.
8. **Menu/bus parity**
   The body context menu exposes Rib/Gusset/Web/Boss/Emboss/Coil/Enclose/
   Derive and the empty selection exposes Dome Feature, Coil, Helix Curve and
   Derive; each answers on the action bus (no placeholder throw).
9. **Helix curve**
   Run `helixCurve` with radius/pitch/turns. It adds one `Helix Curve` row and
   an edge-only 3D helix (not a solid). Invalid pitch/turns produce a named
   error. Confirm whether the curve is visible in the 3D view and Browser.
10. **Fit spline / bridging curve**
    Run `fitSpline` with at least two 3D points (and `closed` on/off); it adds
    one row and an edge chain through the points. Fewer than two points errors.
    Run `bridgingCurve` with start/end; it adds a straight 3D edge chain; a
    malformed endpoint errors.
11. **Enclose**
    Select a body with an opening and run `enclose` with its edge tags. It adds
    a surface feature with `kind: "fill"`; a missing/opening edge set surfaces
    the kernel error.
12. **Derive**
    Create a second Part Studio tab with a box. In the first tab, add a
    `derive` with that tab id. One derived body appears. Edit the source tab's
    box, switch back and rebuild: the derived body updates. A bad tab id/body
    id produces a named error. `merge: true` unions into the target.
13. **Import recognition**
    Insert an STL/STEP body. The `insertedBody` node gains a `recognition`
    JSON string with shape/dimensions/confidence; read it with the
    `recognition(fid)` debug hook. The imported body is unchanged.

## Report format

For each failure: command, feature, expected, actual, screenshot/trace path,
and whether the failure is in geometry, dialog, or history shape. Keep fixes
scoped to F and update this document plus the F rows in
`PHASE3_REMAINING.md`.

## Verification log

Pre-handoff checks run by the implementing agent on 2026-11-07:

- `tsc --noEmit`: **PASS** (exit 0).
- unit suites listed above: **PASS** — 39/39 tests (featuresF 17, featureDialog
  9, operationMenu 5, actionBus 4, paramSupport 4).
- Prettier on the touched source/test/doc files: **PASS**.
- `git diff --check`: **PASS** (exit 0).
- Playwright/ESLint were **not** run and are left to the tester.

Filled by the tester (2026-11-07):

- `tsc --noEmit`: **PASS** (exit 0, whole project).
- Unit suites listed above: **PASS** — 39/39 (5 files).
- Playwright (chromium): **PASS** — 22/22 checks: the 11 specified tests
  (parts 3, multi-body 1, feature-tree 3, feature-dialog 4),
  `e2e/body-properties.spec.ts` (1) and the new `e2e/features-f.spec.ts`
  (10, including four real dialog edits and the tab-based derive test).
- ESLint: **PASS** (0 errors; the same 4 pre-existing `react-hooks` warnings
  in `simpleCadScene.tsx`).
- Prettier + `git diff --check`: **PASS**.
- Manual scenarios: all 13 are covered by `features-f.spec.ts` (hooks, real
  dialogs and the document-tab UI); no separate human pass was needed.

### Defects found and fixed during the pass

1. **F bodies never reached the scene.** `sceneSync.COMMITTABLE` listed only
   the older feature types, so rib/gusset/web/boss/dome/coil/derive/surface/
   wrap and the edge-only curves evaluated but authored no element: they were
   invisible in the 3D view and Browser. The F types are now committable, and
   the spec asserts every standalone body has an element and is visible.
2. **Enclose replaced its source body.** A surface node carries a `targets`
   query, so sync reused the target's element instead of owning the surface.
   Surface features now author their own element (`OWN_BODY` in
   `sceneSync.ts`), so the solid and the enclosed surface coexist.

Geometry notes (no fix required): the kernel can split coplanar caps, so a
simple rib reports 12 faces rather than 6 (the test asserts a lower bound); a
`fill` over a two-edge selection is an open surface (edges, no face), while an
opening yields the filled face. STL insert recognition reports
`shape: "mesh"` with the triangulated face count (12), correct 20 mm dimensions
and confidence 0.4; the imported geometry is unchanged after the read.
