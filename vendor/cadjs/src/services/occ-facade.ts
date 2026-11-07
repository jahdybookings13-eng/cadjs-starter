/**
 * OCC facade, typed wrappers around OpenCascade.js's `_NN` overload variants.
 *
 * **Why this layer exists.** The opencascade.js bindings expose constructor
 * variants as `gp_Pnt_3`, `BRepBuilderAPI_MakeFace_15`, etc. Used directly,
 * they leak the suffix into every call site, hide the actual semantics behind
 * an opaque number, and force `any` casts on builder objects. This facade:
 *
 *   1. Hides the `_NN` suffix, it appears only in this file.
 *   2. Surfaces real OCC base types (`gp_Pnt`, `TopoDS_Edge`, …) in signatures.
 *   3. Centralizes the `if (!builder.IsDone()) { try Check; throw }` pattern
 *      and `Message_ProgressRange_1` allocation/cleanup discipline.
 *
 * **Long-tail rule.** Only patterns used 3+ times across `services/occ-*.ts`
 * + `workers/occ-*.ts` get a helper here. One-off calls (e.g. `IsClosed_2`,
 * `Continuity_1`) stay direct in their site, wrapping noise without value.
 *
 * **Adding a helper.** New helper goes in the matching section below. Use the
 * base type (`gp_Pnt`, not `gp_Pnt_3`) in signatures so call sites are
 * suffix-free. The lint guard in `eslint.config.js` (`no-restricted-syntax`
 * on `_\d+$` member access) prevents the suffix from leaking back in.
 */

import type {
  OpenCascadeInstance,
  TopoDS_Edge,
  TopoDS_Wire,
  TopoDS_Face,
  TopoDS_Shell,
  TopoDS_Solid,
  TopoDS_Shape,
  gp_Pnt,
  gp_Vec,
  gp_Dir,
  gp_Ax1,
  gp_Ax2,
  gp_Circ,
  gp_Trsf,
  Message_ProgressRange,
  TopTools_IndexedMapOfShape,
  TopAbs_ShapeEnum,
} from "opencascade.js";
import { debugLog } from "../config";
import { TESSELLATE_LINEAR, TESSELLATE_ANGULAR } from "../tolerances";

// ── Points / vectors / axes ─────────────────────────────────────────────────

export function makePoint(
  oc: OpenCascadeInstance,
  x: number,
  y: number,
  z: number,
): gp_Pnt {
  return new oc.gp_Pnt_3(x, y, z);
}

export function makeDir(
  oc: OpenCascadeInstance,
  x: number,
  y: number,
  z: number,
): gp_Dir {
  return new oc.gp_Dir_4(x, y, z);
}

export function makeVec(
  oc: OpenCascadeInstance,
  x: number,
  y: number,
  z: number,
): gp_Vec {
  return new oc.gp_Vec_4(x, y, z);
}

export function makeAxis1(
  oc: OpenCascadeInstance,
  origin: gp_Pnt,
  dir: gp_Dir,
): gp_Ax1 {
  return new oc.gp_Ax1_2(origin, dir);
}

export function makeAxis2(
  oc: OpenCascadeInstance,
  origin: gp_Pnt,
  dir: gp_Dir,
  xDir?: gp_Dir,
): gp_Ax2 {
  return xDir
    ? new oc.gp_Ax2_2(origin, dir, xDir)
    : new oc.gp_Ax2_3(origin, dir);
}

export function makeCircle(
  oc: OpenCascadeInstance,
  axis: gp_Ax2,
  radius: number,
): gp_Circ {
  return new oc.gp_Circ_2(axis, radius);
}

// ── Transforms ──────────────────────────────────────────────────────────────

export function makeIdentityTransform(oc: OpenCascadeInstance): gp_Trsf {
  return new oc.gp_Trsf_1();
}

export function makeTranslation(
  oc: OpenCascadeInstance,
  dx: number,
  dy: number,
  dz: number,
): gp_Trsf {
  const trsf = new oc.gp_Trsf_1();
  const vec = makeVec(oc, dx, dy, dz);
  trsf.SetTranslation_1(vec);
  vec.delete();
  return trsf;
}

/**
 * Apply a transform to a shape. `copyGeom=true` rebuilds topology (slower,
 * may reorder edge indices in `TopTools_IndexedMapOfShape`). Use false for
 * pure positional moves where you intend to preserve edge identity.
 */
export function applyTransform(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  trsf: gp_Trsf,
  copyGeom: boolean = false,
): TopoDS_Shape {
  return withOcc(
    () => new oc.BRepBuilderAPI_Transform_2(shape, trsf, copyGeom),
    (transformer) => transformer.Shape(),
  );
}

// ── TopoDS down-casts (replaces oc.TopoDS.{Edge,Face,Wire,Solid,Shell}_1) ──

export function asEdge(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Edge {
  return oc.TopoDS.Edge_1(shape);
}

export function asFace(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Face {
  return oc.TopoDS.Face_1(shape);
}

export function asWire(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Wire {
  return oc.TopoDS.Wire_1(shape);
}

export function asSolid(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Solid {
  return oc.TopoDS.Solid_1(shape);
}

export function asShell(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): TopoDS_Shell {
  return oc.TopoDS.Shell_1(shape);
}

// ── Edges / wires / faces / solids ──────────────────────────────────────────

export function makeEdgeFromPoints(
  oc: OpenCascadeInstance,
  p1: gp_Pnt,
  p2: gp_Pnt,
): TopoDS_Edge {
  return withOcc(
    () => new oc.BRepBuilderAPI_MakeEdge_3(p1, p2),
    (builder) => {
      throwIfNotDone(builder, "MakeEdge (points)");
      return builder.Edge();
    },
  );
}

export function makeEdgeFromCircle(
  oc: OpenCascadeInstance,
  circ: gp_Circ,
): TopoDS_Edge {
  return withOcc(
    () => new oc.BRepBuilderAPI_MakeEdge_8(circ),
    (builder) => {
      throwIfNotDone(builder, "MakeEdge (circle)");
      return builder.Edge();
    },
  );
}

export function makeEdgeFromEllipse(
  oc: OpenCascadeInstance,
  axis: gp_Ax2,
  majorRadius: number,
  minorRadius: number,
): TopoDS_Edge {
  const elips = new oc.gp_Elips_2(axis, majorRadius, minorRadius);
  try {
    // MakeEdge_12 is the direct gp_Elips overload. The Handle_Geom_Curve path
    // crashes in this build even though the typings expose Geom_Ellipse.
    const builder = new oc.BRepBuilderAPI_MakeEdge_12(elips);
    try {
      throwIfNotDone(builder, "MakeEdge (ellipse)");
      return builder.Edge();
    } finally {
      builder.delete();
    }
  } finally {
    elips.delete();
  }
}

export function makeEdgeFromEllipticalArc(
  oc: OpenCascadeInstance,
  axis: gp_Ax2,
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
): TopoDS_Edge {
  const elips = new oc.gp_Elips_2(axis, majorRadius, minorRadius);
  try {
    let end = endAngle;
    while (end <= startAngle) end += Math.PI * 2;
    const builder = new oc.BRepBuilderAPI_MakeEdge_13(elips, startAngle, end);
    try {
      throwIfNotDone(builder, "MakeEdge (elliptical arc)");
      return builder.Edge();
    } finally {
      builder.delete();
    }
  } finally {
    elips.delete();
  }
}

export function makeEdgeFromSpline(
  oc: OpenCascadeInstance,
  points: { x: number; y: number }[],
): TopoDS_Edge {
  if (points.length < 2) {
    throw new Error("A spline needs at least two points");
  }

  const arr = new oc.TColgp_Array1OfPnt_2(1, points.length);
  const allocated: gp_Pnt[] = [];
  const fitter = new oc.GeomAPI_PointsToBSpline_1();
  const handle = new oc.Handle_Geom_Curve_1();
  let builder: InstanceType<typeof oc.BRepBuilderAPI_MakeEdge_24> | null = null;
  try {
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const gp = makePoint(oc, p.x, p.y, 0);
      allocated.push(gp);
      arr.SetValue(i + 1, gp as never);
    }

    const maxDegree = Math.min(8, points.length - 1);
    fitter.Init_1(
      arr,
      Math.min(3, maxDegree),
      maxDegree,
      oc.GeomAbs_Shape.GeomAbs_C1,
      1e-6,
    );
    if (!fitter.IsDone()) throw new Error("PointsToBSpline failed");

    const curve = fitter.Curve();
    if (!curve) throw new Error("PointsToBSpline returned no curve");
    handle.reset(curve.get() as never);
    curve.delete();

    builder = new oc.BRepBuilderAPI_MakeEdge_24(handle as never);
    throwIfNotDone(builder, "MakeEdge (spline)");
    return builder.Edge();
  } finally {
    builder?.delete();
    handle.delete();
    fitter.delete();
    arr.delete();
    for (const p of allocated) p.delete();
  }
}

export function makeEdgeFromBezier(
  oc: OpenCascadeInstance,
  points: { x: number; y: number }[],
): TopoDS_Edge {
  if (points.length !== 4) {
    throw new Error("A cubic Bezier needs exactly four control points");
  }

  const arr = new oc.TColgp_Array1OfPnt_2(1, 4);
  const allocated: gp_Pnt[] = [];
  const handle = new oc.Handle_Geom_Curve_1();
  let curve: InstanceType<typeof oc.Geom_BezierCurve_1> | null = null;
  let builder: InstanceType<typeof oc.BRepBuilderAPI_MakeEdge_24> | null = null;
  try {
    for (let i = 0; i < 4; i++) {
      const p = points[i]!;
      const gp = makePoint(oc, p.x, p.y, 0);
      allocated.push(gp);
      arr.SetValue(i + 1, gp as never);
    }
    curve = new oc.Geom_BezierCurve_1(arr);
    handle.reset(curve as never);
    builder = new oc.BRepBuilderAPI_MakeEdge_24(handle as never);
    throwIfNotDone(builder, "MakeEdge (bezier)");
    return builder.Edge();
  } finally {
    builder?.delete();
    handle.delete();
    curve?.delete();
    arr.delete();
    for (const p of allocated) p.delete();
  }
}

export function makeEdgeFromConic(
  oc: OpenCascadeInstance,
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  rho: number,
  startWeight = 1,
  endWeight = 1,
): TopoDS_Edge {
  const arr = new oc.TColgp_Array1OfPnt_2(1, 3);
  const weights = new oc.TColStd_Array1OfReal_2(1, 3);
  const allocated: gp_Pnt[] = [];
  const handle = new oc.Handle_Geom_Curve_1();
  let curve: InstanceType<typeof oc.Geom_BezierCurve_2> | null = null;
  let builder: InstanceType<typeof oc.BRepBuilderAPI_MakeEdge_24> | null = null;
  try {
    for (const [i, p] of [start, control, end].entries()) {
      const gp = makePoint(oc, p.x, p.y, 0);
      allocated.push(gp);
      arr.SetValue(i + 1, gp as never);
    }
    weights.SetValue(1, Math.max(0.01, startWeight));
    weights.SetValue(2, Math.max(0.01, rho));
    weights.SetValue(3, Math.max(0.01, endWeight));
    curve = new oc.Geom_BezierCurve_2(arr, weights as never);
    handle.reset(curve as never);
    builder = new oc.BRepBuilderAPI_MakeEdge_24(handle as never);
    throwIfNotDone(builder, "MakeEdge (conic)");
    return builder.Edge();
  } finally {
    builder?.delete();
    handle.delete();
    curve?.delete();
    weights.delete();
    arr.delete();
    for (const p of allocated) p.delete();
  }
}

// Note: 3-point arc is not a single MakeEdge overload, it requires
// GC_MakeArcOfCircle first, then MakeEdge_4. Add a helper here if/when
// a third call site appears.

/** Build a wire from an ordered list of edges. Throws if the wire is malformed. */
export function makeWireFromEdges(
  oc: OpenCascadeInstance,
  edges: TopoDS_Edge[],
): TopoDS_Wire {
  return withOcc(
    () => new oc.BRepBuilderAPI_MakeWire_1(),
    (builder) => {
      for (const edge of edges) builder.Add_1(edge);
      throwIfNotDone(builder, "MakeWire");
      return asWire(oc, builder.Wire());
    },
  );
}

/** Build a wire from a single edge. Useful when you already have a closed edge (e.g. a circle). */
export function makeWireFromEdge(
  oc: OpenCascadeInstance,
  edge: TopoDS_Edge,
): TopoDS_Wire {
  return withOcc(
    () => new oc.BRepBuilderAPI_MakeWire_2(edge),
    (builder) => {
      throwIfNotDone(builder, "MakeWire (single edge)");
      return builder.Wire();
    },
  );
}

/** Build a planar face from a closed wire. */
export function makePlanarFace(
  oc: OpenCascadeInstance,
  wire: TopoDS_Wire,
): TopoDS_Face {
  return withOcc(
    () => new oc.BRepBuilderAPI_MakeFace_15(wire, true),
    (builder) => {
      throwIfNotDone(builder, "MakeFace (planar)");
      return builder.Face();
    },
  );
}

// ── Topology iteration ──────────────────────────────────────────────────────

/**
 * Iterate over each sub-shape of `shapeType` inside `shape`. The explorer is
 * disposed automatically when the generator finishes or the caller breaks.
 *
 * Example:
 * ```ts
 * for (const face of iterSubShapes(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_FACE)) {
 *   // ... use face
 * }
 * ```
 */
export function* iterSubShapes(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  shapeType: TopAbs_ShapeEnum,
): Generator<TopoDS_Shape> {
  const explorer = new oc.TopExp_Explorer_2(
    shape,
    shapeType,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE as typeof oc.TopAbs_ShapeEnum,
  );
  try {
    while (explorer.More()) {
      yield explorer.Current();
      explorer.Next();
    }
  } finally {
    explorer.delete();
  }
}

/** Collect all sub-shapes of `shapeType` into an array (eager variant of {@link iterSubShapes}). */
export function collectSubShapes(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  shapeType: TopAbs_ShapeEnum,
): TopoDS_Shape[] {
  const out: TopoDS_Shape[] = [];
  for (const s of iterSubShapes(oc, shape, shapeType)) out.push(s);
  return out;
}

// ── Indexed maps ────────────────────────────────────────────────────────────

/**
 * Build an indexed edge map. Used by fillet/chamfer to address edges by 1-based
 * index. Caller owns the returned object, call `.delete()` when done.
 */
export function mapEdgesIndexed(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
): {
  size: number;
  edgeAt: (oneBasedIndex: number) => TopoDS_Edge;
  raw: TopTools_IndexedMapOfShape;
  delete: () => void;
} {
  const map = new oc.TopTools_IndexedMapOfShape_1();
  oc.TopExp.MapShapes_1(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
    map,
  );
  return {
    get size() {
      return map.Size();
    },
    edgeAt: (i: number) => asEdge(oc, map.FindKey(i)),
    raw: map,
    delete: () => map.delete(),
  };
}

// ── Analysis / fix / mesh ───────────────────────────────────────────────────

/**
 * Run `ShapeFix_Shape` to repair common topology defects (orientation, gaps).
 * `precision` defaults to 1e-6, the value used by every existing call site.
 */
export function fixShape(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  precision: number = 1e-6,
): TopoDS_Shape {
  return withProgressRange(oc, (pr) =>
    withOcc(
      () => new oc.ShapeFix_Shape_2(shape),
      (fixer) => {
        fixer.SetPrecision(precision);
        fixer.Perform(pr);
        return fixer.Shape();
      },
    ),
  );
}

/**
 * Tessellate `shape` in place with `BRepMesh_IncrementalMesh`. Default
 * deflection / angular-deflection come from the centralized tolerances
 * (`TESSELLATE_LINEAR` / `TESSELLATE_ANGULAR`); overridable for previews
 * vs final renders.
 */
export function tessellate(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  deflection: number = TESSELLATE_LINEAR,
  angularDeflection: number = TESSELLATE_ANGULAR,
  isRelative: boolean = false,
  inParallel: boolean = false,
): void {
  // The constructor performs tessellation as a side effect on `shape`. The
  // builder itself is then disposable.
  withOcc(
    () =>
      new oc.BRepMesh_IncrementalMesh_2(
        shape,
        deflection,
        isRelative,
        angularDeflection,
        inParallel,
      ),
    () => undefined,
  );
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** Allocate a `Message_ProgressRange`. Caller is responsible for `.delete()`. */
export function progressRange(oc: OpenCascadeInstance): Message_ProgressRange {
  return new oc.Message_ProgressRange_1();
}

/**
 * Run `fn` with a fresh `Message_ProgressRange`, automatically disposing it on
 * exit. Use this whenever the progress range is short-lived to avoid the
 * leak pattern that `progressRange()` callers fall into.
 */
export function withProgressRange<T>(
  oc: OpenCascadeInstance,
  fn: (pr: Message_ProgressRange) => T,
): T {
  const pr = progressRange(oc);
  try {
    return fn(pr);
  } finally {
    pr.delete();
  }
}

/**
 * Run `body` with a freshly-allocated WASM-backed OCC object, deleting it in
 * `finally` even if `body` throws. Wraps the leak hazard that every
 * `BRepBuilderAPI_*`, `TopTools_*`, `TopExp_Explorer`, etc. allocation has.
 *
 * For multiple short-lived allocations in one body, prefer {@link withOccScope}
 * over nested `withOcc` calls.
 */
export function withOcc<T extends { delete(): void }, R>(
  make: () => T,
  body: (obj: T) => R,
): R {
  const obj = make();
  try {
    return body(obj);
  } finally {
    obj.delete();
  }
}

/**
 * Variant of {@link withOcc} for functions that allocate multiple disposables.
 * The body receives a `track` function; every tracked object is deleted on
 * exit (success or throw), in reverse-allocation order. The tracked value is
 * returned through `track` for inline use.
 *
 * ```ts
 * return withOccScope((track) => {
 *   const origin = track(makePoint(oc, 0, 0, 0));
 *   const dir    = track(makeDir(oc, 0, 0, 1));
 *   const axis   = track(makeAxis1(oc, origin, dir));
 *   const revol  = track(new oc.BRepPrimAPI_MakeRevol_1(face, axis, angle, true));
 *   throwIfNotDone(revol, "Revolve");
 *   return revol.Shape();   // Shape() handle outlives the disposed builder
 * });
 * ```
 */
export function withOccScope<R>(
  body: (track: <T extends { delete(): void }>(obj: T) => T) => R,
): R {
  const stack: Array<{ delete(): void }> = [];
  const track = <T extends { delete(): void }>(obj: T): T => {
    stack.push(obj);
    return obj;
  };
  try {
    return body(track);
  } finally {
    for (let i = stack.length - 1; i >= 0; i--) stack[i]!.delete();
  }
}

/**
 * Check `builder.IsDone()`; on failure, extract a detail via `builder.Check()`
 * if available, then throw with the `opName` prefix. Shared across
 * `occ-extrude.ts`, `occ-revolve-loft.ts`, etc.
 */
export function throwIfNotDone(
  builder: { IsDone: () => boolean; Check?: () => void },
  opName: string,
): void {
  if (builder.IsDone()) return;
  let detail = "unknown reason";
  if (typeof builder.Check === "function") {
    try {
      builder.Check();
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`${opName} failed: ${detail}`);
}

/**
 * Read `HasErrors()` / `HasWarnings()` flags from a BOP / fillet / chamfer
 * builder and return a human-readable summary. Shared across the
 * boolean/fillet/chamfer diagnostics call sites.
 *
 * The `extra` callback lets callers append builder-specific detail without
 * duplicating the common scaffolding.
 */
export function collectBuilderDiagnostics(
  builder: {
    HasErrors?: () => boolean;
    HasWarnings?: () => boolean;
  },
  extra?: () => string[],
): string {
  const parts: string[] = [];
  try {
    if (builder.HasErrors?.()) parts.push("shape computation error");
  } catch (e) {
    debugLog("[diagnostics] HasErrors threw:", e);
  }
  try {
    if (builder.HasWarnings?.()) parts.push("with warnings");
  } catch (e) {
    debugLog("[diagnostics] HasWarnings threw:", e);
  }
  if (extra) {
    try {
      parts.push(...extra());
    } catch (e) {
      debugLog("[diagnostics] extra() threw:", e);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "unknown reason";
}
