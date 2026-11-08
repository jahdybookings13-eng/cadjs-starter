# PARITY STATUS

Generated from `ONSHAPE_PARITY.md` section 4 and `parity/owners.json` by
`scripts/parity-matrix.mjs`. Do not edit by hand.

Generated: 2026-11-08T15:24:59.923Z

## Summary

- Capability rows: **97** across **8** sections
- Self-assessed row score (SHIPPED=1, PARTIAL=0.5; **not** functional parity): **75.3%**
- SHIPPED: **49**
- PARTIAL: **48**
- MISSING: **0**
- STUDIO: **0**

> The row score is hand-maintained tracking metadata, not measured parity. A
> `PARTIAL` row counts half even when only a fraction of the Onshape
> behaviour exists, and `SHIPPED` does not prove the required behaviour is
> complete. Hard control evidence is reported separately below.

## Hard evidence

- Controls: **878**
- Direct test evidence: **76/878 (8.7%)**
- Any referenced evidence: **236/878 (26.9%)**
- No direct/label evidence: **642**

## Ownership

| Section | Owner | Acceptance evidence |
| --- | --- | --- |
| 4.1 Documents, tabs and local data | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.2 Sketch | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.3 Part Studio features | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.4 Assembly | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.5 Drawing and manufacturing | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.6 Specialized studios | Specialized studios | `src/sim/__tests__/`<br>`src/cam/__tests__/`<br>`src/render/__tests__/`<br>`src/pcb/__tests__/`<br>`src/ecad/__tests__/` |
| 4.7 Import/export and interoperability | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.8 Browser UI platform | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |

## Rows

| ID | Capability | Status | Owner | Evidence |
| --- | --- | --- | --- | --- |
| 4.1.1 | Documents page | SHIPPED | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.2 | Document model | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.3 | Document toolbar | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.4 | Document panel | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.5 | Tab manager | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.6 | Part Studio tabs | SHIPPED | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.7 | Assembly tabs | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.8 | Drawing tabs | SHIPPED | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.9 | BOM | SHIPPED | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.10 | Search | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.11 | Local named history | SHIPPED | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.1.12 | Save/reload/recovery | PARTIAL | Document & local data | `src/document/__tests__/document.test.ts`<br>`e2e/document-tabs.spec.ts` |
| 4.2.1 | Line/arc/circle/ellipse | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.2 | Spline/Bezier/conic | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.3 | Polyline | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.4 | Hatch | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.5 | Sketch text | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.6 | Blocks | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.7 | Layers/linetypes | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.8 | Constraints | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.9 | Dimensions | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.10 | Trim/extend/split | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.11 | Fillet/chamfer/offset | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.12 | Mirror/pattern/transform | PARTIAL | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.13 | Project/include | PARTIAL | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.14 | Image underlay | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.15 | Sketch planes | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.16 | Sketch analysis | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.2.17 | Sketch in drawing/assembly | SHIPPED | Sketch | `src/model/__tests__/sketchGeometry.test.ts`<br>`src/model/__tests__/sketchConstraints*`<br>`e2e/sketch-controls.spec.ts` |
| 4.3.1 | Extrude | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.2 | Revolve | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.3 | Sweep | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.4 | Loft | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.5 | Fillet | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.6 | Chamfer | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.7 | Shell | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.8 | Draft | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.9 | Hole | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.10 | Thread | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.11 | Pattern | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.12 | Mirror | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.13 | Boolean | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.14 | Split | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.15 | Move/delete face | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.16 | Transform/scale | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.17 | Project curves/curve on face | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.18 | Surface features | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.19 | Sheet metal | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.20 | Frames | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.21 | Rib/web | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.22 | Dome/offset/intersect | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.23 | Helix/coil/spring | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.24 | Derived/imported feature | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.25 | Feature tree behaviour | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.26 | Multi-body/part semantics | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.27 | Configurations | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.28 | Variables | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.29 | FeatureScript/custom features | SHIPPED | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.3.30 | Measure/inspect | PARTIAL | Part Studio | `src/model/__tests__/primitives.test.ts`<br>`src/model/__tests__/executor.test.ts`<br>`e2e/parity-ops.spec.ts` |
| 4.4.1 | Instances | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.2 | Mate model | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.3 | DOF/over-constraint | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.4 | Drag/move/rotate | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.5 | Interference/clearance | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.6 | Exploded views | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.7 | Display states | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.8 | BOM | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.9 | In-context editing | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.10 | Large assemblies | SHIPPED | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.4.11 | Assembly features | PARTIAL | Assembly | `src/assemblies/__tests__/`<br>`src/components/AssemblyPanel.tsx` |
| 4.5.1 | Drawing workspace | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.2 | Sheets/templates | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.3 | Standard views | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.4 | Dimensions/GD&T | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.5 | BOM tables | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.6 | Export | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.5.7 | Patent sheets | SHIPPED | Drawing | `src/manufacture/__tests__/index.test.ts`<br>`src/manufacture/__tests__/dxf.test.ts` |
| 4.6.1 | Render Studio | SHIPPED | Specialized studios | `src/sim/__tests__/`<br>`src/cam/__tests__/`<br>`src/render/__tests__/`<br>`src/pcb/__tests__/`<br>`src/ecad/__tests__/` |
| 4.6.2 | Simulation | SHIPPED | Specialized studios | `src/sim/__tests__/`<br>`src/cam/__tests__/`<br>`src/render/__tests__/`<br>`src/pcb/__tests__/`<br>`src/ecad/__tests__/` |
| 4.6.3 | CAM Studio | SHIPPED | Specialized studios | `src/sim/__tests__/`<br>`src/cam/__tests__/`<br>`src/render/__tests__/`<br>`src/pcb/__tests__/`<br>`src/ecad/__tests__/` |
| 4.6.4 | PCB Studio | SHIPPED | Specialized studios | `src/sim/__tests__/`<br>`src/cam/__tests__/`<br>`src/render/__tests__/`<br>`src/pcb/__tests__/`<br>`src/ecad/__tests__/` |
| 4.7.1 | STEP import/export | PARTIAL | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.2 | STL import/export | SHIPPED | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.3 | DXF/DWG | PARTIAL | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.4 | IGES/Parasolid/ACIS/JT/3MF | SHIPPED | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.5 | PDF drawing export | SHIPPED | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.6 | Image import | PARTIAL | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.7.7 | Imported feature editing | SHIPPED | Interoperability | `src/manufacture/__tests__/index.test.ts`<br>`e2e/step-import.spec.ts` |
| 4.8.1 | Keyboard shortcuts | PARTIAL | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.2 | Toolbar customization | SHIPPED | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.3 | Tool search | SHIPPED | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.4 | Context menus | PARTIAL | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.5 | Cross-browser | PARTIAL | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.6 | Responsive layout | PARTIAL | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.7 | Accessibility | SHIPPED | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.8 | Performance budgets | SHIPPED | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
| 4.8.9 | Control inventory | SHIPPED | Browser UI platform | `e2e/app-boot.spec.ts`<br>`e2e/document-tabs.spec.ts`<br>`scripts/control-inventory.mjs` |
