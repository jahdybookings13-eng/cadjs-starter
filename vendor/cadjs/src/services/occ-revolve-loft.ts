/** Revolve (axisymmetric solid) and loft (thru-sections). */
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Wire,
} from "opencascade.js";
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

/** Cross of two section-plane directions, used as the twist/seam axis. */
function wireFrame(
  oc: OpenCascadeInstance,
  wire: TopoDS_Wire,
): {
  centroid: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  first: { x: number; y: number; z: number } | null;
} {
  const points: { x: number; y: number; z: number }[] = [];
  for (const sub of iterSubShapes(
    oc,
    wire,
    oc.TopAbs_ShapeEnum.TopAbs_VERTEX as typeof oc.TopAbs_ShapeEnum,
  )) {
    const vertex = oc.TopoDS.Vertex_1(sub);
    const p = oc.BRep_Tool.Pnt(vertex);
    points.push({ x: p.X(), y: p.Y(), z: p.Z() });
  }
  const n = points.length;
  const centroid =
    n > 0
      ? points.reduce(
          (a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }),
          { x: 0, y: 0, z: 0 },
        )
      : { x: 0, y: 0, z: 0 };
  let normal = { x: 0, y: 0, z: 1 };
  for (let i = 1; i < n - 1; i++) {
    const a = points[0]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cross = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const len = Math.hypot(cross.x, cross.y, cross.z);
    if (len > 1e-12) {
      normal = { x: cross.x / len, y: cross.y / len, z: cross.z / len };
      break;
    }
  }
  return { centroid, normal, first: points[0] ?? null };
}

function rotateWire(
  oc: OpenCascadeInstance,
  wire: TopoDS_Wire,
  angle: number,
): TopoDS_Wire {
  if (!(Math.abs(angle) > 1e-12)) return wire;
  const frame = wireFrame(oc, wire);
  const origin = makePoint(
    oc,
    frame.centroid.x,
    frame.centroid.y,
    frame.centroid.z,
  );
  const direction = makeDir(oc, frame.normal.x, frame.normal.y, frame.normal.z);
  const axis = makeAxis1(oc, origin, direction);
  const trsf = new oc.gp_Trsf_1();
  trsf.SetRotation_1(axis, angle);
  const transformed = new oc.BRepBuilderAPI_Transform_2(wire, trsf, true);
  try {
    return asWire(oc, transformed.Shape());
  } finally {
    transformed.delete();
    trsf.delete();
    axis.delete();
    direction.delete();
    origin.delete();
  }
}

/**
 * Loft through sections along an explicit centerline. `ThruSections` has no
 * spine input in this OCC build, so the centerline becomes the spine of a pipe
 * shell and every profile is added as a section along it.
 */
export function loftAlongCenterlineHelper(
  oc: OpenCascadeInstance,
  profileFaces: TopoDS_Shape[],
  spine: TopoDS_Wire,
): TopoDS_Shape {
  const built = withOccScope((track) => {
    const shell = track(new oc.BRepOffsetAPI_MakePipeShell(spine));
    shell.SetDiscreteMode();
    shell.SetTransitionMode(
      oc.BRepBuilderAPI_TransitionMode
        .BRepBuilderAPI_RoundCorner as typeof oc.BRepBuilderAPI_TransitionMode,
    );
    for (const face of profileFaces) {
      for (const wire of iterSubShapes(
        oc,
        face,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE as typeof oc.TopAbs_ShapeEnum,
      )) {
        shell.Add_1(asWire(oc, wire), false, true);
        break;
      }
    }
    withProgressRange(oc, (pr) => shell.Build(pr));
    if (!shell.IsDone()) {
      throw new Error(
        "loft: centerline pipe failed (centerline does not cross every section)",
      );
    }
    shell.MakeSolid();
    return shell.Shape();
  });
  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[loft-centerline] OrientClosedSolid failed:", e);
  }
  return fixed;
}

export function loftShapesHelper(
  oc: OpenCascadeInstance,
  profileFaces: TopoDS_Shape[],
  isSolid: boolean = true,
  isRuled: boolean = false,
  isClosed: boolean = false,
  options?: {
    twistRadians?: number | undefined;
    connectors?: Array<{ x: number; y: number; z: number } | undefined> | undefined;
  },
): TopoDS_Shape {
  const rotating =
    !!options?.twistRadians || !!options?.connectors?.some(Boolean);
  const built = withOccScope((track) => {
    const thruSections = track(
      new oc.BRepOffsetAPI_ThruSections(isSolid, isRuled, 1e-6),
    );
    if (rotating) thruSections.CheckCompatibility(false);

    const wires: TopoDS_Wire[] = [];
    for (const face of profileFaces) {
      for (const wire of iterSubShapes(
        oc,
        face,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE as typeof oc.TopAbs_ShapeEnum,
      )) {
        wires.push(asWire(oc, wire));
        break; // first wire only, matches prior behavior
      }
    }

    const count = wires.length;
    const sections = isClosed && count > 1 ? count : Math.max(1, count - 1);
    const rotated = wires.map((wire, index) => {
      if (!rotating) return wire;
      let angle = (options?.twistRadians ?? 0) * (index / sections);
      const connector = options?.connectors?.[index];
      if (connector) {
        const frame = wireFrame(oc, wire);
        if (frame.first) {
          const current = {
            x: frame.first.x - frame.centroid.x,
            y: frame.first.y - frame.centroid.y,
            z: frame.first.z - frame.centroid.z,
          };
          const target = {
            x: connector.x - frame.centroid.x,
            y: connector.y - frame.centroid.y,
            z: connector.z - frame.centroid.z,
          };
          const dot =
            current.x * target.x + current.y * target.y + current.z * target.z;
          const cx = current.y * target.z - current.z * target.y;
          const cy = current.z * target.x - current.x * target.z;
          const cz = current.x * target.y - current.y * target.x;
          const signed = Math.atan2(
            frame.normal.x * cx + frame.normal.y * cy + frame.normal.z * cz,
            dot,
          );
          angle += signed;
        }
      }
      return rotateWire(oc, wire, angle);
    });

    for (const wire of rotated) thruSections.AddWire(wire);

    // This OCC build does not expose ThruSections::SetClosed. Re-adding the
    // first section after the last one is the standard periodic-loft form:
    // the surface closes the loop and the duplicate caps fall on each other.
    if (isClosed && count > 1) {
      thruSections.AddWire(rotated[0]!);
    }
    withProgressRange(oc, (pr) => thruSections.Build(pr));
    throwIfNotDone(thruSections, "ThruSections");
    return thruSections.Shape();
  });

  const fixed = fixShape(oc, built);
  try {
    oc.BRepLib.OrientClosedSolid(asSolid(oc, fixed));
  } catch (e) {
    debugLog("[loft] OrientClosedSolid failed:", e);
  }
  return fixed;
}
