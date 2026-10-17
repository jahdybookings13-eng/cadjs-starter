# VR PROGRESS & HANDOFF

## What's Done (Code)

### Tool Belt (Waist Carousel)
- Arc-segment concentric ring at waist height (0.8m above floor)
- Radius 0.2m, ring thickness 0.05m, gap between segments
- Text labels face user (readable from above looking down)
- Appears when looking down (headDir.y < -0.5)
- Positioned correctly in player-local space (not stuck at origin)
- Actions: Sketch, Extrude, Loft, Sweep, Revolve, Fillet, Shell, Measure

### Belt Scrolling
- ONLY via grip: grab the belt ring, rotate your hand to scroll
- No thumbstick, no back button scrolling
- Inverted spin fixed: move hand left, belt goes left

### Belt Selection
- Point hand at belt → raycast hover highlights segment
- Raycast angles down at 45° to hit horizontal belt
- Trigger click → selects hovered tool, calls `setMode()`
- Action-to-mode mapping wired: Sketch→sketch, Extrude→extrude, Loft→loft, Sweep→sweep, Revolve→revolve, Fillet→fillet, Shell→combine, Measure→measure

### Grab System (Mode-Independent)
- Squeeze/grip button (buttons[1]) on either controller
- Raycasts from hand, grabs object within 0.5m with userData.id
- Object follows hand freely in 3D while held
- On grab: `selectElement(id)` so properties show
- On release: `deselectElement(id)`, drop object
- Two-hand scale supported (pinch gesture)

### VR Session
- WebXR immersive-vr with local-floor, hand-tracking optional
- Locomotion: thumbstick, head-relative, wall+desk collision
- Room: 5x5x3m with desk, measuring pad, lighting
- Look-up: head menu (deprecated but still present)
- Look-down: tool belt
- Behind-ear reach: pencil tool

### Files Modified
- `/src/components/vr/useVRSession.ts` — main VR loop, grab system, belt interaction, mode switching
- `/src/components/vr/buildVRControls.ts` — belt geometry (arc segments), carousel positioning, highlight logic

---

## What's NOT Done (Spec Only — See VR_SKETCH_SPEC.md)

### SKETCH MODE — Sectioned into Parts

**PART 1: Sketch Mode Entry & Plane Selection** [NOT STARTED]
- Enter via tool belt → Sketch
- Ray landing determines where you start:
  - Ray hits desk → desk sketch mode (locked to desk plane)
  - Ray hits body face → sketch on that face
  - Ray hits origin plane → sketch on that plane
  - Ray hits nothing → 3D freehand mode
- No code written for this yet

**PART 2: Desk Sketching** [NOT STARTED]
- Sketch locked to desk plane (XZ at 0.75m)
- Ray = point placement, trigger = commit point
- Grid appears on desk surface
- Overhead PiP viewport (top-down view of sketch, dimensions, constraints)
- No code written for this yet

**PART 3: 3D Freehand Sketching** [NOT STARTED]
- Grip button = place points (NOT trigger, NOT ray)
- Grip press → lays point at hand position
- Grip hold + move → defines next point
- Grip release → commits point
- Fluent drawing-in-space feel
- This is the FIRST thing to implement after plane selection
- No code written for this yet

**PART 4: Axis Snapping** [NOT STARTED]
- Both grips held → modular axis snapping
- Choose which axis (X/Y/Z) the next point goes
- Toggle axes via hand tilt or thumbstick
- Axis highlight lines (X=red, Y=green, Z=blue)
- Release one grip → free movement
- No code written for this yet

**PART 5: Line Drawing (Priority 1)** [NOT STARTED]
- Chain from endpoint after each point
- Preview line from last point to hand/ray position
- Desk: ray + trigger chain
- 3D: grip chain
- Cancel chain: escape or cancel gesture
- THIS IS THE FIRST GEOMETRY TO GET WORKING
- No code written for this yet

**PART 6: Shape Tool Selection** [NOT STARTED]
- RT hold + left/right thumbstick = scroll through sub-tools
- Selected tool preview appears IN FRONT OF POV
- Sub-tools: Line, Rectangle, Circle, Arc, Point, Dimension, Trim, Extend, Select
- Construction toggle: both grips + trigger
- No code written for this yet

**PART 7: Rectangle, Circle, Arc in 3D** [NOT STARTED]
- Rectangle: two-corner (desk) or grip-define-plane + grip-define-size (3D)
- Circle: center + radius point
- Arc: center + start + end
- All through same useCadCore calls as web
- No code written for this yet

**PART 8: Constraints** [NOT STARTED]
- Select sub-mode → right grip on primitive → context menu
- Menu floats at hand, shows applicable constraints
- Thumbstick navigate, trigger select
- Dimensional: inline value input (floating numpad)
- Full web parity: all geometric + dimensional constraints
- Fix/unfix point: right grip click on point
- Feedback toasts: redundant, conflicting, fully constrained
- No code written for this yet

**PART 9: Sketch Completion** [NOT STARTED]
- Finish: both grips + both triggers (full squeeze) → commit
- Cancel: left grip double-click → discard
- Undo/Redo: left grip + thumbstick up/down, sketch-scoped
- No code written for this yet

### OTHER MODES — All Not Started
- Extrude, Loft, Sweep, Revolve, Fillet, Combine, Measure
- See VR_SKETCH_SPEC.md "Per-Mode VR Controls" for spec
- None of these have VR interaction code yet

### VR INFRASTRUCTURE — Not Started
- Inference/snap system for VR
- Feature tree browser in VR
- ViewCube (physical object in room)
- Import/Export file browser in VR
- Floating HUD (status bar)
- Dimension input (floating numpad)
- Select-Other menu in VR

---

## NEXT STEP

**Implement Part 5: Line Drawing in 3D Space**

This is the priority. Get lines working first:
1. Enter sketch mode from belt
2. Grip to place points in 3D space
3. Chain lines between points
4. Preview line from last point to hand
5. Both grips for axis snapping
6. Commit to same useCadCore as web (geometry parity)

Desk sketching (Part 2) can come after — 3D freehand lines first.
