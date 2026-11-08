# Phase 5 test plan — drawing parity

Status: **complete and verified.** Typecheck, lint, formatting, drawing unit
tests and the focused two-sheet browser checklist all pass.

Do not run the whole Playwright suite for Phase 5. Run the drawing unit files
while working, then the focused Phase 5 spec for the browser checklist.

## Test files

- `src/drawings/__tests__/phase5.test.ts` — Phase 5 behavior, 13 tests.
- `src/drawings/__tests__/model.test.ts` — existing sheet/model render tests.
- `src/drawings/__tests__/export.test.ts` — existing multi-sheet export tests.
- `e2e/phase5.spec.ts` — focused two-sheet drawing package checklist.

## Coverage map

| Item                                                                                 | Test                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| P5-A custom paper, title-block variants, editable metadata, per-sheet persistence    | `phase5.test.ts` → persists custom sheet formats…                 |
| P5-A duplicate / reorder / rename sheets                                             | `phase5.test.ts` → duplicates, reorders and renames sheets…       |
| P5-B view scale, alignment, suppression, section hatching, custom and exploded views | `phase5.test.ts` → applies view scales, alignment, suppression…   |
| P5-B section direction/depth clipping                                                | `phase5.test.ts` → clips section depth…                           |
| P5-B view lock semantics and custom-view removal                                     | `e2e/phase5.spec.ts` → lock disables placement/scale; remove view |
| P5-C linear/angular/radius/diameter dimensions, tolerances and stable edge anchors   | `phase5.test.ts` → keeps stable topology anchors…                 |
| P5-C live radius/diameter recovery from tessellated closed edge loops                | `phase5.test.ts` → recovers live circular rims…                   |
| P5-C editable annotation position, text size, leader and landing                     | `phase5.test.ts` → persists and renders editable note/balloon…    |
| P5-D BOM columns/order/items/overrides, balloon linking and consistency              | `phase5.test.ts` → edits BOM rows and links…                      |
| P5-D edited BOM columns and overrides in PDF and DXF                                 | `phase5.test.ts` → writes edited BOM columns…                     |
| P5-E source fingerprint, stale detection and model-change associativity              | `phase5.test.ts` → detects source changes…; updates dimensions…   |
| P5-F print path, page count, scale, PDF/DXF/DWG verification and BOM rows            | `phase5.test.ts` → prints every sheet…                            |
| DWG release remains binary and round-trippable                                       | `phase5.test.ts` → keeps binary DWG export…                       |
| Two-sheet visual package, exports, view lock, custom view and section controls       | `e2e/phase5.spec.ts` → Phase 5 drawing package checklist          |

## Commands

```bash
npx vitest run src/drawings/__tests__/phase5.test.ts --reporter=verbose
npx vitest run src/drawings/__tests__ --reporter=dot
npx tsc -p tsconfig.json --noEmit
npx eslint src/drawings/model.ts src/drawings/__tests__/phase5.test.ts \
  src/components/DrawingWorkspace.tsx src/scenes/simpleCadScene.tsx \
  e2e/phase5.spec.ts
npx prettier --check src/drawings/model.ts \
  src/drawings/__tests__/phase5.test.ts src/components/DrawingWorkspace.tsx \
  src/scenes/simpleCadScene.tsx e2e/phase5.spec.ts
E2E_PORT=3300 npx playwright test e2e/phase5.spec.ts --project=chromium \
  --reporter=line --retries=0
```

## Visual-regression checklist

Executed with `e2e/phase5.spec.ts`; the test captures both sheets to
`phase5-sheet1.png` and `phase5-sheet2.png` before exporting.

- [x] Sheet 1 and sheet 2 both render at their chosen paper size/orientation.
- [x] Title block variant and revision/date/drawn/checked/approved/material/
      finish/weight fields are readable.
- [x] Every projection and custom view has the expected label and scale.
- [x] Suppressed/locked and aligned views sit where configured.
- [x] Section hatch angle/spacing and depth controls visibly change the view.
- [x] Linear, ordinate, angular, radius and diameter dimensions show the right
      value and tolerance/fit text.
- [x] Balloons match BOM item numbers; no consistency warnings before export.
- [x] Print preview has one page per sheet at the correct size.
- [x] PDF/DXF/DWG open with the expected sheet count and BOM rows.
