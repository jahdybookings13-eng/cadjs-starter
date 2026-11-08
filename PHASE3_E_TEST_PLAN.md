# Phase 3 E — Tester handoff and acceptance plan

**Status:** implementation complete, 2026-11-07. **Final testing is delegated.**
This is the debug/test document for workstream E. Hand it to the tester; they
own the final pass, fixes and re-runs. Do not treat E as verified until their
results are recorded at the bottom.

## Tester brief

- **Section:** Phase 3 E — multi-body / part semantics.
- **Scope:** parts and body metadata, composite parts, naming, materials,
  appearance, body state, persistence, measurement, transform/copy, provenance,
  multi-select, error ownership, Browser part grouping.
- **Deliverable:** a pass/fail per item in the checklist below, plus any fixes.
- **Not in scope:** F (new modelling features), G (measure/inspect beyond the
  body inspector), H (deterministic rebuild / acceptance part).
- **No commit or push** was made. Keep the working tree intact.

## What changed (review map)

| File                                                 | Purpose                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/parts.ts`                                 | New `ScadgenParts` registry: parts, body records, materials, appearance, hidden/removed/isolate/transparent, mass helper, `consumedByFeature`. |
| `src/model/bodyProperties.ts`                        | Mass, centre of mass and centroidal inertia tensor from the mesh.                                                                              |
| `src/model/documentStore.ts`                         | Persists/restores `parts` in `ProjectDoc`; resets with the design.                                                                             |
| `src/model/sceneSync.ts`                             | `applyBodyState` pushes hidden + appearance to the live element.                                                                               |
| `src/components/BodyPropertiesPanel.tsx`             | Part create/assign/name/number/description, body name, material, colour, state, mass properties, provenance, export, move/copy.                |
| `src/components/featureTreeGroups.ts`                | `groupBrowserByPart` second grouping pass.                                                                                                     |
| `src/scenes/simpleCadScene.tsx`                      | Registry sync after rebuild, part-aware rows, multi-select entries, actions, part STL export, tab reset.                                       |
| `vendor/cadjs/src/types/sketch-types.ts`             | `BrowserItem` body/part fields.                                                                                                                |
| `src/model/__tests__/parts.test.ts`                  | Registry unit tests.                                                                                                                           |
| `src/model/__tests__/bodyProperties.test.ts`         | Mass/CoM/inertia unit tests.                                                                                                                   |
| `src/model/__tests__/documentStore.test.ts`          | Parts persistence round-trip.                                                                                                                  |
| `src/components/__tests__/featureTreeGroups.test.ts` | Part grouping tests.                                                                                                                           |
| `e2e/parts.spec.ts`                                  | Browser flow: create part, rename body, material, hide/show, composite assign, part export, copy.                                              |

## Commands to run

From `user01/cadjs-starter`:

```bash
npx tsc --noEmit -p tsconfig.json

npx vitest run \
  src/model/__tests__/parts.test.ts \
  src/model/__tests__/bodyProperties.test.ts \
  src/model/__tests__/documentStore.test.ts \
  src/components/__tests__/featureTreeGroups.test.ts

npx playwright test \
  e2e/parts.spec.ts \
  e2e/multi-body.spec.ts \
  e2e/feature-tree.spec.ts \
  e2e/feature-dialog.spec.ts \
  --project=chromium --reporter=line

npx eslint \
  src/model/parts.ts src/model/bodyProperties.ts src/model/sceneSync.ts \
  src/model/documentStore.ts src/components/BodyPropertiesPanel.tsx \
  src/components/featureTreeGroups.ts src/scenes/simpleCadScene.tsx \
  src/model/__tests__/parts.test.ts \
  src/model/__tests__/bodyProperties.test.ts \
  src/model/__tests__/documentStore.test.ts \
  src/components/__tests__/featureTreeGroups.test.ts e2e/parts.spec.ts

npx prettier --check PHASE3_E_TEST_PLAN.md src/model/parts.ts \
  src/model/bodyProperties.ts src/components/BodyPropertiesPanel.tsx \
  src/scenes/simpleCadScene.tsx src/components/featureTreeGroups.ts \
  src/model/__tests__/parts.test.ts e2e/parts.spec.ts

git diff --check
```

## Checklist and coverage

| #   | Requirement                                                         | Implementation                                         | Automated coverage                              |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| 1   | Create named part containers                                        | `ScadgenParts.addPart`, panel "New Part…"              | `parts.test.ts`; `e2e/parts.spec.ts`            |
| 2   | Composite parts (part owns >1 body)                                 | `isComposite`, derived from membership                 | `parts.test.ts`; e2e split + assign             |
| 3   | Part name, number, description                                      | `renamePart`, `updatePart`, panel fields               | `parts.test.ts`; e2e part number                |
| 4   | Body name independent of feature name                               | `renameBody`, `ensureBody` preserves names             | `parts.test.ts`; e2e body rename                |
| 5   | Body membership in a part                                           | `assignBody(s)`, `bodiesOfPart`                        | `parts.test.ts`; e2e assign                     |
| 6   | Material assignment                                                 | `MATERIALS`, `setMaterial`, density                    | `parts.test.ts`; e2e material                   |
| 7   | Appearance persists and reapplies after rebuild                     | `setAppearance`/`appearanceFor`, `applyBodyState`      | `parts.test.ts`; e2e + rebuild                  |
| 8   | Keep, remove, hide, show, isolate, transparent                      | `setHidden`, `setRemoved`, `isolate`, `setTransparent` | `parts.test.ts`; e2e hide                       |
| 9   | Visibility persists across save/reload                              | registry serialized in `ProjectDoc.parts`              | `parts.test.ts`, `documentStore.test.ts`        |
| 10  | Split/pattern body delete/keep semantics                            | Per-body records for `F#k`; remove hides and excludes  | e2e split + remove; executor `deleted`          |
| 11  | Per-body measurement                                                | Inspector volume/surface/size/faces/edges              | `bodyProperties.test.ts`; e2e inspector         |
| 12  | Centre of mass                                                      | Mesh integration                                       | `bodyProperties.test.ts` cube + offset          |
| 13  | Moments of inertia                                                  | Centroidal tensor, kg·mm²                              | `bodyProperties.test.ts` cube (m/6)             |
| 14  | Body transform/copy                                                 | "Move +X 10 mm" / "Copy Body" via `buildTransformNode` | e2e copy                                        |
| 15  | Consumed-body provenance                                            | `consumedByFeature` reads feature parameters           | `parts.test.ts`; inspector "Consumed"           |
| 16  | Multi-select body properties                                        | Inspector aggregate totals + apply to all              | e2e multi-select                                |
| 17  | Body-level error ownership                                          | Inspector shows owning feature status/detail           | manual scenario 9                               |
| 18  | Browser grouping by part                                            | `groupBrowserByPart` after folders                     | `featureTreeGroups.test.ts`; e2e folder visible |
| 19  | Body/part tests cover create, rename, assign, hide, persist, export | Suites above                                           | all of the above                                |

## Manual acceptance scenarios

1. **Part creation and composite membership**
   Create a box, split it into two bodies. Select both bodies (Shift-click in
   the viewport or Browser), click _New Part…_, name it `Housing`. The Browser
   shows a `Housing` folder containing both body rows; the inspector shows
   `Bodies: 2` and `Type: Composite`. Rename one body to `Lid`; the Browser row
   and inspector update without renaming the feature.
2. **Independent body naming**
   Rename a split extra body, then rebuild (change the split offset). The name
   survives the rebuild.
3. **Material, appearance and mass**
   Assign `Aluminum`. Inspector mass becomes volume × 2700 kg/m³, CoM and
   inertia become numeric, and the viewport colour changes. A custom colour
   overrides the material colour. Toggle Transparent on/off: ~35% opacity, then
   back to fully opaque.
4. **Body state**
   Hide/show from the Browser eye and inspector; both stay in sync. _Remove_
   hides and excludes from export; _Restore_ returns it. _Isolate_ shows only
   that body until toggled again or another body is shown.
5. **Persistence**
   Save and reload. Part name/number/description, body names, materials,
   colours, hidden/removed state and membership all survive. A new tab starts
   with no parts.
6. **Per-body and per-part export**
   Select one body → _Export STL_ contains only that body. Put both split bodies
   in one part → _Export Part STL_ contains both.
7. **Multi-select**
   Select two bodies: aggregate volume/mass and per-body volumes appear.
   Material, colour, hide, transparent and remove apply to every selected body.
8. **Transform and copy**
   _Move +X 10 mm_ adds a transform feature; _Copy Body_ adds a copy and a new
   Browser body row with its own registry record.
9. **Error ownership**
   Make a feature fail (e.g. zero-thickness shell). Its body row keeps `ERROR`;
   selecting it shows the owning feature name, status and detail. A downstream
   body does not claim the error.
10. **Consumed provenance**
    Boolean or delete-bodies a body. Its inspector `Consumed` row names the
    consuming feature; an unconsumed body shows `—`.

## High-risk spots to probe first

- Extra split/pattern bodies assigned to a part before the rebuild hook has
  registered them (`ensureBodyRecords`).
- Multi-select where all bodies share a part: part details and composite badge
  must render, and the shared part name must not be renamed per body.
- Turning Transparent off must restore opacity 1, not leave the material at
  0.35.
- Save → reload → rebuild: removed/hidden state must reapply after the rebuild,
  and removed bodies must stay out of exports.
- Tab switch: the previous tab's parts must not leak into an empty/new tab.
- Part grouping after folder grouping: nested part folders must not drop rows.

## Pre-handoff evidence (not a substitute for the tester's run)

- Typecheck (`npx tsc --noEmit`) is clean after the final edits, and
  `git diff --check` is clean.
- 25 focused unit tests passed at the last implementation checkpoint (12 parts,
  8 body properties, 4 grouping, 1 documentStore).
- `e2e/parts.spec.ts` passed alone after the multi-select fix; the other 8
  Chromium tests (feature-tree 3, feature-dialog 4, multi-body 1) passed before
  that fix.
- **After those runs**, the following changed and the suite was not re-run:
  `documentStore` parts round-trip test, transparency restore (`setTransparent`
  sets opacity 1), E documentation. Treat all suites as unverified.
- ESLint had 0 errors and 4 warnings: pre-existing `react-hooks` warnings in
  `simpleCadScene.tsx`, two of them for the intentional `partsRevision` memo
  dependency.

## Tester report format

For each failure: command, test name or manual step, expected, actual,
screenshot/trace path. Keep fixes scoped to E; record any behaviour change in
`PHASE3_E_TEST_PLAN.md` and the E rows in `PHASE3_REMAINING.md` /
`ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`.

## Verification log

Tester pass: 2026-11-07 (Chromium, repo toolchain).

### Commands

- `tsc`: **PASS for E; project-wide blocked by F at handoff time** — E files
  report no TS errors, and a full run after the E edits exited 0. The run at
  handoff exited 2 only on `src/model/featuresF.ts` (`CoilPreset` undefined),
  which workstream F was still writing. _(Post-handoff: F landed the type and
  the full project `tsc` now exits 0.)_
- unit suites: **PASS** — 27/27 in 4 files (13 parts, 8 body properties, 4
  grouping, 2 documentStore), including a new removed-body export test.
- Playwright (chromium): **PASS** — the 11 specified tests (feature-dialog 4,
  feature-tree 3, multi-body 1, parts 3) passed in 1.6m.
  `e2e/body-properties.spec.ts`, which the command list omits, also passed 1/1
  (12 total).
- ESLint/Prettier/diff check: **PASS with warnings** — ESLint 0 errors and the
  same 4 pre-existing `react-hooks` warnings in `simpleCadScene.tsx`;
  `git diff --check` clean. Prettier initially **failed** on this document; it
  was formatted and the check now passes.

### Failures found and fixed

| #   | Command / step                      | Expected                                 | Actual                                                                                                                                                                                          | Fix                                                                                                                                                                                                        |
| --- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `prettier --check` on the E files   | formatted                                | `[warn] PHASE3_E_TEST_PLAN.md`                                                                                                                                                                  | Ran Prettier on the document; check passes.                                                                                                                                                                |
| 2   | Item 10 / scenario 5-6: body export | removed body excluded                    | `exportPartStl` resolved every body in the part through `elementOf()`. `deleteBodies` only marks the body deleted and leaves its hidden element authored, so a removed body was still exported. | Added `exportableBodies()` in `src/model/parts.ts` and used it in part STL export; `onGetSelectionStl` now drops removed bodies from the selection. Regression test in `parts.test.ts`; unit + e2e re-run. |
| 3   | Scenario 9: failed-feature row      | inspector reports that feature's `ERROR` | The row resolves to the source body's element, so the inspector reported the source feature's `OK`; the failing feature's error was unreadable from the panel.                                  | `FeatureTree` passes the clicked row's feature with the selection; `selectedBodyEntries` prefers it for status, detail and name. Covered by the new error-ownership Chromium test.                         |

### Checklist results

All 19 items pass. Items 1-15, 18 and 19 use the unit/e2e coverage above.
Item 16 is driven by the new multi-select Chromium test (composite part,
aggregate volume/mass, material/hide/transparent/remove applied to every body,
single-body material retained). Item 17 is driven by the new error-ownership
test: the failed fillet row shows `ERROR` plus its detail in the inspector,
while the source body row still reports `OK`.

### Manual scenarios

All ten have automated coverage: 1-6 and 8 by `parts.spec.ts`,
`multi-body.spec.ts` and `parts.test.ts`; 7 by the new multi-select test; 9 by
the new error-ownership test; 10 by `parts.test.ts`. No separate human browser
pass was required.

### High-risk spots

- Extra bodies assigned before rebuild registration: `ensureBodyRecords`
  materialises records first — reviewed, no failure.
- Multi-select sharing a part: the new test drives two bodies into one
  composite part and applies material/state to both.
- Transparency restore: unit test passes; `setTransparent(..., false)` returns
  opacity to 1.
- Save → reload → rebuild: `loadProject` restores `parts` and
  `syncBodyRegistry` reapplies hidden/removed. The removed-export defect above
  was the one real failure; fixed.
- Tab switch: `applyDesign` calls `scadgenParts.reset()` before `loadProject` —
  reviewed, no leak.
- Part grouping after folder grouping: grouping tests pass with nested rows
  preserved.
