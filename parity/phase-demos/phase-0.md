# Phase 0 demo — contract and control inventory

Date: 2026-11-06
Build: working tree on `wip/vr-toolbelt`, Chromium 1440×900, fresh profile.

Format: each step has an action, an expected observation and a durable evidence
artifact. A phase demo is not a screenshot tour; every claim must point at a
check, report or trace.

## Script

1. **Inventory the controls.**
   - Action: `npm run inventory:controls`
   - Expected: 255 controls in 63 files; 0 dead, 0 unlabeled; writes
     `CONTROL_INVENTORY.md` and `parity/controls.json`.
   - Evidence: the generated report and JSON.

2. **Prove the dead-control gate can fail.**
   - Action: add a temporary visible `<button>Dead</button>` with no handler to
     any mounted toolbar, then run `npm run check:controls`; remove it and rerun.
   - Expected: first run fails with that button's file and line; second passes.
   - Evidence: terminal output for both runs. During the real Phase 0 inventory
     the gate found 2 dead and 38 unlabeled controls and failed; after the
     fixes it passes.

3. **Prove every matrix row is owned.**
   - Action: `npm run check:parity`; then change one row to an invalid status
     and rerun.
   - Expected: first run passes with 97 rows in 8 sections; second fails on the
     invalid status.
   - Evidence: `PARITY_STATUS.md` and both terminal runs.

4. **Measure the browser budgets.**
   - Action: `npx playwright test e2e/perf-budget.spec.ts --project=chromium`
   - Expected: boot ≤12 s, document reload ≤15 s, box regeneration ≤5 s, orbit
     ≥30 fps; the spec attaches `perf-measurements.json`.
   - Evidence: the test attachment and the `PERF MEASUREMENTS` console line.
     Two baseline runs: 8.41–9.58 s boot, 5.55–10.64 s reload, 242–726 ms
     regeneration, 56–61 fps.

5. **Run the full gate.**
   - Action: `npm run test:bible`
   - Expected: typecheck, lint, unit suite, production build, bundle budget,
     control inventory, parity matrix and budget schema all pass.
   - Evidence: terminal output.

## Current result

- Controls: 255 in 63 files; 0 dead, 0 unlabeled.
- Direct test evidence: 4 controls (2%). The report lists the remaining gaps;
  closing them is Phase 1 work, not a hidden pass.
- Matrix: 97 rows, 8 sections, every row owned with acceptance evidence;
  row coverage 31.4% (SHIPPED=1, PARTIAL=0.5).
- Browser matrix: Chromium full suite; Firefox/WebKit boot/sketch/undo smoke.
- Budgets: enforced by `e2e/perf-budget.spec.ts`; `check:budgets` validates the
  schema and compares `parity/measurements.json` when a run records it.
