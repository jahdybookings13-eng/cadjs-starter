# ScadGen — Subsystem Planning (new areas)

Scope: planning only. Does not touch existing VR/CAD code paths.

## 0. System-difference map (flu/rea vs PCB vs CAD world)

| Axis | Fluid/FEA (flu) | REA (reverse-eng) | PCB (electronics) | CAD world (scadgen) |
|---|---|---|---|---|
| Units | SI m/kg/s, field quantities | n/a (artifact) | mm, oz copper, mils | mm, mm (scadgen world units) |
| Geometry | mesh/volume grids | binaries/decompiled | 2.5D layers, traces | B-rep/mesh primitives |
| State | solver iterations | evidence ledger | netlist + layout | feature tree + scene |
| I/O | VTK/CGNS | tuples | Gerber/Excellon/BOM | STL/STEP/SCAD |
| Run | async solver | analysis | fab export | rebuild worker |

Bridge rule: every subsystem must round-trip through the ActionBus and feature tree; no side-channel state.

## 1. Patent drawing AI (USPTO)

- Source: USPTO Open Data Portal (data.uspto.gov) — Patent File Wrapper API + bulk granted/app XML; patentgrep for drawing pages; patent.dev MCP connector.
- Training data: granted patent PDFs + drawing sheets (PNG per page), captions from g_draw_desc_text; BigPatent (1.3M) for text; USPTO AI Patent Dataset.
- Rules to ingest (USPTO MPEP 608.02 / 37 CFR 1.84): black lines only, no shading except cross-section; margins; figure numbering; reference numerals; no text in drawings except labels; scale; sheet size; consistency across views; exploded views; flowcharts.
- Check GitHub first: search "patent drawing", "uspto drawing", "patent figure generation"; existing: patentgrep, pqai, bigpatent. Build as separate service consuming scadgen geometry -> rendered views -> rule checker -> PDF sheet.
- Deliverable: `services/patent-draw/` with renderer + rule validator + USPTO fetcher. Not in core repo yet.

## 2. Autodesk Civil 3D alternatives (clone + bridge)

Clone candidates (open source / free) into `vendor/civil/`:
- SaikeiCivil (github.com/saikeicivil/SaikeiCivil) — IFC 4.3 alignments, Blender-based
- FreeCAD + Road workbench
- QGIS + QGisRoadDesign / Hydra
- OpenAEC: Open Infra Studio, Open CAD Studio
- OSAFE workbench (FreeCAD)
- Topologic, Speckle (data bridge)

Bridge plan: import alignment/profile/corridor as scadgen feature nodes (splines, extruded corridors) via IFC/DXF; export back. Keep as adapter modules, not core deps.

## 3. PCB pipeline

- Design tools: KiCad (or trace fork) headless via kicad-cli + IPC; atopile/SKiDL for code-first; fragua for AI-native agent loop; ZapTrace for verified EDA.
- Pipeline: intent -> schematic (SKiDL/atopile) -> ERC -> placement -> routing (FreeRouting) -> DRC -> fab export (Gerber/Excellon/BOM/CPL) -> JLCPCB/PCBWay pack.
- Orchestration: awesome-pcb-workflow reference; KiBot for CI; pygerber for QA.
- Integration with scadgen: PCB as a component (Phase 9) with ports/connectors; 3D model via STEP; electrical metadata on feature nodes.
- Deliverable: `services/pcb/` adapter wrapping kicad-cli + atopile; REST/MCP surface.

## 4. 3D printer wizard (VR print)

- Targets: OctoPrint REST, Moonraker/Klipper, PrusaLink, Bambu Lab, Elegoo, Creality, Anycubic.
- Abstraction: OctoEverywhere plugin API (platform-agnostic: status, control, files, webcam) or SimplyPrint fleet API; OctoPrint native for local.
- Wizard steps: detect printer -> select profile (nozzle/bed/material) -> slice (OrcaSlicer/PrusaSlicer CLI) -> upload -> start -> monitor -> cancel/pause.
- VR UX: in-headset printer picker, progress, webcam view, abort. Print from VR to physical printer.
- Deliverable: `src/printers/` module with adapter interface + wizard UI; slicer invoked as external process.

## 6. GitHub findings — patent drawing / USPTO

- `TopLocalAI/PatentFig-AI` — AI patent drawing generator (text/sketch/photo -> USPTO-compliant line art, DXF/SVG/PDF/TIFF, 37 CFR 1.84). Commercial API + skill.
- `TopLocalAI/patentfig-skill` — Agent skill for PatentFig API (generate/vectorize/upscale/convert).
- `aonanj/drawing-agent` — SDXL QLoRA fine-tune pipeline for USPTO line art from patent text; OCR figure detection, Canny control maps; deprecated but code usable.
- `RobThePCGuy/Claude-Patent-Creator` — REFERENCE ONLY (MCP costs $); steal its Graphviz diagram_generator + formalities checker code, drop MCP/BigQuery paid parts.
- `mobrien133/patentdrawingproject` — patent claims -> USPTO-compliant Mermaid diagrams (web + CLI).
- `retroam/patentpilot` — disclosure -> USPTO-ready filing including formalized sketches.

Recommendation: FREE ONLY. Use Graphviz (from CPC, Apache license) + drawing-agent SDXL pipeline + USPTO free APIs; PatentFig optional paid tier, skip by default.

## 7. Next actions (ordered)

1. Create `docs/` plan files (this file) — done.
2. Prototype patent-draw service skeleton (separate repo).
3. Clone civil alternatives into `vendor/civil/` (git submodules) — not yet.
4. PCB adapter spike against KiCad headless.
5. Printer adapter spike against Moonraker.
6. Wire each into ActionBus only after VR core stable (Phase 9/10).

## 8. Integration design — combined patent-draw pipeline

Layered stack (bottom -> top):

1. **Data + rules (FREE only, no Claude MCP)**
   - USPTO Open Data Portal APIs (data.uspto.gov) + PatentsView bulk + patentgrep for drawings.
   - PQAI (projectpq.ai) for patent search; Google Patents public data (BigQuery free tier).
   - Local rule checks: 37 CFR 1.84 / MPEP text mirrored locally; no paid MCP.

2. **Training data (from drawing-agent)**
   - `src/training/parse_xml.py`, `img_norm.py`, `control.py`, `prompt.py`, `build_dataset.py`, `index_docs.py`.
   - Produces JSONL samples (image + canny control + structured prompt) for SDXL QLoRA fine-tune.
   - USPTO bulk XML + TIFF pages as source; Postgres/Neon indexing.

3. **Diagram generation (drawing-agent SDXL + standalone Graphviz + patentdrawingproject Mermaid)**
   - Mermaid (patentdrawingproject) for quick claims->diagrams.
   - Graphviz standalone (code borrowed from CPC, no MCP) for flowcharts/block diagrams.
   - SDXL fine-tune (drawing-agent) for raster USPTO line art.
   - PatentFig-AI API (external) for production rendering/compliance export.

4. **ScadGen adapter (new, in-repo)**
   - `src/patent/` module: export geometry (primitives/assemblies) -> views -> diagram requests.
   - Calls USPTO/PQAI free endpoints for prior art; PatentFig API (optional paid) for render; drawing-agent models for local generation.
   - ActionBus actions: `patent.generateFigure`, `patent.checkCompliance`, `patent.exportSheet`.

Unified flow:
```
scadgen geometry -> views (SVG/DXF) 
  -> local rules (37 CFR 1.84) + USPTO free APIs: claims analysis + formalities
  -> PatentFig/drawing-agent: render USPTO-compliant figures
  -> export PDF/TIFF sheet (37 CFR 1.84)
```

Files to create (next step):
- `src/patent/index.ts` (adapter facade)
- `services/patent-draw/` (Python service wrapping drawing-agent + MCP client)
- `vendor/` already cloned (drawing-agent, Claude-Patent-Creator, patentdrawingproject)

Constraints: keep vendor as git submodules later; don't modify VR core.

## Constraints

- Do not modify existing VR/CAD code; keep all new work in new dirs/services.
- Preserve uncommitted changes in cadjs-starter; this doc is additive only.

---

## Phase 7 — Flux Parity (100% integrated, not a side project)

**Status: not started. This is the active priority.**

Goal: Flux (the RE'd flux.ai surface) is no longer a stand-alone reference. It is a
first-class subsystem inside scadgen — a "project inside a project" — fully usable
from VR and from the desk, on par with the Onshape layer. A circuit-only user and a
CAD-only user both get the full surface.

### What "Flux" is (from RE evidence — `~/Desktop/FLUX_RE_FINDINGS_2026-11-04.md`)

Flux = an agent-hosting design IDE with two first-class domains:
- **MCAD**: step/stp/iges/brep/gltf/scad/build123d/cadquery/fabricator/formats;
  editable CAD code + rebuild; ECAD↔MCAD co-design (board follows enclosure and
  vice-versa); tolerance stack-up; tool-access checks.
- **PCB (ECAD)**: SchematicObjects tree, PcbGlobalRules (cascade/inherit rule
  sets), rigid-flex, nets, layers, zones, components, BoM, Gerber export,
  SPICE (Shortcircuit simulator).
- **Copilot/agent layer**: prompt-registry of semantic actions (addResistor,
  addHBridge, addRCFilter, runErcDrc, currentAnalysis, activeFilterAnalysis,
  circuitRobustnessAnalyzer, whatIfScenarioExplorer, designSpaceOptimization,
  verifyPartDetails, checkAvailability, recommendMpn, createPinMapping,
  generate_firmware_skeleton, read_datasheet, find_parts, simulate_circuit…).
  Typed selection contracts (`requireAnyToDesignator`, `requireExactlyTwoToPair`)
  and submenu groups (addSubcircuit, componentAnalysis, detailedReviews,
  manufacturingPrep, advancedSimulation).
- **Backend**: Firebase Firestore channels (chat_threads, messages, jobs,
  sentinels, thoughts, suggestions, project_docs, nets, versions); 139 HTTPS
  Cloud Functions (agent, MCP host, BYO computer, manufacturing, datasheets,
  typesense parts search).
- **MCP**: `https://app.flux.ai/mcp` (both server + host); GitLab connector.

### What to build (module map)

New top-level dir: `src/flux/` (subsystem of scadgen, **not** a separate repo).

```
src/flux/
  index.ts              — public facade + FLUX_ACTIONS + runFlux()
  agent/
    orchestrator.ts     — single conductor; routes user intent -> sub-agents
    loop.ts             — one agent loop (tool-call, trace, satisfaction)
    registry.ts         — prompt-registry: action id -> {prompt, selectionMode,
                          submenuGroup, context contract, tool schema}
    context.ts          — typed context contracts (selectionMode enum, doc, tree)
    trace.ts            — trace store (per-agent, replayable via __vrMechanics)
  domains/
    pcb/                — mirrors SchematicObjects + nets + components
      project.ts        — doc model (root, layout, element, via, pad, net, zone…)
      rules.ts          — PcbGlobalRules (cascade/inherit, typed selectors)
      erc.ts            — ERC/DRC pure checks (no kernel)
      spice.ts          — Shortcircuit engine client (transient tStart/tEnd/minStep/maxStep)
    mcad/               — mirrors Flux MCAD (co-design; reuses scadgen kernel)
      coDesign.ts       — board↔enclosure follow links
      formats.ts        — format matrix (scad, build123d, cadquery, …) adapters
  mcp/
    client.ts           — MCP client to app.flux.ai/mcp (OAuth bearer)
    host.ts             — scadgen as MCP host (GitLab connector later)
  vr/
    chatPanelCanvas.ts  — 3D floating chat window (paramPanelCanvas.ts twin)
    vrChatPanel.ts      — CanvasTexture mesh in VR room; raycast hit -> message
                          ONE panel per file/project (the orchestrator window),
                          not one per agent. Sub-agents post INTO it.
  ui/
    chatPanel.tsx       — desk-side React chat per agent
    orchestratorView.ts — main thread that delegates
  bus/
    actions.ts          — FLUX_ACTIONS (id -> handler) for the ActionBus
    bridge.ts           — registerFluxOnBus(bus, scene, agents)
```

### How it wraps (integration — no side-channel state)

- **ActionBus**: `createSceneBus` already owns the registry. Add a `bus.register`
  pass for every `FLUX_ACTIONS` id; the handlers call `runFlux(action, ctx)` which
  calls the right sub-agent or pure domain fn. Same contract as the manufacture bus.
- **Feature tree / history**: PCB + MCAD entities map to `ScadgenFeatureNode`
  (new namespaces: `pcb.*`, `flux.*`). Provenance via the existing
  `ProvenanceQuery` model. Undo/redo reuses `scadgenHistory`.
- **VR**: `useVRSession` mounts the VR room; add a `ChatPanelSpawner` that mounts
  **one** `vrChatPanel` per open file/project (the master orchestrator window).
  Sub-agents (pcb, mcad, sim, parts, firmware) post messages INTO that single
  panel — the user talks to one window, the orchestrator fans out and
  aggregates. No per-agent panels. Chat input goes through the existing
  paramPanelCanvas hit-test path, or a new `vrChatInput` pad. Voice is the same
  bus command, just a different input source.
- **Rebuild**: PCB edits that touch MCAD (enclosure follows board) call the
  operator via `operationMenu` / `featureEngine` — same path the desk uses.
- **Backend seam**: local-first. Firestore/Cloud Functions are optional adapters
  behind `src/flux/backend/` (no-op stub if no firebase config). Core parity
  (agent loop + prompt registry + domain checks) must run in the browser.

### Phases (ordered)

1. **Skeleton + bus pass** — create `src/flux/` with `index.ts`, `bus/actions.ts`,
   `bus/bridge.ts`; register FLUX_ACTIONS on the bus. No behaviour yet (honest
   placeholders, same pattern as manufacture).
2. **Prompt registry + orchestrator** — port the flux prompt-registry (action
   id, selectionMode, context contract, tool schema) as data in `registry.ts`;
   `orchestrator.ts` routes by `submenuGroup` + `selectionMode`.
3. **PCB domain (pure)** — `project.ts` (tree ops), `rules.ts` (ERC rules),
   `spice.ts` (client, no local solver). Drive it from the orchestrator so
   `addResistor` → tree update → ERC → auto-reply.
4. **MCAD co-design** — reuse `@vitekk02/cadjs`; `coDesign.ts` keeps
   board↔enclosure links; `formats.ts` adapters for the format matrix.
5. **VR chat panel** — `chatPanelCanvas.ts` (pure canvas, tested like
    paramPanelCanvas), `vrChatPanel.ts` (mesh + raycast + input pad), wire into
    `useVRSession`. **One panel per open file/project** = the master orchestrator
    window. Every agent thread renders INTO it (thread markers inline). No
    per-agent panels: the window is the conversation, the orchestrator is the
    only speaker the user sees; delegation happens below it.
6. **Desk chat UI** — `chatPanel.tsx` + `orchestratorView.ts`, share the same
   event bus as VR.
7. **MCP client + host** — `mcp/client.ts` (OAuth + tool call), `mcp/host.ts`
   (expose scadgen tools to GitLab/others).
8. **Firestore adapter (optional)** — `backend/` for persistence; off by default.

### What "100% parity" means here

- Every prompt-registry action in the RE'd flux bundle is callable from:
  (a) the desk chat UI, (b) the VR chat panel, (c) the ActionBus by id,
  (d) voice.
- The orchestrator is the single entry; sub-agents (pcb, mcad, sim, parts,
  firmware) are reached by delegation, not by the user typing a domain-specific
  command.
- **One chat window per file/project.** The floating panel (VR or desk) is the
  master orchestrator conversation. Sub-agents never get their own window —
  they post messages into the same window with a thread/agent tag. The user
  sees one stream, one input, one place to talk. This is non-negotiable.
- PCB-only users get the full MCAD co-design surface; CAD-only users get the
  full PCB surface. Same tree, same bus, same VR.

### Reference anchors (evidence)

- `~/Desktop/FLUX_RE_FINDINGS_2026-11-04.md` — primary source (bundle, prompt
  registry, functions, formats, MCP, backend).
- `src/flux/registry.ts` — the concrete action list to transcribe.

### Undone (this phase, ~8 steps)

1. `src/flux/` skeleton + bus pass (placeholders).
2. Prompt-registry port (data, all actions from RE).
3. Orchestrator + one agent loop (text, no tool-call yet).
4. PCB `project.ts` + `rules.ts` (pure, unit-tested).
5. `spice.ts` client (endpoint + payload, no solver).
6. `coDesign.ts` + `formats.ts` (MCAD glue on existing kernel).
7. VR chat panel (canvas + mesh + input) in `useVRSession` — **one panel per
   file/project**, the master orchestrator window; sub-agents post into it.
8. Desk chat UI + orchestrator view (React).
9. MCP client (OAuth + one real tool call).
10. Optional Firestore adapter + persistence.

### Constraints (this phase)

- No new top-level repo. `src/flux/` inside cadjs-starter.
- No side-channel state: PCB tree must live in `scadgenHistory` (or a sibling
  `pcbHistory` with the same provenance model).
- No paid MCP by default; local pure checks only.
- VR chat panel reuses `paramPanelCanvas` hit-test code (extract if needed).
