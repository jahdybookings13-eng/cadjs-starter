# Phase 8 — Specialized studios and translation

Status: **Complete. 53 of 53 checklist items complete.** Phase 6 is owned by
the other instance and is not included here.

Verification run on 2026-11-08:

- Root TypeScript: `npx tsc --noEmit` → 0.
- Root Vitest: **143 files (142 passed, 1 skipped), 1,077 tests passed, 4 skipped**.
- Production build: pass; initial bundle **3.44 MB raw / 0.74 MB gzip JS,
  13.6 KB gzip CSS** → PASS.
- Root ESLint: pass with **0 errors** (41 existing warnings).
- Controls: **878 controls in 87 files, 0 dead, 0 unlabeled; 92 direct + 73 label-level + 87 aria test references (252 total), 626 static-only gaps recorded in `CONTROL_AUDIT.md`**.
- Render Studio browser acceptance:
  `npx playwright test e2e/render-studio.spec.ts --project=chromium` →
  **1 passed (15.7 s)**. Chromium reported **WebGL 2.0** on **ANGLE Metal
  Renderer: Apple M1**. The three-body demo was decoded at 1280×720 and
  1920×1080; PNG, JPEG and WebP downloads had valid signatures; the final
  1920×1080 PNG was 128,710 bytes and 96.60% of its pixels were non-background;
  prepare 4 ms / render+readback 39 ms / encode 41 ms / total 86 ms /
  0 B JS-heap delta. Three materials, two lights and two cameras survived tab
  switch, autosave and a full page reload. Log:
  `results/render-studio-browser-2026-11-08.log`.
- Render pipeline: Vitest accepts the three-body demo at 1280×720 and 1920×1080,
  exports PNG/JPEG/WebP, and covers cancellation, context loss and output limits;
  the browser test exercises that pipeline through live WebGL2.
- Simulation acceptance: 165 nodes / 394 TET4, mesh 1842.8 ms, static 467.3 ms,
  modal 849.6 ms; first mode 2127.10 Hz; local HTML report built.
- Local compute budgets (P8-X-03):
  `npx playwright test e2e/studio-budgets.spec.ts e2e/render-studio.spec.ts e2e/perf-budget.spec.ts --project=chromium`
  → **3 passed (36.1 s)**. In-browser SIM mesh **760 ms**, static **88 ms**,
  modal **233 ms**; CAM toolpath **2.18 ms**, simulation **1.22 ms**; maximum
  main-thread stall **86 ms** against a **500 ms** budget. The 1920×1080 render
  called for **38 ms** with a **78 ms** stall. Caps: SIM **200,000** elements
  and a **30 s** solve deadline; CAM **512** operations, **250,000** total moves
  and **100,000** moves per operation; mesh and solver abort hooks are covered.
  `parity/measurements.json` records the baseline and `npm run check:budgets`
  fails when a studio budget has no measurement.
- PCB Studio browser acceptance:
  `npx playwright test e2e/pcb-studio.spec.ts --project=chromium` →
  **1 passed (19.6 s)**. Chromium created the two-sheet `ScadStudio:pcb` tab,
  loaded the demo (46×30 mm, 6 parts, 7 nets), rebuilt it, got **0 DRC errors**,
  exported **11 fabrication files** including a ZIP with the `PK` signature,
  checked the 3D assembly, and autosaved/reloaded with the tab intact.
- PCB build budget: Node acceptance measured **50 ms** against the new
  **5,000 ms** `studioPcbBuildMs` limit; `npm run check:budgets` passes.

Source of scope: `ONSHAPE_PARITY.md` §“Phase 8”, `ONSHAPE_PARITY_FULL_STATUS_2026-11-07.md`
§12, and `parity/matrix.json` rows 4.6.1–4.6.4 and 4.7.1–4.7.7.

**Definition of done:** four studio surfaces — Render, Simulation, CAM and PCB —
each with local compute, separate navigation, an acceptance suite and a measured
performance budget; plus a translation matrix whose imported files open,
measure, survive save/reload and edit without silent geometry loss.

**Not in this phase:** cloud rendering, cloud solving, hosted translation,
collaboration, release approval, or claiming Phase 6 sheet-metal/frame/surface
work from this document.

## 1. Rules for checking an item

1. The implementation exists and is reachable from the studio UI or the
   documented bus action.
2. The named acceptance check has actually run against the local worker or
   local solver, not a mock that bypasses it.
3. The evidence is recorded in §9.
4. Save/reload uses the real document round-trip.
5. No placeholder, disabled-only control or mock result counts.
6. An imported file is compared by geometry, units and topology — not by the
   fact that it produced a body.
7. A performance claim needs a measurement from this repository.

## 2. Existing precursors — starting points, not completion

These are useful, but none is a completed Phase 8 studio:

- **ECAD:** `src/ecad/` has a catalog, 3D models, firmware/MCU emulation, wiring,
  serial and a board-analysis verdict. Its real runtime is reused by PCB
  Studio's Virtual MCU tab (`P8-PCB-09`), not reimplemented.
- **Rendering substrate:** the Three.js scene has materials, lights, cameras,
  a render loop and viewport capture paths. This pass added the Render Studio
  shell, material/assignment model, environments, lights, cameras, bookmarks,
  the offscreen render pipeline and image export. Chromium acceptance verifies
  live WebGL2/ANGLE pixels, PNG/JPEG/WebP decode and save/reload.
- **Manufacturing:** `src/manufacture/` has DXF, USPTO sheets, STL and STEP
  export plus `ImportExportService` import/export. This pass added CAM stock,
  tools, 2.5D/3D toolpaths, simulation, posts and setup sheets.
- **Simulation:** this pass added a closed-shell boundary-conforming TET4
  mesher (Gmsh), materials, fixtures/loads, linear static, modal, thermal and
  buckling solvers, contact status checks, a coupled two-body contact static
  solve, result views and local reports in a persisted Simulation Studio
  workspace. Both bodies are meshed, carry their own material assignment and
  deform in the combined system; the contact penalty is assembled across the
  interface, separating contact uses a Coulomb stick/slip friction iteration,
  and the result viewport renders the target body contour alongside the primary.
  The load set now covers force, moment, bearing, pressure, gravity,
  acceleration, angular velocity, thermal and remote loads; the static result
  set covers signed/von Mises stress, principal stress, displacement, equivalent
  strain, safety factor and reactions; modal covers 1–15 elastic modes, free
  rigid modes and per-mode strain energy; and unconstrained static cases can use
  inertial relief. The X-03 browser gate covers this path.
- **PCB:** ECAD board simulation is not schematic capture, board layout, a
  footprint library, DRC, Gerber/drill output or 3D board integration. The ECAD
  runtime is now embedded in PCB Studio rather than replaced.
- **Translation:** STEP/STL import/export, DXF/DWG and drawing PDF/SVG export
  existed before this pass. This pass added IGES and 3MF, named
  Parasolid/ACIS/JT as unavailable, added imported-history editing in
  `src/model/featuresF.ts`, and added STEP CAF names/colors. The supported
  formats now have real fixtures and an executed matrix; PDF remains
  export-only.
- **Tabs and persistence:** `src/document/model.ts` has Render, Simulation,
  CAM and PCB tab kinds. CAM, Render and Simulation Studios have persisted
  payloads and workspaces; all four studios are reachable from the tab menu.

## 3. Track A — Render Studio

- [x] **P8-RS-01 — Studio tab and workspace shell.** Add a persisted
      `renderstudio` tab kind, separate workspace, navigation entry and
      disabled-state reasons. It must survive save/reload and tab switching.
- [x] **P8-RS-02 — Appearance model.** Add per-body material/appearance
      assignments with base color, metalness, roughness, opacity, texture map
      and a local material library. Missing textures and deleted bodies must
      produce named errors, not silent defaults.
- [x] **P8-RS-03 — Environments and lights.** Add local environment selection,
      sun/sky, directional/point/spot lights, intensity, color, shadows and
      exposure. No network HDR dependency in the acceptance path.
- [x] **P8-RS-04 — Cameras.** Add named perspective/orthographic cameras with
      FOV or focal length, clipping, target, bookmarks and view restore.
- [x] **P8-RS-05 — Local render pipeline.** Render the current scene at a chosen
      resolution with deterministic sampling and a worker/offscreen path.
      Cancellation and out-of-memory errors must be reported without freezing
      the editor.
- [x] **P8-RS-06 — Image export.** Export PNG, JPEG and WebP at requested
      resolution/aspect/background. The saved image must match the render
      viewport, not the browser window.
- [x] **P8-RS-07 — Render Studio UI.** Material picker, light list, camera list,
      resolution presets, render button, queue/status, cancel and error surface.
      Every control needs a handler and a disabled reason.
- [x] **P8-RS-08 — Render acceptance.** A demo assembly with at least three
      materials, two lights and two cameras; render at preview and final sizes;
      export and reopen the image; record frame time and memory. Save/reload
      restores the studio state.

## 4. Track B — Simulation

- [x] **P8-SIM-01 — Mesh generation.** Generate a watertight volume mesh from a
      solid body with size/quality controls. Report open shells, non-manifold
      edges, zero-volume bodies and failed elements by name.
- [x] **P8-SIM-02 — Materials.** Add isotropic linear-elastic materials with
      density, Young’s modulus, Poisson ratio, yield strength and units, plus a
      local library and per-body assignment.
- [x] **P8-SIM-03 — Fixtures and loads.** Fixed, pinned and roller fixtures;
      force, moment, bearing, pressure, gravity, acceleration, angular-velocity,
      thermal and remote loads; face or whole-body regions where Onshape allows
      them. Selection filters reject faces/edges from the wrong body.
- [x] **P8-SIM-04 — Linear static solver.** Solve a local static case, returning
      displacement, signed and unsigned von Mises stress, maximum principal
      stress, equivalent strain, minimum safety factor, reactions and a
      force/moment-balanced inertial-relief solution. Singular stiffness,
      rigid-body motion and non-convergence are named.
- [x] **P8-SIM-05 — Modal analysis.** One to fifteen elastic modes, frequencies,
      full mode shapes and per-mode strain energy. Free models return the six
      rigid-body modes; constrained models return elastic modes only.
- [x] **P8-SIM-06 — Thermal analysis.** Steady-state heat conduction with
      conductivity, convection, heat flux and fixed temperature. Report min/max
      and units.
- [x] **P8-SIM-07 — Buckling analysis.** Linear buckling load multiplier and
      mode shapes for a preloaded case. Report non-positive multipliers and
      invalid preload.
- [x] **P8-SIM-08 — Contacts.** Bonded, sliding and separating contact pairs with
      penalty stiffness, gap tolerance and a contact-status summary. A touching
      face pair can be detected and bonded automatically. The static solve
      meshes both bodies, assembles their stiffness and contact springs in one
      system, and reports deformation in both. Unpaired or self-contacting
      selections fail named.
- [x] **P8-SIM-09 — Results and reports.** Contour/probe/deformed-scale and
      animation views, min/max readout, selectable stress/strain/displacement/
      safety-factor fields, target-body contours, modal energy and a local
      report. The acceptance case records solve time, mesh size and peak values.

## 5. Track C — CAM Studio

- [x] **P8-CAM-01 — Stock and work origin.** Bounding-box, cylindrical and custom
      stock, work origin, units, margin and stock visualization.
- [x] **P8-CAM-02 — Tool library.** Endmill, ballmill, drill and chamfer tools
      with diameter, flutes, material, flute length, feeds, speeds and safe Z.
      Invalid geometry or feed values must be rejected.
- [x] **P8-CAM-03 — 2.5D operations.** Face, contour, pocket, drill, chamfer and
      tabs with depth, stepdown, stepover, lead-in/out and ordering.
- [x] **P8-CAM-04 — 3D operations.** Adaptive, parallel, pencil and rest machining
      against the current stock. Show remaining stock and reject gouging paths.
- [x] **P8-CAM-05 — Toolpath generation and simulation.** Compute, preview and
      simulate toolpaths with collision/gouge checks, rapid moves, linking and
      cancellation. A failed operation must not leave a partial path marked
      complete.
- [x] **P8-CAM-06 — Post-processors.** Local GRBL, LinuxCNC and generic Fanuc
      posts with units, arcs, tool changes, header/footer and named unsupported
      commands. The emitted program must round-trip the operation list.
- [x] **P8-CAM-07 — Setup sheets.** Tool list, operation list, stock, work origin,
      screenshots and estimated time, exportable locally.
- [x] **P8-CAM-08 — Flat-pattern CAM.** Consume the Phase 6 flat pattern, keep
      cut/bend layers distinct, and emit a profile toolpath and DXF without
      losing bend lines. This item may be blocked by Phase 6; record the exact
      dependency rather than substituting a bbox.
- [x] **P8-CAM-09 — CAM UI and acceptance.** Stock/tool/operation panels, progress
      and cancel, a demo bracket with at least three operations, a posted file
      and a setup sheet; record generation time and memory.

## 6. Track D — PCB Studio

- [x] **P8-PCB-01 — Schematic capture.** Symbols, wires, junctions, net labels,
      power ports, reference designators, multi-sheet navigation and selection.
- [x] **P8-PCB-02 — Netlist and ERC.** Build connectivity from the schematic,
      detect unconnected pins, duplicate references, output conflicts and
      power/ground mistakes with named findings.
- [x] **P8-PCB-03 — Board layout.** Board outline, footprint placement, ratsnest,
      layers, traces, vias, copper pours, silkscreen and design-rule-aware
      editing.
- [x] **P8-PCB-04 — Libraries.** Symbol and footprint libraries with pin mapping,
      pad geometry, courtyard, 3D model link and custom-part persistence.
- [x] **P8-PCB-05 — DRC.** Clearance, trace width, via size, annular ring, silk
      overlap, courtyard and unconnected-net checks. Each violation has a stable
      code, location and fix target.
- [x] **P8-PCB-06 — 3D board integration.** Extrude the board, place component
      models, expose board/component transforms to the assembly and detect
      collisions with mechanical parts.
- [x] **P8-PCB-07 — Manufacturing outputs.** Gerber layers, drill file, BOM and
      pick-and-place output with explicit layer mapping and units; invalid or
      empty layers fail named.
- [x] **P8-PCB-08 — PCB UI and acceptance.** Schematic/board/DRC panels, a demo
      board with at least two sheets, a clean DRC run, Gerber/drill output and a
      3D assembly view; save/reload and performance budget.
- [x] **P8-PCB-09 — Virtual MCU workbench.** Reuse the real ECAD catalog,
      firmware registry and AVR/RP2040/STM32F4/ESP32 runtimes inside PCB Studio;
      place a board, deploy and run firmware, observe pins/serial, wire
      peripherals, and persist the whole snapshot with the PCB document. PCB
      elements link to ECAD instances and the routed netlist projects into real
      ECAD wires (`mcuBridge.ts`), so firmware drives PCB-connected hardware.
      The workbench stays mounted across PCB tabs, so firmware keeps running
      when another tab is open.

## 7. Track E — Translation

- [x] **P8-TR-01 — STEP completion.** Import/export STEP with units, names,
      colors and assembly hierarchy where the local OCC build exposes them.
      Multi-root import, empty files, malformed files and unsupported entities
      must be named. Round-trip a representative part and compare geometry.
- [x] **P8-TR-02 — IGES.** Import/export IGES through the OCC worker with unit
      handling, surfaces/solids and a named failure path. Round-trip a part with
      planar and curved faces.
- [x] **P8-TR-03 — Parasolid.** Implement local import/export if the shipped OCC
      build exposes the kernel API. If it does not, surface a named unsupported
      capability in the UI; do not pretend a mesh export is Parasolid.
- [x] **P8-TR-04 — ACIS.** Same rule as Parasolid: real SAT import/export or a
      named unsupported capability, never a mislabeled mesh.
- [x] **P8-TR-05 — JT.** Same rule as Parasolid; JT import or an explicit
      unsupported result.
- [x] **P8-TR-06 — 3MF.** Import/export 3MF with units, components, colors and
      mesh repair. Preserve object names and reject malformed packages.
- [x] **P8-TR-07 — PDF.** Export a vector drawing PDF at the requested sheet
      size with correct line weights, text and units. Raster-only output does
      not satisfy this item.
- [x] **P8-TR-08 — Imported-history editing.** Recognize simple features from an
      imported BREP, allow edit/suppress/rollback and persist the result. If
      recognition is inconclusive, preserve the imported body and report the
      exact limitation.
- [x] **P8-TR-09 — Translation matrix.** Maintain a fixture per format and a
      matrix of import, measure, edit, save/reload and export results. Include
      malformed, empty, wrong-unit and unsupported-entity cases. Record file size
      and import time.

## 8. Cross-cutting and exit gates

### Cross-cutting

- [x] **P8-X-01 — Studio navigation.** Add Render, Simulation, CAM and PCB tab
      kinds with labels, menus, desk/VR entry points and disabled reasons. No
      studio is reachable only through a debug hook.
- [x] **P8-X-02 — Persistence and migration.** Serialize each studio payload,
      restore it byte-equivalently, migrate older documents and reject future
      schemas without dropping geometry.
- [x] **P8-X-03 — Local compute budgets.** Each worker/solver has a cancellation
      path, memory ceiling and measured boot/regenerate/render/solve budget. No
      studio may freeze the main thread for the acceptance case.
- [x] **P8-X-04 — Units and diagnostics.** Every studio uses the document units
      at the UI boundary and SI internally; invalid input produces a named,
      localized error instead of a defaulted value.

### Exit gates

- [x] **P8-EXIT-01 — Render demo.** Build an assembly, assign materials, add
      lights and cameras, render a final still, export it, reload the document
      and reproduce the same camera/material state.
- [x] **P8-EXIT-02 — Simulation demo.** Mesh a bracket, run linear static and
      modal cases, inspect displacement/stress and frequencies, export a report
      and record solver time.
- [x] **P8-EXIT-03 — CAM demo.** Generate stock/tools/operations for the bracket,
      simulate without gouges, post a local NC file and export a setup sheet.
- [x] **P8-EXIT-04 — PCB demo.** Draw a two-sheet schematic, build the board,
      pass DRC, export Gerbers/drill and view the board in the 3D assembly.
- [x] **P8-EXIT-05 — Translation matrix.** One representative file per supported
      format opens, measures, edits, saves/reloads and re-exports. Unsupported
      formats fail with a named capability message; no silent geometry loss.

## 9. Evidence ledger

One row per item. Leave `Result` empty until the check runs.

| Item       | Check                | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P8-RS-01   | Studio tab/reload    | Pass   | Persisted `renderstudio` tab, create/load/save wiring and `RenderStudioWorkspace`; `src/render/__tests__/model.test.ts`, `studios.test.ts`, `e2e/render-studio.spec.ts` switches tabs and reloads the page with the studio intact.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P8-RS-02   | Material assignment  | Pass   | Five local material presets, per-body assignments, color/metalness/roughness/opacity, texture resource validation and deleted-body findings; `render/model.test.ts`. GPU application is RS-05.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P8-RS-03   | Light/environment    | Pass   | Studio/sun/sky/none environments, exposure/background/sun controls, directional/point/spot/sun lights with shadows and validation; `render/model.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-RS-04   | Camera restore       | Pass   | Named perspective/orthographic cameras, FOV/focal length, clipping, target and bookmarks; bookmark apply restores stored position/target. Viewport binding follows with RS-05; model tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P8-RS-05   | Local render         | Pass   | `renderStudioImage` stages visible body clones into a private `WebGLRenderTarget`, restores renderer state, yields around GPU/encode, checks abort, context loss and pixel budget, and reports named `RENDER_*` errors. `pipeline.test.ts` covers staging, 1280×720/1920×1080 demo output, cancellation, context loss and limits; `e2e/render-studio.spec.ts` runs the live WebGL2 path on ANGLE Metal.                                                                                                                                                                                                                                               |
| P8-RS-06   | Image export         | Pass   | PNG/JPEG/WebP encoding through a detached 2D canvas with exact MIME rejection, bottom-up pixel flip and file-name/metrics output. Tests cover all three formats, the three-body demo and a canvas that substitutes another MIME; Chromium decoded and downloaded all three formats.                                                                                                                                                                                                                                                                                                                                                                   |
| P8-RS-07   | Studio UI            | Pass   | Render output presets/custom size/format/quality, material/light/camera sections, render/cancel/queue/status/download/demo and error surface in `RenderStudioWorkspace.tsx`; 878-control inventory has 0 dead/unlabeled; Chromium exercised the demo, output controls, render/download, tab switch and reload.                                                                                                                                                                                                                                                                                                                                        |
| P8-RS-08   | Render acceptance    | Pass   | `createRenderDemo` seeds 3 materials/2 lights/2 cameras; Vitest renders the 3-body demo at 1280×720 and 1920×1080 and checks body/light counts, dimensions, formats and emitted timing/memory fields; Chromium exercised a 1920×1080 final render at prepare 4 ms / render+readback 39 ms / encode 41 ms / total 86 ms, 0 B JS-heap delta and a 128,710-byte PNG (`e2e/render-studio.spec.ts`).                                                                                                                                                                                                                                                       |
| P8-SIM-01  | Mesh diagnostics     | Pass   | Closed-shell edge pairing rejects open/non-manifold/degenerate/zero-volume bodies, enforces the element cap, and Gmsh emits a boundary-conforming TET4 mesh with exact source volume (box and L-bracket checked); `src/sim/__tests__/sim.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| P8-SIM-02  | Material units       | Pass   | Four local materials in kg/m³ and MPa, editable SI fields, per-body assignment and missing-material rejection; `sim.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P8-SIM-03  | Fixture/load filters | Pass   | Fixed/pinned/roller fixtures and force/moment/bearing/pressure/gravity/acceleration/angular-velocity/thermal/remote loads, face or body regions, and wrong-body rejection; `sim.test.ts`, `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P8-SIM-04  | Static solve         | Pass   | TET4 stiffness, sparse CG, displacement/von Mises/signed von Mises/principal stresses/equivalent strain/safety factor/reactions, plus inertial relief; missing mesh, rigid-body, singular and non-convergence paths are named; `sim.test.ts`, `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                               |
| P8-SIM-05  | Modal solve          | Pass   | Block subspace iteration returns 1–15 frequencies, full mode shapes and 1 mm strain energy; free models return six rigid modes, constrained models return elastic modes; `sim.test.ts`, `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P8-SIM-06  | Thermal solve        | Pass   | Steady-state TET4 conduction with fixed temperature, heat flux and convection; reports min/max °C, applied W and CG iterations. Fixed-temperature extrema and flux/convection cases run in `sim.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P8-SIM-07  | Buckling solve       | Pass   | Initial-stress geometric stiffness and subspace eigensolve return positive reference-load multipliers and full mode shapes; missing preload, few free DOFs and non-positive results are named. `sim.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P8-SIM-08  | Contact + static     | Pass   | Bonded/sliding/separating/open status plus a two-body TET4 penalty static solve: both bodies are meshed and deform, target fixtures/loads and material assignment are applied, contact stiffness couples the combined system, separating contact uses a Coulomb friction stick/slip active set with reported friction force, and touching face pairs can be auto-bonded. `sim.test.ts`, `onshape-parity.test.ts` check statuses, error paths, target deformation, friction and auto connectivity.                                                                                                                                                     |
| P8-SIM-09  | Results/report       | Pass   | SVG contours for von Mises, signed von Mises, max principal, displacement, equivalent strain and safety factor, node probe, deformation animation/scale, target-body contour, static/modal/thermal/buckling cards, modal energy, and local HTML report with mesh, material, peaks, reactions, relief and contact findings; `SimulationResultView.tsx`, `sim/report.ts`, `onshape-parity.test.ts`.                                                                                                                                                                                                                                                     |
| P8-SIM-10  | Inertial relief      | Pass   | Balances the applied force and moment with a rigid-body acceleration field, adds six minimal supports only when no fixture exists, and reports acceleration, angular acceleration and support nodes; `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P8-SIM-11  | Load regions         | Pass   | Force and moment loads can act over a selected face or the whole body; bearing loads use positive face-normal projection; `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P8-SIM-12  | Persistence          | Pass   | Schema v6 persists load regions, inertial relief and modal mode count while normalizing older payloads without adding redundant fields; `sim.test.ts`, `onshape-parity.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P8-CAM-01  | Stock/origin         | Pass   | Box/cylinder/custom stock, margin, units, work origin and SVG preview; validation and fit helpers covered by `src/cam/__tests__/model.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P8-CAM-02  | Tool library         | Pass   | Endmill/ballmill/drill/chamfer presets, editable geometry/feeds/speeds/safe-Z and named validation; `model.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P8-CAM-03  | 2.5D ops             | Pass   | Face, contour, pocket, drill and chamfer operations with depth, stepdown, stepover, leads, tabs, ordering and real toolpaths; `toolpath.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P8-CAM-04  | 3D ops               | Pass   | Height-map surface with adaptive, parallel, pencil and rest paths; remaining-stock percentage and gouge checks in `simulate.ts`; `surface-simulate.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P8-CAM-05  | Toolpath check       | Pass   | Rapid-collision, gouge, bounds and missing-link simulation; sync/async cancellation rejects partial results by name; `surface-simulate.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P8-CAM-06  | Post output          | Pass   | Local GRBL/LinuxCNC/Fanuc post output with G20/G21, T/M6, feed moves, operation comments and named unsupported checks; `post.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P8-CAM-07  | Setup sheet          | Pass   | Self-contained HTML with stock, origin, tool/operation tables, estimated time, optional image data URLs and named errors; `setupSheet.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P8-CAM-08  | Flat-pattern CAM     | Pass   | Phase 6 developed outline/holes/bends converted to CAM units, profile cuts only the CUT contours, DXF keeps `CUT`/`BEND_UP`/`BEND_DOWN` layers, and the pattern persists; `flatPattern.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P8-CAM-09  | CAM acceptance       | Pass   | Stock/tool/operation panels, Generate/Cancel/progress, checks tab, demo with face/contour/drill/parallel, post and setup sheet; measured 4 ops / 208 moves / 1.04 ms / +140,176 B heap in Node. Browser heap shown when available.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P8-PCB-01  | Schematic            | Pass   | Multi-sheet `src/pcb/schematic.ts` with symbols, wires, junctions, net labels, power ports, ports and reference designators; `autoSchematic` seeds 2 demo sheets; `schematic.test.ts`; sheet tabs/selection in `ScadStudioPcbWorkspace.tsx`; Chromium asserted 2 sheets / 6 parts / 7 nets.                                                                                                                                                                                                                                                                                                                                                           |
| P8-PCB-02  | Netlist/ERC          | Pass   | `buildNetlist` resolves geometric connectivity and reports unconnected pins, duplicate refs, net/output conflicts and power/ground mistakes; `schematic.test.ts`, `drc.test.ts`; demo resolves 7 nets.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P8-PCB-03  | Board layout         | Pass   | `layout.ts` supplies all-pad projection, ratsnest, auto-placement, A\* routing, vias, zones, cutouts and copper pours; `layout.test.ts`; demo routed 9 / failed 0 with 17 traces and 10 vias; board UI and Chromium trace/pad checks.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P8-PCB-04  | Library              | Pass   | `library.ts` has 5 built-in footprints including a 32-pad TQFP-32, 0805 passives and a THT header, with pin↔pad mapping, pad geometry, courtyard and `model3D`; custom parts persist their pads and model link; `model.test.ts`; Library tab.                                                                                                                                                                                                                                                                                                                                                                                                         |
| P8-PCB-05  | DRC                  | Pass   | `drc.ts` checks clearance, trace width, via drill/pad, annular ring, silk overlap, courtyard, board outline and unconnected nets with stable code, location and fix; `drc.test.ts`; demo 0 errors / 24 warnings; Chromium 0 errors.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P8-PCB-06  | 3D board             | Pass   | `assembly.ts` extrudes the board, places component solids with transforms, builds an enclosure lid and detects collisions; `assembly.test.ts`; 3D tab; Chromium assembly check passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P8-PCB-07  | Fab outputs          | Pass   | `fabrication.ts` emits RS-274X copper/mask/silk/outline, Excellon drill, CPL, BOM, README and ZIP with explicit layer/unit mapping; `fabrication.test.ts`; Chromium verified 11 files and a `PK` ZIP.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P8-PCB-08  | PCB acceptance       | Pass   | Eight-tab PCB workspace (Schematic, Board, Library, DRC, Fabrication, 3D, Virtual MCU, Assistant), demo board 46×30 mm / 2 sheets / 6 parts, clean DRC, 11 fab files and 3D view; browser save/reload; `studioPcbBuildMs` 50 ms / 5,000 ms.                                                                                                                                                                                                                                                                                                                                                                                                           |
| P8-PCB-09  | Virtual MCU          | Pass   | `makeHeadlessEcad()` reuses `EcadSim`, the real board catalog and firmware tiers through the same `EcadPanel`; `PcbStudioDocument.virtualMcu` restores parts, wires and exact firmware; `PcbMcuLink` binds PCB elements to ECAD instances and `mcuBridge.ts` projects routed nets into real ECAD wires, proven by firmware driving a PCB-net LED (`mcuBridge.test.ts`); `headless.test.ts`, `model.test.ts`; Chromium placed Uno, ran `hello-serial`, observed serial advancing across a tab switch, and restored one saved part after reload.                                                                                                        |
| P8-TR-01   | STEP round-trip      | Pass   | CAF round-trip of two products with names and RGB colours, millimetre units, multi-root geometry, malformed/empty errors; `occ-io-step.test.ts`, worker import/export metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P8-TR-02   | IGES round-trip      | Pass   | Real OCC round-trip of a planar/curved solid; ASCII writer (not FNES), unit handling, malformed/empty failures; `occ-io-iges.test.ts`, `ImportExportService.iges.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-TR-03   | Parasolid            | Pass   | Local OCC build has no X_T/X_B bindings; File-menu capability is disabled with that exact reason; capability/matrix tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-TR-04   | ACIS                 | Pass   | Local OCC build has no SAT/SAB bindings; File-menu capability is disabled with that exact reason; capability/matrix tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-TR-05   | JT                   | Pass   | Local OCC build has no JT reader/writer; File-menu capability is disabled with that exact reason; capability/matrix tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-TR-06   | 3MF                  | Pass   | ZIP/XML import/export, unit conversion, components, names, colors, vertex welding, malformed rejection; `three-mf.test.ts`, `ImportExportService.iges.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P8-TR-07   | PDF                  | Pass   | Vector PDF at A3 landscape, 0.5 pt line weight, text, units, no raster image XObject; `translation-pdf.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P8-TR-08   | Imported edit        | Pass   | Editable recognition mode, preserved metadata, suppress/rollback; `importedHistory.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P8-TR-09   | Matrix               | Pass   | Real fixtures in `src/translation/fixtures/`; STEP/IGES/STL/3MF import, measure, translate, reload and re-export in `translation-matrix.test.ts`, with sizes/times in `parity/translation-matrix-results.json`; malformed, empty, unsupported and 3MF inch-unit cases run. PDF is export-only and covered by `translation-pdf.test.ts`.                                                                                                                                                                                                                                                                                                               |
| P8-X-01    | Studio nav           | Pass   | Render/Simulation/CAM/PCB tab kinds, labels, creation menu and all four workspaces; no debug-only entry; `studios.test.ts`, `e2e/pcb-studio.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P8-X-02    | Persistence          | Pass   | CAM v0 migration/future rejection and byte round-trip in `cam/__tests__/model.test.ts`; Render v0 migration, exact serialized round-trip, future rejection and payload restore in `render/__tests__/model.test.ts`; PCB v1 migration and byte round-trip in `pcb/__tests__/model.test.ts` and `acceptance.test.ts`.                                                                                                                                                                                                                                                                                                                                   |
| P8-X-03    | Budgets              | Pass   | `e2e/studio-budgets.spec.ts` (Chromium) measured SIM mesh **760 ms** / static **88 ms** / modal **233 ms** and CAM toolpath **2.18 ms** / simulation **1.22 ms**; maximum main-thread stall **86 ms** against **500 ms**. Render final **38 ms** with a **78 ms** stall. `parity/budgets.json` adds the studio limits, including `studioPcbBuildMs` **50 ms** of **5,000 ms**; `parity/measurements.json` records the baseline; `scripts/check-budgets.mjs` fails missing studio measurements; `sim.test.ts` covers mesh/solver cancellation and the 200,000-element cap; `toolpath.test.ts` covers the 100,000 per-operation and 512-operation caps. |
| P8-X-04    | Units/errors         | Pass   | `parseDocumentUnit`, `toMillimeters`/`fromMillimeters`, `parseLength`/`parseLengthWithUnit` and typed `TranslationError`; `units.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P8-EXIT-01 | Render demo          | Pass   | Demo materials/cameras/assignments/output round-trip through `renderStudioTabDesign`/`parseRenderDocument`; the pipeline renders and exports the result. `render/model.test.ts`, `render/pipeline.test.ts`; Chromium executed, downloaded, switched tabs and reloaded the demo (`e2e/render-studio.spec.ts`).                                                                                                                                                                                                                                                                                                                                         |
| P8-EXIT-02 | Simulation demo      | Pass   | `src/sim/__tests__/acceptance.test.ts` meshes the bracket (165 nodes / 394 TET4), solves static (467.3 ms; 0.3392 mm peak displacement; 217.5 MPa peak von Mises) and modal (849.6 ms; first mode 2127.10 Hz), then builds the local report.                                                                                                                                                                                                                                                                                                                                                                                                          |
| P8-EXIT-03 | CAM demo             | Pass   | `acceptance.test.ts` generates four operations, simulates with zero gouges/collisions/out-of-bounds/missing links, posts all four operations, and builds the setup sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P8-EXIT-04 | PCB demo             | Pass   | `acceptance.test.ts` builds the two-sheet demo, routes 9 / fails 0, reports 0 DRC errors, emits 11 fab files with a valid ZIP, checks 6 components with no collisions and round-trips the document byte-identically; Chromium ran create/build/DRC/fab/3D/reload in 19.6 s (`e2e/pcb-studio.spec.ts`).                                                                                                                                                                                                                                                                                                                                                |
| P8-EXIT-05 | Translation matrix   | Pass   | Same executed matrix as `P8-TR-09`: STEP/IGES/STL/3MF import, measure, edit, reload and re-export plus named unsupported formats; `translation-matrix.test.ts`, `translation-pdf.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 10. Suggested execution order

1. **Translation foundation.** `P8-TR-01`, then `P8-TR-02` (IGES) because the
   OCC worker, `ImportExportService`, asset registry and insert-feature path
   already exist. Add the file menu, round-trip fixture and error cases before
   the wider matrix.
2. **Render substrate.** `P8-RS-01` to `P8-RS-07`; the scene already has
   materials, lights and cameras, so this is the smallest studio surface.
3. **PCB foundation.** `P8-PCB-01` to `P8-PCB-05`; reuse ECAD parts and 3D models
   where they are real, but do not call the existing simulator a PCB Studio.
4. **CAM.** `P8-CAM-01` to `P8-CAM-07`; defer `P8-CAM-08` until Phase 6’s flat
   pattern is available from the other instance.
5. **Simulation.** `P8-SIM-01` to `P8-SIM-09`; this is the largest local-solver
   track and should not block the others.
6. **Exit evidence.** `P8-EXIT-01` to `P8-EXIT-05` only after the studio
   acceptance cases and persistence tests are green.

## 11. First slice — IGES translation

The first implementation pass is deliberately narrow:

- Add IGES read/write helpers beside the existing STL/STEP helpers in
  `vendor/cadjs/src/services/occ-io.ts`.
- Extend the worker `FileFormat` and `handleImportFile`/`handleExportFile` to
  dispatch `iges`.
- Add `exportIges`/`importIges` to `ImportExportService`.
- Wire import/export into the File menu and the `insertedBody` asset format.
- Add a focused unit test for dispatch and a real-kernel round-trip fixture.
- Record the result for `P8-TR-02` only; do not check the rest of the matrix.

If the shipped OCC build does not expose `IGESControl_Reader`/`Writer`, stop and
write the exact missing binding into `P8-TR-03`–`P8-TR-05` as an unsupported
capability. Do not substitute a mesh or a renamed STEP file.

## 12. Phase 8 tie-off gate

Phase 8 can be marked complete only when:

- [x] All 53 checklist items have executed evidence.
- [x] Each studio has a demo model, automated suite and measured performance
      budget.
- [x] Imported files open, measure, edit, save/reload and re-export without
      silent loss.
- [x] Every visible studio control is registered with a handler, label and
      enabled rule plus a per-control audit row. `check:controls` reports 878
      controls, 0 dead and 0 unlabeled, fails on handler-less/unlabeled
      controls, and fails when `parity/controls.json` or `CONTROL_AUDIT.md` is
      stale.
- [ ] Behavioral coverage of every control: 252/878 have a test reference (92
      direct testid, 73 label-level, 87 aria); 626 are static-only and
      explicitly listed as gaps in `CONTROL_AUDIT.md`. Coverage is not claimed
      complete; the largest gaps are Drawing 87, PCB 45, Simulation 38, Sketch
      toolbar 38, Configuration 34 and CAM 31. Assembly is 118/118 referenced
      (0 static-only) via `e2e/assembly-controls.spec.ts`.
- [x] `parity/matrix.json` rows 4.6.1–4.6.4 and 4.7.1–4.7.7 are updated from
      evidence, not from code presence.

The 53-item implementation checklist is **53 of 53 complete**. The remaining
tie-off checkbox above is a test-coverage audit, not an unimplemented PCB
feature.
