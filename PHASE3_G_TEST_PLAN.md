# Phase 3 G — Measure / inspect tester handoff

**Status:** G is complete as of 2026-11-07. All G1–G8 browser scenarios that
can be reached through the live app pass on the isolated HMR-free server, the
measure pin/unpin path is covered across a rebuild, and the G checkboxes in
`PHASE3_REMAINING.md` are closed. G7 remains unit-only because the app has no
route to select a zero-triangle body; that limit is stated below rather than
counted as browser evidence.

## What landed

- `src/model/inspect.ts`
  - Volume, surface area, mass, centre of mass and bbox from the existing mesh.
  - Radius/diameter and curvature from a circle fit over smooth-edge rings.
  - Thickness from bidirectional rays through the body.
  - Interference and minimum clearance from triangle tests.
  - XY section area/perimeter through the bbox centre.
  - mm/in conversion and deterministic formatting.
  - Named `inspect: body has no measurable geometry` error.
- `src/components/BodyPropertiesPanel.tsx`
  - New **Inspect** section with unit and precision controls.
  - Radius, diameter, thickness, curvature, section area/perimeter.
  - Multi-selection interference/clearance.
  - Empty-body error row and visible mesh-accuracy policy.
  - The mm/in switch now applies to dimensions, volume, area, mass, CoM and
    inertia in the Mass Properties block as well as the Inspect block.
- `src/scenes/simpleCadScene.tsx`
  - Per-body inspection attached to every inspector entry.
  - Selection-level interference/clearance computed from the selected outputs.
- `src/scenes/modes/MeasureModeContent.tsx`
  - Test bridge for the real distance/edge/angle and pin/unpin state.
- `src/model/__tests__/inspect.test.ts` — 9 tests.
- `e2e/body-properties.spec.ts` — 10 browser tests (baseline + G1–G6, G8).
- `e2e/measure.spec.ts` — 2 browser tests (distance, edge length, angle,
  pin/unpin across a rebuild).

## Automated checks (run 2026-11-07)

From `user01/cadjs-starter`:

```bash
npx vitest run src/model/__tests__/inspect.test.ts \
  src/model/__tests__/cheapWins.test.ts
npx tsc --noEmit
npx eslint src/model/inspect.ts src/model/__tests__/inspect.test.ts \
  src/components/BodyPropertiesPanel.tsx src/scenes/modes/MeasureModeContent.tsx \
  e2e/helpers.ts e2e/body-properties.spec.ts e2e/measure.spec.ts
npx prettier --check src/model/inspect.ts \
  src/model/__tests__/inspect.test.ts src/components/BodyPropertiesPanel.tsx \
  src/scenes/modes/MeasureModeContent.tsx e2e/helpers.ts \
  e2e/body-properties.spec.ts e2e/measure.spec.ts
E2E_PORT=3300 npx playwright test e2e/body-properties.spec.ts \
  e2e/measure.spec.ts --project=chromium --reporter=line --retries=0
```

| Check               | Result                                                      |
| ------------------- | ----------------------------------------------------------- |
| Inspect unit tests  | **9/9 pass**                                                |
| Measure model tests | **8/8 pass** (`cheapWins.test.ts`)                          |
| `tsc --noEmit`      | **Pass**                                                    |
| ESLint (touched)    | **0 errors**                                                |
| Prettier            | **Pass**                                                    |
| Browser tests       | **12/12 pass** (10 inspector + 2 Measure)                   |
| G7                  | Unit-only; no live-app route to select a zero-triangle body |

Browser tests ran against the isolated HMR-free server at
`https://localhost:3300`; the shared `3100` server was left untouched.

Unit coverage: box volume/area/bbox/section/thickness, cylinder radius/diameter/
curvature, density-to-mass, empty-body error, split body id `F1#1`, overlapping
interference, separated clearance, order-independent section, mm/in and
mm³/in³ formatting.

Browser coverage in `e2e/body-properties.spec.ts`: G1 box thickness/section/
precision, G2 cylinder radius/diameter/curvature, G3 mm/in round trip across the
whole inspector, G4 overlap (`Yes`, `0.00 mm`) and 30 mm clearance, G5 section
unchanged after a depth edit, G6 extra split body measurements plus hide/show
and isolate/clear, G8 values unchanged after a later rebuild.

Browser coverage in `e2e/measure.spec.ts`: real distance picking, edge-length
picking, angle picking, and pin/unpin surviving a rebuild with the value
unchanged.

## Manual scenarios

Use the normal app at `user01/cadjs-starter` (`npm run dev`). Select a body in the
viewport or Browser; the inspector is on the right in every non-sketch mode,
including Measure.

### G1 — Box measurements and precision

**Automated:** `G1: box inspect reports thickness, section and precision`.

1. Create a 20 × 10 × 5 mm box and select it.
2. Read `inspect-thickness`, `inspect-section-area`,
   `inspect-section-perimeter`.
3. Change `inspect-precision` to 4.

Pass: thickness ≈ 5 mm; XY section ≈ 200 mm² and 60 mm perimeter; radius and
curvature show `n/a`; values show 4 decimals.

### G2 — Cylinder radius, diameter, curvature

**Automated:** `G2: cylinder inspect estimates radius, diameter and curvature`.

1. Create a cylinder with a known radius (for example 5 mm) and select it.
2. Read `inspect-radius`, `inspect-diameter`, `inspect-curvature`.

Pass: radius/diameter match the source within tessellation tolerance (≤2%);
curvature ≈ `1 / radius`; thickness equals the smaller through-distance.

### G3 — mm/in toggle

**Automated:** `G3: inspect switches between mm and inches`.

1. With a body selected, record a length in mm.
2. Click `inspect-unit-in`, then `inspect-unit-mm`.

Pass: inches = mm / 25.4 (for example `25.40 mm` → `1.000 in`); area uses in²;
curvature uses 1/in; volume/area/mass/CoM/inertia switch too; switching back
restores the mm values.

### G4 — Multi-body interference and clearance

**Automated:** both `G4:` browser tests, separate bodies and overlapping bodies.

1. Select two separated bodies. Read `inspect-interference` and
   `inspect-clearance`.
2. Move one body so the two overlap; read them again.

Pass: separated reports `No` with a positive clearance; overlapping reports
`Yes` and `0.00 mm`. Multi-selection volume/mass still aggregates.

### G5 — Section workflow

**Automated:** `G5: XY section stays fixed when box depth changes`.

1. Select a box and note the XY section values.
2. Change its Z size while keeping the same XY footprint.

Pass: section area/perimeter stay constant; this confirms it is a section
metric, not the Section feature's cut geometry.

### G6 — Hidden, isolated and extra bodies

**Automated:** `G6: extra split body reports its own measurements` and
`G6: hidden and isolated bodies keep their inspect values`.

1. Hide the selected body, then show it. Isolate it, then clear isolation.
2. Create a split-both or pattern extra and select the extra body.

Pass: the inspector still opens, the Visible row reflects state, and the extra
body reports its own measurements. Selecting the owner row is not required.

### G7 — Named error / non-measurable selection

**Unit-only.** Covered by the unit test `names an empty body instead of throwing`.
If a body with no triangles can be selected in the app, the Inspect section shows
`inspect: body has no measurable geometry` in `inspect-error`; it must not throw
or blank the panel.

### G8 — Rebuild stability

**Automated:** `G8: inspect values survive a later rebuild`.

1. Record the inspect values, edit an unrelated feature and rebuild.
2. Re-select the body.

Pass: values are unchanged for unchanged geometry; no stale value from the
previous selection is displayed.

## Known limits (do not treat as passes)

- All values are computed from the **tessellated** BREP, not analytic OCC
  queries. Radius/curvature are circle-fit estimates; thin/complex parts can
  read `n/a`.
- Thickness samples up to 160 triangles. Interference/clearance samples up to
  220 triangles per body, so very dense meshes are approximate.
- The section is a fixed XY cut through the bbox centre and assumes one convex
  loop. Arbitrary-plane section analysis remains the Section feature.
- Inspect units are mm/in. The same switch now covers volume, area, mass, CoM
  and inertia; mass uses g/kg in mm mode and lb in inch mode.
- Display precision is formatting only. The UI states the accuracy policy:
  measurements are mesh-derived, curved fits reject >2% RMS, thickness samples
  up to 160 triangles, and clearance samples up to 220 triangles per body.
- G7's live-app error presentation still lacks browser automation because no
  selectable zero-triangle body can be manufactured through the UI; its named
  error is unit-tested.

## Files

| File                                      | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `src/model/inspect.ts`                    | Inspect math, units, section and pairwise clearance |
| `src/model/__tests__/inspect.test.ts`     | 9 focused unit tests                                |
| `src/components/BodyPropertiesPanel.tsx`  | Inspect UI, unit/precision controls                 |
| `src/scenes/simpleCadScene.tsx`           | Per-body and selection inspection wiring            |
| `src/scenes/modes/MeasureModeContent.tsx` | Real measure state and pin/unpin test bridge        |
| `e2e/body-properties.spec.ts`             | Baseline inspector + G1–G6/G8 browser coverage      |
| `e2e/measure.spec.ts`                     | Distance, edge length, angle and pin persistence    |
| `PHASE3_G_TEST_PLAN.md`                   | This handoff                                        |

No commit or push was made. Phase 3 A–G remain uncommitted.
