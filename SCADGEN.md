# ScadGen — Mechanics-First Build Path

This document is the master build path for ScadGen. It comes before implementation. It defines the conceptual layers, the category buckets, and the mechanics that should be articulated from top to bottom.

## Status

Current phase: **Foundation / VR World Mechanics — parked at Phase 2**.

Primary objective: build a deterministic, observable VR CAD environment where the AI can perform actions and the human can confirm visually through the live viewer.

Current verified state:

```text
viewer shows VR canvas
selection context exists
beam state exists
free/desk/face triad actions exist
triad plane selection exists
primitive spawn debug hook exists
beam hover/select works for basic body subselection
```

Known unfinished polish:

```text
ActionBus integration for triad/beam/selection actions
face/edge classification refinement
automatic triad attach from selected face
selection highlight consistency
cleanup of debug/test hooks
```

Next step when resumed:

```text
Phase 3 — Sketch Entity Mechanics
```

First Phase 3 target:

```text
spawn a literal line or circle on the active triad plane and see it in the viewer
```

We are not yet building the final VR gate.  
We are not yet building the full Onshape parity gate.  
We are not yet building engines, simulations, circuits, weather, AI orchestration, or hand tracking.

We are building the mechanics that make those later layers possible.

---

## Core Product Laws

1. **Onshape technical parity first**

   ScadGen must technically reach the same baseline as Onshape: anything doable in Onshape must be doable in ScadGen through ScadGen’s own stack and interface logic.

   This is not a literal UI clone. It is a functional and architectural parity target.

2. **Every action is one action**

   Desk buttons, controllers, gestures, voice commands, and future AI calls must all resolve through the same action registry.

   No operation should exist only as a button, only as a gesture, or only as a voice command.

3. **The desk is the exit ramp**

   The desk is the fallback surface. Every operation reachable by hand/controller/gesture/voice must also be reachable from the desk.

   Rule:

   ```text
   Any operation available in the world must also be available from the desk with the same result.
   ```

4. **Everything is literal**

   There is no visual-only scaling.

   If the model is scaled, moved, stretched, offset, or resized, it changes the real literal CAD model.

5. **Mechanics before final features**

   Build the underlying mechanical primitives first:

   - selection
   - planes
   - triads
   - sketch contexts
   - primitives
   - dimensions
   - transformations
   - attachments
   - action identity

   Later features then articulate naturally.

6. **Engines come after the world**

   Simulation, circuit, thermal, structural, fluid, electromagnetic, environment, validation, coupling, and AI orchestration are later layers.

   The CAD/world mechanics foundation comes first.

---

## Build Categories

Everything gets categorized into these buckets:

```text
DOABLE NOW
DOABLE AFTER FOUNDATION
LATER
SUPER LATER
```

### DOABLE NOW

These are the immediate foundation mechanics:

- live viewer loop
- deterministic environment control
- ActionBus action spine
- selection context
- triad spawn
- triad plane selection
- free-space sketching
- sketch primitive creation
- literal dimensions
- literal transforms
- desk context mechanics

### DOABLE AFTER FOUNDATION

These come once the foundation mechanics are proven:

- Onshape parity CAD operations
- extrude/revolve/sweep/loft/fillet/chamfer/shell/boolean
- feature tree
- sketch attach/detach
- contextual menus
- measurement view
- component library
- voice engine
- room physics

### LATER

These come after the CAD/world foundation is stable:

- first-party 3D primitive library expansion
- advanced AI generation
- simulation bootstrap
- units/materials/mesh bridge
- one physics engine
- validation

### SUPER LATER

These are post-product-engineering layers:

- engine coupling
- structural/thermal/fluid/electromagnetic/circuit engines
- Monte Carlo variation
- failure ranking
- safety margins
- robustness scores
- exposure/degradation/aging
- prototype calibration
- weather/climate providers
- simulation library
- orchestrator AI
- engineering AI APIs

---

## Live Viewer Iteration Protocol

The live viewer is the confirmation layer.

Roles:

```text
Human: watch the viewer and confirm whether the world did what it should.
AI: drive the environment through HTTP/API and state/logs.
Viewer: passive, no human controls required.
```

This allows fast iteration without repeatedly entering the actual VR headset.

The loop is:

1. AI performs an environment action.
2. Human sees the result in the live viewer.
3. Human says yes/no.
4. If yes, ship that mechanic.
5. If no, fix the mechanic before moving upward.

No mechanic should be considered done if it cannot be observed through this loop.

---

## Mechanics-First Top-To-Bottom Path

### Phase 1 — Viewer And Harness

Already mostly established.

Goal:

- AI can drive the VR world.
- Human can observe it live.
- State/logs/errors are readable.
- HMR reload keeps the world alive where possible.

Exit criterion:

```text
The human can confirm a simple visible world action from the viewer without entering VR.
```

---

### Phase 2 — Deterministic Controller Mechanics

Before hand tracking, voice, or complex CAD, we need stable world manipulation primitives.

Mechanics:

- look direction
- head pose
- left/right ray direction
- ray target point
- beam distance
- press/release
- hover/select
- grab/drag/release
- lock/unlock position

Conceptual actions:

```text
look.at()
point.at()
select.at()
press.trigger()
release.trigger()
grab.object()
move.object()
rotate.object()
scale.object()
```

Exit criterion:

```text
The AI can deterministically point at, select, grab, move, and release world objects.
```

---

### Phase 3 — ActionBus Spine

Every operation becomes an action id.

No operation can be implemented as only a button, only a gesture, only a voice command, or only debug hook.

Each action has:

```text
id
target
value
source
result
error
```

Examples:

```text
sketch.spawnTriad
sketch.selectPlane
sketch.line
sketch.circle
sketch.ellipse
primitive.box
primitive.sphere
primitive.cylinder
primitive.cone
primitive.torus
primitive.ellipsoid
object.select
object.move
object.rotate
object.scaleLiteral
op.extrude
op.fillet
op.shell
op.union
view.measure.toggle
physics.gravity.toggle
physics.positionLock.toggle
```

Exit criterion:

```text
Every visible operation can be invoked through the ActionBus.
```

---

## Sketch Hosts And Start Requirements

Sketching starts anywhere once the sketch start requirement is satisfied.

The activation mechanism is not the concept.  
A button, hot button, mode, gesture, voice command, or menu entry is only a trigger.

The conceptual rule is:

```text
Valid sketch requirement satisfied -> sketching can begin.
```

A valid sketch requirement may be:

- a triad exists
- a plane is selected
- a beam point and distance are chosen
- a face/edge/vertex selection provides a valid origin/frame
- desk bounds/workzone constraints are satisfied
- the user is in a sketch-capable mode

The UI mechanism can be decided later. The concept cannot be confused with the button.

---

## Sketch Host Types

### 1. Free Triad

A triad spawned in free space.

Properties:

- not attached to an existing surface or object
- can be placed anywhere
- can be moved
- can be rotated
- has origin, axes, and planes
- can host primitives
- can later support multiple selectable sketch planes

Concept:

```text
Free triad = independent sketch frame in space.
```

This is the main primitive for 3D sketching without a 2D viewport.

---

### 2. Desk Triad

A special **space-restricted triad**.

The desk is not merely a plane. It is a dedicated workspace with its own rules.

Properties:

- belongs to the desk context
- has desk-bound restrictions
- likely constrained to the desk workzone
- has its own activation logic
- supports sketches on or near the desk surface
- is different from a free triad

Concept:

```text
Desk triad = restricted sketch frame inside the desk workspace.
```

This needs its own section early in the build because the desk is both:

- the 2D exit-ramp surface
- a constrained VR CAD workspace

Open questions later:

- Does the desk triad snap to the desk surface only?
- Can the desk triad rotate freely within a bounded work volume?
- Is there a desk-only local coordinate origin?
- Can sketches spawn from desk UI and land in 3D above the desk?

---

### 3. Plane-Attached Triad

A triad attached to an existing plane.

Plane sources:

- wall
- ceiling
- floor
- desk surface
- object face
- datum plane
- user-created plane
- existing sketch plane

Properties:

- origin lies on the plane or selected target point
- normal comes from the plane
- axes are chosen from plane orientation or user adjustment
- sketching is constrained to the plane initially
- triad can still be moved/rotated if allowed by attachment rules

Concept:

```text
Plane-attached triad = sketch frame derived from a selected planar context.
```

The user chooses the plane. The sketch starts once the plane satisfies the requirement.

---

### 4. Object-Face Sketching

A special case of plane-attached triad, but important enough to have its own rules.

When sketching on an object face:

- the face provides the target plane/normal
- the sketch is associated with that object until merged
- if the face moves, the attached sketch may move with it
- when merged into another object, the sketch/feature relationship transfers or detaches according to explicit rules

Concept:

```text
Every object gets its own sketch plane until merged into another object.
```

---

## Free-Space Sketching

Free-space sketching is not “draw randomly.”

It is spatial sketch creation anchored by the pointer beam.

Mechanics:

1. The beam provides direction.
2. The beam provides depth/distance.
3. The point along the beam becomes the sketch origin or active sketch point.
4. A triad or local sketch frame is created.
5. Primitives are placed relative to that frame.

The beam is modular.

Distance modes may include:

- fixed distance
- adjustable distance
- snap distance
- lock depth
- raycast to target
- select target first
- choose origin and distance

Concept:

```text
Begin sketch in free space =
point beam
+ choose/modulate distance
+ place sketch origin
+ create triad/plane context
+ begin primitives
```

This is how sketching starts anywhere.

---

## Triads In 3D, Not Locked To 2D Viewers

A sketch in ScadGen should not be reduced to a 2D viewport with a perspective cube.

The VR model is:

```text
A sketch is a 3D object/container.
It contains a triad.
The triad contains selectable axes and planes.
Primitives live on selected planes or in constrained/free spatial modes.
The entire sketch frame can be moved/rotated in the world.
```

This replaces the old Onshape-style 2D sketch lock with a 3D-native sketch mechanic.

### Triad Structure

A triad has:

- origin
- X axis
- Y axis
- Z axis
- XY plane
- XZ plane
- YZ plane

Selectable parts:

```text
origin
axisX
axisY
axisZ
planeXY
planeXZ
planeYZ
whole triad
```

Editing actions:

```text
moveTriad
rotateTriad
setTriadOrigin
setTriadAxis
setTriadPlane
selectTriadPlane
```

All edits are literal.

---

## Active Plane Mechanics

Within a triad, sketching usually happens on an active plane.

Example:

```text
activePlane = XY | XZ | YZ
```

Rules:

- selecting a plane makes it the active drawing surface
- new primitives inherit the active plane unless explicitly placed elsewhere
- primitives may later store their own plane reference
- the sketch remains a 3D object even when entities are planar

Concept:

```text
A sketch is a 3D container.
A plane inside it is a local drawing surface.
```

---

## Primitive Taxonomy

Primitives are not sketches.

There are two major layers:

## 1. Sketch Primitives / Entities

These live inside a sketch.

Examples:

- point
- line
- rectangle
- polygon
- circle
- arc
- ellipse
- spline
- construction line
- dimension/constraint reference

They are planar or constrained to a local sketch context.

Example action ids:

```text
sketch.point
sketch.line
sketch.rectangle
sketch.circle
sketch.arc
sketch.ellipse
sketch.spline
sketch.editDimension
```

## 2. 3D CAD Primitives

These are full bodies/solids/features.

Examples:

- box/cube
- sphere
- ellipsoid
- cylinder
- cone
- torus
- dome
- pyramid
- prism
- capsule
- lofted body
- swept body

They are not just mesh shapes. They should be represented as editable CAD features or parametric geometry.

Example action ids:

```text
primitive.box
primitive.sphere
primitive.ellipsoid
primitive.cylinder
primitive.cone
primitive.torus
primitive.dome
primitive.pyramid
```

The difference:

```text
A sketch primitive is a 2D/local element.
A 3D primitive is a body/feature.
A 3D primitive may be built from sketches and operations, but it must remain editable.
```

---

## 3D Primitive Strategy

### Baseline Rule

ScadGen should have first-party 3D primitives.

They are important because they let users start quickly and let the AI build/test mechanics before full sketch-driven modeling is finished.

But 3D primitives should not be dead meshes.

They should be:

- parametric
- editable
- tree-visible
- transformable
- selectable
- dimension-aware
- attachable to sketch/feature contexts

### Current State

The starter repo already has several composite parametric builders:

```text
box
cylinder
cone
sphere
torus
rectangle profile
linear pattern
mirror
shell
draft
hole
project curves
ruled surface
fill surface
offset surface
create plane
curve on face
scale
thread
feature pattern
flange
hem
unfold
wrap
move face
section
split
thicken
delete bodies
delete face
curve pattern
circular pattern
```

Existing 3D primitive builders include:

```text
box
cylinder
cone
sphere
torus
```

The debug scene hooks currently expose some of these directly, including:

```text
box
cylinder
sphere
torus
rect
```

### Missing / Needed Next

We should add a proper first-party 3D primitive set.

Important missing primitives for the foundation:

```text
ellipsoid
dome
pyramid
capsule
prism
```

High priority:

1. **Ellipsoid**

   Direct answer to: “cubes spheres elipses all that in 3d.”

2. **Dome**

   Useful for enclosures and organic parts.

3. **Capsule**

   Useful for handles, fasteners, organic connectors.

4. **Pyramid / prism**

   Useful for mechanical geometry.

5. **Regular polygon extrusion primitive**

   Useful as a bridge between 2D primitives and 3D primitives.

---

## Ellipsoid / Ellipse Clarification

There are two different objects:

### 2D ellipse

A sketch primitive/entity.

Properties:

- center
- radius X
- radius Y
- rotation
- plane

Actions:

```text
sketch.ellipse
```

### 3D ellipsoid

A full primitive body.

Properties:

- center
- radius X
- radius Y
- radius Z
- rotation
- orientation triad

Actions:

```text
primitive.ellipsoid
```

It may be built from ellipse profiles + revolve/loft/surface operations, or implemented as a native parametric body if better.

For now, conceptual requirement:

```text
The user can create a literal editable 3D ellipsoid.
```

---

## Literal Transforms And Literal Scale

No visual-only scale.

All transforms are literal:

```text
move
rotate
scale
stretch
offset
mirror
```

If the object changes size, the actual CAD geometry dimensions change.

### Example

Scaling an ellipsoid should update:

```text
radiusX
radiusY
radiusZ
```

not just the mesh display.

This keeps:

- selection
- dimensioning
- booleans
- fillets
- simulations
- components
- voice commands

consistent.

---

## Selection Mechanics

Selection must be categorized because later operations depend heavily on what kind of thing is selected.

Selectable types:

```text
world point
empty space
object/body
face
edge
vertex
plane
datum
triad origin
triad axis
triad plane
sketch
sketch entity
point entity
line entity
circle entity
ellipse entity
arc entity
constraint
dimension
feature tree node
component
```

Each selection should expose:

```text
type
id
worldPosition
normal/tangent if relevant
parent sketch/object
parent feature node
current dimensions
```

This is the foundation for contextual menus and operations.

---

## Contextual Menus

Context menus should only show operations that are valid for the current selection/context.

Context types:

```text
nothing selected
object selected
face selected
edge selected
vertex selected
plane selected
triad selected
sketch selected
sketch entity selected
feature tree node selected
component selected
desk selected
free space beam selected
```

Menu items are action ids.

No special duplicate menu logic.

Example:

```text
face selected -> sketch.onFace
edge selected -> op.fillet
plane selected -> sketch.onPlane
sketch line selected -> sketch.editDimension
```

---

## Voice Engine Requirements

Voice is later, but the architecture must not block it.

Voice should be a grammar system over the same action bus.

Command shape:

```text
verb + target/setting + optional value
```

Examples:

```text
toggle gravity
lock position
unlock position
show measurements
hide grid
new sketch
begin sketch
select face
fillet five millimeters
extrude ten millimeters
sphere fifty millimeters
ellipsoid thirty by forty millimeters
```

Voice actions should resolve to:

```text
ActionBus.run(...)
```

Voice requirements:

- local speech recognition
- fixed vocabulary
- deterministic fallback
- hold-to-talk or push-to-talk later
- visual confirmation
- unmatched phrase fallback to orchestrator later

Voice should not create bespoke operations outside the action spine.

---

## Hand Tracking Requirements

Hand tracking comes after deterministic controller mechanics.

Gestures should also resolve to the same action bus.

Examples:

```text
grab -> object.grab
release -> object.release
pinch -> object.scaleLiteral
point -> ray.update
faceClick -> select.face
twoHandScale -> object.scaleLiteral
```

No separate gesture-only system.

---

## Room Physics Requirements

Room physics is a world mechanic, not a simulation engine.

Mechanics:

```text
gravity on/off
physics on/off
object float
object rotate slowly
object throw
object collide
object lock position
object lock rotation
recall object
```

At desk:

- objects may float and slowly rotate
- desk workspace may remain stable and readable

Away from desk:

- room physics can become active

Keep this separate from later simulation engines.

---

## Component Library Requirements

Component library comes after the CAD foundation.

A component is more than geometry.

A component should include:

```text
geometry
dimensions
material
ports
connectors
mechanical metadata
electrical metadata
thermal metadata
physical metadata
compatibility rules
```

Example components:

- screen
- battery
- port
- connector
- PCB
- case
- screw
- fastener
- material block
- server part

Box-to-part conversion:

```text
select box
choose component type
convert to part
preserve/attach metadata
```

Example:

```text
box -> screen
```

---

## AI Generation Requirements

AI generation comes after mechanics and CAD baseline.

### Spec Lane

- request real-world dimensions
- generate exact editable parametric geometry
- produce feature tree
- keep primitives editable

### Generate Lane

- Tripo or similar generates rough organic mesh
- user says “bring it to spec”
- ScadGen detects features
- rebuilds exact parametric editable geometry
- shows deviation overlay

### Organic Parts

- AI asks which dimensions are critical
- remaining dimensions fit within tolerances
- result should remain parametric/editable when possible

---

## Engines And Simulation

This is later.

Engine build order:

1. units
2. material database
3. mesh bridge
4. one physics engine
5. validation
6. additional engines
7. coupling engine

Engines:

- rigid body
- structural
- thermal
- fluid
- electromagnetic
- circuit
- environment
- shared solvers

Rules:

- all engines use typed ports
- coupling engine moves data between engines
- validation engine checks conservation, units, benchmarks
- no engine talks to another ad hoc

---

## Super-Later Simulation Intelligence

These are not current-phase priorities.

Future workflow:

```text
request -> spec -> simulation -> replay -> extracted dataset
```

Future features:

- simulation library
- closest simulation reuse
- confidence check after edit
- Monte Carlo variations
- failure ranking
- safety margins
- robustness score
- corrosion/fatigue/creep/wear
- aging timeline slider
- prototype calibration
- weather/climate provider
- engineering AI API
- orchestrator AI

---

## Immediate Next Build Target

The first concrete mechanic to build/prove next is:

```text
Literal sketch entity on the active triad plane.
```

This proves:

- triad planes can host real sketch entities
- 2D entities are constrained to a 3D plane
- entities are literal/dimensional
- entities are selectable
- the viewer loop works for sketch mechanics
- later extrude/fillet operations have a real source

### Desired Test Sequence

1. AI runs:

```text
triad.spawnFree
```

2. Viewer shows a 3D triad in space.

3. AI runs:

```text
triad.selectPlane plane=XZ
```

4. Viewer shows highlighted active plane.

5. AI runs:

```text
sketch.line
```

or:

```text
sketch.circle
```

6. Viewer shows literal sketch entity on the selected plane.

7. Human confirms:

```text
yes, ship it
```

or rejects:

```text
no, fix mechanic
```

Once that is visible and understandable, we can build upward from there.

---

## Current Open Decisions

These are not blockers for the conceptual path.

Open questions:

- What button/gesture/voice phrase starts a sketch?
- Should free triad default to view-aligned or world-aligned?
- Can one triad host sketches on multiple planes by default?
- Should desk triad be constrained to the desk surface or a bounded volume?
- Are 3D primitives native body operations or always composite features?
- When do ellipsoid/dome/capsule become first-party?
- How is beam distance modulated in VR?
- What is the first visible selection highlight system?

These should be resolved one mechanic at a time.

---

## 3D Primitive Catalog

Yes. 2D sketch primitives are still valid, but they are only one layer.

ScadGen needs a first-class **3D primitive system**.

3D primitives are not just meshes. They are spawnable, editable, literal, parametric bodies or features.

### Core requirements

Each 3D primitive must be:

- spawnable at will
- parametric
- literal/dimensional
- selectable
- moveable
- rotatable
- scalable in literal dimensions only
- attached to a placement context
- visible in the feature tree
- editable after creation
- callable through `ActionBus`
- callable from desk button, voice, gesture, ray/beam, menu, or debug API

### Primitive placement model

A 3D primitive is created by:

```text
primitiveType + parameters + placement
```

Example:

```text
primitive.box {
  width: 100mm,
  height: 50mm,
  depth: 25mm
}
placement {
  mode: freeTriad,
  origin: beamPoint,
  orientation: viewAligned
}
```

Placement modes:

```text
airBeam
freeTriad
deskTriad
planeAttached
faceAttached
worldOrigin
selectedObjectCenter
selectedPoint
```

### Voice grammar for primitives

Examples:

```text
sphere fifty millimeters
box ten by five by two centimeters
ellipsoid thirty forty fifty millimeters
cylinder radius ten height fifty
cone radius twenty height sixty
torus ring thirty tube five
capsule length one hundred diameter twenty
pipe outer diameter twenty inner diameter sixteen length one hundred
dome radius fifty height thirty
```

### First-party 3D primitive catalog

Priority A: immediate foundation

1. `box` / `cube`

   Parameters:

   ```text
   width, height, depth
   optional uniform edge radius
   optional uniform edge chamfer
   ```

2. `sphere`

   Parameters:

   ```text
   radius
   ```

3. `ellipsoid`

   Parameters:

   ```text
   radiusX, radiusY, radiusZ
   optional rotation
   ```

4. `cylinder`

   Parameters:

   ```text
   radius or diameter
   height/length
   axis orientation
   ```

5. `cone`

   Parameters:

   ```text
   baseRadius
   topRadius if frustum
   height
   axis orientation
   ```

6. `frustum` / truncated cone

   Parameters:

   ```text
   bottomRadius
   topRadius
   height
   ```

7. `torus`

   Parameters:

   ```text
   ringRadius
   tubeRadius
   major/minor segments if needed
   ```

8. `capsule`

   Parameters:

   ```text
   length
   radius
   axis orientation
   ```

9. `dome`

   Parameters:

   ```text
   radius
   height
   base plane
   ```

10. `hemisphere`

   Parameters:

   ```text
   radius
   orientation
   ```

Priority B: mechanical primitives

11. `pipe` / `tube`

   Parameters:

   ```text
   outerDiameter
   innerDiameter
   length
   ```

12. `rod`

   Parameters:

   ```text
   diameter
   length
   ```

13. `bar`

   Parameters:

   ```text
   width
   height
   length
   corner radius
   ```

14. `plate`

   Parameters:

   ```text
   width
   length
   thickness
   corner radius
   optional holes
   ```

15. `washer`

   Parameters:

   ```text
   outerDiameter
   innerDiameter
   thickness
   ```

16. `flange`

   Parameters:

   ```text
   outerDiameter
   thickness
   boltCircleDiameter
   holeCount
   holeDiameter
   ```

17. `ibeam`

   Parameters:

   ```text
   width
   height
   thickness
   flangeThickness
   webThickness
   length
   ```

18. `channel`

   Parameters:

   ```text
   width
   height
   thickness
   length
   ```

19. `angle`

   Parameters:

   ```text
   legA
   legB
   thickness
   length
   ```

20. `tee`

   Parameters:

   ```text
   width
   height
   thickness
   length
   ```

21. `gear`

   Parameters:

   ```text
   teeth
   module or pitchRadius
   pressureAngle
   width
   boreDiameter
   ```

22. `bearing`

   Parameters:

   ```text
   outerDiameter
   innerDiameter
   width
   ```

23. `bolt`

   Parameters:

   ```text
   threadDiameter
   length
   headType
   headSize
   threadPitch
   ```

24. `nut`

   Parameters:

   ```text
   threadDiameter
   acrossFlats
   height
   ```

25. `spring`

   Parameters:

   ```text
   wireDiameter
   coilDiameter
   pitch
   turns
   length
   ```

Priority C: geometric primitives

26. `prism`

   Parameters:

   ```text
   baseRadius or apothem
   sides
   height
   rotation
   ```

27. `pyramid`

   Parameters:

   ```text
   baseRadius or apothem
   sides
   height
   rotation
   ```

28. `tetrahedron`

29. `octahedron`

30. `dodecahedron`

31. `icosahedron`

32. `polygonPrism`

   Parameters:

   ```text
   polygon points
   height
   ```

33. `extrudedPolygon`

34. `revolvedProfile`

35. `loftedBody`

   Parameters:

   ```text
   profile1
   profile2
   optional profileN
   ```

36. `sweptBody`

   Parameters:

   ```text
   profile
   path
   ```

Priority D: organic / useful special shapes

37. `superellipsoid`

   Parameters:

   ```text
   radiusX
   radiusY
   radiusZ
   exponent
   ```

38. `squircleBox`

   Parameters:

   ```text
   width
   height
   depth
   cornerExponent
   ```

39. `egg` / teardrop

   Parameters:

   ```text
   length
   width
   asymmetry
   ```

40. `lens`

   Parameters:

   ```text
   diameter
   thickness
   curvature
   ```

41. `oblateSpheroid`

   Parameters:

   ```text
   equatorialRadius
   polarRadius
   ```

42. `prolateSpheroid`

   Parameters:

   ```text
   equatorialRadius
   polarRadius
   ```

43. `torusKnot`

   Parameters:

   ```text
   p
   q
   radius
   tube
   ```

44. `roundedBox`

   Parameters:

   ```text
   width
   height
   depth
   radius
   ```

45. `chamferedBox`

   Parameters:

   ```text
   width
   height
   depth
   chamfer
   ```

46. `boxWithHole`

   Parameters:

   ```text
   width
   height
   depth
   holeDiameter
   holeAxis
   ```

47. `slottedBox`

   Parameters:

   ```text
   width
   height
   depth
   slotLength
   slotWidth
   ```

48. `ringBlock`

   Parameters:

   ```text
   outerRadius
   innerRadius
   height
   ```

49. `starPrism`

   Parameters:

   ```text
   points
   outerRadius
   innerRadius
   height
   ```

50. `key`

   Parameters:

   ```text
   width
   height
   length
   ```

### Primitive creation concept

Primitive creation should be a first-class action:

```text
primitive.create
```

But for usability and voice, there should also be direct aliases:

```text
primitive.box
primitive.sphere
primitive.ellipsoid
primitive.cylinder
primitive.cone
primitive.torus
primitive.capsule
primitive.dome
primitive.pyramid
primitive.prism
primitive.washer
primitive.pipe
```

All aliases resolve to:

```text
ActionBus.run('primitive.create', {
  type: 'box',
  params: {...},
  placement: {...}
})
```

### Current known builders

The starter currently has parametric builders for at least:

```text
box
cylinder
cone
sphere
torus
rectangle profile
```

The debug hooks expose some of these directly:

```text
box
cylinder
sphere
torus
rect
```

But we do not yet have a complete primitive catalog.

### Missing high-priority primitives

Immediate next additions:

1. `ellipsoid`
2. `capsule`
3. `dome`
4. `pipe`
5. `prism`
6. `pyramid`
7. `plate`
8. `washer`
9. `roundedBox`
10. `chamferedBox`

### Primitive architecture rule

A 3D primitive can be implemented in two ways:

1. **Native parametric body**

   If the CAD kernel/engine supports it directly.

2. **Composite feature**

   Built from sketches, profiles, extrudes, revolves, lofts, sweeps, booleans, fillets.

But both must behave the same from the user’s perspective:

```text
one primitive action
one selectable body
one editable parameter set
one tree entry or feature group
```

### Primitive library build path

First mechanics:

1. Create a `PrimitiveCatalog`.
2. Create `PlacementContext`.
3. Wire `primitive.create` into `ActionBus`.
4. Add primitive aliases.
5. Add debug hooks so AI can spawn them in viewer.
6. Add visible selection/highlight for spawned primitive.
7. Add literal parameter editing.
8. Add voice grammar mapping.
9. Add desk UI palette.

The first visible proof should be:

```text
Spawn ellipsoid in front of the user through beam/free triad placement.
```

Then:

```text
Spawn box, sphere, cylinder, cone, torus, ellipsoid, capsule, dome.
```

That starts the 3D primitive world.

## The One-Sentence Version

ScadGen starts by building a literal, observable VR mechanics system where sketching begins from valid spatial requirements — free triads, desk triads, plane-attached triads, or beam-anchored free-space frames — not from arbitrary buttons, and where every later CAD operation resolves through one ActionBus.
