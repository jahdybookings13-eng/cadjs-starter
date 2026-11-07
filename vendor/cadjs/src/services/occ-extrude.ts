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
  collectSubShapes,
  fixShape,
  makeAxis2,
  makeDir,
  makePoint,
  makeVec,
  throwIfNotDone,
  withOcc,
  withOccScope,
  withProgressRange,
} from "./occ-facade";
import { debugLog } from "../config";

export function extrudeShapeHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  depth: number,
  direction: number = 1,
  normalVec?: Vec3,
  symmetric?: boolean,
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
    return prism.Shape();
  });

  const fixed = fixShape(oc, built, 1e-9);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, built));
  } catch (e) {
    debugLog("[extrude] OrientClosedSolid failed (best-effort):", e);
  }
  return fixed;
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
  },
): TopoDS_Shape {
  const face = asFace(oc, profileFace);
  type SweepResult = { kind: "ok"; built: TopoDS_Shape } | { kind: "fallback" };
  let result: SweepResult;
  try {
    result = withOccScope<SweepResult>((track) => {
      const profileWire = oc.BRepTools.OuterWire(face);
      const shell = track(new oc.BRepOffsetAPI_MakePipeShell(pathWire));

      if (options.orientation === "perpendicular") {
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
