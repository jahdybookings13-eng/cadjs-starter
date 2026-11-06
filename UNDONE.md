# UNDONE — tooling phases

Tracked work that is intentionally left partial. Each item is scoped, not a wish list.

## Phase 9 — Fastener / Thread (+ surf ops + query predicate tail)

Status: **landed + tested** (bolt M6 + screwHole M6 e2e green through the OCC
worker; 331 unit tests green; tsc + eslint clean on all touched files). Full e2e
37 passed / 1 skipped / 0 failed.

- `src/model/threadStandards.ts` — ISO 68-1 + ASME B1.1 + NPT tables.
- `src/model/headShapes.ts` — head/tip 2D profile (r,z).
- `src/model/fastenerPresets.ts` — 11 families × standard × head/tip, `resolvePreset`
  + `validateFastener`.
- `src/model/fasteners.ts` — `buildFastenerPresetNode` / `buildScrewHolePresetNode`.
- `src/model/executor.ts` — `case "fastener" | "screwHole"` (inline revolve +
  thread); **`flattenNodes`** post-orders sub-features and skips embedded `thread`;
  new **`boundarySurface` / `constrainedSurface` / `queryFaces` / `queryEdges`**
  cases (Phase 3 tail).
- `src/model/predicates.ts` + `src/model/featureMap.ts` — Phase 3 query ops wired.
- `src/scenes/simpleCadScene.tsx` — `fastener` / `screwHole` debug hooks + a few
  more ops (queryFaces/queryEdges/curveOnFace/scale/boundingBox/sliceFace/
  moveFaceOffset/…); Fasteners dropdown in `PrimaryToolbar.tsx`.
- `e2e/parity-ops.spec.ts` — fastener + screwHole test (line 967).
- **Fix this session**: `src/model/primitiveLibrary.ts` — library revolve ops
  (pcyl/pcone/ptor) passed `angleForward` as a length (`units: "m"`, expression in
  mm) instead of an angle, so the executor's `EXPECTED_DIMS` type-check threw
  `expected rad, got m`. Added a `rad(radians)` helper; all three swapped to
  `rad(Math.PI * 2)`.

## Known pitfalls (this session's landmines)

- **`loadAppReady` "canvas not visible"** — a pre-existing first-render race in
  `useMoveMode` (`Scene, camera, or renderer not available` console.error).
  Flaky on heavy systems; the canvas IS in the DOM, just logged as an error
  during the first tick before the visualizer mounts. Scratch probe proved the
  canvas renders 768×640 with a child `<canvas>`. If a test goes red on
  `toBeVisible`, retry — do not read it as a real render crash.
- **`--isolate=false` for vitest** — OOMs large suites; keep isolate on for the
  fastener/headShapes/predicates files, off for the rest.

---

## Phase 8 — ECAD virtual MCUs (LANDED 2026-11-05)

Status: **landed + tested (32 ecad unit tests, e2e green when app boots; tsc + eslint clean on all ecad files).**

- `src/ecad/` — catalog (14 major MCU boards, 9 displays, 8 peripherals), procedural
  3D models, virtual-firmware runtime (Arduino-flavored JS on a virtual clock),
  **real AVR hex emulation** via avr8js (assembler-built Uno/Nano blink hexes are
  proven in `__tests__/hex.test.ts`), wiring rules, serial, per-frame 3D sync.
- Bus actions `ecad.*` (insert/move/wire/code/deploy/uploadHex/run/stop/status/
  serial/press/release/setPot/catalog/update/openPanel/closePanel) — desk, VR,
  voice, and the flux AI all dispatch the same ids (exit-ramp rule).
- Desktop panel `src/components/EcadPanel.tsx` (place/wire/code/run/serial);
  opens via `bus.run("ecad.openPanel")`.
- AI path: `PROMPT_REGISTRY` gains listBoards/insertMcu/wirePins/writeFirmware/
  deployFirmware/runFirmware/ecadStatus; new `ecad` sub-agent in
  `src/ecad/agent.ts` registered on the session's orchestrator (deterministic,
  local-first — no brain round-trip for placement/wiring/deploy/run).
- Scene hookup (small additive hunks in `simpleCadScene.tsx`): install in the
  debug-hook effect (re-registers on every bus rebuild), per-frame
  `layer.update()` rAF loop, flux-agent registration in the flux effect,
  `window.__ecad` + `__cadDebug.scadgen.ecad` test hooks.

Undone (scoped, not wishes):
- **VR coding surface** — the AI/VR chat panel already reaches every ecad action,
  but there is no dedicated VR floating editor/serial panel yet (chat + voice is
  the VR coding path today).
- **AVR coverage** — hex tier ships for Uno/Nano (ATmega328P). Mega/Leonardo/
  ATtiny85 accept .hex uploads but avr8js support for those MCUs is partial —
  they default to the virtual tier (declared honestly in `catalog.ts`).
- **Worker sandbox** — virtual firmware runs on the main thread; a sketch with
  a synchronous infinite loop freezes the tab. Move `McuRuntime` into a Web
  Worker with a postMessage HAL (catalog/runtime stay pure TS — seam is ready).
- **ESP32/RP2040/STM32 native emulation** — no open emulator ships; those
  families run the virtual tier only (tiered honestly in the catalog).
- **Wire drawing in 3D** — wires are logical (net resolution + state flow);
  no visual conductor meshes yet.
- **e2e re-run pending** — `e2e/ecad-mcu.spec.ts` passed; the full suite needs
  a quiet window (another AI is concurrently editing the app; avoid parallel
  playwright runs).

---

"Landed" means the model/logic exists and passes tests; UI wiring and long tails are separate.

- **Phase 7 — Flux Parity** → see `SCADGEN_SUBSYSTEMS_PLAN.md` § "Phase 7".
  Status: **engine + session + scene/VR/desk integration LANDED (265 tests, tsc + eslint clean).**
  All four entry points now hit the SAME orchestrator thread (the "one window,
  one thread, four entry points" invariant):

  - **ActionBus** (`simpleCadScene.tsx`): the scene creates ONE `FluxSession`
    per mount and calls `registerFluxBus(bus, session.orchestrator)`, so
    `bus.run("flux.runTurn", key, selection)` and every `flux.<key>` resolve to
    the session's orchestrator.
  - **Desk** (`simpleCadScene.tsx` + `ui/orchestratorView.tsx`): an "⚡ Flux"
    button toggles the `OrchestratorView` floating over the canvas — the single
    per-file chat window (agent-tagged rows + radial Actions menu). Selection is
    mirrored: scene `selectedElements` → `SelectedPart[]` (nodeId = designator).
  - **VR** (`useVRSession.ts` + `vr/vrChatPanel.ts`): on `enterVR` a
    `createVRChatPanel(scene)` mesh is positioned at eye height top-right; the
    scene pushes a live session getter via `__vrMechanics.setFluxSession(() =>
    ({ref, rows}))`, and the render loop calls `panel.refresh(rows)` every frame
    — no polling, no per-frame allocation. Disposed on session end.
  - **Voice**: same `bus.run("flux.runTurn")` path (different input source).

  `src/flux/` (40 engine+integration tests, 265 full suite green): prompt-registry
  (48 actions), orchestrator (single conductor + one thread per file), agent loop
  (uniform brain seam), MCAD→ECAD co-design (mounting-hole echo, device assembly,
  ECAD↔MCAD links + tolerance stack + tool-access), MCP serialiser, bus bridge,
  **`FluxSession`** (`makeFluxSession`) — the ONLY stateful flux object, exposing
  `ref`, `orchestrator`, project/links/holes/mcadParts getters+setters, `setBrain`,
  and `trace()`. Registered 5 sub-agents (orchestrator, pcb, mcad, firmware, parts)
  with `runLocal` adapters wrapping `PromptAction` → `AgentArgs`. Public facade
  (`src/flux/index.ts`) exports `makeFluxSession`, `FluxSession`, `FluxSessionOpts`
  alongside the registry/orchestrator/loop/domains/bus/UI surfaces.

  Integrated in: `simpleCadScene.tsx` (session + bus + desk view + selection),
  `useVRSession.ts` (panel mesh + per-frame refresh + `__vrMechanics.setFluxSession`),
  `useFluxChat.ts` (`getRows()` memo for VR sync), `index.tsx` (unchanged; scene
  wires it).

---

## Phase 3 — Query predicates

**Status: partial (landed slice).**

Landed (`src/model/predicates.ts`, tested):
- Face: area, normal, planar, vertex-count, adjacency
- Edge: length, direction, midpoint, parallel, equal-length, share-vertex
- `queryFaces` / `queryEdges` dispatchers wired into the executor as feature cases
  (`queryFaces`, `queryEdges`) and registered in `featureMap.ts`.

Undone (~90 predicates):
- curved-surface surface-type checks (cylinder/cone/sphere/torus/spline)
- edge-on-surface, edge-tangent-to-edge
- general equal-length/shape matching beyond the exact-axis case
- parallel-in-plane, perpendicular, tangent
- longest/shortest, midpoint-on-plane, distance-to-plane
- containment (`qContains`, `qIncludes`) and `qContainsMatches` combinations
- any predicate needing a live OCC kernel result (current ones are pure mesh)

Note: pure-mesh predicates are approximations. Anything curvature-dependent must
round-trip the worker to be truthful.

---

## Phase 4 — Parameter panel

**Status: model + render surface + commit path landed; controller binding pending.**

Landed:
- `src/model/paramPanel.ts` (tested): `paramPanelForFeature()` projects a feature's
  `ParamSpec[]` into UI-ready rows (quantity/boolean/enum/string/queryList/matrix),
  with `linkedVariable` detection, `usingDefault` fallback; `applyPanelEdit()` and
  `panelEditToParameter()` write edits back with min/max clamping.
- `src/components/vr/paramPanelCanvas.ts` (tested): pure canvas renderer + hit testing
  (`drawPanel`, `layoutPanel`, `hitTest`, `resolveHitValue`). No DOM, no three.js.
- `src/components/vr/vrParamPanel.ts`: floating CanvasTexture panel with raycast UV →
  hit mapping and `applyHit`.
- `useVRSession.ts`: panel created per session, disposed on end; debug/control API on
  `__vrMechanics`: `openPanel`, `closePanel`, `panelRows`, `panelStep`, `propertyPanel`.
  `panelStep` commits through `ScadgenHistory.updateParameter` and refreshes the panel.

Undone:
- Physical controller binding: pick up the panel and press trigger on a +/- /toggle/enum
  region. Today the panel is driven via `__vrMechanics.panelStep` + raycast helpers; the
  in-VR trigger→`applyHit`→commit loop is not yet hooked to the controller event path.
- Panel placement/affordance: current mesh is fixed at origin; needs desk/PiP anchoring
  and a grab handle.
- Text-entry rows: `string` rows render but have no keyboard/keypad entry in VR.
- Desktop `SketchPropertiesPanel` not yet switched onto this model (still its own code).
- Value-change UX for quantity: step buttons work; no jog/scrub or variable-picker.
- Validation messages (dimension mismatch from the evaluator) not surfaced in the panel.
- Undo/redo of a panel edit not defined.


---

## Phase 5 — Assemblies

**Status: not started.**

Undone:
- mate model (coincident/concentric/parallel/distance/angle)
- assembly tree separate from the part feature tree
- instance/occurrence placement and transforms
- DOF solving and over-constraint reporting
- VR grip/placement of parts into an assembly

---

## Suggested order

1. **Parameter panel UI** — biggest functional unlock; consumes the landed model and
   unblocks editing for every implemented feature.
2. **Assemblies** — new subsystem, no dependencies on the above.
3. **Predicate tail** — only when general VR selection is actually needed.

---

## Phase 6 — Manufacturing export (DXF / USPTO sheets)

**Status: model + tests landed; no scene UI yet.**

Landed (`src/manufacture/`, all tested, tsc + eslint clean):
- `geometry.ts` — pure BREP → measurement extraction. No kernel round-trip, runs
  in browser and under vitest.
  - `extractGeometry(brep, {position?, rotation?})` → `BodyGeometry`: bbox,
    per-edge (`Edge3`=a/b/length/dir/midpoint), per-face (`Face3`=normal/
    centroid/area/cornerCount/isPlanar), axis dims (x/y/z), per-face rectangular
    2-D dims (with ring reconstruction; the kernel's `Face` carries unordered
    planar vertices, so `rectDimsOfFace` re-chains via greedy nearest-neighbour
    and validates with dot/cross products — rejects bowties and colinear quads),
    per-edge circle/arc dims (degenerate-hemisphere detection — empty for a box).
  - `makeViewBasis(eyeDir)` — right-handed orthographic view basis, verified
    `|eye×right − up| = 0` for every one of the seven standard views.
  - `projectEdges` / `projectPoints` — world → 2-D view, centred on the bbox
    centre.
- `dxf.ts` — Dxf R12 technical drawing generator (pure, deterministic).
  - `layoutWindows()` third-angle slotting, bounded inside `[margin, paper−margin]`,
    avoiding the title-block zone.
  - `generateDxf({titleBlock, windows, notes?, generalTolerance?})` → ASCII DXF
    R12 string with `$INSUNITS=4` (mm), `$MEASUREMENT=1` (metric), GEOM/ANNO/FRAME
    layers, projection of every view's edges, per-view width/height dimension
    lines w/ arrowheads + labels, title block (title/partNo/material/units/scale/
    drawnBy/date/sheet), and a notes/GD&T block above it.
- `uspto.ts` — US patent figure sheets, Letter (8.5×11 in) portrait, 37 CFR 1.84
  compliant. Margins L0.75/R0.5/T0.75/B1.0.
  - `usptoSheet(spec, sheetNo, sheetCount)` → one SVG string (SVG path emission).
  - `usptoSheets(figures, spec, maxFiguresPerSheet)` → one SVG per chunk.
  - `checkUsptoCompliance(spec)` — pre-flight validator; flags missing title,
    applicant, empty figures, invalid figure labels (`FIG. N`), empty bodies,
    and reused reference numerals.
  - `drawReferenceNumerals` — calls out the numeral + optional label at the
    projected anchor.
- `index.ts` — public surface + ActionBus ids.
  - `extractBodyEl(element: SceneElement)` — the single choke-point from the
    scene to the drawing package; applies the element's world position+rotation
    to its analytic BRep.
  - `bodyToDxf(body, titleBlock, {notes?, generalTolerance?})` — one body
    → 3-view (front/top/right) DXF, `exactOptionalPropertyTypes`-safe.
  - `buildPatentFigure(figure, spec)` / `buildPatentSheets(figures, spec,
    maxFiguresPerSheet)` — high-level patent export returning the SVG + a
    compliance pre-flight + a temp path.
  - `MANUFACTURE_ACTIONS` + `ManufactureAction` — bus ids for extractBody /
    exportDxf / exportStep / exportStl / exportPatentSheet / checkUspto.

Tests (`src/manufacture/__tests__/`):
- `geometry.test.ts` — unit cube measurement, translation/rotation, empty,
  front/top view basis correctness, projection.
- `dxf.test.ts` — layout bounds, DXF skeleton, layer tables, per-view edge
  count, title-block wiring, view labels, dim text, determinism.
- `uspto.test.ts` — Letter size, header, title, figure labels, reference
  numerals, sheet chunking, compliance pass/fail rules.
- `index.test.ts` — `extractBodyEl` (at origin, translated, no rotation),
  `bodyToDxf`, patent figure + sheet builders, `MANUFACTURE_ACTIONS`, and the
  `runManufactureExport` dispatcher (STL / STEP / DXF / USPTO-SVG) with a
  mocked `ImportExportService`.
- `src/assets/fonts/` — `LiberationSans-Regular.ttf` / `-Oblique.ttf` /
  `-Bold.ttf` shipped for R12 text fidelity (register in the `STANDARD` /
  `OPEN D`-style `STYLE` table via `STYLE`-code `3` = `txt SHX`).

Undone:
- **Verification + wiring pass** (the 5-step closeout):
  1. Fix `index.test.ts` — R12 header regex, `extractBodyEl` empty-brep return,
     `checkUsptoCompliance` figures array, `require()` → top-level import,
     `mkBody0` hoist. (Tests currently pass; latent `const` scoping fixed.)
  2. `npx vitest run src/manufacture` — confirm all green.
  3. `npx vitest run` (full suite) + `npx tsc --noEmit` — final verification.
  4. Wire `MANUFACTURE_ACTIONS` + `runManufactureExport` into the scene
     `ActionBus` in `src/scenes/simpleCadScene.tsx` (register bus handlers for
     exportDxf / exportStl / exportStep / exportPatentSheet / checkUspto).
  5. Wire the same into the VR grab flow so a held-part → select export format
     triggers the dispatcher without desktop UI.
- Wire `MANUFACTURE_ACTIONS` + `runManufactureExport` into the Scene
  `ActionBus` handlers (and the VR grab flow). No scene/UI consumers yet.
- SVG → PDF assembler for the patent sheets (the module emits vector SVG;
  the 300 DPI raster / PDF page-append step is the caller's).
- STEP / STL export paths are now real (delegated to `ImportExportService`)
  but the bus handlers in the scene are not yet registered; the dispatcher is
  the only entry point today.
- The kernel does not emit ring-ordered face vertices; the work-around is in
  `rectDimsOfFace` (greedy NN + direction validation). Once the kernel exposes
  `Face.points` / contour ordering, simplify to a direct traversal.

## Phase 6.1 — Manufacturing export dispatcher (all 3D types)

- `src/manufacture/index.ts` now exports `runManufactureExport(action,
  elements, opts)` — the single bus-side entry point for **all** export
  formats.
  - `manufacture.exportStl` / `manufacture.exportStep` → delegate to
    `ImportExportService.getInstance().export / .exportStep` (the OCC worker
    that `simpleCadScene.tsx` already uses for exportSceneStl / exportSceneStep).
  - `manufacture.exportDxf` → pure, `bodyToDxf` + `TextEncoder`.
  - `manufacture.exportPatentSheet` → pure, `buildPatentFigure` + USPTO
    compliance gate (throws with the first issue on failure).
  - `manufacture.extractBody` / `manufacture.checkUspto` → throw
    "unsupported action" (they have their own signatures: `extractBodyEl` /
    `checkUsptoCompliance` — call those directly).
- Types: `ManufacturingFormat = "stl" | "step" | "dxf" | "svg"`;
  `ExportOutput { name, mimeType, bytes: Uint8Array }`.
- `index.test.ts` mocks `@vitekk02/cadjs` (`ImportExportService`) and asserts
  each dispatcher branch returns the right mimeType + payload.
- Full `npx vitest run` green (33 files / 200+ tests), `tsc --noEmit` clean,
  `eslint --fix` clean.
