/** Revolve (axisymmetric solid) and loft (thru-sections). */
import type { OpenCascadeInstance, TopoDS_Shape } from "opencascade.js";
import type { Vec3 } from "../workers/occ-worker-types";
import {
  asSolid,
  asWire,
  fixShape,
  iterSubShapes,
  makeAxis1,
  makeDir,
  makePoint,
  throwIfNotDone,
  withOcc,
  withOccScope,
  withProgressRange,
} from "./occ-facade";
import { debugLog } from "../config";

export function revolveShapeHelper(
  oc: OpenCascadeInstance,
  face: TopoDS_Shape,
  axisOrigin: Vec3,
  axisDir: Vec3,
  angleRadians?: number,
): TopoDS_Shape {
  const built = withOccScope((track) => {
    const origin = track(
      makePoint(oc, axisOrigin.x, axisOrigin.y, axisOrigin.z),
    );
    const direction = track(makeDir(oc, axisDir.x, axisDir.y, axisDir.z));
    const axis = track(makeAxis1(oc, origin, direction));

    const isFullRevolution =
      angleRadians === undefined || Math.abs(angleRadians - 2 * Math.PI) < 1e-6;
    const revolBuilder = track(
      isFullRevolution
        ? new oc.BRepPrimAPI_MakeRevol_2(face, axis, true)
        : new oc.BRepPrimAPI_MakeRevol_1(face, axis, angleRadians!, true),
    );

    withProgressRange(oc, (pr) => revolBuilder.Build(pr));
    throwIfNotDone(revolBuilder, "Revolve");
    return revolBuilder.Shape();
  });

  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    // Returning unoriented solid is acceptable; record so callers / dev mode
    // can investigate inverted normals.
    debugLog("[revolve] OrientClosedSolid failed:", e);
  }
  return fixed;
}

export function loftShapesHelper(
  oc: OpenCascadeInstance,
  profileFaces: TopoDS_Shape[],
  isSolid: boolean = true,
  isRuled: boolean = false,
): TopoDS_Shape {
  const built = withOcc(
    () => new oc.BRepOffsetAPI_ThruSections(isSolid, isRuled, 1e-6),
    (thruSections) => {
      for (const face of profileFaces) {
        for (const wire of iterSubShapes(
          oc,
          face,
          oc.TopAbs_ShapeEnum.TopAbs_WIRE as typeof oc.TopAbs_ShapeEnum,
        )) {
          thruSections.AddWire(asWire(oc, wire));
          break; // first wire only, matches prior behavior
        }
      }
      withProgressRange(oc, (pr) => thruSections.Build(pr));
      throwIfNotDone(thruSections, "ThruSections");
      return thruSections.Shape();
    },
  );

  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[loft] OrientClosedSolid failed:", e);
  }
  return fixed;
}
