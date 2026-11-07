/** Fillet and chamfer edge operations. */
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Edge,
  ChFiDS_ErrorStatus,
} from "opencascade.js";
import { fixAndOrient } from "./occ-shape-conversion";
import {
  collectBuilderDiagnostics,
  fixShape,
  mapEdgesIndexed,
  withProgressRange,
} from "./occ-facade";

/**
 * Common machinery for fillet/chamfer: optional shape-fix, edge map lookup,
 * per-edge `Add_2(value, edge)`, build, diagnose. Caller supplies the builder
 * factory, the per-edge value parameter, and the operation name.
 */
type EdgeOpBuilder = {
  IsDone: () => boolean;
  Add_2: (value: number, edge: TopoDS_Edge) => void;
  Build: (pr: import("opencascade.js").Message_ProgressRange) => void;
  Shape: () => TopoDS_Shape;
  NbFaultyContours?: () => number;
  FaultyContour?: (i: number) => number;
  StripeStatus?: (ic: number) => ChFiDS_ErrorStatus;
  NbFaultyVertices?: () => number;
  HasErrors?: () => boolean;
  HasWarnings?: () => boolean;
};

function runEdgeOp(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndices: number[],
  value: number,
  skipFix: boolean,
  makeBuilder: (preparedShape: TopoDS_Shape) => EdgeOpBuilder,
  opName: string,
  values?: number[],
): TopoDS_Shape {
  const prepared = skipFix ? shape : fixShape(oc, shape);
  const edgeMap = mapEdgesIndexed(oc, prepared);
  try {
    const builder = makeBuilder(prepared);
    edgeIndices.forEach((idx, k) => {
      if (idx >= 1 && idx <= edgeMap.size) {
        const v = values && values[k] !== undefined ? values[k]! : value;
        builder.Add_2(v, edgeMap.edgeAt(idx));
      }
    });
    withProgressRange(oc, (pr) => builder.Build(pr));
    if (!builder.IsDone()) {
      throw new Error(collectChFiDiagnostics(oc, builder, opName));
    }
    return fixAndOrient(oc, builder.Shape());
  } finally {
    edgeMap.delete();
  }
}

export function filletEdgesHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndices: number[],
  radius: number,
  skipFix: boolean = false,
  radii?: number[],
): TopoDS_Shape {
  return runEdgeOp(
    oc,
    shape,
    edgeIndices,
    radius,
    skipFix,
    (prepared) =>
      new oc.BRepFilletAPI_MakeFillet(
        prepared,
        oc.ChFi3d_FilletShape.ChFi3d_Rational as typeof oc.ChFi3d_FilletShape,
      ),
    "Fillet",
    radii,
  );
}

export function chamferEdgesHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndices: number[],
  distance: number,
  skipFix: boolean = false,
  distances?: number[],
): TopoDS_Shape {
  return runEdgeOp(
    oc,
    shape,
    edgeIndices,
    distance,
    skipFix,
    (prepared) => new oc.BRepFilletAPI_MakeChamfer(prepared),
    "Chamfer",
    distances,
  );
}

function chFiStatusToString(
  oc: OpenCascadeInstance,
  status: ChFiDS_ErrorStatus,
): string {
  if (status === oc.ChFiDS_ErrorStatus.ChFiDS_WalkingFailure)
    return "radius too large for edge geometry";
  if (status === oc.ChFiDS_ErrorStatus.ChFiDS_StartsolFailure)
    return "cannot compute fillet at this edge";
  if (status === oc.ChFiDS_ErrorStatus.ChFiDS_TwistedSurface)
    return "fillet surface would self-intersect";
  if (status === oc.ChFiDS_ErrorStatus.ChFiDS_Error) return "computation error";
  return "unknown status";
}

/**
 * Shared diagnostics helper for the ChFiDS edge-op builders (fillet and
 * chamfer). Builds on `collectBuilderDiagnostics` from occ-facade.ts.
 */
function collectChFiDiagnostics(
  oc: OpenCascadeInstance,
  builder: EdgeOpBuilder,
  opName: string,
): string {
  const detail = collectBuilderDiagnostics(builder, () => {
    const parts: string[] = [];
    if (
      builder.NbFaultyContours &&
      builder.FaultyContour &&
      builder.StripeStatus
    ) {
      const nFaulty = builder.NbFaultyContours();
      for (let i = 1; i <= nFaulty; i++) {
        try {
          const ic = builder.FaultyContour(i);
          const status = builder.StripeStatus(ic);
          parts.push(chFiStatusToString(oc, status));
        } catch {
          /* best effort */
        }
      }
    }
    if (builder.NbFaultyVertices) {
      try {
        const nVerts = builder.NbFaultyVertices();
        if (nVerts > 0) parts.push(`${nVerts} faulty vertex(es)`);
      } catch {
        /* best effort */
      }
    }
    return parts;
  });
  return `${opName}: ${detail}`;
}
