/** Extrude (linear prism) and advanced sweep (frenet/binormal pipe shell). */
import type {
  OpenCascadeInstance,
  TopoDS_Face,
  TopoDS_Shape,
  TopoDS_Wire,
} from "opencascade.js";
import type { Vec3 } from "../workers/occ-worker-types";
import {
  applyTransform,
  asFace,
  asSolid,
  asWire,
  collectSubShapes,
  fixShape,
  makeAxis2,
  makeDir,
  makePlanarFace,
  makePoint,
  makeVec,
  throwIfNotDone,
  withOcc,
  withOccScope,
  withProgressRange,
} from "./occ-facade";
import { debugLog } from "../config";

/**
 * Taper the lateral walls of a prism about the profile plane. The neutral
 * plane passes through the profile centroid; cap faces are selected out by
 * their centroid position along the extrusion axis.
 */
function applyExtrudeDraft(
  oc: OpenCascadeInstance,
  track: <T extends { delete(): void }>(obj: T) => T,
  shape: TopoDS_Shape,
  baseFace: TopoDS_Face,
  normal: Vec3,
  signedDepth: number,
  symmetric: boolean,
  angleDeg: number,
  neutralPoint?: Vec3,
  neutralNormal?: Vec3,
  mode: "NEUTRAL" | "PARTING" = "NEUTRAL",
  partingLine?: { start: Vec3; end: Vec3 },
): TopoDS_Shape {
  if (!(Math.abs(angleDeg) > 1e-9)) return shape;
  if (!(Math.abs(signedDepth) > 1e-9))
    throw new Error("extrude: draft needs a non-zero depth");

  const baseProps = track(new oc.GProp_GProps_1());
  oc.BRepGProp.SurfaceProperties_2(baseFace, baseProps, 1e-7, false);
  const basePoint = track(baseProps.CentreOfMass());
  const origin = { x: basePoint.X(), y: basePoint.Y(), z: basePoint.Z() };
  // Default to the profile plane; an explicit neutral plane or parting line
  // overrides only the plane, not the draft pull direction.
  const planePoint =
    mode === "PARTING" && partingLine
      ? partingLine.start
      : neutralPoint ?? origin;
  const planeNormal = neutralNormal ?? normal;
  if (mode === "PARTING") {
    if (!partingLine) throw new Error("extrude: parting mode needs a parting edge");
    const dx = partingLine.end.x - partingLine.start.x;
    const dy = partingLine.end.y - partingLine.start.y;
    const dz = partingLine.end.z - partingLine.start.z;
    const dl = Math.hypot(dx, dy, dz);
    const nl = Math.hypot(planeNormal.x, planeNormal.y, planeNormal.z);
    if (!(dl > 1e-12) || !(nl > 1e-12))
      throw new Error("extrude: parting edge or neutral normal is degenerate");
    const dot =
      ((dx * planeNormal.x + dy * planeNormal.y + dz * planeNormal.z) /
        (dl * nl));
    if (Math.abs(dot) > 1e-5)
      throw new Error(
        "extrude: parting edge must lie in a plane perpendicular to the draft direction",
      );
  }

  const faces = collectSubShapes(
    oc,
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
  ).map((s) => asFace(oc, s));
  const lateral: TopoDS_Face[] = [];
  for (const face of faces) {
    const props = track(new oc.GProp_GProps_1());
    oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
    const c = track(props.CentreOfMass());
    const t =
      ((c.X() - origin.x) * normal.x +
        (c.Y() - origin.y) * normal.y +
        (c.Z() - origin.z) * normal.z) /
      signedDepth;
    const isLateral = symmetric
      ? Math.abs(t) < 0.85
      : t > 0.15 && t < 0.85;
    if (isLateral) lateral.push(face);
  }
  if (!lateral.length)
    throw new Error("extrude: draft found no lateral faces");

  const attempt = (deg: number): TopoDS_Shape | null => {
    try {
      const dir = track(makeDir(oc, normal.x, normal.y, normal.z));
      const planeDir = track(
        makeDir(oc, planeNormal.x, planeNormal.y, planeNormal.z),
      );
      const neutral = track(
        new oc.gp_Pln_3(
          makePoint(oc, planePoint.x, planePoint.y, planePoint.z),
          planeDir,
        ),
      );
      const draft = track(new oc.BRepOffsetAPI_DraftAngle_1());
      draft.Init(shape);
      for (const face of lateral) {
        let faceDeg = deg;
        if (mode === "PARTING") {
          const props = track(new oc.GProp_GProps_1());
          oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
          const c = track(props.CentreOfMass());
          const side =
            (c.X() - planePoint.x) * planeNormal.x +
            (c.Y() - planePoint.y) * planeNormal.y +
            (c.Z() - planePoint.z) * planeNormal.z;
          if (side < 0) faceDeg = -deg;
        }
        draft.Add(face, dir, (faceDeg * Math.PI) / 180, neutral, false);
        if (!draft.AddDone()) {
          const bad = draft.ProblematicShape();
          bad.delete();
        }
      }
      withProgressRange(oc, (pr) => draft.Build(pr));
      if (!draft.IsDone()) return null;
      draft.CorrectWires();
      return draft.Shape();
    } catch {
      return null;
    }
  };

  const drafted = attempt(angleDeg) ?? attempt(-angleDeg);
  if (!drafted)
    throw new Error(`extrude: draft angle ${angleDeg}deg could not be built`);
  return drafted;
}

export function extrudeShapeHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  depth: number,
  direction: number = 1,
  normalVec?: Vec3,
  symmetric?: boolean,
  draftAngleDeg?: number,
  draft?: {
    neutralPoint?: Vec3 | undefined;
    neutralNormal?: Vec3 | undefined;
    mode?: "NEUTRAL" | "PARTING" | undefined;
    partingLine?: { start: Vec3; end: Vec3 } | undefined;
  },
): TopoDS_Shape {
  const built = withOccScope((track) => {
    const faces = collectSubShapes(
      oc,
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
    ).map((s) => asFace(oc, s));
    if (faces.length === 0) throw new Error("No face found for extrusion");

    const n = normalVec || { x: 0, y: 0, z: 1 };
    const d = direction * Math.abs(depth);

    let baseShape: TopoDS_Shape;
    if (faces.length === 1) {
      baseShape = faces[0]!;
    } else {
      const sewing = track(
        new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false),
      );
      for (const face of faces) sewing.Add(face);
      withProgressRange(oc, (pr) => sewing.Perform(pr));
      baseShape = sewing.SewedShape();
    }

    // Symmetric: translate base back by -d*normal, then extrude by 2*d*normal
    if (symmetric) {
      const trsf = track(new oc.gp_Trsf_1());
      const shiftVec = track(makeVec(oc, -n.x * d, -n.y * d, -n.z * d));
      trsf.SetTranslation_1(shiftVec);
      baseShape = applyTransform(oc, baseShape, trsf, false);
    }

    const extrusionMag = symmetric ? 2 * d : d;
    const extrusionVec = track(
      makeVec(oc, n.x * extrusionMag, n.y * extrusionMag, n.z * extrusionMag),
    );

    const prism = track(
      new oc.BRepPrimAPI_MakePrism_1(baseShape, extrusionVec, false, true),
    );
    withProgressRange(oc, (pr) => prism.Build(pr));
    throwIfNotDone(prism, "Prism creation");
    const prismShape = prism.Shape();
    if (!draftAngleDeg) return prismShape;
    return applyExtrudeDraft(
      oc,
      track,
      prismShape,
      faces[0]!,
      n,
      d,
      !!symmetric,
      draftAngleDeg,
      draft?.neutralPoint,
      draft?.neutralNormal,
      draft?.mode ?? "NEUTRAL",
      draft?.partingLine,
    );
  });

  const fixed = fixShape(oc, built, 1e-9);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, built));
  } catch (e) {
    debugLog("[extrude] OrientClosedSolid failed (best-effort):", e);
  }
  return fixed;
}

/**
 * Offset a closed profile inward by `thickness` and return the inner face.
 * Thin wall is the outer solid minus the solid built from this face. Tries the
 * inward offset first, then the outward one (wire orientation is not reliable).
 */
export function offsetProfileFace(
  oc: OpenCascadeInstance,
  face: TopoDS_Face,
  thickness: number,
  corner: "ROUNDED" | "CONICAL" | "TRANSITIONAL" = "ROUNDED",
): TopoDS_Face {
  if (!(thickness > 0)) throw new Error("thin wall needs a positive thickness");
  const outer = oc.BRepTools.OuterWire(face);
  if (!outer) throw new Error("thin wall needs a closed profile");
  const attempt = (delta: number): TopoDS_Face | null => {
    try {
      const off = new oc.BRepOffsetAPI_MakeOffset_1();
      try {
        // Thin-feature corner handling: rounded = arc join, conical = sharp
        // intersection, transitional = tangent join (OCC's three join modes).
        const join =
          corner === "CONICAL"
            ? oc.GeomAbs_JoinType.GeomAbs_Intersection
            : corner === "TRANSITIONAL"
              ? oc.GeomAbs_JoinType.GeomAbs_Tangent
              : oc.GeomAbs_JoinType.GeomAbs_Arc;
        off.Init_2(join as typeof oc.GeomAbs_JoinType, false);
        off.AddWire(outer);
        off.Perform(delta, 0);
        if (!off.IsDone()) return null;
        return makePlanarFace(oc, asWire(oc, off.Shape()));
      } finally {
        off.delete();
      }
    } catch {
      return null;
    }
  };
  const inner = attempt(-thickness) ?? attempt(thickness);
  if (!inner) {
    throw new Error(
      "thin wall: profile could not be offset (self-intersecting or wall too thick)",
    );
  }
  return inner;
}

function sweepShapeSimpleHelper(
  oc: OpenCascadeInstance,
  profileFace: TopoDS_Face,
  pathWire: TopoDS_Wire,
): TopoDS_Shape {
  const built = withOcc(
    () => new oc.BRepOffsetAPI_MakePipe_1(pathWire, profileFace),
    (pipe) => {
      withProgressRange(oc, (pr) => pipe.Build(pr));
      if (!pipe.IsDone()) throw new Error("BRepOffsetAPI_MakePipe failed");
      return pipe.Shape();
    },
  );
  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[sweep-simple] OrientClosedSolid failed (best-effort):", e);
  }
  return fixed;
}

export function sweepShapeAdvancedHelper(
  oc: OpenCascadeInstance,
  profileFace: TopoDS_Shape,
  pathWire: TopoDS_Wire,
  options: {
    orientation: "perpendicular" | "parallel";
    cornerMode: "right" | "round";
    chordalTolerance?: number | undefined;
    /** Auxiliary spine: the single guide curve this OCC build supports. */
    guideWire?: TopoDS_Wire | undefined;
  },
): TopoDS_Shape {
  const face = asFace(oc, profileFace);
  type SweepResult = { kind: "ok"; built: TopoDS_Shape } | { kind: "fallback" };
  let result: SweepResult;
  try {
    result = withOccScope<SweepResult>((track) => {
      const profileWire = oc.BRepTools.OuterWire(face);
      const shell = track(new oc.BRepOffsetAPI_MakePipeShell(pathWire));

      if (options.guideWire) {
        shell.SetMode_5(
          options.guideWire,
          false,
          oc.BRepFill_TypeOfContact.BRepFill_NoContact as never,
        );
      } else if (options.orientation === "perpendicular") {
        shell.SetDiscreteMode();
      } else {
        const origin = track(makePoint(oc, 0, 0, 0));
        const zDir = track(makeDir(oc, 0, 0, 1));
        const xDir = track(makeDir(oc, 1, 0, 0));
        const ax2 = track(makeAxis2(oc, origin, zDir, xDir));
        shell.SetMode_2(ax2);
      }

      shell.SetTransitionMode(
        (options.cornerMode === "right"
          ? oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner
          : oc.BRepBuilderAPI_TransitionMode
              .BRepBuilderAPI_RoundCorner) as typeof oc.BRepBuilderAPI_TransitionMode,
      );

      if (options.chordalTolerance && options.chordalTolerance > 0) {
        // (Tol3d, BoundTol, TolAngular); 1.0 / 1e-4 are the OCC defaults for
        // the two arguments this API makes mandatory.
        shell.SetTolerance(options.chordalTolerance, 1.0, 1e-4);
      }

      shell.Add_1(profileWire, false, true);
      withProgressRange(oc, (pr) => shell.Build(pr));

      if (!shell.IsDone()) {
        const reason = pipeShellFailureReason(oc, shell);
        console.warn(
          `[sweepShapeAdvanced] MakePipeShell failed: ${reason}, falling back to simple pipe`,
        );
        return { kind: "fallback" };
      }

      shell.MakeSolid();
      return { kind: "ok", built: shell.Shape() };
    });
  } catch (e) {
    debugLog("[sweep] advanced sweep threw, falling back to simple pipe:", e);
    return sweepShapeSimpleHelper(oc, face, pathWire);
  }

  if (result.kind === "fallback")
    return sweepShapeSimpleHelper(oc, face, pathWire);

  const fixed = fixShape(oc, result.built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[sweep] OrientClosedSolid failed, returning unoriented:", e);
  }
  return fixed;
}

function sampleOuterWire(
  oc: OpenCascadeInstance,
  wire: TopoDS_Wire,
  count: number,
): P3[] {
  const curve = new oc.BRepAdaptor_CompCurve_2(wire, true);
  try {
    const first = curve.FirstParameter();
    const last = curve.LastParameter();
    const out: P3[] = [];
    for (let i = 0; i < count; i++) {
      const p = curve.Value(first + ((last - first) * i) / (count - 1));
      out.push({ x: p.X(), y: p.Y(), z: p.Z() });
      p.delete();
    }
    return out;
  } finally {
    curve.delete();
  }
}

function dominantAxis(points: P3[], center: P3, fallback: P3): P3 {
  let axis = vUnit(fallback) ?? { x: 1, y: 0, z: 0 };
  for (let iter = 0; iter < 16; iter++) {
    let next = { x: 0, y: 0, z: 0 };
    for (const p of points) {
      const d = vSub(p, center);
      next = vAdd(next, vScale(d, vDot(d, axis)));
    }
    const unit = vUnit(next);
    if (!unit) break;
    axis = vDot(unit, axis) < 0 ? vScale(unit, -1) : unit;
  }
  return axis;
}

function frameFromAxis(axis: P3, normal: P3): [P3, P3, P3] | null {
  const e3 = vUnit(normal);
  if (!e3) return null;
  const projected = vSub(axis, vScale(e3, vDot(axis, e3)));
  const e1 = vUnit(projected);
  if (!e1) return null;
  const e2 = vUnit(vCross(e3, e1));
  if (!e2) return null;
  return [e1, e2, e3];
}

/**
 * True multi-guide sweep for this OpenCascade build. MakePipeShell only takes
 * one auxiliary spine, so this path builds a section at every path station and
 * drives that section from all guide rails: the section centroid follows the
 * rail centroid, its in-plane axis follows the rail spread, and its plane
 * normal follows the path tangent. This is rail-constrained sweeping rather
 * than averaging the guides into one spine.
 */
export function sweepMultiGuideHelper(
  oc: OpenCascadeInstance,
  profileFace: TopoDS_Shape,
  pathPoints: Vec3[],
  guideCurves: Vec3[][],
  options: {
    orientation: "perpendicular" | "parallel";
    cornerMode: "right" | "round";
    chordalTolerance?: number | undefined;
  },
): TopoDS_Shape {
  if (guideCurves.length < 2)
    throw new Error("sweep: multi-guide sweep needs at least two guides");
  if (pathPoints.length < 2)
    throw new Error("sweep: multi-guide sweep needs a path");

  const stationsCount = Math.min(64, Math.max(16, pathPoints.length));
  const path = resamplePolyline(
    pathPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    stationsCount,
  );
  const guides = guideCurves.map((curve) =>
    resamplePolyline(
      curve.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      stationsCount,
    ),
  );

  const built = withOccScope((track) => {
    const face = asFace(oc, profileFace);
    const surf = track(new oc.BRepAdaptor_Surface_2(face, true));
    if (surf.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane)
      throw new Error("sweep: multi-guide sweep needs a planar profile");
    const sourcePlane = track(surf.Plane());
    const sourceAx = track(sourcePlane.Position());
    const sourceNormalDir = sourceAx.Direction();
    const sourceNormal = {
      x: sourceNormalDir.X(),
      y: sourceNormalDir.Y(),
      z: sourceNormalDir.Z(),
    };
    const outerWire = (
      oc as unknown as {
        BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
      }
    ).BRepTools.OuterWire(face);
    if (!outerWire) throw new Error("sweep: profile has no outer wire");
    const wireSamples = sampleOuterWire(oc, outerWire, 256);
    if (wireSamples.length < 4)
      throw new Error("sweep: profile outer wire could not be sampled");

    const used = new Set<number>();
    const contacts = guides.map((guide) => {
      const start = guide[0]!;
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < wireSamples.length; i++) {
        if (used.has(i)) continue;
        const d = vLen(vSub(wireSamples[i]!, start));
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      if (best < 0) best = 0;
      used.add(best);
      return wireSamples[best]!;
    });

    const sourceCenter = vScale(
      contacts.reduce((acc, p) => vAdd(acc, p), { x: 0, y: 0, z: 0 }),
      1 / contacts.length,
    );
    const sourceSpread =
      contacts.reduce((acc, p) => acc + vLen(vSub(p, sourceCenter)) ** 2, 0) /
      contacts.length;
    let sourceAxis = dominantAxis(contacts, sourceCenter, {
      x: 1,
      y: 0,
      z: 0,
    });
    const firstOffset = vSub(contacts[0]!, sourceCenter);
    if (vDot(sourceAxis, firstOffset) < 0) sourceAxis = vScale(sourceAxis, -1);

    const tangentAt = (i: number): P3 | null => {
      const a = path[Math.max(0, i - 1)]!;
      const b = path[Math.min(path.length - 1, i + 1)]!;
      return vUnit(vSub(b, a));
    };

    const sourceFrame = frameFromAxis(sourceAxis, sourceNormal);
    if (!sourceFrame)
      throw new Error("sweep: could not build the profile guide frame");

    const thruSections = track(
      new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6),
    );
    thruSections.CheckCompatibility(false);
    thruSections.SetSmoothing(true);

    for (let i = 0; i < stationsCount; i++) {
      const targets = guides.map((g) => g[i]!);
      const targetCenter = vScale(
        targets.reduce((acc, p) => vAdd(acc, p), { x: 0, y: 0, z: 0 }),
        1 / targets.length,
      );
      const targetSpread =
        targets.reduce(
          (acc, p) => acc + vLen(vSub(p, targetCenter)) ** 2,
          0,
        ) / targets.length;
      const top = tangentAt(i);
      const targetNormal =
        options.orientation === "parallel" || !top ? sourceNormal : top;
      let targetAxis = dominantAxis(targets, targetCenter, sourceAxis);
      const targetFirst = vSub(targets[0]!, targetCenter);
      if (vDot(targetAxis, targetFirst) < 0)
        targetAxis = vScale(targetAxis, -1);
      const targetFrame = frameFromAxis(targetAxis, targetNormal);
      if (!targetFrame)
        throw new Error("sweep: a guide section frame degenerated");
      if (!(sourceSpread > 1e-12) || !(targetSpread > 1e-12))
        throw new Error("sweep: guide rails do not span the profile");
      const scale = Math.sqrt(targetSpread / sourceSpread);
      if (!(scale > 1e-6) || !Number.isFinite(scale))
        throw new Error("sweep: guide rail scale is degenerate");

      const [s1, s2, s3] = sourceFrame;
      const [t1, t2, t3] = targetFrame;
      const targetColumns = [
        [t1.x, t2.x, t3.x],
        [t1.y, t2.y, t3.y],
        [t1.z, t2.z, t3.z],
      ];
      const sourceColumns = [
        [s1.x, s2.x, s3.x],
        [s1.y, s2.y, s3.y],
        [s1.z, s2.z, s3.z],
      ];
      const m = (row: 0 | 1 | 2, col: 0 | 1 | 2) => {
        const target = targetColumns[row]!;
        const source = sourceColumns[col]!;
        return (
          target[0]! * source[0]! +
          target[1]! * source[1]! +
          target[2]! * source[2]!
        );
      };
      const rc = (p: P3): P3 => ({
        x: m(0, 0) * p.x + m(0, 1) * p.y + m(0, 2) * p.z,
        y: m(1, 0) * p.x + m(1, 1) * p.y + m(1, 2) * p.z,
        z: m(2, 0) * p.x + m(2, 1) * p.y + m(2, 2) * p.z,
      });
      const rotatedCenter = vScale(rc(sourceCenter), scale);
      const trsf = track(new oc.gp_Trsf_1());
      trsf.SetValues(
        m(0, 0) * scale,
        m(0, 1) * scale,
        m(0, 2) * scale,
        targetCenter.x - rotatedCenter.x,
        m(1, 0) * scale,
        m(1, 1) * scale,
        m(1, 2) * scale,
        targetCenter.y - rotatedCenter.y,
        m(2, 0) * scale,
        m(2, 1) * scale,
        m(2, 2) * scale,
        targetCenter.z - rotatedCenter.z,
      );
      const moved = track(
        new oc.BRepBuilderAPI_Transform_2(face, trsf, true),
      );
      const movedFace = asFace(oc, moved.Shape());
      const movedWire = (
        oc as unknown as {
          BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
        }
      ).BRepTools.OuterWire(movedFace);
      if (!movedWire)
        throw new Error("sweep: a guide section has no outer wire");
      thruSections.AddWire(asWire(oc, movedWire));
    }

    withProgressRange(oc, (pr) => thruSections.Build(pr));
    throwIfNotDone(thruSections, "multi-guide sweep");
    return thruSections.Shape();
  });

  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[sweep-multi-guide] OrientClosedSolid failed:", e);
  }
  return fixed;
}

type P3 = { x: number; y: number; z: number };
const vSub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vAdd = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vScale = (a: P3, s: number): P3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const vDot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vCross = (a: P3, b: P3): P3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vLen = (a: P3): number => Math.hypot(a.x, a.y, a.z);
const vUnit = (a: P3): P3 | null => {
  const l = vLen(a);
  return l > 1e-12 ? vScale(a, 1 / l) : null;
};

/** Resample a polyline to `count` arc-length stations (keeps both ends). */
function resamplePolyline(points: P3[], count: number): P3[] {
  if (points.length < 2) return points.slice();
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + vLen(vSub(points[i]!, points[i - 1]!)));
  }
  const total = lengths[lengths.length - 1]!;
  if (!(total > 1e-12)) return [points[0]!, points[points.length - 1]!];
  const out: P3[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (seg < lengths.length - 1 && lengths[seg]! < target) seg++;
    const a = points[seg - 1]!;
    const b = points[seg]!;
    const span = lengths[seg]! - lengths[seg - 1]!;
    const t = span > 1e-12 ? (target - lengths[seg - 1]!) / span : 0;
    out.push(vAdd(a, vScale(vSub(b, a), t)));
  }
  return out;
}

/**
 * Twist sweep. The pipe shell has no twist input in this OCC build, so the
 * profile is placed as a section at every path station with its frame rotated
 * by the accumulated twist, then the sections are lofted. This is the same
 * section engine as loft, applied along the path; it supports arbitrary 3D
 * paths and produces one capped solid.
 */
export function sweepTwistedHelper(
  oc: OpenCascadeInstance,
  profileFace: TopoDS_Shape,
  pathPoints: Vec3[],
  twistRadians: number,
  options?: {
    chordalTolerance?: number | undefined;
    cornerMode?: "right" | "round" | undefined;
  },
): TopoDS_Shape {
  if (!(Math.abs(twistRadians) > 1e-12))
    throw new Error("sweep: twist angle is zero");
  if (pathPoints.length < 2)
    throw new Error("sweep: twisted sweep needs a path with >=2 points");

  const pts: P3[] = pathPoints.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const stations = resamplePolyline(
    pts,
    Math.min(48, Math.max(8, pts.length)),
  );

  const built = withOccScope((track) => {
    const face = asFace(oc, profileFace);
    const props = track(new oc.GProp_GProps_1());
    oc.BRepGProp.SurfaceProperties_2(face, props, 1e-7, false);
    const centre = track(props.CentreOfMass());
    const centreP3 = {
      x: centre.X(),
      y: centre.Y(),
      z: centre.Z(),
    };

    const surf = track(new oc.BRepAdaptor_Surface_2(face, true));
    if (surf.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane)
      throw new Error("sweep: twisted sweep needs a planar profile");
    const pln = track(surf.Plane());
    const plnAx = track(pln.Position());
    const sourceN = plnAx.Direction();
    const sourceX = plnAx.XDirection();

    const tangentAt = (i: number): P3 | null =>
      vUnit(
        vSub(
          stations[Math.min(i + 1, stations.length - 1)]!,
          stations[Math.max(i - 1, 0)]!,
        ),
      );
    const t0 = tangentAt(0);
    if (!t0) throw new Error("sweep: path has no usable start tangent");

    // Parallel-transport the profile x direction along the path; the profile
    // normal follows the tangent so every section is perpendicular to it.
    const sourceXVec = {
      x: sourceX.X(),
      y: sourceX.Y(),
      z: sourceX.Z(),
    };
    let xRef: P3 | null = vUnit(
      vSub(sourceXVec, vScale(t0, vDot(sourceXVec, t0))),
    );
    if (!xRef) {
      const seed =
        Math.abs(t0.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      xRef = vUnit(vSub(seed, vScale(t0, vDot(seed, t0))));
    }
    if (!xRef) throw new Error("sweep: could not build a profile frame");

    const source = track(
      new oc.gp_Ax3_3(centre, sourceN, sourceX),
    );

    const thruSections = track(
      new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6),
    );
    thruSections.CheckCompatibility(false);

    for (let i = 0; i < stations.length; i++) {
      const p = stations[i]!;
      const t = tangentAt(i) ?? t0;
      const projected = vUnit(vSub(xRef!, vScale(t, vDot(xRef!, t))));
      if (projected) xRef = projected;
      const y = vCross(t, xRef);

      const theta = twistRadians * (i / (stations.length - 1));
      const xr = vUnit(
        vAdd(vScale(xRef, Math.cos(theta)), vScale(y, Math.sin(theta))),
      );
      if (!xr) throw new Error("sweep: twisted section frame degenerated");

      const target = track(
        new oc.gp_Ax3_3(
          makePoint(oc, p.x, p.y, p.z),
          makeDir(oc, t.x, t.y, t.z),
          makeDir(oc, xr.x, xr.y, xr.z),
        ),
      );
      const trsf = track(new oc.gp_Trsf_1());
      trsf.SetDisplacement(source, target);
      const transformed = track(
        new oc.BRepBuilderAPI_Transform_2(profileFace, trsf, true),
      );
      const movedFace = asFace(oc, transformed.Shape());
      const outerWire = (
        oc as unknown as {
          BRepTools: { OuterWire: (f: TopoDS_Face) => TopoDS_Wire };
        }
      ).BRepTools.OuterWire(movedFace);
      if (!outerWire) throw new Error("sweep: twisted section has no outer wire");
      thruSections.AddWire(asWire(oc, outerWire));
    }

    if (options?.chordalTolerance && options.chordalTolerance > 0) {
      // ThruSections has no tolerance setter; the path is already resampled.
      void options.chordalTolerance;
    }
    withProgressRange(oc, (pr) => thruSections.Build(pr));
    throwIfNotDone(thruSections, "twisted sweep");
    return thruSections.Shape();
  });

  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[sweep-twist] OrientClosedSolid failed:", e);
  }
  return fixed;
}

function pipeShellFailureReason(
  oc: OpenCascadeInstance,
  shell: InstanceType<OpenCascadeInstance["BRepOffsetAPI_MakePipeShell"]>,
): string {
  try {
    const status = shell.GetStatus();
    if (
      status ===
      oc.BRepBuilderAPI_PipeError.BRepBuilderAPI_PlaneNotIntersectGuide
    ) {
      return "guide curve does not intersect profile plane";
    }
    if (
      status === oc.BRepBuilderAPI_PipeError.BRepBuilderAPI_ImpossibleContact
    ) {
      return "impossible contact between profile and path";
    }
  } catch (e) {
    debugLog("[sweep] pipe status decode failed:", e);
  }
  return "unknown";
}
