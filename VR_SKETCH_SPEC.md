# VR SKETCH MODE SPEC

## PRIORITY 1: Lines in 3D Space (DO THIS FIRST)

### Two Sketching Contexts: Desk vs Freehand 3D

**DESK SKETCHING** — ray determines where you start:
- Hand ray hits the desk surface → that's where you sketch
- Ray = how you place points on the desk (ray landing = point position)
- Trigger to place points on desk plane
- Sketch locks to desk plane (XZ at desk height 0.75m)
- Overhead PiP: viewport above/behind user showing top-down view of the sketch
  - PiP visible when glancing up slightly
  - Shows 2D sketch flat with dimensions and constraints

**FREEHAND 3D SKETCHING** — grip is how you lay points:
- When NOT hitting the desk → you're in 3D freehand mode
- GRIP BUTTON = place points / start the sketch
- Grip press at hand position → lays a point there
- Grip hold + move → drags/defines next point position
- Grip release → commits point
- This is the primary input for 3D freehand — NOT trigger, NOT ray
- Fluent: grip-and-drag feels like drawing in space with your hand

### Ray vs Grip Summary
| Context | Input | What It Does |
|---------|-------|-------------|
| Desk | Ray (pointing) | Determines where on desk you're sketching |
| Desk | Trigger | Place point at ray landing spot |
| 3D Freehand | Grip | Place/start point at hand position |
| 3D Freehand | Ray | Distance reference only (not for placing points) |

### Line Drawing Flow
- Enter sketch mode via tool belt → Sketch
- DESK: point at desk with ray → trigger click to place first point → move ray → trigger click next point → chain
- 3D: grip press at hand position → place first point → move hand → grip press → place next point → chain
- Chain continues from last endpoint until cancelled

### Axis Snapping (Both Grips Held)
- While BOTH grip buttons held → modular axis snapping
- Choose which direction/axis the next point goes
- Toggle axes by tilting hand or thumbstick direction
- Visual: axis line highlights (X=red, Y=green, Z=blue)
- Release one grip → back to free movement

---

## PRIORITY 2: Locomotion

- Locomotion is UNLOCKED during sketch mode
- You can walk/move while sketching
- This lets you walk around your sketch, approach the desk from different angles, etc.

---

## PRIORITY 3: Sketch Sub-Tools (VR Input Mapping)

### Tool Selection
- Right Trigger (RT) HOLD + left/right thumbstick = scroll through sub-tools
- The tool you're selecting (line, circle, rectangle, etc.) appears IN FRONT OF YOUR POV
- It's a visual preview — you see the shape/tool floating in front of you
- Release RT → tool is selected, preview disappears
- Thumbstick left/right cycles through the list

### Sub-Tool List (full parity with web)
| Sub-Mode | Web Key | VR Action | Notes |
|----------|---------|-----------|-------|
| Line | L | Default on mode enter | Chain drawing |
| Rectangle | R | Select from palette | Two-corner |
| Circle | C | Select from palette | Center + radius |
| Arc | A | Select from palette | Center + start + end |
| Point | P | Select from palette | Single click |
| Dimension | D | Select from palette | Click primitive |
| Select | S | Select from palette | For constraint application |
| Trim | T | Select from palette | Click segment |
| Extend | E | Select from palette | Click segment |

### Construction Toggle
- Both grips + trigger → toggle construction geometry mode
- Visual: line style changes to dashed

---

## PRIORITY 4: Constraints (VR)

### Constraint Application
- In Select sub-mode, right grip click on primitive → context menu appears
- Menu floats in front at hand position
- Shows applicable constraints (filtered by selection, same logic as web)
- Thumbstick scroll to navigate, trigger to select
- Dimensional constraints: opens inline value input
  - Numpad entry via thumbstick (virtual numpad floating at hand)
  - Or voice input (future)

### Constraint Types (full web parity)
**Geometric:** coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, concentric, pointOnLine, pointOnCircle

**Dimensional:** distance, distanceX, distanceY, angle, radius, diameter

### Fix/Unfix Point
- Right grip click on point → toggle fixed constraint

### Constraint Feedback
- Same toast system as web: redundant (yellow), conflicting (red), fully constrained (green)
- Toasts rendered as floating billboard at eye level, auto-dismiss

---

## PRIORITY 5: Sketch Completion

### Finish Sketch
- Both grips + both triggers (full hand squeeze) → commit sketch
- Or: look up at head menu → "Finish Sketch" button, trigger click
- Same as web: commits to 3D body, exits sketch mode

### Cancel Sketch
- Left grip double-click → cancel, discard sketch
- Or: look up at head menu → "Cancel Sketch" button

### Undo/Redo (Within Sketch)
- Left grip + left thumbstick up → undo
- Left grip + left thumbstick down → redo
- Uses sketch-scoped undo stack (same as web)

---

# FULL WEB→VR PARITY SPEC

## Scene Modes (Tool Belt)

All modes accessible from waist tool belt. Current belt items:
Sketch, Extrude, Loft, Sweep, Revolve, Fillet, Shell, Measure

Missing from belt that exists in web: Move (should be default/escape mode)

## Per-Mode VR Controls

### Move Mode
- Default mode (no tool active)
- Grab any object with grip → move freely in 3D
- Both grips on object → scale (pinch)
- Trigger click → select (properties show in floating panel)
- Alt+grab → rotate (future: grip + trigger held)

### Extrude Mode
- Trigger click on flat profile → select for extrusion
- Grab the extrude arrow handle → drag to set depth
- Grip + thumbstick → adjust depth precisely
- Both grips → toggle symmetric
- Right grip → toggle join/cut
- Dimension input: floating numpad at hand position

### Loft Mode
- Trigger click profiles to add (2+ required)
- Trigger click again to remove
- Right grip → toggle smooth/ruled
- Both grips + trigger → apply loft

### Sweep Mode
- Phase 1: trigger click to select profile
- Phase 2: trigger click to select path
- Right grip → cycle perpendicular/parallel orientation
- Right grip + thumbstick → cycle right/round corner mode
- Both grips + trigger → apply

### Revolve Mode
- Phase 1: trigger click to select profile
- Phase 2: trigger click to select axis (or grip+thumbstick to pick X/Y/Z origin axis)
- Phase 3: grip drag or thumbstick to set angle
- Right grip → cycle one-side/two-sides/symmetric
- Right grip + trigger → flip axis
- Both grips + trigger → apply

### Fillet Mode
- Trigger click body → select
- Trigger click edges → toggle edge selection
- Right grip → toggle fillet/chamfer
- Grip drag → adjust radius
- Dimension input: floating numpad

### Combine Mode
- Trigger click first body → target
- Trigger click additional bodies → tool bodies
- Right grip → cycle join/cut/intersect
- Right grip + thumbstick → toggle keep tools
- Both grips + trigger → apply

### Measure Mode
- Right grip → cycle sub-modes: distance / edge length / angle
- Trigger click → place measurement points
- Right grip + thumbstick up → pin measurement
- Right grip + thumbstick down → clear temporary
- Measurements float as billboards in 3D space

---

## Selection System (VR)

### Ray-Based Selection
- Hand raycast (from controller, pointing forward/down)
- Hits classified as face / edge / vertex (subPrimSelector thresholds)
- Hover highlights with color feedback
- Trigger click → select
- Ctrl equivalent: grip held while trigger clicking → multi-select

### Select-Other Menu
- Hold trigger ~400ms on overlapping geometry → select-other menu
- Menu floats at hit point, shows candidates
- Thumbstick scroll → cycle, trigger → pick

---

## Inference/Snap System (VR)

### Inference Points
All web inference types must work in VR:
- Endpoint, midpoint, center, quadrant, intersection, perpendicular, tangent, horizontal, vertical

### VR Snap Behavior
- When hand ray passes near an inference point → snap (with visual indicator)
- Snap distance threshold: larger than web (VR needs more forgiveness ~5mm world space)
- Inference glyphs rendered as 3D markers (small spheres/crosses) at snap points
- Guidelines rendered as 3D lines in space

### Grid Snapping
- Toggle: both grips + thumbstick click
- Grid spacing: configurable (same options as web: 0.1, 0.25, 0.5, 1.0, 2.0)
- Visible as 3D grid on sketch plane

---

## Feature Tree / Browser (VR)

### Access
- Look up → head menu → "Browser" button → floating panel
- Panel shows feature tree (same data as web)
- Thumbstick scroll to navigate
- Trigger click → select element
- Double trigger click → edit sketch / rename
- Right grip on item → context menu (edit, rename, delete, hide/show)

### Sketch Properties Panel
- When sketch primitive selected → properties float at hand
- Shows coordinates, radius, length etc.
- Inline editing via floating numpad

---

## View Controls (VR)

### ViewCube
- Physical ViewCube object in the room (on desk or floating)
- Grab and rotate → camera follows
- Or: grip + thumbstick to snap to named views

### Named Views
- Front, Back, Top, Bottom, Left, Right, Isometric
- Access via: both grips + thumbstick direction (up=top, down=bottom, left=left, right=right, forward=front, back=isometric)

### Projection Toggle
- Not needed in VR (stereo rendering is inherently perspective)
- But: orthographic mode for precision work could be a future option

### Fit All
- Both grips + thumbstick click → fit all in view

---

## Import/Export (VR)

### File Operations
- Access via: look up → head menu → File submenu
- Open Project, Save Project, Import STEP/STL, Export STEP/STL
- File browser: floating panel with thumbstick navigation
- Uses same ImportExportService as web

---

## Undo/Redo (VR)

### Global
- Left grip + thumbstick up → undo
- Left grip + thumbstick down → redo
- Same undo stack as web (sketch-scoped when in sketch)

---

## Status Information (VR)

### Floating HUD
- Always-visible thin strip at bottom of view
- Shows: current mode, cursor position (X Y Z), DOF count (sketch mode), constraint status
- Non-intrusive, semi-transparent

### Dimension Input
- When needed (extrude depth, fillet radius, constraint value)
- Floating numpad appears at hand position
- Thumbstick to move cursor, trigger to press keys
- Or: voice input (future)

---

## Geometry Parity (CRITICAL)

### Rule: Geometry created in VR = full web parity
- A line in VR is the SAME line object as in web
- A box sketched in VR is eligible for ALL operations: extrude, fillet, boolean, measure, etc.
- Feature tree sees VR-created geometry identically to web-created geometry
- Undo/redo works across VR and web sessions
- No separate "VR geometry" type — it's the same cadjs core

### This means:
- VR sketch mode calls the same `createSketch`, `addLine`, `addCircle` etc. as web
- VR extrude calls the same `extrudeBRep` as web
- VR uses the same `useCadCore` context — no parallel state
- Element IDs are shared — selecting in VR highlights in feature tree and vice versa
