# ONSHAPE_PARITY — in-browser designer parity

Status: **scope frozen; Phase 1 (document shell) started 2026-11-06**
Baseline date: **2026-11-06**
Target: **Onshape's browser designer (desktop web), current production behaviour**
Current product: **ScadGen / cadjs-starter**

Parity here means **everything a user can do inside the designer and every
control in the browser UI**. It does **not** mean Onshape's cloud platform.
There is no API, App Store, account system, cloud storage, real-time
collaboration, PDM/release workflow or hosted operations in this scope. All
state is local to the browser and local files.

This document is the contract for that scope. It is deliberately larger than
one release. Reading it should make the remaining work obvious, measurable, and
impossible to hand-wave.

## 0. The honest answer

ScadGen is **not** at 100% in-browser designer parity and cannot get there in a
single working session.

Removing the cloud platform removes years of backend, PDM, collaboration and
enterprise work, but the designer itself is still a deep CAD application. A
credible program is **15–25 engineer-years** for near-complete in-browser
designer coverage, or roughly **2–4 years with 8–12 engineers**. A 6–9 person
team can reach a credible 70–80% core-modelling subset in **12–20 months**, but
that is still not 100%.

The only honest “tonight” deliverable is:

1. A frozen scope and control/feature matrix.
2. A 1:1 UI information architecture for the designer.
3. A gap assessment against the current code.
4. A sequenced work breakdown with acceptance gates.
5. No fake buttons and no claims of parity the app cannot demonstrate.

This file is that deliverable. Implementation status is in section 9.

### Scope boundary (explicit)

| Excluded                                                 | Why                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| API, webhooks, App Store, OAuth apps                     | Platform/extensibility surface, not designer UI                          |
| Accounts, SSO, MFA, organizations, permissions           | Cloud identity and administration                                        |
| Cloud document storage, sync, thumbnails, hosted assets  | Local browser storage and local files are the storage model              |
| Real-time multi-user editing, presence, comments         | Collaboration service, not a modelling control                           |
| Sharing links, public/private documents, notifications   | Cloud access control                                                     |
| Versions, branches, merge, release candidates, approvals | Cloud PDM and release management. Local named snapshots **are** in scope |
| Billing, SLAs, data residency, backups, audit logs       | Hosted operations                                                        |
| Native iOS/Android applications                          | Out of the browser                                                       |
| Onshape trademarks, icons, artwork, proprietary code     | Not copied. Behaviour and layout only                                    |

## 1. What “parity” means

Parity is measured on six axes. A feature is not “done” because a button exists.

| Axis          | Definition                                                             | Evidence required                            |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| Functional    | Same user outcome, same inputs, same failure behaviour                 | Automated feature test plus manual checklist |
| Interaction   | Same selection, preview, confirm/cancel, edit and undo behaviour       | Browser interaction test                     |
| Visual        | Same information hierarchy and panel/toolbar placement                 | Screenshot review at supported sizes         |
| Data          | Same document/tab/feature/history semantics, surviving save and reload | Round-trip and recovery tests                |
| Performance   | Same practical latency for orbit, regenerate, select and open          | Measured budgets, not impressions            |
| Accessibility | Keyboard operation, focus, contrast and screen-reader labels           | Keyboard-only and accessibility checks       |

“1:1” means **behavioural and layout parity**, not copying Onshape trademarks,
icons, proprietary artwork, text, or implementation. All UI assets and code
must remain original or properly licensed.

### 1.1 Control parity rules

The unit of parity is a **control**, not a feature area. Every visible control
must satisfy all of these:

- It performs the action it names, or it is visibly disabled with a stated
  reason (selection missing, view-only, dependency unavailable, not built).
- Its enabled/disabled state tracks the real selection and document state.
- It previews in the graphics area where Onshape previews, and supports
  apply/cancel without committing.
- It participates in undo/redo under a named action where Onshape does.
- It has the Onshape keyboard path where one exists.
- It has an automated test or a `TEST_BIBLE.md` line that a person can confirm.
- It is listed in the control inventory with its handler and evidence.

A placeholder control, a button that only shows “coming soon”, or a control
that silently does nothing is a defect, not partial parity.

## 2. Current baseline

### What exists today

- A React/Three.js/OCC editor plus a persisted document/tab layer: one
  `CadDocument` per project, with Part Studio tabs that can be created,
  renamed, duplicated, reordered, deleted and switched. Each tab owns its own
  serialized design, so switching and reloading restore the right geometry
  (localStorage today).
- Part Studio-style feature history with add, update, delete, undo/redo,
  suppression states, rollback-era code paths, feature regeneration and
  persistent face/edge tags.
- Sketch: lines, arcs, circles, ellipses, elliptical arcs, splines, Beziers,
  conics, constraints, dimensions, trim/extend, fillet/chamfer, offset, join,
  mirror, move/copy, rotate/scale, linear/circular/path patterns, text, DXF,
  image underlays and analytic plane-section Include.
- Features: extrude, revolve, sweep, loft, fillet, chamfer, boolean, shell,
  thicken, draft, hole, pattern, mirror, move/delete face, split, section,
  project curves, curve on face, surface, wrap, thread, fastener, screw hole,
  flange, hem, unfold, plane, scale.
- Basic assembly model with instances, mates, DOF/residual checks and a small
  solver.
- Manufacturing exports: DXF drawing sheets, USPTO patent sheets, STL/STEP/SVG.
- ECAD simulation, firmware/MCU emulation, RF, VR room/desk interactions.
- Browser gates: full Chromium suite, Firefox/WebKit smoke matrix.
- Automated evidence at this baseline: **590 app tests passing, 4 skipped**;
  full Chromium **45 passed, 1 skipped**; Firefox/WebKit smoke **8 passed**
  (the tab spec is Chromium-only until it is added to the smoke matrix).

### What does not exist

- A local Documents page; persisted Assembly, Drawing, Variable Studio and
  Feature Studio tabs (only Part Studio tabs exist); tab search and multi-select
- A real Drawing workspace
- Full assembly mate set, exploded views, interference and large-assembly
  performance
- Configurations, Variable Studio, Feature Studio, FeatureScript and custom
  features
- Full sheet metal/frames/surface feature depth
- Render, simulation, CAM and PCB studios
- Broad CAD translation and imported-history editing
- Onshape-style toolbar customization, tool search, document panel and local
  named history
- Full control inventory; many toolbar groups are still missing controls

## 3. 1:1 UI blueprint

The target is Onshape’s designer information architecture, not the current
single floating toolbar.

### 3.1 Application chrome

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Document toolbar: menu | document + active tab | save | export | undo/redo │
│                   help | display settings                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ Context toolbar: Feature / Sketch / Assembly / Drawing, grouped with        │
│ separators, overflow menus, search tools, customization                    │
├────────────────────────────────────────────────────────────────────────────┤
│ Document panel │ Feature/Instance list │ Graphics area        │ Properties  │
│ (vertical)     │ + rollback bar        │ + view cube         │ / dialogs   │
│                │                       │ + selection HUD     │             │
├────────────────────────────────────────────────────────────────────────────┤
│ Tab manager: Part Studio | Assembly | Drawing | Feature Studio | ...        │
└────────────────────────────────────────────────────────────────────────────┘
```

Required behaviours:

- Five toolbar families: Document, Feature, Sketch, Assembly, Drawing.
- Context toolbar swaps with the active tab and selection.
- Tool groups separated by vertical rules; overflow collapses at narrow widths.
- Right-click toolbar customization with reset-to-default.
- Search tools accessible from the toolbar.
- Document panel always available: Properties, local History, Where used,
  Performance.
- Feature list with rollback bar, drag reorder, suppress, rename, folder/group
  and error/warning badges.
- Parts list for bodies/parts, with visibility, appearance, material and
  properties.
- Tab manager with create, rename, duplicate, move, delete, search and
  multi-select.
- View cube, standard views, display style, section view, measure and selection
  filters in predictable locations.
- Dialogs use the same grammar: blue selection fields, checkboxes, dropdowns,
  apply/cancel, persistent preview, explicit error text.
- Undo/redo is document-scoped and names the operation.

### 3.2 Documents page (local)

- Create document, blank/import, folder, label, search, sort, filter.
- Recent documents and trash.
- Document cards with thumbnail, last modified and tab count.
- Open, move, copy, rename, delete, restore, export.
- No “shared with me”, owner, permission or workspace state: those are cloud
  concepts outside this scope.

### 3.3 Part Studio

- Tabs for multiple Part Studios in one document.
- Feature toolbar groups, in order:
  Sketch; Extrude/Revolve/Sweep/Loft/Thicken; Fillet/Chamfer/Shell/Draft;
  Hole/Thread; Pattern/Mirror/Transform; Boolean/Split/Delete Face/Move Face;
  Curve/Surface; Sheet Metal/Frames; Measure/Inspect.
- Origin planes and axes in the feature list.
- Rollback preview and rebuild on every feature edit.
- Multi-body and multi-part semantics.
- Feature error states with “what failed” and affected references.
- In-context editing from assemblies.

### 3.4 Sketch

- Sketch toolbar groups: draw, modify, constrain, dimension, pattern, inspect.
- All Onshape sketch entity types and tools, including polyline, hatch, blocks,
  layer/linetype behaviour and full project/include.
- Constraint inference with visible glyphs and conflict resolution.
- Dimensions with driving/driven state, expressions and variables.
- Fully constrained/under/over status with DOF.
- Trim, extend, split, offset, fillet, chamfer, transform, patterns, mirror.
- Sketch text with font and path options.
- Image underlay attach, move, scale, rotate, opacity and delete.
- Sketch block definition/insert/explode.
- Project edges, curves, points and silhouette; include 3D geometry with
  associative update.
- Sketch planes on faces, mate connectors and custom planes.

### 3.5 Assembly

- Insert parts, Part Studios, subassemblies and standard content.
- Instance list, mate list, folders and suppression.
- Mate types: fasten, coincident, concentric, distance, angle, parallel,
  perpendicular, tangent, planar, ball, pin slot, slider, cylindrical, revolute,
  prismatic, screw and width.
- DOF display, over-constrained diagnosis and mate limits.
- Drag, move, rotate, collision, interference and clearance.
- Exploded views, named positions and display states.
- Assembly features and in-context Part Studio editing.
- BOM with structured/indented/flat modes and metadata editing.
- Large-assembly performance and level-of-detail behaviour.

### 3.6 Drawing

- Sheet formats, title blocks, borders and zones.
- Standard/auxiliary/section/detail/exploded views.
- Projected, aligned and broken-out views.
- Dimensions, ordinate dimensions, GD&T, surface finish, weld symbols, notes
  and balloons.
- BOM tables linked to assemblies.
- Drawing properties, scales, sheet sizes and multi-sheet documents.
- Export to PDF/DWG/DXF/SVG.
- Associative update from the model.

### 3.7 Variable Studio and Feature Studio

- Variable Studio tabs, types, units, expressions, tables and configurations.
- Feature Studio editor with FeatureScript syntax highlighting, completion,
  errors, docs and local history.
- Custom feature creation, insertion and configuration.
- FeatureScript notices and compatibility behaviour.

### 3.8 Specialized studios

Separate acceptance tracks, in-browser UI only. No cloud solving or render
farms: any computation runs locally or in a worker.

- **Render Studio**: materials, appearances, lighting, cameras, viewport render.
- **Simulation**: linear static, modal, thermal, buckling, contacts, meshing,
  results and reports.
- **CAM Studio**: operations, tools, stock, toolpaths, simulation, post-processors.
- **PCB Studio**: schematic, PCB layout, libraries, DRC, 3D board integration.

## 4. Capability matrix

Status keys:

- `SHIPPED` — comparable behaviour exists and has regression coverage.
- `PARTIAL` — something real exists, but not parity.
- `MISSING` — no comparable behaviour.
- `STUDIO` — requires a separate product-grade subsystem.

### 4.1 Documents, tabs and local data

| Capability           | Current                                                   | Required for parity                                                          | Status  |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| Documents page       | None                                                      | Local create/open/rename/duplicate/delete/recent/import                      | MISSING |
| Document model       | One local `CadDocument` per project with Part Studio tabs | Multiple elements/tabs with document metadata                                | PARTIAL |
| Document toolbar     | Project name, file menu, undo/redo subset                 | Full document menu, save/export, display settings, help                      | PARTIAL |
| Document panel       | None                                                      | Properties, local history, where used, performance                           | MISSING |
| Tab manager          | Create/rename/duplicate/move/delete/switch Part Studios   | Create/rename/move/delete/search Part Studios, Assemblies, Drawings, studios | PARTIAL |
| Part Studio tabs     | Multiple persisted Part Studios, one design each          | Multiple Part Studios per document                                           | PARTIAL |
| Assembly tabs        | Basic panel                                               | Persisted assembly tab with instances/mates                                  | PARTIAL |
| Drawing tabs         | Exports only                                              | Persisted drawing workspace                                                  | MISSING |
| BOM                  | None                                                      | Structured/indented/flat BOM, metadata, configurations                       | MISSING |
| Search               | None                                                      | Document, tab, feature and part search                                       | MISSING |
| Local named history  | Undo stack only                                           | Named local snapshots and restore                                            | MISSING |
| Save/reload/recovery | localStorage + file import/export                         | Explicit save, autosave, corruption recovery, no lost work                   | PARTIAL |

### 4.2 Sketch

| Capability                 | Current             | Required for parity                                      | Status  |
| -------------------------- | ------------------- | -------------------------------------------------------- | ------- |
| Line/arc/circle/ellipse    | Yes                 | Onshape-equivalent creation and editing                  | PARTIAL |
| Spline/Bezier/conic        | Yes                 | Full control-point, handle and curvature editing         | PARTIAL |
| Polyline                   | No                  | Polyline primitive and vertex editing                    | MISSING |
| Hatch                      | No                  | Hatch regions, patterns and boundaries                   | MISSING |
| Sketch text                | Yes                 | Fonts, alignment, path text and editing                  | PARTIAL |
| Blocks                     | No                  | Define, insert, explode, nested blocks                   | MISSING |
| Layers/linetypes           | No                  | Layer model, colours, line styles, visibility            | MISSING |
| Constraints                | 18 core constraints | Full Onshape constraint set and inference                | PARTIAL |
| Dimensions                 | Driving dimensions  | Driving/driven, expressions, variables, limits           | PARTIAL |
| Trim/extend/split          | Yes                 | Full topology-aware behaviour                            | PARTIAL |
| Fillet/chamfer/offset      | Yes                 | Full corner and chain behaviour                          | PARTIAL |
| Mirror/pattern/transform   | Yes                 | Full sketch pattern, transform and constraints           | PARTIAL |
| Project/include            | Plane section only  | Associative project edges/curves/points/silhouette       | PARTIAL |
| Image underlay             | Yes                 | Attach/move/scale/rotate/opacity/delete                  | SHIPPED |
| Sketch planes              | Planes/faces        | Mate connectors, custom planes, in-context               | PARTIAL |
| Sketch analysis            | DOF/status          | Constraint conflict diagnostics, curvature, intersection | PARTIAL |
| Sketch in drawing/assembly | No                  | In-context sketching and cross-context references        | MISSING |

### 4.3 Part Studio features

| Capability                    | Current                    | Required for parity                                                 | Status  |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------- | ------- |
| Extrude                       | Yes                        | End conditions, thin feature, draft, offset, merge scope            | PARTIAL |
| Revolve                       | Yes                        | End conditions, thin, merge scope                                   | PARTIAL |
| Sweep                         | Yes                        | Guide curves, twist, thin, merge scope                              | PARTIAL |
| Loft                          | Yes                        | Guides, tangency, thin, merge scope                                 | PARTIAL |
| Fillet                        | Yes                        | Constant/variable, face blends, full edge propagation               | PARTIAL |
| Chamfer                       | Yes                        | Distance/angle, variable, full propagation                          | PARTIAL |
| Shell                         | Yes                        | Multi-thickness, face selection, special cases                      | PARTIAL |
| Draft                         | Yes                        | Neutral plane, parting line, face propagation                       | PARTIAL |
| Hole                          | Yes                        | Standards, countersink/counterbore, tapped, clearance               | PARTIAL |
| Thread                        | Yes                        | Cosmetic and modelled threads, standards                            | PARTIAL |
| Pattern                       | Yes                        | Feature/face/body patterns, curves, spacing modes                   | PARTIAL |
| Mirror                        | Yes                        | Feature/face/body mirror and merge                                  | PARTIAL |
| Boolean                       | Yes                        | Full merge/scope/provenance behaviour                               | PARTIAL |
| Split                         | Yes                        | Split by plane/surface/body and keep scopes                         | PARTIAL |
| Move/delete face              | Yes                        | Full face editing and healing                                       | PARTIAL |
| Transform/scale               | Yes                        | Body/part transform and copy semantics                              | PARTIAL |
| Project curves/curve on face  | Yes                        | Associative, tangent and intersection modes                         | PARTIAL |
| Surface features              | Ruled/fill/offset subset   | Full surfacing: boundary, loft, knit, trim, extend, thicken         | PARTIAL |
| Sheet metal                   | Flange/hem/unfold subset   | Full sheet metal: base, flange, bend, relief, corner, louver, rules | PARTIAL |
| Frames                        | No                         | Frame profiles, miter/trim, groups, cut lists                       | MISSING |
| Rib/web                       | No                         | Rib, web, boss, emboss                                              | MISSING |
| Dome/offset/intersect         | Partial                    | Full solid/surface toolset                                          | PARTIAL |
| Helix/coil/spring             | No                         | Helical solid and curve features                                    | MISSING |
| Derived/imported feature      | No                         | Derived Part Studio, import with history editing                    | MISSING |
| Feature tree behaviour        | Add/update/delete/suppress | Reorder, rollback, folders, configurations, error recovery          | PARTIAL |
| Multi-body/part semantics     | Basic                      | Bodies, parts, composite parts, properties, materials               | PARTIAL |
| Configurations                | No                         | Part Studio/assembly/property configurations and tables             | MISSING |
| Variables                     | Partial parameter fields   | Variable Studio, tables, types, units, configurations               | PARTIAL |
| FeatureScript/custom features | No                         | Editor, compiler, custom feature insertion                          | MISSING |
| Measure/inspect               | Partial                    | Distance, angle, radius, thickness, interference, curvature         | PARTIAL |

### 4.4 Assembly

| Capability             | Current     | Required for parity                                  | Status  |
| ---------------------- | ----------- | ---------------------------------------------------- | ------- |
| Instances              | Basic       | Parts, Part Studios, subassemblies, standard content | PARTIAL |
| Mate model             | Basic mates | Full mate set and mate connectors                    | PARTIAL |
| DOF/over-constraint    | Basic       | Full diagnosis and resolution                        | PARTIAL |
| Drag/move/rotate       | Basic       | Mates-aware manipulation and collision               | PARTIAL |
| Interference/clearance | No          | Collision and interference reports                   | MISSING |
| Exploded views         | No          | Explode steps and named positions                    | MISSING |
| Display states         | No          | Visibility, appearance and configuration states      | MISSING |
| BOM                    | No          | Structured/indented/flat BOM                         | MISSING |
| In-context editing     | No          | Edit Part Studio from assembly context               | MISSING |
| Large assemblies       | No          | LOD, lightweight instances, performance budgets      | MISSING |
| Assembly features      | No          | Cut/extrude/hole in assembly context                 | MISSING |

### 4.5 Drawing and manufacturing

| Capability        | Current                | Required for parity                                 | Status  |
| ----------------- | ---------------------- | --------------------------------------------------- | ------- |
| Drawing workspace | No                     | Sheet-based associative drawing tab                 | MISSING |
| Sheets/templates  | No                     | Sheet sizes, borders, zones, title blocks           | MISSING |
| Standard views    | Export projection only | Front/top/right/iso/auxiliary/section/detail        | PARTIAL |
| Dimensions/GD&T   | Basic bbox dimensions  | Full dimensioning, tolerances, GD&T, surface finish | PARTIAL |
| BOM tables        | No                     | Linked BOM tables and balloons                      | MISSING |
| Export            | DXF/SVG/STL/STEP       | PDF/DWG/DXF/SVG/STEP/IGES/Parasolid and more        | PARTIAL |
| Patent sheets     | Yes, separate          | Not an Onshape parity requirement                   | SHIPPED |

### 4.6 Specialized studios

| Studio        | Current                 | Required for parity                                    | Status |
| ------------- | ----------------------- | ------------------------------------------------------ | ------ |
| Render Studio | No                      | Materials, lighting, cameras, local viewport render    | STUDIO |
| Simulation    | No                      | Linear static/modal/thermal/buckling, local solver     | STUDIO |
| CAM Studio    | No                      | Operations, tools, stock, toolpaths, simulation, posts | STUDIO |
| PCB Studio    | Separate ECAD simulator | Schematic, layout, libraries, DRC, 3D integration      | STUDIO |

### 4.7 Import/export and interoperability

| Capability                 | Current           | Required for parity                              | Status  |
| -------------------------- | ----------------- | ------------------------------------------------ | ------- |
| STEP import/export         | Partial           | Full associative translation and history options | PARTIAL |
| STL import/export          | Yes               | Units, repair and print workflows                | SHIPPED |
| DXF/DWG                    | DXF import/export | Full DWG/DXF workflows and layers                | PARTIAL |
| IGES/Parasolid/ACIS/JT/3MF | No                | Supported translation matrix                     | MISSING |
| PDF drawing export         | No                | Multi-sheet vector/PDF output                    | MISSING |
| Image import               | Sketch underlay   | Reference images and decals                      | PARTIAL |
| Imported feature editing   | No                | Direct editing and feature recognition           | MISSING |

### 4.8 Browser UI platform

| Capability            | Current                       | Required for parity                             | Status  |
| --------------------- | ----------------------------- | ----------------------------------------------- | ------- |
| Keyboard shortcuts    | Substantial sketch/editor map | Complete Onshape key map, rebindable            | PARTIAL |
| Toolbar customization | No                            | Right-click customization and reset             | MISSING |
| Tool search           | No                            | Search every implemented tool and command       | MISSING |
| Context menus         | Sketch/feature subset         | Full right-click menus per selection            | PARTIAL |
| Cross-browser         | Chromium full, FF/WK smoke    | Full suite on Chromium, Firefox and WebKit      | PARTIAL |
| Responsive layout     | Desktop-oriented              | Usable at supported widths                      | PARTIAL |
| Accessibility         | Unknown                       | Keyboard, focus, screen-reader labels, contrast | MISSING |
| Performance budgets   | Informal                      | Measured budgets for load/orbit/regenerate      | MISSING |
| Control inventory     | None                          | Every control with handler, state and evidence  | MISSING |

## 5. Required architecture

### 5.1 Frontend

- A document shell with tabs and a persisted tab graph.
- A command/control registry that represents every tool, its selection
  requirements, enabled state, previews, confirm/cancel and undo label. The
  toolbar, menus, palette and keyboard map all read from this one registry.
- A feature-tree component with rollback, reorder, folders, suppression and
  error propagation.
- A property/dialog framework with typed parameter schemas.
- A design system for toolbars, panels, dialogs, context menus and keyboard maps.
- A graphics layer that can handle large assemblies, section views,
  transparency, selection filters and overlays.

### 5.2 Geometry and feature graph

- OCC remains the kernel for BRep operations, but parity requires a stronger
  feature graph:
  - typed parameters and expressions;
  - stable topological references;
  - dependency graph and partial regeneration;
  - rollback and reorder semantics;
  - feature suppression and error isolation;
  - multi-body/part output scopes;
  - configurations and variable substitution;
  - deterministic rebuild and serialization.
- Dedicated engines will be needed for advanced surfacing, sheet metal, frames,
  simulation meshing, CAM and rendering.

### 5.3 Local document/data layer

No backend. Parity is achieved with local storage and local files:

- Document metadata, tabs, feature graphs and binary assets in IndexedDB with a
  localStorage fallback for small documents.
- Autosave, explicit save, crash recovery and corruption repair.
- Local named snapshots and restore (the in-designer history surface).
- File import/export for the translation matrix in section 4.7.
- Optional local file-system access where the browser supports it.
- Clear quota handling: refuse a save with a stated error rather than silently
  losing work.

### 5.4 Quality infrastructure

- Unit tests for pure model/geometry logic.
- Kernel integration tests against real OCC.
- Browser interaction tests per workspace and per control group.
- Visual regression tests for the 1:1 layout.
- A control-inventory audit that fails when a visible control has no handler,
  no enabled-state rule, or no evidence entry.
- Import corpus tests with real CAD files.
- Performance budgets for load, regenerate, orbit and large assemblies.
- Accessibility and keyboard-only tests.
- Cross-browser matrix: Chromium, Firefox and WebKit, full suites.

## 6. Work breakdown and sequencing

Phases are ordered by dependency, not visual appeal. Every phase has the same
contract:

- **Goal** — the user-visible outcome.
- **Workstreams** — the concrete surfaces and systems to build.
- **Deliverables** — what exists at the end that did not before.
- **Exit evidence** — automated checks, `TEST_BIBLE.md` lines and a manual demo.
- **Depends on** — phases that must be complete first.
- **Not in this phase** — the adjacent work that would otherwise creep in.

Sizes assume the four-person core team in section 7. Coverage is approximate
matrix-row coverage, not effort or value; a row marked `SHIPPED` can still hide
depth gaps until its phase exit demo passes.

| Phase | Outcome                                           | Depends on | Size          | Row coverage after |
| ----- | ------------------------------------------------- | ---------- | ------------- | ------------------ |
| 0     | Contract and control inventory                    | —          | 2–3 weeks     | measured baseline  |
| 1     | Document shell and local Documents page           | 0          | 8–12 weeks    | ~41%               |
| 2     | Sketch parity                                     | 1          | 4–6 months    | ~52%               |
| 3     | Part Studio core parity                           | 2          | 9–12 months   | ~67%               |
| 4     | Assembly parity                                   | 3          | 6–9 months    | ~76%               |
| 5     | Drawing parity                                    | 3, 4       | 6–9 months    | ~81%               |
| 6     | Sheet metal, frames and surfaces                  | 3          | 6–9 months    | ~83%               |
| 7     | Configurations, Variable Studio and FeatureScript | 3, 4       | 6–12 months   | ~85%               |
| 8     | Specialized studios and translation               | 5, 6, 7    | 18–24+ months | ~94%               |
| 9     | Hardening and release gate                        | continuous | ongoing       | 100% by gate       |

Critical path: **0 → 1 → 2 → 3 → 4 → 5**. Phases 6 and 7 can run in parallel
with 4 and 5 once Phase 3 lands. Phase 8 starts only after the workspaces it
consumes are real. Phase 9 runs continuously and gates the release.

### Phase 0 — Contract and control inventory (2–3 weeks) — **not started**

**Goal:** make “all the buttons” countable and stop dead controls from entering
the app.

**Workstreams**

- A. Freeze this matrix; assign an owner and acceptance test to every row.
- B. Build the control registry: one entry per visible control with id, label,
  toolbar family, selection requirements, enabled rule, handler, undo label,
  keyboard binding, evidence link and implementation status.
- C. Build the inventory report grouped by toolbar and dialog, with counts of
  wired, disabled-with-reason and missing controls.
- D. Add the dead-control audit to CI: a visible control with no handler, no
  enabled rule, or no evidence entry fails the build.
- E. Define budgets: boot time, orbit FPS, regenerate time, document load,
  assembly open; and the supported browser/viewport matrix.
- F. Define the phase demo script format (the manual half of exit evidence).

**Deliverables**

- Control registry module and generated inventory report.
- CI audit script wired into the existing test command.
- Performance/browser budget document, enforced by checks.

**Exit evidence**

- Report lists every current toolbar/menu/dialog control and its handler.
- Audit fails on a deliberately added dead button, then passes when removed.
- Every matrix row has an owner and an acceptance-test reference.

**Not in this phase:** implementing missing controls. Measurement first.

### Phase 1 — Document shell and local Documents page (8–12 weeks) — **partial: tab model landed**

**Goal:** a real local document environment: create, open, organise, save and
recover documents, with every tab type backed by a real workspace.

**Workstreams**

- A. Persistence hardening: IndexedDB adapter behind the document store (with a
  localStorage fallback for small documents), explicit save, autosave and dirty
  state, quota errors surfaced to the user, corruption repair, migration from
  the current blob format.
- B. Local Documents page: list/grid, create blank or import, open, rename,
  duplicate, delete, restore from trash, recent, search, sort, filter, local
  thumbnail, export project file.
- C. Document panel: document properties, tab list, local history/snapshots,
  where-used, performance readout.
- D. Local named history: create snapshot, name it, restore it, prune old ones;
  separate from the undo stack.
- E. Tab manager completion: tab search, multi-select, drag reorder, keyboard
  operation; Assembly/Drawing/Variable Studio/Feature Studio tabs only when the
  corresponding workspace exists (no empty tabs).
- F. Chrome: document toolbar (save, export, display, help), five toolbar
  families, overflow behaviour, context menus, keyboard map.
- G. Round-trip tests for documents, tabs, snapshots and file import/export.

**Deliverables**

- Documents page and document panel reachable from the browser.
- IndexedDB-backed persistence with autosave and recovery.
- Named local snapshots with restore.
- Tab search/multi-select and drag reorder.

**Exit evidence**

- Create a document with three Part Studios, reorder and duplicate tabs, save a
  snapshot, restore it, reload, and recover from a simulated corrupt write.
- Quota failure produces a clear error and leaves the last good save intact.
- Browser test covers create → tabs → snapshot → reload → restore.

**Not in this phase:** cloud storage, accounts, sharing, real Assembly/Drawing
workspaces (their tabs arrive with their phases).

### Phase 2 — Sketch parity (4–6 months) — **not started**

**Goal:** every Onshape sketch entity, constraint, dimension and modify tool,
with inference and conflict feedback.

**Workstreams**

- A. Entities: polyline (chained creation and vertex editing), hatch regions and
  patterns, blocks (define/insert/explode/nested), construction geometry and
  points.
- B. Layers and linetypes: layer model, colour, visibility, line style, DXF
  mapping.
- C. Constraints: complete geometric set, constraint inference with glyphs,
  conflict detection, over-constrained resolution, DOF reporting.
- D. Dimensions: driving and driven, expressions and variables, limits,
  reference dimensions, consistent value-entry UI.
- E. Modify: trim/extend/split/offset/fillet/chamfer edge cases, chain and loop
  selection, pattern/transform interactions with constraints.
- F. Project/include: edges, curves, points and silhouette, associative update,
  include 3D geometry into the active sketch.
- G. Text and underlay: font selection, alignment, text on path, underlay
  rotate/re-attach as well as move/scale/opacity/delete.
- H. Sketch planes: face planes, mate connectors, custom planes; sketch analysis
  (curvature, intersections, open/closed profiles).
- I. Sketch acceptance checklist and visual regression baselines.

**Deliverables**

- Polyline, hatch, blocks and layers in the sketch toolbar.
- Full constraint/dimension set with inference and conflict UI.
- Associative project/include.

**Exit evidence**

- A sketch using every entity type, 15+ constraints and three dimensions stays
  fully constrained after edit, undo and reload.
- Deliberate over-constraint is reported with the conflicting set named.
- Checklist and screenshot baselines pass.

**Not in this phase:** in-context sketching from an assembly or drawing (Phase 4/5).

### Phase 3 — Part Studio core parity (9–12 months) — **not started**

**Goal:** model a representative mechanical part end to end with Onshape-level
feature depth and tree behaviour.

**Workstreams**

- A. Extrude/revolve/sweep/loft: every end condition, thin feature, draft and
  offset, merge scope, guide curves, twist and profile rules.
- B. Fillet/chamfer: constant, variable and face blends; full edge propagation;
  shell with multi-thickness; draft with neutral plane and parting line; hole
  standards, counterbore/countersink, tapped and clearance; cosmetic and
  modelled threads.
- C. Patterns/mirror/boolean/split: feature, face and body patterns; curve and
  spacing modes; merge scopes; keep scopes; provenance and consumed bodies;
  move/delete face healing; transform and copy semantics.
- D. Feature tree: reorder, rollback, folders/groups, suppression, rename, error
  badges, failure isolation, recovery and affected-reference reporting.
- E. Multi-body/part semantics: bodies, parts, composite parts, properties,
  materials, appearances, visibility and per-body measurement.
- F. New features: rib/web/boss/emboss, dome, helix/coil/spring, derived Part
  Studio, imported feature recognition.
- G. Measure/inspect: distance, angle, radius, thickness, interference,
  curvature, section analysis and mass properties.
- H. Deterministic rebuild and serialization tests across all features.

**Deliverables**

- Feature-complete core modelling set (sheet metal/frames/surfaces excluded to
  Phase 6).
- Rollback/reorder-capable feature tree with error recovery.
- Multi-body semantics and measure/inspect.

**Exit evidence**

- A 20+ feature mechanical part is built, reordered, rolled back and edited with
  identical geometry after save/reload and export/re-import.
- Every feature’s failure mode produces a named error, not a bogus body.
- Feature-level interaction tests cover dialog, preview, apply and cancel.

**Not in this phase:** sheet metal, frames, full surfacing, configurations and
FeatureScript.

### Phase 4 — Assembly parity (6–9 months) — **not started**

**Goal:** build and drive a multi-level assembly with real mates, diagnostics,
interference and a BOM.

**Workstreams**

- A. Insertion: parts, Part Studios, subassemblies and standard content;
  instance list with folders, rename, suppression and visibility.
- B. Mate connectors and the full mate set: fasten, coincident, concentric,
  distance, angle, parallel, perpendicular, tangent, planar, ball, pin slot,
  slider, cylindrical, revolute, prismatic, screw and width, with limits.
- C. Solver: robust convergence, DOF display, over-constrained diagnosis,
  mate limits, drag with mates.
- D. Collision/interference/clearance reports; exploded views; named positions;
  display states.
- E. BOM: structured, indented and flat modes; metadata editing; export.
- F. In-context Part Studio editing; assembly features (cut/extrude/hole).
- G. Large-assembly performance: level of detail, lightweight instances,
  measured open/orbit budgets.

**Deliverables**

- Full mate set and diagnostics.
- Exploded views, display states and BOM.
- In-context editing and assembly features.

**Exit evidence**

- A three-level assembly with 20+ instances, mixed mates, an exploded view and a
  BOM round-trips through save/reload.
- Over-constraint and interference are reported with the offending instances.
- Large-assembly budget passes.

**Not in this phase:** cloud collaboration or shared assemblies.

### Phase 5 — Drawing parity (6–9 months) — **not started**

**Goal:** produce a production drawing package from a model and keep it
associative.

**Workstreams**

- A. Drawing tab and workspace; sheet sizes, borders, zones, title blocks and
  templates.
- B. Views: standard, projected, aligned, auxiliary, section, detail, exploded
  and broken-out.
- C. Annotation: dimensions, ordinate dimensions, GD&T, surface finish, weld
  symbols, notes and balloons.
- D. BOM table linked to the assembly; revision/title fields that stay local
  (no cloud release workflow).
- E. Drawing properties, scales, multi-sheet navigation and associative update
  after model changes.
- F. Export: PDF, DWG, DXF, SVG; print.

**Deliverables**

- A real drawing workspace, not an export button.
- Associative views and annotation tools.
- Multi-sheet export.

**Exit evidence**

- Generate a two-sheet drawing from an assembly, change a model dimension, and
  see views/dimensions update.
- Export PDF/DWG and verify sheet count, scale and BOM rows.
- Checklist and visual regression pass.

**Not in this phase:** release approvals and cloud revision control.

### Phase 6 — Sheet metal, frames and surfaces (6–9 months) — **not started**

**Goal:** manufacturable sheet metal and frames, plus complete surface modelling.

**Workstreams**

- A. Sheet metal: rules/styles, base flange, edge flange, bend, relief, corner
  treatment, hem, louver, flat pattern, bend table, DXF flat export.
- B. Frames: profile libraries, groups, miter/trim, cut lists, weld gaps.
- C. Surfaces: boundary, loft, fill, ruled, offset, knit/stitch, trim, extend,
  thicken, replace face, curvature analysis.
- D. Conversion between solid and surface bodies, with error reporting.

**Deliverables**

- Full sheet-metal feature set and flat pattern.
- Frame generator with cut list.
- Complete surfacing toolset.

**Exit evidence**

- A sheet-metal enclosure unfolds to a manufacturable flat pattern exported as
  DXF.
- A frame assembly produces a correct cut list.
- A surface model knits, thickens and converts to a solid without gaps.

**Not in this phase:** CAM toolpaths from the flat pattern (Phase 8).

### Phase 7 — Configurations, Variable Studio and FeatureScript (6–12 months) — **not started**

**Goal:** author part families and custom features entirely in the browser.

**Workstreams**

- A. Variable Studio: types, units, expressions, tables, document-level
  variables and dependency display.
- B. Configurations: Part Studio, Assembly and property configurations;
  configuration tables; visibility conditions; configured tabs and BOM columns.
- C. FeatureScript: editor with highlighting, completion, errors, docs and local
  history; parser/evaluator; custom feature definition, insertion and
  configuration; notices and compatibility behaviour.
- D. Migration and round-trip tests for configured documents and custom
  features.

**Deliverables**

- Working Variable Studio and configuration tables.
- Feature Studio with a usable editor and custom features.

**Exit evidence**

- A part family with three configurations switches geometry and BOM data.
- A custom feature authored in Feature Studio inserts, edits and rebuilds.
- Errors point at the offending line and do not corrupt the document.

**Not in this phase:** publishing custom features to an App Store (out of scope).

### Phase 8 — Specialized studios and translation (18–24+ months) — **not started**

**Goal:** the remaining browser studios, each with local compute and its own
acceptance suite.

**Workstreams, one track each**

- A. Render Studio: PBR materials/appearances, environments and lights,
  cameras, local/worker render, image export.
- B. Simulation: meshing, linear static, modal, thermal, buckling, contacts,
  results, reports; local solver budget.
- C. CAM Studio: stock, tools, operations, toolpaths, simulation,
  post-processors, setup sheets.
- D. PCB Studio: schematic, board layout, libraries, DRC, 3D board integration.
- E. Translation: IGES, Parasolid, ACIS, JT, 3MF, PDF; imported-history editing.

**Deliverables**

- Four studio surfaces with separate navigation and acceptance suites.
- Broad import/export matrix.

**Exit evidence**

- Each studio has a demo model, an automated suite and a performance budget.
- Imported files open, measure and edit without silent geometry loss.

**Not in this phase:** cloud rendering, cloud solving or hosted translation.

### Phase 9 — Hardening and release (ongoing) — **not started**

**Goal:** make the whole designer dependable enough to call parity.

**Workstreams**

- A. Accessibility: keyboard-only operation, focus order, labels, contrast,
  reduced motion.
- B. Local data: recovery, quota handling, migration, long-session stability.
- C. Performance: boot, orbit, regenerate, large assembly, drawing open; all
  against measured budgets.
- D. Cross-browser: full Chromium, Firefox and WebKit suites at supported
  widths and devices.
- E. Control inventory audit at zero dead controls.
- F. Release gate execution and evidence archive.

**Deliverables**

- A release gate report with every criterion evidenced.

**Exit evidence**

- Section 8 passes end to end, including the manual demo script.

## 7. Team shape

Minimum credible core team:

- 2 geometry/kernel engineers
- 2 frontend/UI engineers
- 1 test/quality engineer
- 1 product/design owner

That team can deliver Phases 0–3 in roughly 9–15 months, not 100% parity.
Assembly, drawings, sheet metal/surfaces, FeatureScript and the specialized
studios require additional specialists. No backend/data engineer is needed
because there is no backend in scope.

## 8. Release gate for “100% in-browser designer parity”

Parity may be claimed only when all of the following are true:

1. Every row in section 4 is `SHIPPED` or explicitly approved as out of scope.
2. Every visible control has a handler, a correct enabled/disabled rule, and an
   automated test or `TEST_BIBLE.md` line. No dead or mock controls.
3. The 1:1 UI blueprint passes visual regression at supported viewport sizes.
4. Chromium, Firefox and WebKit pass the full browser suite, not only smoke
   tests.
5. A document with multiple tabs, features, sketches and a local snapshot
   survives save, reload, recovery and re-import with identical state.
6. A representative part, assembly, drawing and sheet-metal part can be
   authored, edited, exported and re-imported.
7. Performance budgets for load, orbit, regenerate and large assemblies pass.
8. Keyboard-only operation and accessibility checks pass.
9. No parity row is backed only by a button, a mock, or a screenshot.

## 9. Current slice status and next steps

Landed 2026-11-06 (Phase 1, first slice):

1. `src/document/` — a persisted `CadDocument` with `tabs[]`, active tab,
   migration from the old single-design project blob, and repair on read.
2. Part Studio tabs are real: create, rename, duplicate, move, delete and
   switch. Each tab stores its own serialized design; switching flushes the
   live scene and restores the target tab, the same path a reload uses.
3. The tab bar is mounted in the editor (`src/components/DocumentTabBar.tsx`).
   Non-Part-Studio kinds are listed as disabled/planned, not fake buttons.
4. Boot now hydrates the active tab, so a reload reopens the Part Studio the
   user was in instead of an empty scene.
5. Unit tests for the model/store and a Chromium browser test for tab
   isolation, rename, reload and delete.

Still missing from Phase 1: the local Documents page, document panel, tab
search and multi-select, persisted Assembly/Drawing/Variable Studio/Feature
Studio tabs, and local named snapshots. Those depend on the real workspaces they
would open; adding empty tabs first would be a mock.

The next implementation slice is the control inventory plus the local
Documents page and document panel, and adding the tab spec to the Firefox and
WebKit smoke matrix. Keep every existing test green and add round-trip coverage
for each new tab kind.

## 10. Sources and baseline notes

Primary Onshape references used for this scope:

- Onshape User Interface Basics: five context toolbars, graphics area, feature
  list/rollback bar, document panel.
- Onshape Document Toolbar: document name, save/export and display controls.
- Onshape Part Studios: tab manager, insert-element menu, configurations and
  part properties.
- Onshape Configurations: Part Studio, Assembly and Variable Studio
  configurations, property configurations, visibility conditions.
- Onshape Drawings, Frames, Sheet Metal and BOM product pages.
- Onshape FeatureScript documentation and Feature Studio behaviour.

Deliberately excluded from the references: release management, branch/merge,
sharing, API/App Store and hosting pages. They are outside this scope.

This document is the scope. It is not evidence that the scope is implemented.
