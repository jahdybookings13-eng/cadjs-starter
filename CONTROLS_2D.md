# 2D controls

Sketch mode is the 2D parametric editor. This is the control map for every
behaviour that actually exists in the engine — **60 commands**: 42 core sketch
commands and 18 constraints. It is not a claim that AutoCAD is fully cloned;
the unsupported tools are listed at the bottom and have no buttons.

Open the map in the app with **F1** or **?**. Open the searchable palette with
**Ctrl+K** (Cmd+K on macOS). Both are also buttons in the sketch toolbar.

## Why there is one registry

`src/model/sketchControls.ts` is the source of truth. The toolbar, the palette,
the help sheet and the tests all read it. The CAD engine still owns the direct
single-key bindings; the registry documents them and adds AutoCAD aliases for
search and discovery. There is no second implementation of line/trim/etc.

AutoCAD aliases are accepted **in the palette**. Where AutoCAD uses a different
single key, the app's existing key wins. Type the full alias to avoid ambiguity.

| App key | App action   | AutoCAD key   | Note                                                            |
| ------- | ------------ | ------------- | --------------------------------------------------------------- |
| `S`     | Select       | `S` = STRETCH | STRETCH is not implemented; SELECT is available by name.        |
| `E`     | Extend       | `E` = ERASE   | ERASE is mapped to Delete.                                      |
| `X`     | Construction | `X` = EXPLODE | Explode is not implemented.                                     |
| `R`     | Rectangle    | `REC`         | Type REC/RECTANG in the palette.                                |
| `T`     | Trim         | `T` = MTEXT   | Type TR/TRIM in the palette.                                    |
| `D`     | Dimension    | `DIM`         | Generic dimension; separate linear/angular tools are not built. |
| `P`     | Point        | `PO`          | Type PO/POINT in the palette.                                   |

## Core commands

| Command          | App key               | AutoCAD alias       | cadjs id                 |
| ---------------- | --------------------- | ------------------- | ------------------------ |
| Select           | S                     | SELECT              | `sketch.select`          |
| Line             | L                     | LINE                | `sketch.line`            |
| Midpoint line    | —                     | MIDLINE / ML        | `sketch.midpointLine`    |
| Rectangle        | R                     | REC / RECTANG       | `sketch.rectangle`       |
| Center rectangle | —                     | CRECT               | `sketch.centerRectangle` |
| Slot             | —                     | SLOT                | `sketch.slot`            |
| Polygon          | —                     | POLYGON / POL       | `sketch.polygon`         |
| Circle           | C                     | CIRCLE              | `sketch.circle`          |
| Circle (3-point) | —                     | CIRCLE3P / 3P       | `sketch.circle3p`        |
| Ellipse          | —                     | ELLIPSE / EL        | `sketch.ellipse`         |
| Elliptical arc   | —                     | ELLIPTICALARC / EAR | `sketch.ellipticalArc`   |
| Spline           | —                     | SPLINE / SPL        | `sketch.spline`          |
| Bezier           | —                     | BEZIER / BZ         | `sketch.bezier`          |
| Conic            | —                     | CONIC / CO          | `sketch.conic`           |
| Arc              | A                     | ARC                 | `sketch.arc`             |
| Point            | P                     | PO / POINT          | `sketch.point`           |
| Text             | —                     | TEXT / T / MTEXT    | `sketch.text`            |
| Import DXF       | —                     | DXFIN / IMPORT      | `sketch.importDxf`       |
| Dimension        | D                     | DIM                 | `sketch.dimension`       |
| Trim             | T                     | TR / TRIM           | `sketch.trim`            |
| Extend           | E                     | EX / EXTEND         | `sketch.extend`          |
| Mirror           | —                     | MI                  | `sketch.mirror`          |
| Fillet           | —                     | FILLET / F          | `sketch.fillet`          |
| Chamfer          | —                     | CHAMFER / CHA       | `sketch.chamfer`         |
| Offset           | —                     | OFFSET / O          | `sketch.offset`          |
| Join             | —                     | JOIN / J            | `sketch.join`            |
| Split            | —                     | SPLIT / SP          | `sketch.split`           |
| Move             | —                     | MOVE / M            | `sketch.move`            |
| Copy             | —                     | COPY / CP           | `sketch.copy`            |
| Rotate           | —                     | ROTATE / RO         | `sketch.rotate`          |
| Scale            | —                     | SCALE / SC          | `sketch.scale`           |
| Linear pattern   | —                     | PATTERN / AR        | `sketch.patternLinear`   |
| Circular pattern | —                     | CIRCULAR            | `sketch.patternCircular` |
| Path pattern     | —                     | PATHPATTERN         | `sketch.patternPath`     |
| Construction     | X                     | —                   | `sketch.construction`    |
| Fix point        | —                     | FIX                 | `sketch.fix`             |
| Delete           | Delete / Backspace    | ERASE / E           | `sketch.delete`          |
| Undo             | Ctrl+Z                | U / UNDO            | `sketch.undo`            |
| Redo             | Ctrl+Shift+Z / Ctrl+Y | REDO                | `sketch.redo`            |
| Solve            | —                     | SOLVE               | `sketch.solve`           |
| Finish sketch    | Enter                 | FINISH              | `sketch.finish`          |
| Cancel sketch    | Esc                   | —                   | `sketch.cancel`          |
| Grid snap        | —                     | SNAP                | `sketch.gridSnap`        |
| Command palette  | Ctrl+K / Cmd+K        | COMMAND             | `sketch.commands`        |
| Controls help    | F1 / ?                | HELP                | `sketch.help`            |

Bezier is a cubic curve defined by four control points. Conic is a rational
quadratic conic with start, end and control points; the toolbar rho value
controls its shape. Both are real curve primitives with OCC edges, mirror and
BRep participation, not tessellated previews.

Mirror is a one-shot geometric copy: select exactly one line as the axis plus
the geometry to mirror. The axis line is not duplicated, points on the axis are
shared, and construction flags are preserved. Mirror is intentionally a copy,
not a symmetric constraint; use the Symmetric constraint when the two sides
must stay linked.

Linear pattern takes a count from 2–50 plus X/Y spacing and creates independent
copies of the selection. Circular pattern takes a count and total angle; the
count includes the source and copies are evenly spaced. Path pattern chooses one
selected line, arc, circle, ellipse, spline, Bezier or conic as the path,
samples it by arc length, and optionally aligns each copy to the path tangent.
Open paths place `count - 1` copies; closed paths fill the loop.

Rotate takes degrees and scales by a positive factor. With one point selected,
that point is the transform centre; otherwise the selection centroid is used.
Circle/arc radii, ellipse radii, and ellipse/elliptical-arc orientation are
updated along with their points. Scale factor 1 and zero rotation are refused.

Move and Copy take a two-value X/Y vector. Move updates the selected geometry's
defining points; Copy creates independent points and primitives, sharing each
cloned point once. Origin geometry is refused.

Split clicks a line, arc, circle, spline, cubic Bezier or conic away from its
endpoints and replaces it with two real primitives sharing a new vertex. A line
becomes two lines; an arc becomes two arcs; a circle becomes two semicircular
arcs; a cubic Bezier is subdivided with de Casteljau into two cubic Beziers. A
rational conic is subdivided in homogeneous coordinates with de Casteljau,
carrying the endpoint weights so the two conics reproduce the original exactly.
A spline is split by giving each half a non-overlapping raw parameter range of
the same Catmull-Rom control polygon, with the split vertex as the shared visible
endpoint. An elliptical arc is split at the clicked ellipse parameter into two
arcs that share that parameter boundary. The original circle is replaced, and
construction state is preserved.

Offset creates a copy of one selected line, circle or arc. Positive distance is
to the left of a line's direction and outward for circles/arcs; the source is
not modified. Join merges two collinear lines that share an endpoint into one
line and refuses non-collinear or overlapping pairs. These are real geometry
operations, not display-only previews.

Fillet accepts two selected non-origin lines that meet within their segments,
one line plus one arc, or two arcs that share an endpoint. It asks for a radius,
replaces the near corner with tangent points, trims both source curves, and
inserts a real tangent arc. The line/arc solver intersects the offset line with
a concentric `R-r` / `R+r` circle; the arc/arc solver intersects the four
`R1±r` / `R2±r` offset-circle combinations and checks that both tangent points
lie on the retained arc sweeps. Cases with no valid tangent point are refused.
Chamfer remains the two-line case. Parallel, non-touching, non-shared,
concentric and too-large cases are refused instead of producing invalid
geometry. The old corner point is removed only when no other primitive
references it.

Text inserts single-stroke uppercase engineering text as ordinary points and
lines, so it can be selected, constrained, patterned, trimmed and finished like
any other sketch geometry. A selected point sets the insertion origin. DXF
import supports LINE, CIRCLE, ARC, LWPOLYLINE (straight segments), ELLIPSE and
POINT, converts `$INSUNITS` to millimetres, and reports unsupported entities
instead of dropping them silently. Image attaches a raster underlay to the
sketch, persisted as a data URL and rendered behind the construction plane;
Include projects the selected 3D body's BRep edge segments onto the active
sketch plane as ordinary points and lines.

Circle (3-point) picks three points and adds a circle plus three point-on-circle
constraints, so the points stay on the circle when either is dragged. It refuses
collinear points instead of creating an invalid circle.

Ellipse picks its centre, a point on the major axis, then a point whose
perpendicular distance sets the minor radius. The three picks define a real
`Geom_Ellipse` edge and a closed OCC profile; if the second radius is larger,
the axes swap so the stored ellipse always has `major >= minor`.

Spline picks three or more points and interpolates a real OCC BSpline edge
through them. Move the mouse to preview the curve, then double-click the last
point to finish. The picked points stay as sketch points, so dragging one
reshapes the spline and the normal solver dependencies follow it.

Midpoint line picks an existing line, then an endpoint. The new line starts at a
point constrained to the source line's midpoint, so moving the source line moves
the start of the new line with it.

Slot picks two centre points and a width. It creates two lines and two
equal-radius arcs; the caps are point-symmetric about their centres and the
sides are parallel, so the slot stays a slot when dragged.

Polygon picks a centre, a vertex and a side count (3–12). The vertices are
constrained to a construction circle and the sides are equal, so it stays
regular when dragged.

## Constraints

Constraints apply to the current selection. The palette only enables the ones
the solver reports as valid for that selection. Distance, angle, radius and
diameter, distance X and distance Y ask for a value; the rest apply
immediately. All 18 also exist as toolbar buttons.

Value fields accept arithmetic and units: `2*25.4 mm`, `45 deg`, `1/2` and
`180 deg / 2` all evaluate before the constraint, move, pattern or fillet is
applied. Length fields reject angle units and vice versa. Project-variable
names are not resolved in these fields yet.

| Constraint      | AutoCAD alias | cadjs id                          |
| --------------- | ------------- | --------------------------------- |
| Horizontal      | HOR           | `sketch.constraint.horizontal`    |
| Vertical        | VER           | `sketch.constraint.vertical`      |
| Parallel        | PAR           | `sketch.constraint.parallel`      |
| Perpendicular   | PER           | `sketch.constraint.perpendicular` |
| Tangent         | TAN           | `sketch.constraint.tangent`       |
| Equal           | EQL           | `sketch.constraint.equal`         |
| Coincident      | COI           | `sketch.constraint.coincident`    |
| Concentric      | CON           | `sketch.constraint.concentric`    |
| Point on line   | POINTONLINE   | `sketch.constraint.pointOnLine`   |
| Point on circle | POINTONCIRCLE | `sketch.constraint.pointOnCircle` |
| Midpoint        | MID           | `sketch.constraint.midpoint`      |
| Symmetric       | SYM           | `sketch.constraint.symmetric`     |
| Distance        | DISTANCE      | `sketch.constraint.distance`      |
| Distance X      | DISTX / DX    | `sketch.constraint.distanceX`     |
| Distance Y      | DISTY / DY    | `sketch.constraint.distanceY`     |
| Angle           | ANG           | `sketch.constraint.angle`         |
| Radius          | RAD           | `sketch.constraint.radius`        |
| Diameter        | DIA           | `sketch.constraint.diameter`      |

## Not in this engine yet

These are intentionally absent from the toolbar and palette. They are the 2D
parity backlog, not hidden features.

Polyline, path pattern, hatch, sketch text, block, explode,
layers/linetypes, plot.

Why: the primitive model is points, lines, circles, arcs, ellipses,
elliptical arcs and splines; rectangles and the newer tools are built from
those. It still has no polyline/text/hatch primitive, no layer model, and no
general 2D transform/offset operation. Adding a button for any of them today
would be a dead control.
Mirror is real because it is a one-shot operation over the existing primitives.

## Adding a command

1. Add one entry to `SKETCH_COMMANDS` with a stable `sketch.*` id, label, group,
   description, the real keys, AutoCAD aliases and cadjs id.
2. Add its action to `SketchCommandAction` and handle it in
   `runSketchCommand` in `src/scenes/modes/SketchModeContent.tsx`.
3. If it is a drawing tool, it must be a real `SketchSubMode`; do not fake one.
4. Run `npx vitest run src/model/__tests__/sketchControls.test.ts`. The tests
   fail on duplicate ids, labels, keys or AutoCAD aliases, on undocumented
   engine keys, and on a gap alias that would resolve to a real command.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run src/model/__tests__/sketchControls.test.ts` — registry,
  lookup, availability and parity-gap tests.
- `npx eslint .` — no errors.
- `npm run build` — production build.
