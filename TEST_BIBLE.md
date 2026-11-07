# TEST_BIBLE

Primary-function checklist for ScadGen.

This is not a command sheet. The 603 passing automated checks (plus 4 skipped) are the regression net;
this file distils them into the **primary functions a person must confirm with
their own eyes** before release. One line = one behaviour. Work top to bottom,
one at a time, and mark it.

- `[ ]` not checked yet
- `[x]` confirmed — you saw it work
- `[!]` failed — write what happened next to it
- `OPEN` means the function is specified but not built; do not mark it.

A section is signed off only when every line is `[x]` or `OPEN`. A passing unit
test is evidence, not confirmation. If you cannot observe it in the app or the
headset, it stays unchecked.

---

## A — Boot, projects, persistence

- [ ] **A1** Cold start reaches a usable 3D viewport, not a blank canvas.
- [ ] **A2** First boot creates exactly one active project.
- [ ] **A3** Reload reopens that same project; no duplicate is created.
- [ ] **A4** Creating, renaming and deleting a project works, and the active project follows.
- [ ] **A5** A legacy single-document design migrates into a project exactly once.
- [ ] **A6** Personal settings override project defaults without changing the shared project for anyone else.
- [ ] **A7** Save, reload, and the model tree, features, dimensions and ECAD scene all come back.
- [ ] **A8** A deliberately corrupted saved project is rejected without taking the app down.
- [ ] **A9** Undo and redo walk a multi-feature chain forwards and backwards without losing geometry.
- [ ] **A10** The document tab bar creates a second Part Studio; each tab keeps its own bodies, and switching restores them.
- [ ] **A11** Renaming, duplicating, reordering and deleting tabs works; the last tab cannot be deleted, and a reload reopens the same active tab with its geometry.
- [ ] **A12** The Documents page creates, opens, renames, duplicates, exports, trashes and restores a local document; the change survives reload through IndexedDB.
- [ ] **A13** A corrupt localStorage mirror is replaced from the good IndexedDB copy on reload instead of hiding the document.
- [ ] **A14** A full or unavailable localStorage write shows a clear storage error and leaves the last good save intact.
- [ ] **A15** A named snapshot survives reload and restores the document's geometry when applied.
- [ ] **A16** Tab search filters the bar; Alt+Arrow reorders, drag reorder lands at the target, and panel multi-select duplicates the selected tabs.

## B — Viewport and navigation

- [ ] **B1** Orbit, pan and zoom move the camera only; geometry never moves.
- [ ] **B2** View cube faces and corners snap the camera to the expected view.
- [ ] **B3** Standard views (front, top, right, iso) match their labels.
- [ ] **B4** Selecting a plane from the plane selector highlights the correct plane.
- [ ] **B5** Section view cuts where the plane sits and can be turned off.
- [ ] **B6** Measure reports the real distance, angle and radius of picked geometry.
- [ ] **B7** The status bar reports selection count and units truthfully.

## C — Sketching and constraints

- [ ] **C1** A rectangle can be drawn on a plane and closed.
- [ ] **C2** Line, circle and arc tools create editable geometry; there is no polyline tool yet.
- [ ] **C3** A dimension drives the geometry: change 10 mm to 20 mm and the sketch doubles.
- [ ] **C4** Coincident, horizontal, vertical, perpendicular and tangent constraints behave as named.
- [ ] **C5** Over-constraining is reported, not silently accepted.
- [ ] **C6** Trim removes the segment past an intersection; extend reaches the nearest target.
- [ ] **C7** The constraint menu only offers constraints valid for the current selection.
- [ ] **C8** A sketch on a planar face attaches to that face.
- [ ] **C9** A sketch on a curved face is refused, as Onshape refuses it.
- [ ] **C10** Editing a sketch re-solves downstream features rather than freezing them.
- [ ] **C11** Ctrl+K opens the command palette and lists every implemented 2D tool and constraint.
- [ ] **C12** Typing LINE, REC, CIRCLE or TRIM finds the matching command; Enter runs it.
- [ ] **C13** A command that needs a selection or undo history is visibly disabled with a stated reason.
- [ ] **C14** F1/? lists the full control map and names the unsupported AutoCAD tools as gaps, with no dead buttons.
- [ ] **C15** Image attaches a raster underlay; Underlay moves, scales, fades and deletes it, and the image survives finish/reopen.
- [ ] **C16** Include turns the selected body's analytic plane section into editable sketch points and lines on the active plane.
- [ ] **C17** Break splits a line, arc, circle, elliptical arc, spline, Bezier and conic into two real primitives.

## D — Features and primitives

- [ ] **D1** Box, cylinder, sphere, torus and cone each produce a closed solid.
- [ ] **D2** Box midplane and opposite-direction options place it on the expected side.
- [ ] **D3** Extrude with a valid profile produces the stated depth.
- [ ] **D4** Revolve around the chosen axis produces the expected body.
- [ ] **D5** Sweep follows the chosen path.
- [ ] **D6** Loft needs two profiles and produces a body between them.
- [ ] **D7** Boolean add, cut and intersect give the expected result and keep provenance.
- [ ] **D8** Fillet rounds the picked edges; changing the radius updates the same feature.
- [ ] **D9** Variable-radius fillet stores and applies per-edge radii.
- [ ] **D10** Chamfer cuts the picked edges at the stated distance.
- [ ] **D11** Mirror reflects the source body across the chosen plane.
- [ ] **D12** Linear, circular and curve patterns place the stated count with the stated spacing.
- [ ] **D13** Move face, delete face, split, section and thicken act on the picked faces.
- [ ] **D14** Project curves lands curves on the target face.
- [ ] **D15** STEP import brings in a real body that can then be measured and edited.
- [ ] **D16** A feature built from a missing or ghost profile reports ERROR instead of producing a bogus body.
- [ ] **D17** Rolling back a boolean hides the tool result and unhides it when the error clears.

## E — Parameters and variables

- [ ] **E1** Expressions respect precedence, parentheses and units.
- [ ] **E2** A variable can be defined and used by a later feature.
- [ ] **E3** Changing a variable updates every consumer.
- [ ] **E4** Mixing a length with an angle is rejected with a reason.
- [ ] **E5** A bad expression marks the feature or variable as ERROR with the reason visible.
- [ ] **E6** The parameter panel edits values and expressions in place.
- [ ] **E7** Quantity edits clamp to their declared min/max; booleans toggle.
- [ ] **E8** Variable-driven rows are marked and are not also edited as plain numbers.

## F — Selection and topology

- [ ] **F1** Clicking a face, edge or body selects exactly that sub-element.
- [ ] **F2** The right-click menu for a face, edge and body offers the operations that apply.
- [ ] **F3** A face tag survives a rebuild when the topology is unchanged.
- [ ] **F4** When face order shifts, tags are remapped rather than silently reassigned.
- [ ] **F5** Ambiguous topology is left unknown; the app does not guess.
- [ ] **F6** Picking a face on a sibling body reports the correct owner.
- [ ] **F7** Hidden helpers and tool previews cannot be picked as model geometry.

## G — Assemblies

- [ ] **G1** Coincident mates bring origins together with near-zero residual.
- [ ] **G2** Concentric mates align axes.
- [ ] **G3** Distance mates hold the requested gap.
- [ ] **G4** Two mates between the same pair are flagged as over-constrained.
- [ ] **G5** Degrees of freedom drop as mates are added.
- [ ] **G6** Moving or removing an instance updates the mate graph and serialises back cleanly.
- [ ] **G7** The example arm reaches its target pose.

## H — Fasteners and threads

- [ ] **H1** All 11 fastener families are offered.
- [ ] **H2** All 13 head shapes and 6 tip styles are offered where valid.
- [ ] **H3** ISO M6 coarse resolves to 1 mm pitch and the documented thread depth.
- [ ] **H4** Unified and NPT sizes resolve with their own depth rules.
- [ ] **H5** Engagement scales thread depth correctly.
- [ ] **H6** An impossible family/standard/head/tip combination is rejected, not quietly built.
- [ ] **H7** An M6 bolt and its screw hole cut real geometry through the kernel.
- [ ] **H8** Clearance-fit choices match the ISO 273 family.
- [ ] **H9** Countersunk, pointed and partially threaded tips produce visibly different profiles.

## I — Manufacturing, drawings and patent sheets

- [ ] **I1** Bounding box, face and edge counts match the body.
- [ ] **I2** All six box faces are recognised as planar with four corners.
- [ ] **I3** Front, top and right projections keep the correct up/right axes.
- [ ] **I4** DXF output is R12 with the GEOM, ANNO and FRAME layers.
- [ ] **I5** Each view writes one line per projected edge.
- [ ] **I6** The DXF title block carries title, author, date and notes.
- [ ] **I7** General tolerance appears in the notes block.
- [ ] **I8** DXF output is byte-identical when repeated.
- [ ] **I9** A USPTO sheet is Letter size with the applicant and sheet count in the header.
- [ ] **I10** Figures carry FIG. labels, reference numerals and the compliance panel.
- [ ] **I11** Multiple figures split across sheets at the configured limit.
- [ ] **I12** Patent pre-flight flags a missing title, missing applicant, empty figure, bad FIG. label and reused numeral.
- [ ] **I13** STL, STEP, DXF and SVG exports each return the right format and open in a viewer.

## J — Print pipeline

- [ ] **J1** Printer detection reaches a profile step.
- [ ] **J2** Selecting a profile advances to slicing.
- [ ] **J3** Slicing produces an estimate and advances to upload.
- [ ] **J4** Uploading without a target or STL errors clearly.
- [ ] **J5** The estimate grows with model volume.
- [ ] **J6** The monitor step stays active while a job reports printing.
- [ ] **J7** Each printer kind resolves its own adapter.

## K — ECAD design and build

- [ ] **K1** The catalog covers the major MCU board families and display classes.
- [ ] **K2** Part ids are unique and every part has complete metadata.
- [ ] **K3** Every board has usable power and ground pins.
- [ ] **K4** Runtime tiers are honest: emulated, binary-only and delivery-only are not mixed up.
- [ ] **K5** Every firmware reference on every part resolves.
- [ ] **K6** Universal sketches appear for every board; board-specific ones only where valid.
- [ ] **K7** Every board provides the pin constants its sketches use.
- [ ] **K8** A part can be placed, moved and removed.
- [ ] **K9** Removing a part removes its wires.
- [ ] **K10** Wiring enforces pin compatibility; an unknown pin or a self-wire is refused.
- [ ] **K11** An LED wired to a board pin follows that pin's state.
- [ ] **K12** An I2C OLED receives text into its buffer.
- [ ] **K13** A button press reaches the running firmware.
- [ ] **K14** Serial output accumulates per board.
- [ ] **K15** Studio reports ready, needs-work or blocked, and the reason matches the code and wiring.
- [ ] **K16** The ECAD panel and the bus report the same verdict.
- [ ] **K17** The BOM groups identical parts and lists their designators.
- [ ] **K18** Passive consolidation finds the same value with multiple MPNs.

## L — Electrical simulation

- [ ] **L1** A resistor divider produces the calculated ADC voltage.
- [ ] **L2** A capacitor charges through a resistor over time, not instantly.
- [ ] **L3** A coil ramps its current instead of jumping to steady state.
- [ ] **L4** A reverse-biased diode blocks.
- [ ] **L5** A forward LED carries a physically plausible current.
- [ ] **L6** An NPN switches a lamp from a GPIO pin.
- [ ] **L7** An NPN biased in forward-active sits at Vbe 0.55–0.85 V with the collector mid-rail.
- [ ] **L8** A 5.1 V Zener clamps within 4.7–5.6 V.
- [ ] **L9** A 1N4148 drifts 0.1–0.2 V over a 73 °C rise.
- [ ] **L10** The running firmware reads the solved divider through analogRead, not a stub.
- [ ] **L11** An RC low-pass shows about −3 dB and −45° at 1592 Hz.
- [ ] **L12** A 25-point AC sweep returns gain and phase for every point.
- [ ] **L13** An AVR board keeps 5 V and an ESP board 3.3 V unless overridden per board.
- [ ] **L14** Overriding one board's supply does not change another board's.
- [ ] **L15** Temperature changes device behaviour without changing the wiring.
- [ ] **L16** Removing a wire or part updates the solve on the next tick.

## M — Firmware and microcontrollers

- [ ] **M1** Intel HEX parses and re-serialises without changing the program.
- [ ] **M2** The shipped Uno blink HEX toggles D13 with the designed period.
- [ ] **M3** The same HEX runs identically when assembled fresh.
- [ ] **M4** Uno blink uses PB5, Mega PB7, Leonardo PC7 and ATtiny85 PB1.
- [ ] **M5** Mega exposes 256 KB flash, 11 ports and timers 0–5; Leonardo has no Timer2.
- [ ] **M6** An unknown MCU has no profile and is refused rather than guessed.
- [ ] **M7** Catalog pin mappings win where a board declares its own port/bit.
- [ ] **M8** A hand-written 328P program reads a solved divider through ADCL/ADCH into PORTB.
- [ ] **M9** SSD1306 and SH1106 GDDRAM bytes appear as the right pixels.
- [ ] **M10** Servo pulses arrive at 1–2 ms and are clamped at the ends.
- [ ] **M11** Serial is normalised across AVR, RP2040 and ESP32 tiers.
- [ ] **M12** Arduino C++ is recognised as C++, not as a broken JS sketch.
- [ ] **M13** The in-browser C++ build injects the right preamble and pin constants.
- [ ] **M14** Setup/loop, helper functions and user-defined constants survive the preamble.
- [ ] **M15** A compile error reports the first real error, stripped of tool prefixes.
- [ ] **M16** A C++ blink compiles, deploys and toggles a wired LED in the browser.
- [ ] **M17** Wire, Servo and Serial reach the OLED, servo and serial log.
- [ ] **M18** A non-328P target is refused instead of linked with the wrong binary.
- [ ] **M19** A hostile `while(true)` sketch does not freeze the page; rendering continues.
- [ ] **M20** ESP32 boots a merged flash image through the mask ROM and shows its serial banner.
- [ ] **M21** MicroPython on the simulated ESP32 drives a GPIO edge and lights a wired LED.
- [ ] **M22** ESP32 refuses an app-only image, wrong core, wrong container and oversized image.
- [ ] **M23** RP2040 boots a raw image and a UF2, drives GPIO25, and lights a wired LED.
- [ ] **M24** RP2040 refuses an image with no boot vector or one larger than flash.
- [ ] **M25** STM32F4 boots real firmware, prints its USART banner and drives PC13.
- [ ] **M26** A UF2/ELF/raw image is verified against its board: machine type, family, entry point, flash/RAM bounds.
- [ ] **M27** A verified image for an unemulated MCU reports binary-attached, never running.
- [ ] **M28** An image pushed at the wrong architecture is refused.
- [ ] **M29** An ECAD snapshot restores parts, wires, firmware text and radio channels exactly.
- [ ] **M30** Unknown parts and stale wires are dropped on restore; corrupt snapshots are rejected.

## N — In-world RF

- [ ] **N1** Two radio boards link at roughly 31 m at default power.
- [ ] **N2** Moving past reach drops frames.
- [ ] **N3** Retuning moves the channel; off-channel links do not deliver.
- [ ] **N4** Every delivered edge appears in the frame log.
- [ ] **N5** Firmware sees the link as a real input, not a direct function call.
- [ ] **N6** Radio tuning survives a snapshot round-trip.
- [ ] **N7** A non-radio part is refused as a radio.

## O — VR physical world

- [ ] **O1** A board's rendered size matches its real millimetres at 1:1.
- [ ] **O2** Millimetre-to-metre conversion happens once; a giant board is rejected.
- [ ] **O3** Board mass comes from its volume and FR4 density.
- [ ] **O4** A dropped board rests on the desk instead of tunnelling through it.
- [ ] **O5** Grabbing makes a board kinematic; it stays where the hand holds it.
- [ ] **O6** Releasing makes it dynamic again and it falls back to the desk.
- [ ] **O7** Throwing carries the hand's velocity, clamped to 0.3–5 m/s.
- [ ] **O8** The circuit card stays pinned to the held board.
- [ ] **O9** The card describes the board that is actually wired and paints deterministically.
- [ ] **O10** The suit/parameter panel edits live values and clamps them to their bounds.
- [ ] **O11** Panel edits rebuild the room while keeping board bodies intact.
- [ ] **O12** The second desk appears where expected and does not fall through the floor.
- [ ] **O13** Room boundaries exist on all sides and the ceiling.
- [ ] **O14** Entering and leaving VR restores the desktop view without leaking physics bodies.

## P — Agent, flux and controls

- [ ] **P1** Every menu action is reachable by its action id.
- [ ] **P2** An unknown or unwired action fails loudly instead of doing nothing.
- [ ] **P3** A flux turn shows intent, tool call, tool result and satisfaction in order.
- [ ] **P4** A brain failure becomes an error row, not a crash.
- [ ] **P5** Every action key routes to its owning sub-agent.
- [ ] **P6** The selection contract blocks a turn that needs two bodies when only one is selected.
- [ ] **P7** ECAD prompt actions are registered and run local-first.
- [ ] **P8** Desk, VR and the agent all reach the same Flux thread and produce the same trace.
- [ ] **P9** BOM, voltage divider, RC filter, LC resonance and tolerance stack give the documented numbers.
- [ ] **P10** Monte Carlo is deterministic for a seed and stays inside the tolerance band.
- [ ] **P11** Board-to-enclosure links resolve in both parameterised and rigid modes.
- [ ] **P12** A fastener that cannot reach is flagged by the approach check.
- [ ] **P13** An MCP tool call serialises, validates required args, and rejects a missing one.
- [ ] **P14** An unknown MCP tool returns an error rather than a fabricated result.

### Voice and regular controls — OPEN, not built

- [ ] **P15** `OPEN` Text transcript maps to intent: add part, wire pins, run/stop, validate, build, set supply, set temperature, read node voltage, tune radio, AC sweep, save.
- [ ] **P16** `OPEN` Spoken designators resolve against placed instances; ambiguity asks instead of guessing.
- [ ] **P17** `OPEN` Confirmation is shown and spoken; remove and firmware overwrite require an explicit yes.
- [ ] **P18** `OPEN` Keyboard and VR controller maps dispatch the same action ids, with no logic in the listener.
- [ ] **P19** `OPEN` Microphone audio never leaves the device without an explicit provider choice.
- [ ] **P20** `OPEN` VR push-to-talk works from the controller, shows listening, and has a cancel word.
- [ ] **P21** `OPEN` Unit tests feed text at the transcript boundary and need no microphone.

## Q — Collaboration

- [ ] **Q1** The host starts seated and a joining peer gets its own seat and colour.
- [ ] **Q2** Rejoining a peer upgrades the seat instead of duplicating it.
- [ ] **Q3** Selection, surface and heartbeat from a peer appear and then time out after 25 s.
- [ ] **Q4** Leaving removes the seat cleanly.
- [ ] **Q5** Both share-link forms parse: view and enter, with a token.
- [ ] **Q6** `OPEN` A share link actually routes to the project; today it only parses.
- [ ] **Q7** `OPEN` Two machines collaborate; today the transport is BroadcastChannel in one profile.

## R — Release health

- [ ] **R1** Type checking is clean.
- [ ] **R2** Linting has zero errors.
- [ ] **R3** The full unit suite passes with no unexpected skips.
- [ ] **R4** The production build completes.
- [ ] **R5** Initial JavaScript stays under 0.8 MB gzip and 3.5 MB raw; CSS under 20 KB gzip.
- [ ] **R6** The divider solve stays under 250 µs/tick, transistor+LED+cap under 400 µs/tick, AC sweep under 4 ms.
- [ ] **R7** Chromium browser gates pass; Firefox and WebKit pass the boot/sketch/undo smoke set; flaky VR specs pass twice.
- [ ] **R8** A cold load on the target headset reaches the viewport without a console crash.
- [ ] **R9** `npm run check:controls` reports 255 visible controls, zero dead and zero unlabeled; adding a handler-less button makes it fail.
- [ ] **R10** `npm run check:parity` reports 97 capability rows, all with an owner and acceptance evidence; an invalid status makes it fail.
- [ ] **R11** `npx playwright test e2e/perf-budget.spec.ts --project=chromium` passes boot ≤12 s, document reload ≤15 s, box regeneration ≤5 s and orbit ≥30 fps.

---

## Known limits — do not mark these as working

- PNP transistors, MOSFET body diode, per-device self-heating, diffusion capacitance, ESR/ESL, wire parasitics, noise and Monte Carlo transient analysis.
- ATtiny85 ADC; compiling for AVR chips other than the 328P.
- ESP32 Wi-Fi association with the stock blob; classic ESP32 BLE advertising.
- RP2040 mask-ROM calls; native emulation of STM32F1, Teensy, micro:bit and Due (they are binary-verified only).
- Two-machine collaboration, share-link routing and CRDT editing.
- Visual polish, comfort, in-headset latency and long-session stability need a device pass.
- Voice control in every form: parser, keyboard map, push-to-talk and provider choice.

## Sign-off

- Build tested: **\*\*\*\***\_\_\_\_**\*\*\*\***
- Browser / headset: **\*\***\_\_**\*\***
- Checked by: \***\*\*\*\*\***\_\***\*\*\*\*\***
- Date: \***\*\*\*\*\*\*\***\_\_\_\***\*\*\*\*\*\*\***
- Sections signed off: **\*\***\_**\*\***
- Open failures carried forward: \_\_\_
