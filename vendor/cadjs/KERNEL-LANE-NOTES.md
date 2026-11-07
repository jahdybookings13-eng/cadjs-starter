# Kernel lane notes (2026-10-18)

## Binding-probe investigation (opencascade.js upgrades)
- Pinned: 2.0.0-beta.b5ff984 (full.d.ts). Latest published: 2.0.0-beta.fdece36
  (per-module d.ts layout) and 1.1.1 (no d.ts, smaller API).
- VERDICT: BRepOffsetAPI_MakeHelix and BRepOffsetAPI_MakeThickSolid exist in NO
  published build (grep=0 in TKBO module d.ts of latest beta). No dependency
  swap unblocks helix/shell.
- PATH: custom emscripten build of opencascade.js with the classes added to its
  IDL/binding list (their repo build script + Docker + emsdk). Owner-side
  environment task; then swap the pin and re-run the 915 suite.

## Shipped meanwhile
- thread: torus-stack ring grooves w/ ISO/UNIFIED/NPT table (correct per-groove
  depth; helical continuity = cosmetic delta). True helical pipeline proven
  geometrically (see thread handler history + handoff doc): spline upcast via
  Handle_Geom_Curve_1().reset(curve.get()) -> MakeEdge_26 -> PipeShell(default
  frame) shell -> caps from the sweep's OWN boundary rings -> Sewing+MakeSolid_3
  -> but BSpline-vs-cylinder boolean ~300s/2-turns in wasm. After the custom
  build lands, keep the pipeline, only re-check boolean cost.
- flange: 6650ad7 (915 tests). hem idea for next: flange at ~175deg is already a
  closed-ish hem client-side; true hem needs a fold-back arc sweep — try
  ThruSections with 3 wires (works where PipeShell MakeSolid caps fail).
- unfold/flat-pattern: not started. Approach: detect cylindrical bend faces
  (radius ~ k*t), rotate flange segments back to plane = inverse-flange
  transforms (SetRotation_1 about the bend-line gp_Ax1_2 — remember _2 is the
  quaternion overload), sum flat lengths = pi/2 arcs * (r + k t).
- wrap: feasible with the handle-reset upcast: gp_Cylinder -> Geom_CylindricalSurface
  -> Handle_Geom_Surface_1().reset(surf.get()), Geom2d_Line -> reset into
  Handle_Geom2d_Curve_1, then BRepBuilderAPI_MakeEdge_30 (pcurve on surface) =
  true 3D geodesic/helix edges. Unroll-map planar tool pattern to (u=arc,
  v=height), rebuild as surface edges, ThruSections/loft to thin solid, cut.

## Binding landmines (verified this session, do not rediscover)
- Primitive ctors DON'T auto-construct: explicit withProgressRange(x.Build(pr))
  before IsDone() (bit torus; likely same for new primitives).
- Handle_Geom_* wrappers fail as args; raw subclass fails as Standard_Transient;
  the door is `new Handle_Geom_Curve_1(); .reset(rawCurve.get())`.
- BRepBuilderAPI_MakeWire has no ctor: use occ-facade makeWireFromEdges/…FromEdge.
- MakePipeShell.MakeSolid() always throws in this build: cap manually (sew).
- Sewing API: Add(shape)/Perform(pr), no _1 suffixes.
- PointsToBSpline.Init_1(arr, degMin, degMax, oc.GeomAbs_Shape.GeomAbs_C1, tol);
  TColgp_Array1OfPnt_2(lower,upper).SetValue(i, pnt) (no suffix).
