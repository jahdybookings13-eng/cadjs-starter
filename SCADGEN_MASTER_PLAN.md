# ScadGen Master Plan v2

This is the top-down build plan for ScadGen.

We are not building features randomly.  
We are building a VR-native CAD world from the ground up.

The current phase is:

```text
Phase 1 — World Mechanics
```

The goal of Phase 1 is to make the VR world controllable, observable, and mechanically coherent before we try to reproduce Onshape parity.

---

## 1. Product Direction

ScadGen is a VR-native parametric CAD system.

It is not just Onshape in a headset.

The long-term product has three input surfaces:

```text
1. Hands / controllers / gestures
2. Voice
3. Desk exit-ramp
```

All three must operate on the same model, through the same action system, with the same results.

The desk is not the main experience.  
The desk is the safety net.

The main experience is direct manipulation in 3D space.

---

## 2. Core Laws

### Law 1 — Literal only

There is no visual-only scaling.

Every transform changes the real CAD model.

```text
move = literal
rotate = literal
scale = literal
dimension = literal
```

If it looks bigger, it is bigger.

---

### Law 2 — One action spine

Every operation resolves through the ActionBus.

```text
desk button -> ActionBus
voice -> ActionBus
gesture -> ActionBus
controller -> ActionBus
AI -> ActionBus
debug API -> ActionBus
```

No operation may exist only in one surface.

---

### Law 3 — The ActionBus is dynamic

We do not need a frozen master command list.

The action registry grows as mechanics are built.

Each mechanic registers its actions:

```text
select.face
sketch.spawnTriad
sketch.selectPlane
primitive.box
primitive.sphere
```

The catalog is generated from registered actions.

---

### Law 4 — Selection is the root of manipulation

Before we can do anything to an object, the world must know what is selected.

Selection must carry context:

```text
kind
id
position
normal
parent
sketch context
feature context
```

The first selection kinds are:

```text
none
body
face
edge
vertex
plane
triad
sketch
entity
component
```

---

### Law 5 — Sketching starts from a valid spatial requirement

Sketching is not tied to a specific button.

A button, hot button, gesture, voice command, or menu is only an activation mechanism.

The concept is:

```text
Valid sketch requirement satisfied -> sketching can begin.
```

A valid requirement can be:

- free triad exists
- desk triad exists
- plane selected
- face selected
- beam point + distance chosen
- origin/axis/edge selection
- user-created plane

---

## 3. Current Verified State

Status: **parked here intentionally**.

The live VR viewer works as a confirmation surface:

- the AI can drive fake VR headless
- the viewer shows the VR canvas, not the desktop UI
- state/logs/errors are readable
- the human can watch and confirm without entering VR

Current verified mechanics:

```text
viewer canvas focus
selection context
beam state
free triad
desk triad
face-attached triad
triad plane selection
triad move/rotate
primitive spawn debug hook
body selection
beam hover selection
beam select
```

Verified selection sequence:

```text
pointAt right beam
→ hoverBeam
→ selectBeam
→ selection.kind = edge
```

Current viewer state shape:

```text
active
busy
mode
selection
triad
beam
errors
logs
```

Current proof:

```text
selection: edge node_1
triad: face XZ
beam: distance + target available
```

Known limitations:

- selection context is still basic; face/edge classification needs refinement
- triad attach is currently parameter-driven, not fully automatic from selected face
- ActionBus integration for triad/beam actions is not complete
- primitive catalog exists conceptually but is not yet a full registry
- sketch entities on triad planes are not yet built

This is enough to begin Phase 3 when we return.

---

## 4. Master Phase Map

```text
Phase 1 — World Mechanics
Phase 2 — Selection + Triad Mechanics
Phase 3 — Sketch Entity Mechanics
Phase 4 — Primitive Mechanics
Phase 5 — CAD Operation Mechanics
Phase 6 — Desk Parity
Phase 7 — Voice Layer
Phase 8 — Hand Tracking Layer
Phase 9 — Component Library
Phase 10 — Engines
```

Current position:

```text
Phase 1: complete enough
Phase 2: mostly built, parked
Next when resumed: Phase 3 sketch entities on triad planes
```

---

# Phase 1 — World Mechanics

Goal:

> The AI can drive the world, and the human can see what happened.

This phase is done enough to support the rest of the build.

Remaining work:

- keep viewer stable
- keep state/logs readable
- make sure every mechanic can be proven visually
- avoid desktop UI leaking into the viewer

Exit criterion:

```text
A world action can be performed and confirmed visually without entering VR.
```

Status:

```text
Complete.
```

---

# Phase 2 — Selection + Triad Mechanics

Status: **mostly built and parked**.

Goal:

> The world knows what is selected, and sketching can begin from a triad.

What is already live:

```text
selection context
beam state
free triad
desk triad
face-attached triad
triad move/rotate
triad plane selection
hoverBeam
selectBeam
```

What still needs polish when resumed:

```text
ActionBus integration for triad/beam/selection actions
face/edge classification refinement
automatic triad attach from selected face
selection highlight consistency
viewer state cleanup
```

## 2.1 Selection Model

Build a unified selection context.

Shape:

```ts
type SelectionKind =
  | "none"
  | "body"
  | "faces"
  | "face"
  | "edge"
  | "edges"
  | "vertex"
  | "plane"
  | "triad"
  | "triadAxis"
  | "triadPlane"
  | "sketch"
  | "entity"
  | "component";

interface SelectionContext {
  kind: SelectionKind;
  ids: string[];
  position: [number, number, number] | null;
  normal?: [number, number, number] | null;
  parentBodyId?: string | null;
  sketchId?: string | null;
  featureId?: string | null;
}
```

Actions:

```text
select.none
select.body
select.face
select.edge
select.vertex
select.plane
select.triad
select.triadPlane
select.sketch
select.entity
```

Every action must be callable through ActionBus.

## 2.2 Triad Hosts

A triad is a 3D sketch frame.

It has:

```text
origin
X axis
Y axis
Z axis
XY plane
XZ plane
YZ plane
```

Triad hosts:

```text
freeTriad
deskTriad
planeAttachedTriad
faceAttachedTriad
edgeAttachedTriad
originTriad
```

Each host has its own rules.

## 2.3 Free Triad

Free triad is unattached.

It can spawn:

- in front of the user
- at beam target
- at selected point
- at world origin
- at custom coordinates

Default:

```text
position: 0.6m in front of head
orientation: view-aligned
activePlane: XY
```

Actions:

```text
triad.spawnFree
triad.move
triad.rotate
triad.selectPlane
triad.setActivePlane
triad.clear
```

## 2.4 Desk Triad

The desk is a restricted triad host.

It is not just a plane.

Desk rules:

- bounded work zone
- desk surface orientation
- likely default active plane is desk plane
- may allow limited movement within desk bounds
- may have a local desk origin
- may be the safest place for 2D-like sketching

Actions:

```text
triad.spawnDesk
desk.selectSurface
desk.setWorkzone
desk.clearSketch
```

This needs its own section because the desk is the exit ramp.

## 2.5 Plane-Attached Triad

Plane sources:

```text
wall
ceiling
floor
desk surface
object face
datum plane
user-created plane
```

Mechanic:

1. User selects plane or face.
2. Triad attaches.
3. Plane normal becomes triad Z.
4. User can rotate/adjust axes.
5. Active plane becomes selected plane.

Actions:

```text
triad.attachToPlane
triad.attachToFace
triad.detach
```

## 2.6 Beam Placement

The pointer beam is a modular placement tool.

Beam provides:

```text
origin
direction
distance
target
```

Distance modes:

```text
fixed
adjustable
snap
lockDepth
raycast
```

Actions:

```text
beam.setDistance
beam.lockDepth
beam.snapToTarget
beam.placeTriad
```

Concept:

```text
point beam + choose distance + place triad = begin sketch anywhere.
```

Exit criterion for Phase 2:

```text
User can point, select a host, spawn a triad, select a plane, and see it in the viewer.
```

---

# Phase 3 — Sketch Entity Mechanics

Goal:

> Primitives can be created inside a sketch context.

Important distinction:

```text
2D sketch entities are not 3D primitives.
```

2D sketch entities live inside a sketch plane.

First entities:

```text
point
line
rectangle
circle
arc
ellipse
polygon
construction line
```

Each entity needs:

```text
id
sketchId
plane
local coordinates
literal dimensions
selection state
```

Actions:

```text
sketch.addPoint
sketch.addLine
sketch.addRectangle
sketch.addCircle
sketch.addArc
sketch.addEllipse
sketch.selectEntity
sketch.editDimension
sketch.deleteEntity
```

Phase 3 exit criterion:

```text
A user can draw and edit literal entities on a selected triad plane.
```

---

# Phase 4 — Primitive Mechanics

Goal:

> 3D primitives spawn at will.

3D primitives are bodies/features, not just meshes.

They must be:

```text
parametric
editable
selectable
dimensional
tree-visible
transformable
```

Primitive creation:

```text
primitiveType + parameters + placement
```

Placement:

```text
airBeam
freeTriad
deskTriad
planeAttached
faceAttached
worldOrigin
selectedPoint
```

Actions:

```text
primitive.create
primitive.box
primitive.sphere
primitive.cylinder
primitive.cone
primitive.torus
primitive.ellipsoid
primitive.capsule
primitive.dome
primitive.pipe
primitive.prism
primitive.pyramid
```

Phase 4 exit criterion:

```text
User can spawn a catalog of 3D primitives at will and select/edit them.
```

---

# Phase 5 — CAD Operation Mechanics

Goal:

> Turn sketches and primitives into real CAD operations.

Operations:

```text
extrude
revolve
sweep
loft
fillet
chamfer
shell
boolean
pattern
mirror
section
split
measure
```

Every operation must:

- act on valid selection
- create editable feature nodes
- update tree
- update scene
- fail honestly
- be callable from desk and world

Phase 5 exit criterion:

```text
Core Onshape-style CAD operations can be performed through the same action spine.
```

---

# Phase 6 — Desk Parity

Goal:

> The desk is a true exit ramp.

Every world action must have a desk equivalent.

Desk UI needs:

- feature tree
- mode toolbar
- primitive palette
- selection inspector
- dimension editor
- operation panels
- save/load
- action log

Rule:

```text
If the world can do it, the desk can do it.
```

Phase 6 exit criterion:

```text
No operation exists only in VR.
```

---

# Phase 7 — Voice Layer

Goal:

> Voice becomes the fast lane.

Voice must not invent new behavior.

Voice maps to existing actions:

```text
verb + target/setting + value
```

Examples:

```text
new sketch
select face
fillet five millimeters
toggle grid
lock position
show measurements
sphere fifty millimeters
```

Actions:

```text
voice.listen
voice.parse
voice.confirm
voice.runAction
```

Voice requirements:

- local
- fixed vocabulary first
- hold-to-talk or push-to-talk
- visual confirmation
- fallback to orchestrator later

Phase 7 exit criterion:

```text
Voice can operate the same action spine as hands and desk.
```

---

# Phase 8 — Hand Tracking Layer

Goal:

> Direct manipulation becomes more natural.

Hand tracking comes after controller mechanics.

Gestures map to actions:

```text
grab -> object.grab
release -> object.release
pinch -> object.scaleLiteral
point -> ray.update
faceClick -> select.face
twoHandScale -> object.scaleLiteral
```

No separate hand-only logic.

Phase 8 exit criterion:

```text
Hands are another input surface, not a new system.
```

---

# Phase 9 — Component Library

Goal:

> The model becomes manufacturable and meaningful.

Components need:

```text
geometry
dimensions
material
ports
connectors
electrical metadata
mechanical metadata
thermal metadata
compatibility rules
```

Examples:

```text
screen
battery
port
connector
PCB
case
screw
fastener
server part
```

Actions:

```text
component.insert
component.convertBoxToPart
component.checkCompatibility
component.attach
component.replace
```

Phase 9 exit criterion:

```text
Parts are more than meshes; they carry engineering meaning.
```

---

# Phase 10 — Engines

Goal:

> Simulate reality after the world is stable.

Engine order:

```text
1. units
2. material database
3. mesh bridge
4. one physics engine
5. validation
```

Then:

```text
structural
thermal
fluid
electromagnetic
circuit
environment
coupling
```

Phase 10 exit criterion:

```text
One engine can run against real CAD geometry with typed validation.
```

---

# 5. Immediate Next Design Sprint

We should now design the **Selection + Triad Mechanics** layer.

## Sprint Goal

Make the world understand:

```text
what is selected
where a sketch begins
which plane is active
how a triad is hosted
how the user can see it
```

## Sprint Deliverables

### A. Selection Context Upgrade

Current selection is basic:

```text
body / none
```

Upgrade to:

```text
none
body
face
edge
vertex
plane
triad
triadPlane
entity
```

### B. Triad State Model

Store triad state:

```ts
interface VRTriadState {
  placed: boolean;
  host: "free" | "desk" | "plane" | "face";
  position: [number, number, number];
  orientation?: [number, number, number, number];
  activePlane: "XY" | "XZ" | "YZ";
  attachedTo?: {
    kind: "body" | "face" | "plane" | "desk";
    id?: string;
  };
}
```

### C. Triad Host Actions

Implement:

```text
triad.spawnFree
triad.spawnDesk
triad.attachToPlane
triad.attachToFace
triad.selectPlane
triad.move
triad.rotate
triad.clear
```

### D. Beam Placement Model

Implement:

```text
beam.point
beam.distance
beam.target
beam.placeTriad
```

### E. Viewer State Panel

Show:

```text
selection
triad
beam
mode
errors
```

### F. Visual Feedback

The viewer should show:

- triad origin
- axes
- active plane
- selected object highlight
- beam target marker

## Sprint Exit Test

Run this in viewer:

```text
1. Spawn free triad.
2. Select XZ plane.
3. Move triad with beam.
4. Spawn box.
5. Select box.
6. Attach triad to box face.
7. Viewer shows triad attached and active plane highlighted.
```

If that works, Phase 2 is solid.

---

# 6. What We Should Not Do Yet

Do not build:

- full hand tracking
- full voice stack
- simulation engines
- weather/climate
- AI orchestration
- circuit engines
- Monte Carlo
- prototype calibration
- full component library

Those are later.

Right now we are building the mechanical spine.

---

# 7. The Master Mental Model

The whole system should eventually work like this:

```text
User points / speaks / clicks / gestures
        ↓
ActionBus
        ↓
Selection Context + Triad Host + Sketch/Feature Model
        ↓
CAD Operation
        ↓
Feature Tree + Scene Update + Viewer Confirmation
```

The desk, hands, and voice are all just ways to feed the same action spine.

---

# 8. Current Parked Step

We are parking at the end of Phase 2.

Completed:

```text
1. Basic selection context exists.
2. Triad state exists.
3. Free/desk/face triad actions exist.
4. Beam state exists.
5. Triad/plane/selection/beam are visible through viewer state.
6. The viewer can show the VR canvas without desktop UI.
```

Known unfinished Phase 2 polish:

```text
1. Move triad/beam/selection actions into ActionBus.
2. Improve face/edge classification.
3. Attach triad automatically from selected face.
4. Clean up debugRaycast/test hooks.
5. Make selection highlight consistent in VR.
```

Next step when resumed:

```text
Phase 3 — Sketch Entity Mechanics
```

First concrete Phase 3 target:

```text
spawn a literal line or circle on the active triad plane and see it in the viewer
```
