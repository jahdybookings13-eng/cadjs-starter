# UNDONE — tooling phases

Tracked work that is intentionally left partial. Each item is scoped, not a wish list.

## Current truth — 2026-11-06 (physical ECAD, test bible, measured speed)

This is the top of the file for a reason. Everything below it is history; this
section is what is true in the working tree today. **Nothing is committed.**

### Landed: persisted document tabs (Phase 1, first slice)

`src/document/` introduces a real document above the editor: one `CadDocument`
per project, with Part Studio tabs that can be created, renamed, duplicated,
reordered, deleted and switched. Each tab owns its own serialized design.

- Switching flushes the live scene into the outgoing tab and restores the
  target tab's blob (the same `documentStore` path a reload uses).
- Boot hydrates the active tab, so a reload reopens the Part Studio you were in,
  not an empty scene.
- `ProjectDoc.design` is now updated on every save; before this it only carried
  ECAD, so the project envelope could drift from the live design.
- Non-Part-Studio tab kinds are listed but disabled and labelled **Planned**
  with `ONSHAPE_PARITY.md` as the reason. There are no empty Assembly/Drawing
  tabs pretending to be workspaces.
- Tests: `src/document/__tests__/document.test.ts` (13) plus the Chromium
  browser test `e2e/document-tabs.spec.ts` (separate designs, rename, reload,
  delete).

Not done: Documents page, document panel, tab search/multi-select, other tab
kinds, and local named snapshots. Cloud/PDM work (accounts, sharing, real-time
collaboration, release management, API/App Store) is explicitly out of scope —
see `ONSHAPE_PARITY.md` section 0.

### Landed: the electrical layer is physical, not decorative

`src/ecad/circuit.ts` is a continuous nodal (MNA) solver stamped every tick from
the pins firmware actually drives. There are no piecewise switches dressed up as
devices:

- **Diode / LED** — Shockley junction (`Is`, `n`) with series resistance,
  reverse breakdown (Zener/avalanche) and voltage-dependent junction
  capacitance. The 1N4148 uses real parameters (`Is = 2.52 nA`, `n = 1.752`), so
  it drops ≈0.65 V and drifts with temperature instead of snapping at 0.7 V.
- **NPN** — Ebers-Moll with forward/reverse beta, Early voltage and junction
  capacitance. It biases into forward-active and amplifies; it also saturates.
  Proven by the mid-rail collector case in `circuit.test.ts`.
- **MOSFET** — Shichman-Hodges square law in triode and saturation, with
  channel-length modulation and gate capacitance.
- **Passives / sources** — Ohm's law plus backward-Euler companions for
  capacitors and coils, so charge and current ramp over time.
- **Per-board grounds** — a board's GND pins are internally joined; different
  boards are isolated until wired. An unwired board sits on the bench
  reference. There is no hidden global ground.
- **Per-board supplies** — AVR 5 V, ARM/ESP 3.3 V by family, plus
  `sim.setSupply(id, volts)` (bus: `ecad.setSupply`).
- **Temperature** — `sim.setTemperature(celsius)` (bus: `ecad.setTemperature`)
  scales junction saturation current across the whole solve; measured drift is
  ≈−2 mV/°C on a 1N4148.
- **AC small-signal analysis** — `sim.acSweep({drive, probe, fromHz, toHz,
points})` (bus: `ecad.ac`) linearises every device at the DC operating point
  and solves the complex nodal system, returning gain (dB) and phase. This is a
  small-signal sweep at an operating point, not transient distortion analysis.
- **Compiled AVR analog input** — `makeAvrChip` attaches avr8js's real `AVRADC`
  (every profile except ATtiny85, whose register map differs). `EcadSim` maps
  `A0`..`A15` by pin name (including A4/A5, which also carry I2C) and feeds
  solved probe volts through `setAnalog`. A hand-assembled 328P program that
  writes ADMUX/ADCSRA with `sts` and reads ADCL/ADCH with `lds` proves the
  compiled path sees the circuit, not a stub.
- **New parts** — `capacitor-100n`, `zener-5v1`, `battery-9v` added to the
  existing 220 Ω/1 kΩ/10 kΩ, 100 µF, 100 mH, 1N4148, 2N3904, 2N7000, 5 V set.
- **In-world RF** — `rf-tx-433` / `rf-rx-433` remain a physical OOK link
  (`radio.ts`): ~31 m free-space reach at default power, RSSI and per-frame edge
  log, tunable channel. Framing/timing stays in firmware. No internet involved.

Proof: `src/ecad/__tests__/circuit.test.ts` (11), plus `analogAvr.test.ts`,
`radio.test.ts`, `persist.test.ts` and the chip/peripheral suites. The last full
run was **477 passed across 62 executed files** (63 total; the opt-in perf
harness contributes 4 skipped cases), `tsc --noEmit` 0, `npm run build` clean.
ESLint is 0 errors once generated `public/**` and the gitignored
`vendor/esp32sim` checkout are excluded (they are Emscripten glue / upstream
source staged by `prebuild`, not project source); the two stray TypeScript
casts in `src/printers/slicers/daemon.mjs` were removed so the `.mjs` parses.

### Landed: the test bible

`TEST_BIBLE.md` is now a **command-free, 222-item primary-function checklist**
in 18 sections (A–R): boot/projects, viewport, sketching, features, parameters,
selection/topology, assemblies, fasteners, manufacturing/patent, printing,
ECAD build, electrical simulation, firmware/MCUs, RF, VR physics, agent/flux,
collaboration and release health. Each line is one behaviour a person confirms
with their own eyes; `OPEN` lines are specified but not built.The 590 passing automated checks (plus 4 skipped) remain the regression net behind it. New commands:

- `npm run test:perf` — prints µs/op and fails on a 4–10× regression.
- `npm run check:bundle` — fails when the initial payload exceeds budget.
- `npm run test:bible` — types → lint → unit → build → bundle budget.
- Browser gates stay separate (`npx playwright test e2e/<spec>`); Chromium
  runs the full suite, while Firefox and WebKit run the boot/sketch/undo smoke
  projects in `playwright.config.ts`.

### Measured speed (not claimed)

| Measurement                    | Result                 | Budget          |
| ------------------------------ | ---------------------- | --------------- |
| Empty `tick(16)`               | 0.42–0.44 µs           | 100 µs          |
| Divider, 5 parts               | 30–33 µs/tick          | 250 µs          |
| NPN + LED + capacitor, 9 parts | 54–69 µs/tick          | 400 µs          |
| AC sweep, 25 points            | 510–638 µs/sweep       | 4 ms            |
| Production build               | 11.8–12.5 s            | —               |
| Initial JS                     | 2.77 MB / 0.62 MB gzip | 3.5 MB / 0.8 MB |
| Initial CSS                    | 35.0 KB / 7.0 KB gzip  | 20 KB gzip      |

Initial composition after the boot split: app 1.32 MB raw / 284 KB gzip, three
1.23 MB / 279 KB, react 280 KB / 67 KB. Rapier (2.89 MB / 1.08 MB gzip) and the
VR-only GLTF loader (58 KB) are now lazy chunks, so desktop boot no longer
parses a physics engine. The other heavy native pieces were already off the
boot path: OCC (50.3 MB wasm) and cc1plus (13.8 MB wasm) are fetched on demand,
and the MCU emulators run in workers.

**Do we need an accelerator?** No — not for ECAD. The solve spends 0.2–0.4% of
a 16.6 ms frame, and the expensive work is already WASM/worker-isolated. The
boot win was not more three tree-shaking (Rollup already drops every unreachable
three export; the core renderer is genuinely needed for the first frame). It was
keeping Rapier out of the desktop parse: the VR hook imported it statically.

Landed:

1. Rapier is imported when physics starts; its 1.08 MB gzip chunk is no longer
   in the boot path. The VR-only GLTF loader is lazy too.
2. three and react are stable vendor chunks, so immutable caching survives app
   deploys and a UI change re-downloads only the app chunk.
3. Brotli is negotiated by the Vercel edge; the bundle gate reports raw, gzip
   and brotli for every initial asset. Hashed assets are `immutable` for a year;
   `index.html` revalidates.

Do not add a “performance accelerator” dependency without a failing budget
first. The budgets above are the tripwire.

### Landed: 2D control map and command palette

`src/model/sketchControls.ts` maps the real 2D surface: 45 core commands and 18
constraints, each with its app key, AutoCAD alias and cadjs id. `Ctrl+K` opens a
searchable palette; `F1` / `?` opens the full map; both are also toolbar
buttons. Dimensional constraints reuse the existing value prompt instead of
guessing a value. Unsupported AutoCAD tools are listed in `CONTROLS_2D.md` and
the help sheet as gaps — no dead buttons. Registry tests cover uniqueness,
alias lookup, engine-key coverage, availability and gap honesty.

The primitive set is points, lines, circles, arcs, ellipses, elliptical arcs
and splines; rectangles and the newer tools are built from those. This pass
added Mirror, 3-point circle, midpoint line, centre rectangle, slot, polygon,
ellipse, elliptical arc, spline, cubic Bezier, conic, line/line, line/arc and
arc/arc fillet, chamfer, offset, line join,
line/arc/circle/elliptical-arc/spline/Bezier/conic split, vector move/copy,
numeric rotate/scale, linear/circular/path patterns, single-stroke text, DXF
import, and midpoint/symmetric constraints. Numeric sketch fields now evaluate
arithmetic and units (`2*25.4 mm`, `45 deg`, `1/2`) with dimension checks;
project-variable references in those fields are still open. Polyline, hatch,
blocks, layers and plot are not implemented; image underlays and include of
selected 3D BRep edges are implemented, with underlay move/scale/opacity/delete
editing and analytic plane-section include.

### Next: voice + regular controls (READY TO BUILD, not built)

What already exists:

- Every ECAD capability answers on the **same ActionBus** (`ecad.insert`,
  `ecad.wire`, `ecad.run`, `ecad.validate`, `ecad.setSupply`,
  `ecad.setTemperature`, `ecad.ac`, `ecad.tuneRadio`, …). The comments and the
  exit-ramp rule already reserve this path for voice/desk/VR/AI.
- VR input is real: grab/throw, trigger, rays, `__vrMechanics` control hooks.
- Keyboard hotkeys exist for the CAD core (`useSceneKeyboardBindings.ts`:
  undo/redo, duplicate, Escape, view keys). Sketch mode now has a unified 2D
  command map, but there is still **no unified ECAD shortcut map** and no
  command grammar.

What is missing and must be built as one slice:

1. `parseCommand(transcript)` — pure, testable text → `{action, args}`; number
   words, part aliases, installed-instance resolution (“the red LED”, “the
   Uno”), and a clarification result for ambiguity instead of a guess.
2. `dispatchCommand(bus, cmd)` — no second implementation of any capability.
3. Confirmation/cancel semantics and a destructive-intent gate (remove board,
   overwrite firmware).
4. ECAD keyboard/controller map that emits the **same** command objects. (The
   2D sketch map exists; it is not an ECAD map.)
5. An STT seam. Web Speech works on desktop Chromium but is not dependable in
   Quest Browser; a cloud STT needs an explicit provider + key decision. Audio
   must not leave the device until that choice is made.
6. VR push-to-talk (controller button), listening indicator, cancel word.

Items P15–P21 in `TEST_BIBLE.md` are the acceptance spec. They stay **OPEN**
until a scripted transcript actually drives the real bus and a headset
push-to-talk session works; parser-only tests are not enough to call them done.

### Gates run in this window

- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` — full suite.
- `npx eslint .` — 0 errors on the app sources.
- `npm run build` and `npm run check:bundle` — clean and inside budget.
- `npx playwright test e2e/sketch-controls.spec.ts e2e/sketch-rectangle.spec.ts e2e/extrude-profile.spec.ts e2e/undo-chain.spec.ts` —
  4 passed, 1 opt-in drag test skipped; covers text/DXF insert, rectangle →
  profile, extrude activation, and undo-chain in the real browser.
- `npm run test:perf` — last recorded runs: 0.44 / 30.34–32.83 / 53.80–68.82 µs
  per tick and 509.89–637.69 µs per AC sweep; all under budget.

### Still open (honest, unchanged by the above)

PNP devices, MOSFET body diode, per-device self-heating, diffusion capacitance
and reverse recovery, ESR/ESL/wire parasitics, noise/Monte Carlo, transient AC
and distortion analysis; ATtiny85 ADC; compiling for non-328P AVR; RGB LEDs
light from pin levels rather than solved current; ESP32 Wi-Fi association with
the stock blob and classic BLE advertising; native ESP32-S3/ESP8266/STM32F1/
Teensy/micro:bit/Due; two-machine collaboration (share-link routing is now
landed, but a server/auth transport is not); voice and regular controls as
scoped above.

## Project ("suit") model + 1:1 VR physics (LANDED 2026-11-06, uncommitted)

Status: **landed + tested** (13 project, 12 session, 5 suitPanel, 8 oneToOne,
6 ecadPhysics, 4 physicsWorld wasm, 4 circuitPip = 52 green; tsc clean; eslint
0 errors on every touched file; `e2e/vr-board-grab.spec.ts` +
`e2e/vr-suit-settings.spec.ts` pass against the real browser + real RAPIER WASM,
and `e2e/app-boot.spec.ts` passes with the session runtime booting with the
scene).

**Session record vs. this file:** the agent's own todo list (opencode session
`ses_e510e0e2cf`, Nov 6 07:58) still shows "1:1 LAW" as `in_progress` and
physics / PiP / settings-panel / gates as `pending` — that snapshot is stale.
Items 2, 3, 4, 6 and 7 below were finished after it, and item 5 (throw + the
held-board circuit card) was finished on 2026-11-06 morning — see below. A
later session (07:59) misreported Block C as "not built" (it is), then the
08:03 session died on Groq's 8k TPM cap before it could do anything. Trust this
file plus the code, not the client-side todo list.

- `src/project/model.ts` — Account / Team / ProjectDoc / ProjectSettings +
  share tokens, `resolveSettings` (project default → per-user overlay).
- `src/project/store.ts` — localStorage seam (`scadgen.account|team|projects|
active|overlay.v1`), active project, one-time `scadgen.project.v1` migration.
- `src/project/suitPanel.ts` — the settings panel as pure `ParamPanel` rows +
  `applySuitEdit` (clamped/validated), so VR and desk share one edit path.
- `src/components/vr/vrSuitPanel.ts` — floating canvas panel; look UP to open
  (replaces the dead head menu), right-hand ray + trigger edits a row, every
  commit calls `saveProject` and room/desk rows rebuild the room live.
- `src/ecad/oneToOne.ts` — the 1:1 LAW made checkable: mm↔m, physical size
  bounds, FR4 `boardMassKg`, `assertOneToOneScale` + `OneToOneScaleError`.
- `src/ecad/physics.ts` — `EcadPhysics`: board = Rapier dynamic body whose
  collider IS its real meter size and whose mass is FR4 volume × density;
  grab → kinematic hand-follow, release → dynamic fall; writes world (m) back
  to the sim (mm).
- `src/ecad/scene.ts` — the mm→m boundary (`instanceMeters`, part group scaled
  0.001 exactly once), `meters()` / `markPhysicsOwned` / `setFromWorld` so a
  thrown board's transform is Rapier's, not the sim's.
- `src/ecad/sim.ts` — `insertInlinePart` for out-of-catalog / parametric boards.
- `physicsWorld.ts` — honest timestep (clamped 1/240…1/30), CCD on dynamic
  bodies (a 1.6mm board tunnels a thin slab at throw speed), 0.5m desk slab,
  `zeroBodyVelocity` (no fling on release), `buildRoomBoundaries` returns its
  bodies so a live room rebuild can retire them.
- `simpleCadScene.tsx` — resolves the active project at boot, publishes
  `__scadgen.project/settings` and the live `ecadLayer`; attaches the ECAD
  layer group when `sceneReady` flips (the context `scene` is a stale ref).
- `useVRSession.ts` — room built from project dims; suit panel per session;
  per-frame `EcadPhysics.step`, 1:1 nag every 0.5s, grip bridge routes boards
  to physics instead of raw position-copying.

Landed after the audit above (2026-11-06, todo #5 — the last open item):

- **Circuit card** — `src/ecad/circuitPip.ts` is pure and non-DOM:
  `circuitPipSnapshot(sim, boardInst)` reads the board's real header geometry for
  pad positions, its real wires (`sim.wiresFor`) for margin modules, per-pin live
  drive (`sim.pinDrive`), LED/servo/buzzer/display state, and the last serial
  line; `drawCircuitPip` paints it deterministically. `components/vr/vrCircuitPip.ts`
  is the floating canvas mesh; `useVRSession` keeps it up ALWAYS — it follows
  the head (left of centre), tracks the board you're holding, and stays pinned
  to that board after release (falling back to the first board in the circuit
  before you've held one). Repaints only on change and exposes
  `__scadgen.circuitPip.{isVisible,snapshot}`.
- **Throw semantics** — `EcadPhysics` keeps a `THROW_WINDOW_MS = 120` hand trail;
  `release()` launches the body with the measured hand velocity (clamped to
  `MAX_THROW_MPS = 5`) and falls back to `zeroBodyVelocity` below
  `MIN_THROW_MPS = 0.3`, so a slow release still just drops. New seam:
  `physicsWorld.setBodyVelocity`. `grabbedIds()` feeds the card.
- Proven by `__tests__/circuitPip.test.ts` (4), the throw/`grabbedIds` cases in
  `__tests__/ecadPhysics.test.ts`, and `e2e/vr-board-grab.spec.ts` (card shows the
  held board and keeps showing it after release).

## Session layer — one room, two surfaces (LANDED 2026-11-06, uncommitted)

Status: **landed + tested** (12 session tests; 52 unit green; tsc clean;
eslint 0 errors; `e2e/app-boot.spec.ts` green).

What exists now:

- `src/project/session.ts` — the `Session` the model comment used to promise.
  Seats are keyed by account, carry `surface: "2d" | "vr"`, a role
  (`view`/`comment`/`edit`), a selection of element ids and a heartbeat
  timestamp. `applySessionEvent` is a pure reducer (join / leave / select /
  surface / role / heartbeat / doc), `sessionPeers` drops seats silent for 25 s,
  and `parseSharePath` understands `/project/:id/view|enter?t=…&vr=1`.
- `src/project/sessionBus.ts` — `Transport` seam: memory transport for tests,
  BroadcastChannel for other tabs, no-op when neither exists. A server for two
  machines is a third transport, not a rewrite.
- `src/project/sessionRuntime.ts` — the module singleton both surfaces use:
  starts a session, publishes selection/surface/heartbeat, exposes
  `remoteSelections()` for the three.js loop, relays "doc saved", and
  publishes `__scadgen.session` for e2e.
- 2D: `components/SessionPresenceStrip.tsx` shows the live seats (You/Dave,
  2D/VR, what they are touching); a peer's 2D selection tints the body in the
  desk canvas via `highlightElement`; saving broadcasts so the other surface
  reloads instead of rendering stale geometry.
- VR: `components/vr/vrSessionPresence.ts` draws a peer-coloured wireframe box
  (depth-test off, 200 ms recompute) around whatever a peer selected; the loop
  publishes the board in hand as my selection. Entering VR makes the headset
  the publishing surface, leaving hands the seat back to the desk.

Honest limits (not built, deliberately):

- One machine only. BroadcastChannel syncs tabs/windows of the same browser
  profile; two people on two machines need a server transport (the seam exists,
  the service does not).
- No live mesh streaming: doc sync is "reload on save", not per-edit CRDT. Two
  people editing the same feature at once is last-writer-wins.
- **Share links are routed at boot** through `resolveBootProject`: a valid
  token selects the project, role and VR gate before the scene hydrates. The
  app still has no general router; the URL is read once on boot, and a static
  host must serve `index.html` for `/project/*`.

## Collaboration / sharing (LANDED 2026-11-06, uncommitted)

Status: **landed + tested** — project-level people/sharing panel, per-link
roles, VR-gated links, seat role changes, pinned notes and a real read-only
surface. App + project tests are green; this has not had a two-machine gate.

What exists:

- `model.ts` — `ShareRole` is `view | comment | edit`; `ShareToken.allowVr`
  decides whether a link may enter VR; `ProjectMember` stores a named person's
  role; `ProjectNote` pins a note to selected element ids. `accessForShareUrl`
  resolves role + VR from the token, never from the URL path alone.
- `store.ts` — `resolveBootProject` reads `/project/:id/view|enter?t=…&vr=1`
  once at boot, normalizes old docs, and returns `denied` without hydrating the
  design when the token is missing/expired/revoked.
- `SessionEvent` now carries role changes. The owner can change a live seat's
  role; the peer receives the downgrade and its UI locks immediately.
- `CollaborationPanel` — live seats and surface, current selection, shared
  feature tree, owner-only role controls, view/comment/edit link creation with
  a VR checkbox, link copy/revoke, and notes pinned to the current selection.
- `ShareGate` — the link landing gate explains the role; a VR link offers
  `Enter VR` only when the token allows it. A missing/revoked link never shows
  the design.
- Reader lock — view/comment roles get `ViewerToolbar` instead of edit tools,
  no sketch/feature mode, no Flux, no assembly/ECAD editors, keyboard edit
  shortcuts are disabled, `persistProject` refuses writes, and VR grab,
  carousel, sketch-finish, feature-commit and parameter-panel edits are
  guarded by `canEditSession()`.

Honest limits:

- One browser profile / one machine. `BroadcastChannel` connects tabs; two
  people on two machines still need a server transport and real auth. The
  share token is a local, revocable id, not a signed cloud grant.
- Named member roles persist, but a link's token role is the grant at join
  time; without auth there is no verified account identity to bind a link to a
  member automatically.
- The tree is one shared project tree. The panel shows it under each live seat
  with that seat's current selection; it is not a separate per-person tree.
- Notes sync on save (`announceDocSaved`), not as a CRDT; simultaneous edits are
  last-writer-wins. There is no VR note-entry surface yet.
- There is no full e2e/Playwright run for sharing or a real headset gate in this
  window.

## Virtual MCUs — pre-hardware firmware validation (LANDED 2026-11-06, uncommitted)

Status: **landed + tested** (11 new `studio` tests; 43 ECAD tests green —
catalog 9, runtime 8, hex 4, sim 11, studio 11; tsc clean; eslint 0 errors;
`e2e/ecad-mcu.spec.ts` green).

The simulation core was already here (catalog of 20+ boards, virtual
Arduino-flavoured JS tier, real avr8js `.hex` tier, LED/servo/buzzer/screen
state, serial). What was missing was the judgment a maker needs BEFORE buying
parts, so `src/ecad/studio.ts` adds it:

- Static checks: parse-only compile of the sketch, `setup()`/`loop()` presence,
  the pin constants the sketch uses, and whether a `.hex` is being pushed at a
  board that cannot run it.
- Circuit checks: every used constant resolves to a pin that exists on THIS
  board, that pin is actually wired, and the peer is the right kind of part
  (`Servo.` needs a servo, `Display.` a screen, `tone()` a buzzer).
- Runtime check: the last run's error blocks; a running sketch is reported as
  running, not assumed.
- Verdict: `ready` (nothing to doubt), `needs-work` (warnings only — e.g. code
  is fine but nothing is wired), `blocked` (errors). Findings carry stable
  codes for the AI and a future VR badge.
- Surfaces: `ecad.validate` bus action returns the same report to desk, VR,
  voice and the flux agent; the ECAD panel's code tab has a `✓ validate`
  button that renders the verdict + findings (`ecad-report`, `data-verdict`).
- `EcadSim.firmwareOf()` exposes the deployed entry so validation never
  reaches into private maps.

Honest limits:

- **Firmware persistence: LANDED.** The saved unit is the whole ECAD scene,
  not just the code, because wires and firmware key off instance ids (b1, b2…)
  that are generated per session. `src/ecad/persist.ts` defines a versioned
  `EcadSnapshot` (parts + inline parts + wires + exact deployed source per
  board); `EcadSim.snapshot()` / `EcadSim.restore()` rebuild it with the same
  ids, drop unknown parts/stale wires instead of failing, and bump the id
  counter so a restored scene cannot collide with new inserts. The snapshot
  lives in `ProjectDoc.design.ecad`, is written to the legacy document blob by
  `documentStore.saveProject(ecad)`, is carried across the one-time migration,
  and is restored when the scene installs ECAD (parts are re-added to the 3D
  layer). The desk save action, the `project.save` bus action, and the ECAD
  panel after deploy/run/hex-upload all funnel through one `persistProject`.
  Proven by 7 new `__tests__/persist.test.ts` cases (round-trip, catalog
  firmware by id, id-collision guard, corrupt snapshot, clear, document blob).
- **In-browser C++ compilation: LANDED (ATmega328P).** The earlier claim in
  this file ("no wasm avr-gcc exists") was wrong: `@horang-corp/avr-gcc-wasm`
  ships `cc1plus`, `avr-as`, `avr-ld` and `avr-objcopy` as WebAssembly plus
  prebuilt Arduino core objects (~16 MB tools + ~38 MB assets).
  `scripts/avr-assets.mjs` stages them into `public/avr/` (gitignored, run by
  `predev`/`prebuild`). `src/ecad/avrSource.ts` does what Arduino's build step
  does around cc1plus — `#include <Arduino.h>`, the board's pin constants, and
  prototypes for functions defined after use — and `src/ecad/avrBuild.ts` runs
  the toolchain in a module worker (`avrBuildWorker.ts`) so the render loop
  never blocks. `ecad.buildFirmware` (bus) compiles, deploys the Intel HEX and
  runs it; the panel's code tab has `⚙ build C++` + a C++ sample + a compiler
  error pane. `avr.ts` now instantiates Timer0/1/2, without which real Arduino
  `delay()`/`millis()` hangs under avr8js.
  Proven by `__tests__/avrBuild.test.ts` (11) and `e2e/ecad-cpp-build.spec.ts`,
  which compiles a C++ blink in Chromium, deploys the hex and watches the
  emulated AVR toggle a wired LED.
- **Compiled firmware reaches real peripherals (LANDED).** The hex tier now
  attaches avr8js's TWI peripheral and decodes SSD1306/SH1106 transfers into the
  sim's display buffer (`src/ecad/avrPeripherals.ts`), so a compiled sketch's
  OLED shows the same pixels as the virtual tier. Servo signals are decoded as
  1–2 ms control pulses measured in board cycles (`EcadSim.servoPulse`), which
  is how a horn reads them, so `Servo.write(90)` moves the 3D servo. avr8js
  requires every TWI phase to call `complete*()` or `Wire.endTransmission()`
  spins forever — that contract is now honoured in `avr.ts`, and USART lines are
  normalised (`\r`/NUL padding) so compiled and virtual serial read the same.
  Proven by `__tests__/avrPeripherals.test.ts` (4) and
  `e2e/ecad-cpp-peripherals.spec.ts`, which compiles C++ using `Wire`, `Servo`
  and `Serial`, then asserts the OLED framebuffer, a ~90° servo angle and both
  serial lines.
- **Every board's virtual firmware is worker-isolated (LANDED).**
  `src/ecad/firmwareWorker.ts` runs `McuRuntime` in a module worker and posts
  coalesced HAL state, serial, display ops and errors; `EcadSim.startRemote()`
  applies them to the same pin state / display backends the in-thread path used.
  A sketch with a synchronous infinite loop now burns only its worker. Node has
  no `Worker`, so tests keep the in-thread fallback. Proven by
  `e2e/ecad-worker.spec.ts` (page still answers while `setup(){while(true){}}`
  spins) and the ESP32 serial case in the same spec.
- **Firmware for MCUs with no emulator (LANDED: verified, delivery-only).**
  ESP32 / ESP8266 / STM32 / Teensy / micro:bit / Due still run the virtual
  tier; there is no in-app emulator for them. To make the suit's promise true
  ("code ready, waiting on delivery"), `ecad.uploadBinary` accepts a real
  `.bin` / `.uf2` / `.elf` and now _verifies_ it before attaching:
  `inspectFirmware` reads the ELF header (machine 40 ARM / 83 AVR / 94 Xtensa,
  entry point, loadable-segment size), parses UF2 blocks and family ids, and
  checks the result against `src/ecad/target.ts` (arch, flash and RAM for every
  catalog MCU). Wrong-architecture images and images larger than the chip's
  flash are refused, not attached; accepted images persist in the snapshot and
  report `tier: "binary"` with a `binary-attached` finding carrying the parse
  facts — never `running`.
- **RP2040 images actually run (LANDED).** `rp2040js` is a real Cortex-M0+ plus
  the RP2040's GPIO/UART/I2C/SPI/PWM/PIO, so Pico / Pico W left the
  delivery-only path. `src/ecad/rp2040.ts` loads a UF2 (blocks placed at their
  own target addresses) or a raw flash image, synthesizes the two words the
  mask ROM's reset would read (initial SP + reset vector) and boots the core;
  `src/ecad/rp2040Worker.ts` runs it at 125 MHz in a worker and posts coalesced
  GPIO changes (mapped to catalog names such as GP25) and UART0 lines.
  `sim.run` reports `tier: "rp2040"`. Honest boundary, stated in the catalog,
  the studio finding and the serial log: the RP2040 mask ROM is proprietary and
  is not shipped, so boot-vector images run (bare-metal, and most
  MicroPython/Arduino images) but firmware that looks up mask-ROM functions
  will not find them. Proven by `__tests__/rp2040.test.ts`: hand-assembled
  Thumb code drives GPIO25 high from both a raw image and a UF2, and the same
  UF2 deploys to a Pico in `EcadSim` and lights a wired LED.
- **STM32F4 firmware runs for real (LANDED).** `stm32f4-emu` (MIT) provides a
  Rust Thumb-2 Cortex-M4 core with a VFPv4-SP FPU and a 41-block STM32F4
  peripheral model, compiled to WebAssembly; it is a runtime dependency, not a
  badge. `src/ecad/stm32f4.ts` boots `.bin` / Intel `.hex` / ELF images, samples
  each GPIO bank's ODR every 10k instructions (so pulses between frames are not
  lost) and drains USART output; `src/ecad/stm32f4Worker.ts` runs the core in a
  worker. A new catalog board, **STM32F4 Black Pill (STM32F411CEU6, 512 KB /
  128 KB)**, declares `tier: "stm32f4"`; `sim.run` reports that tier and maps
  PC13 and friends to the 3D pins. Proven by `__tests__/stm32f4.test.ts`: the
  package's real `blinky_f411` firmware prints its banner over USART1, drives
  PC13, and lights a wired LED through `EcadSim`. F401/F407/F407VE/F429 images
  boot on their matching chip model. The F103 Blue Pill is a different core
  generation and stays verified-image only.
- **Classic ESP32 (Xtensa LX6) runs for real (LANDED).** The MIT `esp32sim`
  core is built from source with Rust→WASM (no npm package, no prebuilt module)
  and shipped in `public/esp32/` with its MIT licence; Espressif's Apache-2.0
  `esp32_rev300_rom.elf` boots it. `src/ecad/esp32.ts` drives the plain C ABI
  (alloc/load/boot/run/outbox), feeds a virtual clock tied to emulated cycles,
  and relays UART text; `src/ecad/esp32Worker.ts` runs it off the main thread.
  A merged flash image (bootloader 0x1000 + partition table 0x8000 + app
  0x10000) boots through the real mask ROM, so the reset banner, 2nd-stage
  bootloader and partition table are all genuine. App-only images are refused:
  esp32sim's classic ESP32 has no synthetic app boot; a combined image written
  at 0x1000 (stock MicroPython, Arduino) is also accepted. Scope is LX6 only;
  the S3 (LX7) and ESP8266 (L106) stay verified-image. The upstream module was
  patched (it is built here) to expose the GPIO edges it already recorded
  (`esp32sim_gpio_*`) plus pad input, `esp32sim_load_at` and `esp32sim_ble_enable`.
  So the tier now drives real pins: a GPIO edge lights a wired LED or moves a
  servo, and buttons/pots drive pads. Proven with stock MicroPython v1.29.0:
  `__tests__/esp32.test.ts` boots its combined image through the ROM, types
  `Pin(2, OUT).value(1)` into the REPL, sees the captured edge and lights a
  wired LED through `EcadSim`.
  **Wi-Fi:** `esp32sim_wifi` attaches the virtual AP (SSID `esp32sim`, WPA2
  passphrase `esp32sim-pass`) before boot; the guest's driver starts and the
  AP/subnet model answers, but association with the stock Espressif blob is
  NOT yet proven — MicroPython's `connect()`/`scan()` wait forever in this
  MAC/PHY model, and upstream has no classic-ESP32 firmware test for it. That
  gap is real and is not claimed as working (S3/C3 Wi-Fi fixtures are, but they
  are different chips).
  **Bluetooth:** the classic ESP32 uses a VHCI controller that must be enabled
  from the application ELF's symbol table (`enable_ble`), because a flash .bin
  carries no symbols; the panel's `ble elf` upload feeds it and the adapter
  refuses with the missing symbol otherwise. No classic BLE firmware+ELF
  fixture exists to prove an advertising session end to end.
- **AVR coverage beyond the 328P: LANDED.** Reverse-engineering avr8js 0.21.1
  showed the old "328P only" note was wrong: `CPU(progMem, sramBytes)` switches
  on a 22-bit program counter above 128 KB, ports A-L are exported, and an
  ATtiny25/45/85 Timer1 + USI ship in the library. What was missing was the
  per-chip register map, now `src/ecad/avrChips.ts`, read from the avr-libc
  headers inside the wasm toolchain (`iomxx0_1.h` for the 2560, `iom32u4.h`,
  `iotnx5.h`) and converted to avr8js's data-space addresses and interrupt
  slots:
  - **ATmega2560** - 256 KB flash, 8 KB SRAM (SP lands on RAMEND 0x21FF), ports
    A-L, timers 0-5, USART0-3, TWI, D13 = PB7.
  - **ATmega32U4** - 32 KB / 2.5 KB, timers 0/1/3, USART1, ports B-F,
    D13 = PC7. Timer4 (10-bit high-speed) is deliberately absent rather than
    wrong; `Serial` is USB CDC and is not emulated, so the run says so and
    binds `Serial1`.
  - **ATtiny85** - 8 KB / 512 B at 8 MHz, PORTB, Timer0 with its own TIFR/TIMSK
    bit layout and 1-word vector slots, plus the library's ATtiny Timer1. No
    USART and no TWI (USI only) - stated at run time instead of faked.
    Deploy/run/tick are chip-aware (`makeAvrChip`), the catalog declares `hex` for
    all three, and each ships a blink .hex aimed at its own LED pin. Proven by
    `__tests__/avrChips.test.ts` (13: profiles vs device headers, pin maps, blink
    execution on all four chips) and `e2e/ecad-hex-chips.spec.ts` (Mega,
    Leonardo and ATtiny85 light their LEDs in the running app).
- **Compiling for those chips stays 328P-only, and that is a toolchain limit.**
  The wasm builder hardcodes `-mmcu=atmega328p` / multilib `avr5` and links
  prebuilt Arduino core objects plus `crtatmega328p.o` and an avr5 libc; there
  are no 2560/32U4/ATtiny core objects or avr6/avr25 crt+libc to link. Linking
  the 328P objects into a "Mega" build would bake in Uno pin tables and 328P
  interrupt slots, so `ecad.buildFirmware` says exactly that (`avrBuildRefusal`)
  and points at the path that works: build in Arduino IDE, upload the .hex.
- **Still not emulated:** ESP32-S3/ESP8266 (Xtensa), STM32F1, Teensy, micro:bit
  and Due (ARM). Their firmware path is virtual tier + verified attached binary;
  the classic ESP32 (LX6) now boots real merged flash images (see above).
- Validation is structural (pins, wiring, part kinds), not electrical: no
  voltage/current/timing/address checks, and wiring is whatever the sim wires
  contain.
- Screen/servo behaviour is simulated at render-loop resolution, not at MCU
  clock resolution in the virtual tier.

Undone (scoped, not wishes):

- **Settings with no live effect** — `units` and `render`
  (standard/wireframe/xray/colorByBody/colorByMaterial) persist but have no
  consumer yet; they apply on next entry at best. Physics personality is the
  same: `magnetic` and `ghost` are declared in the model, only `realistic` is
  implemented in `EcadPhysics`.
- **No desk surface for the suit panel** — it is VR-only today, which breaks
  the exit-ramp rule (Law 2). The desk needs a Project Settings panel over the
  same `suitPanelFor` / `applySuitEdit` data.
- **Share links not routed** — `issueShareToken` / `roleForShareUrl` are pure +
  tested, but no `/project/:id/(view|enter)` route or URL parsing exists.
- **Full e2e suite not re-run in this window** — only the two new specs were
  run; run the whole suite in a quiet window.
- Nothing is committed: all of the above is uncommitted working tree.

## Phase 9 — Fastener / Thread (+ surf ops + query predicate tail)

Status: **landed + tested** (bolt M6 + screwHole M6 e2e green through the OCC
worker; 331 unit tests green; tsc + eslint clean on all touched files). Full e2e
37 passed / 1 skipped / 0 failed.

- `src/model/threadStandards.ts` — ISO 68-1 + ASME B1.1 + NPT tables.
- `src/model/headShapes.ts` — head/tip 2D profile (r,z).
- `src/model/fastenerPresets.ts` — 11 families × standard × head/tip, `resolvePreset`
  - `validateFastener`.
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
- **AVR long tail** — all four AVR chips now run uploaded .hex, but the
  in-browser compiler is 328P-only; ATmega32U4 Timer4 (10-bit) and USB CDC, and
  the ATtiny85's USI (so I2C/SPI displays there), are not modelled.
- **Native emulation for ESP32-S3/ESP8266, STM32F1 (Blue Pill), Teensy, nRF52,
  SAM3X** — they run the virtual tier with a verified attached image. RP2040 is
  covered by `rp2040js` (mask ROM not redistributable, so ROM-calling firmware
  is not guaranteed to boot), STM32F4 by `stm32f4-emu`, and the classic ESP32
  (Xtensa LX6) by the MIT `esp32sim` built from source (real mask ROM + merged
  flash boot, serial only). ESP32-S3 (LX7) and ESP8266 (L106) remain
  unemulated. None of the worker tiers has a Playwright spec yet — the adapters
  and their sim paths are covered by unit tests.
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

## In-world RF + component-level electrical layer (LANDED 2026-11-06, uncommitted)

Status: **landed + tested** — `src/ecad/radio.ts`, `src/ecad/circuit.ts`, new
catalog parts, sim integration and firmware demos. Full suite green (62 files /
477 tests), `tsc --noEmit` clean, `eslint` 0 errors, `npm run build` clean.

- **RF is a physical-layer link you build, not Wi-Fi.** `rf-tx-433` /
  `rf-rx-433` are ordinary peripherals: wire `DATA` to any board pin (or a
  button) and `OUT` to a pin, LED or another transmitter. Every edge goes
  through the medium (`radio.ts`): 433.92 MHz default channel, OOK edges,
  free-space path loss plus 25 dB/end implementation loss, -95 dBm
  sensitivity → ~31 m reach. `sim.tuneRadio(id, mhz)` moves a part;
  `sim.radioLink(tx, rx)` reports distance / RSSI / reach / hears;
  `sim.radioFrames()` is the over-air log; `ecad.tuneRadio` + `ecad.radio`
  expose both on the bus. Tuned channels persist in the ECAD snapshot.
- **Discrete parts are electrical elements, with continuous device models.**
  `circuit.ts` is a nodal (MNA) solver: resistor, capacitor, coil, diode, LED,
  NPN, N-MOSFET, battery. It runs on every `sim.tick`, driven by the pins
  firmware actually writes. LEDs light from solved forward current, and ADC pins
  on dividers feed `analogRead()` on both the virtual and compiled tiers.
  - diode/LED: Shockley junction (`Is`, `n`) + series resistance + reverse
    breakdown (Zener/avalanche) + voltage-dependent junction capacitance
  - NPN: Ebers-Moll with forward/reverse beta, Early voltage and junction
    capacitance — it amplifies in the active region and saturates when driven
  - MOSFET: Shichman-Hodges square law in triode and saturation, with
    channel-length modulation and gate capacitance
  - resistor/capacitor/coil/battery: Ohm's law and backward-Euler companions
  - boards keep separate grounds (GND pins are internally joined; boards share
    only when wired, an unwired board sits on the bench reference) and separate
    logic supplies (AVR 5 V, ARM/ESP 3.3 V) with `setSupply` overrides
  - `setTemperature` scales junction saturation current (a 1N4148 drifts about
    -2 mV/°C); `acSweep` linearises every device at the DC operating point and
    solves the complex nodal system for gain (dB) and phase over a sweep
    New parts: `resistor-220/1k/10k`, `capacitor-100u`, `capacitor-100n`,
    `coil-100mh`, `diode-1n4148`, `zener-5v1`, `transistor-2n3904`,
    `mosfet-2n7000`, `battery-5v`, `battery-9v`.
- **Compiled AVR firmware reads analog inputs.** `makeAvrChip` attaches
  avr8js's real `AVRADC` (every profile except ATtiny85, whose register map
  differs); `EcadSim` feeds solved probe voltages through `AvrEmulator.setAnalog`,
  mapping `A0`..`A15` to their ADC channel (including A4/A5, which also carry
  I2C). Proven by `__tests__/analogAvr.test.ts`: a hand-assembled ATmega328P
  program writes ADMUX/ADCSRA with `sts`, waits, reads ADCL/ADCH with `lds` and
  puts the high byte on PORTB, sampled from a solved 220 Ω/1 kΩ divider.
- **Bus/API surface:** `ecad.setSupply`, `ecad.setTemperature`, `ecad.ac`;
  `sim.nodeVoltage`, `sim.acSweep`, `sim.radioLink`, `sim.radioFrames`.
  Model tests: 11 in `circuit.test.ts` (divider, RC, coil, diode, NPN switch,
  virtual ADC, active-region bias, Zener clamp, temperature drift, AC low-pass,
  per-board supply) and 1 in `analogAvr.test.ts`.
- **Still open:** only NPN (no PNP); the MOSFET body diode and per-device
  self-heating are not modelled (`setTemperature` is one solver-wide junction
  temperature); diode capacitance is a depletion approximation with no
  diffusion capacitance or reverse recovery; no ESR/ESL, wire resistance or
  inductance, noise or Monte Carlo. AC analysis is a small-signal sweep at the
  DC operating point (no transient AC source or distortion analysis). ATtiny85
  still has no emulated ADC, and compiling for non-328P AVR chips is still
  unsupported. RGB LEDs light from pin levels rather than solved current. RF
  carries OOK edges with no bit timing, so framing, addressing and retries live
  in firmware — which is the point.
