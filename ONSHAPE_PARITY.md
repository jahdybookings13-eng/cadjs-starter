# ONSHAPE_PARITY — in-browser designer parity

Status: **scope frozen; Phase 0, Phase 1 and Phase 2 complete 2026-11-06; Phase 3 not started**
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
  renamed, duplicated, reordered, deleted, searched, multi-selected and
  switched. Each tab owns its own serialized design, so switching and
  reloading restore the right geometry (IndexedDB with a localStorage mirror).
- A local Documents page (grid/list, create, import, open, rename, duplicate,
  export, trash/restore, recent, search, filter, sort) and a document panel
  (properties, tabs, named snapshots, where-used, size/storage), plus a
  document toolbar with explicit save, export, panel, help and display state.
- Part Studio-style feature history with add, update, delete, undo/redo,
  suppression states, rollback-era code paths, feature regeneration and
  persistent face/edge tags.
- Sketch: lines, arcs, circles, ellipses, elliptical arcs, splines, Beziers,
  conics, constraints, dimensions, trim/extend, fillet/chamfer, offset, join,
  mirror, move/copy, rotate/scale, linear/circular/path patterns, text,
  polylines, hatches, block define/insert/explode with nested instance paths,
  layers/linetypes, DXF (including LAYER table mapping), image underlays and
  analytic plane-section Include.
- Features: extrude, revolve, sweep, loft, fillet, chamfer, boolean, shell,
  thicken, draft, hole, pattern, mirror, move/delete face, split, section,
  project curves, curve on face, surface, wrap, thread, fastener, screw hole,
  flange, hem, unfold, plane, scale.
- Basic assembly model with instances, mates, DOF/residual checks and a small
  solver.
- Manufacturing exports: DXF drawing sheets, USPTO patent sheets, STL/STEP/SVG.
- ECAD simulation, firmware/MCU emulation, RF, VR room/desk interactions.
- Browser gates: full Chromium suite, Firefox/WebKit smoke matrix.
- Automated evidence at this baseline: **619 app tests passing, 4 skipped**;
  the Chromium sketch-controls spec passes, including DXF layer/linetype
  mapping and the layers dialog. The pre-existing VR specs were not rerun in
  this pass, and the Firefox/WebKit smoke matrix was not rerun.

### What does not exist

- Persisted Assembly, Drawing, Variable Studio and Feature Studio tabs (only
  Part Studio tabs have a real workspace, so the others are not offered as
  empty tabs)
- A real Drawing workspace
- Full assembly mate set, exploded views, interference and large-assembly
  performance
- Configurations, Variable Studio, Feature Studio, FeatureScript and custom
  features
- Full sheet metal/frames/surface feature depth
- Render, simulation, CAM and PCB studios
- Broad CAD translation and imported-history editing
- Onshape-style five-family toolbar customization and tool search
- Direct automated evidence for most of the 295 visible controls; the inventory
  is complete, but evidence coverage is still low

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

| Capability           | Current                                                                                         | Required for parity                                                          | Status  |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| Documents page       | Local grid/list: create/open/rename/duplicate/export/trash/restore/import/search/filter/sort    | Local create/open/rename/duplicate/delete/recent/import                      | SHIPPED |
| Document model       | One `CadDocument` with multiple persisted Part Studio tabs                                      | Multiple elements/tabs with document metadata                                | PARTIAL |
| Document toolbar     | Document menu, save, export, panel, help, display toggle                                        | Full document menu, save/export, display settings, help                      | PARTIAL |
| Document panel       | Properties, tabs, named snapshots, where-used, size/storage                                     | Properties, local history, where used, performance                           | PARTIAL |
| Tab manager          | Create/rename/duplicate/move/delete/search/multi-select Part Studios                            | Create/rename/move/delete/search Part Studios, Assemblies, Drawings, studios | PARTIAL |
| Part Studio tabs     | Multiple persisted Part Studios, one design each                                                | Multiple Part Studios per document                                           | SHIPPED |
| Assembly tabs        | Basic panel                                                                                     | Persisted assembly tab with instances/mates                                  | PARTIAL |
| Drawing tabs         | Exports only                                                                                    | Persisted drawing workspace                                                  | MISSING |
| BOM                  | None                                                                                            | Structured/indented/flat BOM, metadata, configurations                       | MISSING |
| Search               | Documents and tabs; no feature/part search                                                      | Document, tab, feature and part search                                       | PARTIAL |
| Local named history  | Named local snapshots (newest 20), restore and delete                                           | Named local snapshots and restore                                            | SHIPPED |
| Save/reload/recovery | IndexedDB + localStorage mirror, autosave, explicit save, quota errors, corrupt-mirror recovery | Explicit save, autosave, corruption recovery, no lost work                   | PARTIAL |

### 4.2 Sketch

| Capability                 | Current                                                                                             | Required for parity                                      | Status  |
| -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- | --- | --------------- | -------------------------------------------------------- | -------------------------------------------------- | ------- |
| Line/arc/circle/ellipse    | Yes                                                                                                 | Onshape-equivalent creation and editing                  | PARTIAL |
| Spline/Bezier/conic        | Yes                                                                                                 | Full control-point, handle and curvature editing         | PARTIAL |
| Polyline                   | Yes — chained lines share vertex points                                                             | Polyline creation and vertex editing                     | SHIPPED |
| Hatch                      | Yes — closed-loop solid/line/cross fills                                                            | Hatch regions, patterns and boundaries                   | SHIPPED |
| Sketch text                | Yes                                                                                                 | Fonts, alignment, path text and editing                  | PARTIAL |
| Blocks                     | Yes — define/insert/explode; nested paths remapped                                                  | Define, insert, explode, nested blocks                   | SHIPPED |
| Layers/linetypes           | Yes — colours, visibility, dash styles; DXF LAYER import                                            | Layer model, colours, line styles, visibility            | SHIPPED |
| Constraints                | 18 constraints; H/V/perp/parallel/tangent/coincident inference; named conflicts with remove actions | Full Onshape constraint set and inference                | SHIPPED |
| Dimensions                 | Driving, driven/reference, expressions, sketch variables, min/max limits                            | Driving/driven, expressions, variables, limits           | SHIPPED |
| Trim/extend/split          | Yes                                                                                                 | Full topology-aware behaviour                            | PARTIAL |
| Fillet/chamfer/offset      | Yes                                                                                                 | Full corner and chain behaviour                          | PARTIAL |
| Mirror/pattern/transform   | Yes                                                                                                 | Full sketch pattern, transform and constraints           | PARTIAL |     | Project/include | Associative section edges/vertices; custom plane normals | Associative project edges/curves/points/silhouette | PARTIAL |
| Image underlay             | Yes                                                                                                 | Attach/move/scale/rotate/opacity/delete                  | SHIPPED |
| Sketch planes              | Planes/faces                                                                                        | Mate connectors, custom planes, in-context               | PARTIAL |
| Sketch analysis            | DOF/status                                                                                          | Constraint conflict diagnostics, curvature, intersection | PARTIAL |
| Sketch in drawing/assembly | No                                                                                                  | In-context sketching and cross-context references        | MISSING |

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
- A control-inventory audit that fails when a visible control has no handler or
  no accessible label; evidence coverage is reported per control rather than
  silently assumed.
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

### Phase 0 — Contract and control inventory (2–3 weeks) — **complete 2026-11-06**

**Goal:** make “all the buttons” countable and stop dead controls from entering
the app.

**Workstreams**

- A. Freeze this matrix; assign an owner and acceptance test to every row.
- B. Build the control registry: one entry per visible control with id, label,
  toolbar family, enabled/selection rule, handler, keyboard hint, evidence link
  and implementation status. Undo labels remain on the runtime undo stack.
- C. Build the inventory report grouped by toolbar and dialog, with counts of
  wired, disabled-with-reason and missing controls.
- D. Add the dead-control audit to CI: a visible control with no handler or no
  accessible label fails the build; evidence coverage is reported and burned
  down in Phase 1.
- E. Define budgets: boot time, orbit FPS, regenerate time, document load,
  assembly open; and the supported browser/viewport matrix.
- F. Define the phase demo script format (the manual half of exit evidence).

**Deliverables (landed)**

- `scripts/control-inventory.mjs` and the generated `CONTROL_INVENTORY.md`:
  every visible JSX control with label, handler, enabled rule, keyboard hint
  and test-evidence level, grouped by toolbar/dialog.
- `scripts/parity-matrix.mjs`, `parity/owners.json` and `PARITY_STATUS.md`:
  every capability row gets an owner and acceptance evidence, and the report
  tracks row coverage live.
- `scripts/check-budgets.mjs`, `parity/budgets.json` and
  `e2e/perf-budget.spec.ts`: browser budgets for boot, document reload,
  regeneration and orbit, plus the supported browser/viewport matrix.
- `parity/phase-demos/phase-0.md`: the demo-script format and the Phase 0 run.

**Exit evidence (measured 2026-11-06)**

- 255 visible controls in 63 files; 0 dead, 0 unlabeled.
- 97 matrix rows in 8 sections; every row has an owner and acceptance evidence;
  row coverage is 31.4% (SHIPPED=1, PARTIAL=0.5).
- The audit found 2 dead and 38 unlabeled controls on its first run and failed;
  after wiring the printer fields and naming the icon/dynamic controls it
  passes. Evidence coverage is only 4 direct test references (2%); that gap is
  enumerated in `CONTROL_INVENTORY.md` and is Phase 1 work, not a hidden pass.
- Headless Chromium baseline over two runs: boot 8.41–9.58 s (budget 12 s),
  document reload 5.55–10.64 s (budget 15 s), box regeneration 242–726 ms
  (budget 5 s), orbit 56–61 fps (budget ≥30). These are dev-server numbers,
  not production or headset numbers.

**Not in this phase:** implementing missing controls. Measurement first.

**Not in this phase:** implementing missing controls. Measurement first.

### 6.1 Phase demo script format

Every phase exit demo is a numbered script stored in
`parity/phase-demos/phase-N.md`. Each step names the action, the expected
observation, and the evidence artifact (test name, trace, screenshot or
console line). A demo runs from a clean browser profile against a fresh build;
if a step cannot be run, the phase is not complete. The Phase 0 script is
`parity/phase-demos/phase-0.md`.

### Phase 1 — Document shell and local Documents page (8–12 weeks) — **complete 2026-11-06**

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

**Exit evidence (measured 2026-11-06)**

- A document with three Part Studios is created, searched, keyboard-reordered,
  drag-reordered, duplicated and multi-selected/duplicated in Chromium.
- Rename, duplicate, export download, trash/restore and permanent-delete paths
  run through the Documents page; the created document is confirmed in
  IndexedDB.
- A named snapshot is created, survives a reload, and restores the scene to the
  snapshotted geometry.
- A deliberately corrupt localStorage mirror is replaced on reload by the good
  IndexedDB copy; a failed localStorage write reports a quota error and leaves
  the last serialized good save intact.
- `src/document/__tests__` passes 26 tests; the Documents and tab Chromium specs
  pass. Full gate and perf results are recorded in
  `parity/phase-demos/phase-1.md`.

**Not in this phase:** cloud storage, accounts, sharing, real Assembly/Drawing
workspaces (their tabs arrive with their phases). The five-family toolbar
rebuild is also deferred; the document toolbar landed, while feature/sketch
context toolbars remain the existing surfaces.

### Phase 2 — Sketch parity (4–6 months) — **in progress: Phase 2.1 complete**

**Goal:** every Onshape sketch entity, constraint, dimension and modify tool,
with inference and conflict feedback.

**Phase 2 internal sequence (5 sub-phases)**

| Sub-phase                         | Scope                                                                                                                                                                                                        | Exit gate                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **2.1 Entities and layers**       | Polyline (chained creation and vertex editing), construction geometry and points, hatch regions/patterns, blocks (define/insert/explode/nested), layer model, colour, visibility, linetypes and DXF mapping. | **Complete: entity, layer and block round-trip unit tests plus browser DXF layer evidence pass.**                                     |
| **2.2 Constraints and inference** | Complete geometric constraint set, inference with glyphs, DOF reporting, over-constraint resolution and named conflict sets.                                                                                 | **Complete: 15-constraint solver test, H/V/perp/parallel/tangent/coincident inference, named conflict set and remove actions pass.**  |
| **2.3 Dimensions**                | Driving, driven and reference dimensions; expressions and variables; limits; consistent value-entry UI.                                                                                                      | **Complete: three driving dimensions, expression/variable persistence, reference measurement, limits and undo/reload coverage pass.** |     | **2.4 Modify and associative project/include** | Trim/extend/split/offset/fillet/chamfer edge cases, chain/loop selection, pattern/transform interactions; project/include edges, curves, points and silhouettes with associative update; face, mate-connector and custom sketch planes. | **Core complete: associative edge/vertex include, face/custom planes and existing modify operations pass. Silhouettes and mate-connector planes remain explicit gaps.** |     | **2.5 Text/underlay, analysis and acceptance** | Font selection, alignment and text-on-path; underlay rotate/re-attach; curvature, intersection and open/closed-profile analysis; acceptance checklist and visual regression baselines. | **Complete: text, underlay rotate/re-attach, analysis panel and checklist pass. Screenshot baselines remain a release capture task.** |

These are sequencing slices inside Phase 2, not five additional global phases.
The 4–6 month phase estimate assumes the four-person team works them in
parallel; run sequentially they are longer.

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

**Landed 2026-11-06 (Phase 2.5)**

- Image underlays can rotate around the sketch normal and re-attach to a
  selected sketch point; rotation persists with the sketch.
- Sketch analysis reports open/closed profile counts, line intersections and
  maximum circle/arc curvature through a dedicated panel.
- Text insertion already emits editable single-stroke geometry and remains
  part of the same profile pipeline.
- Acceptance is recorded in `TEST_BIBLE.md`; screenshot baselines are captured
  by the browser tester rather than claimed from a static check.

**Landed 2026-11-06 (Phase 2.4)**

- Included geometry now carries `includeSource` metadata (source node and
  offset), so moving/undoing the upstream body re-projects its points instead
  of leaving stale sketch geometry.
- Include projects body section edges plus selected-body vertices. The data is
  stored on the sketch and survives project save/load.
- The plane picker retains XY/XZ/YZ, body-face selection and offsets, and now
  accepts a custom normal vector.
- Existing trim/extend/split/offset/fillet/chamfer and transform/pattern paths
  remain the modify implementation; this slice adds the associative include
  path they feed into.

**Landed 2026-11-06 (Phase 2.3)**

- Dimensional constraints now persist their source `expression`, optional
  inclusive `min`/`max` limits, and the existing `driving` flag through undo
  and project save/load.
- The dimension overlay accepts arithmetic and unit expressions, resolves
  sketch-local variables, validates limits before submit, and preserves the
  expression when a dimension is reopened for editing.
- Reference dimensions (`driving: false`) are re-measured from solved geometry
  after every solve. They follow dragged geometry without adding solver
  equations; driving dimensions still enforce their value.
- The Layers dialog now includes sketch variables (`name = value`) that are
  available to every dimension expression in that sketch.
- Focused coverage covers scoped variable evaluation and reference measurement;
  the full vendor solver suite remains at 38 tests.

**Landed 2026-11-06 (Phase 2.2)**

- Automatic constraint inference now covers horizontal, vertical, perpendicular,
  parallel, tangent and coincident relationships, in addition to endpoint,
  midpoint, centre, quadrant and intersection snap glyphs.
- The solver reports named redundant/conflicting constraint ids. The feedback
  panel names the set and offers a remove action for each conflicting
  constraint, so an over-constrained sketch can be resolved without abandoning
  the sketch.
- DOF and fully/under/over-constrained status continue to come from planegcs;
  the 18-type constraint registry covers 12 geometric and 6 dimensional types.
- Vendor solver coverage includes a sketch carrying 15 independent constraints,
  plus the existing deliberate-conflict assertion.

**Landed 2026-11-06 (Phase 2.1)**

- Polyline is a chain of real lines sharing `polylineId`, so solver, render,
  BRep and shared-point vertex editing stay on the existing paths.
- Hatch is a first-class `SketchHatch` with ordered boundary line ids, pattern,
  spacing, angle and layer metadata; it renders solid/line/cross and is
  excluded from BRep. Deleting a boundary line cascades to its hatch.
- Blocks define snapshot definitions, insert clones with remapped point, line,
  hatch-boundary and polyline ids, preserve nested instance paths, and explode
  back to ordinary geometry. Selecting one member selects the whole instance.
- Layers carry colour, visibility and continuous/dashed/dotted/center styles;
  assignment, the Layers dialog, renderer visibility and DXF LAYER import are
  wired end to end.
- DXF import now maps LAYER table colours/linetypes/visibility and entity layer
  codes, and groups LWPOLYLINE segments by `polylineId`.
- Focused tests cover closed-loop hatch creation, layer assignment, block
  define/insert/explode, nested block paths, block hatch remapping, polyline
  vertices and DXF layers. `test:bible` and the Chromium sketch-controls spec
  pass.

**Landed 2026-11-06 (first slice)**

- The solver's `conflictingConstraintIds` / `redundantConstraintIds` now flow
  through `ConstraintResult`, sketch feedback and the UI toast. The toast names
  the offending constraints and their primitives instead of saying only
  "constraint conflicts".
- `src/model/sketchDiagnostics.ts` formats the named set; unknown ids are kept
  rather than hidden.
- Focused unit tests cover the formatter; app typecheck, the full gate and the
  existing sketch browser spec pass.**Phase 2 exit:** complete except screenshot baseline capture. Silhouette and
  mate-connector include remain documented compatibility gaps for a later slice.

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

Landed 2026-11-06 (Phase 0):

1. `scripts/control-inventory.mjs` scans the JSX and generates
   `CONTROL_INVENTORY.md` + `parity/controls.json`. `npm run check:controls`
   fails on a visible control with no handler or no accessible label; the first
   run found 2 dead and 38 unlabeled controls, all resolved.
2. `scripts/parity-matrix.mjs` parses section 4, applies `parity/owners.json`,
   validates every row's status and writes `PARITY_STATUS.md` +
   `parity/matrix.json`. `npm run check:parity` fails on an untracked row.
3. `parity/budgets.json`, `scripts/check-budgets.mjs` and
   `e2e/perf-budget.spec.ts` define and measure boot, document reload,
   regeneration and orbit, plus the Chromium/Firefox/WebKit matrix.
4. `parity/phase-demos/phase-0.md` defines the demo-script format and records
   the Phase 0 run; `npm run test:bible` now includes the new checks.

Landed 2026-11-06 (Phase 1, second slice):

1. `src/document/` — a persisted `CadDocument` with `tabs[]`, active tab,
   migration from the old single-design project blob, and repair on read.
2. IndexedDB (`scadgen.documents`) is the durable store, with the localStorage
   map as a synchronous mirror and fallback. Boot hydrates before the scene
   resolves its tab; newest `updatedAt` wins per document on migration.
3. Part Studio tabs are real: create, rename, duplicate, move, delete, switch,
   search, multi-select, drag reorder and keyboard reorder. Each tab stores its
   own serialized design; switching flushes the live scene and restores the
   target tab, the same path a reload uses.
4. The Documents page provides grid/list, create, import, open, rename,
   duplicate, export, trash/restore, permanent delete, recent, search, kind
   filter and sort. The document panel provides properties, tab multi-select,
   named snapshots (newest 20), where-used assets and storage/size status.
5. Save state, autosave, explicit save and storage failures are visible; a
   corrupt mirror falls back to the good IndexedDB copy. Unit tests cover the
   model, browse rules, snapshots, file round-trip, corrupt mirror and quota
   failure; Chromium specs cover the Documents page, tab manager and the
   existing tab isolation/reload path.

Phase 1 is complete for the local document shell. The matrix is 39.7% after
Phase 2.2 because Assembly, Drawing, BOM, feature/part search and deeper
document behaviour are later phases; the shipped rows include the
Documents page, Part Studio tabs and named local history. Only Part Studio tabs
are offered because the other workspaces do not exist yet; adding empty tabs
would be a mock.

Landed 2026-11-06 (Phase 2, first slice):

1. Sketch constraint feedback now carries the solver's named conflicting or
   redundant constraint ids end to end. The feedback toast shows the constraint
   type and primitive ids, with an 8 s window for a conflicting set.
2. The formatter is a pure model helper with focused unit tests. Unknown ids
   survive formatting instead of being silently dropped.

Phase 2 is code-complete across 2.1–2.5: entities/layers/DXF, constraint
inference/conflict resolution, driving/reference dimensions with expressions,
variables and limits, associative include and custom planes, plus text,
underlay rotation/re-attach and sketch analysis. Screenshot baselines remain a
release capture task. Keep the tab spec in the Chromium suite until the
Firefox/WebKit smoke matrix can afford its runtime, and continue the
control-evidence burn-down.

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
