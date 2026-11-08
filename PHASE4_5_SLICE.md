# Phase 4 + 5 vertical slice — Assembly and Drawing

Status: **working expanded slice; not full Onshape parity.**

Completion list for Phase 4 and Phase 5: `PHASE4_5_REMAINING.md`.

Phase 3 is still at 3A. Assembly and Drawing tabs are real persisted workspaces
sharing the active Part Studio scene. They do not duplicate geometry.

## What is implemented

### Assembly (`kind: "assembly"`)

- Persisted payload in `DocumentTab.design`:
  `{ v: 1, kind: "assembly", sourceTabId, assembly, explode, positions }`.
  Instance visibility, nested subassemblies and assembly features are persisted.
- Instances are added from visible solid bodies in the source Part Studio.
  Sketch/profile bodies are excluded.
- Named local mate connectors derived from body bounds: body origin, center,
  six faces and X/Y/Z axes. Mates can reference them instead of only `body`.
- Mate model exposes the full expected kind set: fasten, coincident,
  concentric, distance, angle, parallel, perpendicular, tangent, planar, ball,
  pin-slot, slider, cylindrical, revolute, prismatic, screw and width.
- `Solve & place` runs the geometry-aware solver against connector frames. The
  solver handles nonzero angle targets, tangent radius offsets, screw/width
  axial values, full fasten orientation and local connector-frame conversion.
  Complementary mates on the same pair are accepted; exact duplicate
  constraints are rejected.
- **Subassemblies:** selected instances can be grouped into a nested
  subassembly, dissolved back to top-level instances, and flattened back to
  world transforms for placement, visibility, interference and BOM. Nested
  groups support rename and per-leaf visibility.
- **Assembly features:** hole, cut, boss/extrude, revolve, fillet-all-edges and
  chamfer-all-edges are written as in-context nodes into the source Part Studio,
  targeting the selected instance's body. Because the feature is part of the
  Part Studio history, it survives tab switches and project save/reload instead
  of existing only as a transient scene edit. Radius, depth and offsets are
  entered in millimetres and converted to SI.
- **Interference:** AABB is the broad phase. When body BReps are available,
  `exactInterferencePairs` runs an OCCT `BRepAlgoAPI_Common` intersection and
  reports the common volume with `method: "brep"`. If OCC cannot build the
  common shape, the report falls back to tessellated face-triangle tests
  (`method: "face"`) and then to AABB (`method: "bounds"`); the UI names which
  test produced each pair.
- Linear instance patterns along X/Y/Z with count and spacing.
- Per-instance visibility toggles. Hidden instances remain in the assembly/BOM
  but are not placed or interference-tested.
- Read-only assembly viewing when the session cannot edit.
- Explode slider, named positions, and BOM modes: structured, indented, flat.
- Recursive BOM derives subassembly rows and nested child rows with quantities.
- Instances are placed in the 3D scene; changing tabs restores the workspace
  payload and re-places instances.

### Drawing (`kind: "drawing"`)

- Persisted payload in `DocumentTab.design`:
  `{ v: 1, kind: "drawing", sourceTabId, assemblyTabId, sheet, sheets?,
activeSheet?, notes, balloons, gdt?, dimensions? }`.
- A4/A3, landscape/portrait, title, drawing number, scale, BOM toggle, ISO/ANSI
  template selection and optional zone grid per sheet.
- Multi-sheet drawings with add/remove/sheet navigation. The active sheet is
  mirrored into the legacy `sheet` field so older drawing payloads still load.
  SVG builds one composite sheet view; DXF and DWG use named paper-space
  layouts; PDF emits one page per sheet.
- Deterministic SVG sheet with front, top, right and isometric projections.
- Hidden-line removal by analytic segment/triangle interval clipping (no
  sampling), with an optional dashed hidden-line display.
- Optional section A-A generated from face/plane intersections.
- **Detail views:** circle-clipped, scaled detail of a parent projection, with
  configurable label, centre, radius and scale.
- **Broken-out views:** circular broken-out region of a parent projection,
  rendered as its own labelled sheet view.
- **Auxiliary views:** projection along a model-space direction, using a stable
  basis, with configurable label.
- **GD&T and weld symbols:** feature-control frames (flatness through runout,
  optional diameter and datum references), datum feature symbols, surface-finish
  (`Ra`) and weld symbols with type, size, length, pitch and all-around flags.
  They render in SVG, PDF and DXF and persist per sheet.
- **Associative annotations:** balloons and GD&T can be anchored to a body in
  the projected view; dimensions can be anchored to a body or a specific body
  edge in a view, with horizontal/vertical measurement from the projected
  geometry.
- Per-sheet notes and balloons.
- Title block and optional assembly-linked BOM table.
- Native multi-page vector PDF and ASCII DXF export, plus composite multi-sheet
  SVG export.
- **DWG export:** binary R2000 (`AC1015`), R2004 (`AC1018`) or R2018
  (`AC1032`), selectable in the drawing workspace and written by the
  MIT-licensed, pure-TypeScript `nasjidwg` codec. The sheet is generated once
  as DXF, parsed by `nasjidwg`, and encoded as DWG; it is not a DXF file with a
  renamed extension. Drawing dimensions are emitted as native associative
  `DIMENSION` entities, each with its anonymous rendered block, so CAD opens
  them as dimensions rather than loose lines and text.

### Document integration

- `DocumentTabBar` enables Assembly and Drawing creation.
- Creating a tab serializes the current Part Studio, appends and activates the
  new tab.
- Switching tabs captures the live workspace into its tab and loads the next
  payload.
- Reload restores the active tab and its assembly/drawing workspace.
- Assembly/Drawing workspaces hide the Part Studio toolbar and body inspector.

## Verification performed

```bash
npx tsc -p tsconfig.json --noEmit
npx vitest run src/assemblies/__tests__ src/drawings/__tests__
npx playwright test e2e/phase4-5.spec.ts --project=chromium
```

Current focused results:

- Project typecheck: **passed** (`tsc --noEmit`, exit 0).
- Focused Vitest: **70 tests passed** across all assembly and drawing suites,
  including every exposed mate kind.
- Focused Playwright: **1 passed**, covering Assembly/Drawing creation,
  instances, BRep interference, mate solve, in-context boss/fillet, subassembly
  group/ungroup, pattern, linked drawing, zones/template, custom views, weld,
  body-linked balloon, multi-sheet SVG/DXF, R2018 DWG download, reload and
  restore.

## Remaining limitations

### Assembly

- Interference reports exact OCCT common volume when available, but not contact
  area or a persistent interference body.
- The mate solver is iterative; mate limits, full over-constraint diagnosis and
  drag-aware solving remain incomplete.
- Mass properties, configurations, display states beyond visibility, standard
  content and large-assembly LOD/performance budgets are not built.
- Connector geometry is bounds-derived, not true face/edge topology selection.

### Drawing

- DWG still writes the sheet as LINE, LWPOLYLINE, CIRCLE and TEXT entities on
  VISIBLE/HIDDEN/ANNOTATION layers, plus native DIMENSION records. It does not
  create general reusable blocks or dynamic DWG objects. R2007 is omitted
  because `nasjidwg` marks that container experimental.
- Dimensions follow projected body bounds or a selected body edge; they are
  drawing associations, not source-model driving constraints.
- Hidden-line intervals are exact for the tessellated source triangles; curved
  fidelity still follows the source tessellation.
- Dedicated drawing-view configuration and suppression are not built.

### General

- No commit or push was made for this slice.
