/** Fillet and chamfer edge operations. */
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Vertex,
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
  Add_3?: (...args: any[]) => void;
  Add_4?: (...args: any[]) => void;
  AddDA?: (...args: any[]) => void;
  Build: (pr: import("opencascade.js").Message_ProgressRange) => void;
  Shape: () => TopoDS_Shape;
  NbFaultyContours?: () => number;
  FaultyContour?: (i: number) => number;
  StripeStatus?: (ic: number) => ChFiDS_ErrorStatus;
  NbFaultyVertices?: () => number;
  HasErrors?: () => boolean;
  HasWarnings?: () => boolean;
  Contour?: (edge: TopoDS_Edge) => number;
  FirstVertex?: (ic: number) => TopoDS_Vertex;
  LastVertex?: (ic: number) => TopoDS_Vertex;
  SetRadius_6?: (radius: number, ic: number, v: TopoDS_Vertex) => void;
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
  addEdge?: (
    builder: EdgeOpBuilder,
    value: number,
    edge: TopoDS_Edge,
    index: number,
    prepared: TopoDS_Shape,
  ) => void,
): TopoDS_Shape {
  const prepared = skipFix ? shape : fixShape(oc, shape);
  const edgeMap = mapEdgesIndexed(oc, prepared);
  try {
    const builder = makeBuilder(prepared);
    let added = 0;
    edgeIndices.forEach((idx, k) => {
      if (idx < 1 || idx > edgeMap.size) {
        throw new Error(
          `${opName}: edge index ${idx} is out of range (1-${edgeMap.size})`,
        );
      }
      const v = values && values[k] !== undefined ? values[k]! : value;
      const edge = edgeMap.edgeAt(idx);
      if (addEdge) addEdge(builder, v, edge, k, prepared);
      else builder.Add_2(v, edge);
      added++;
    });
    if (!added) throw new Error(`${opName}: no edges selected`);
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
  section?: "RATIONAL" | "QUASI_ANGULAR" | "POLYNOMIAL",
  variableRadii?: Array<{ start: number; end: number }>,
  cornerRadius?: number,
): TopoDS_Shape {
  const shapes = oc.ChFi3d_FilletShape as unknown as Record<string, unknown>;
  const sectionEnum =
    section === "QUASI_ANGULAR"
      ? (shapes.ChFi3d_QuasiAngular ?? shapes.ChFi3d_Rational)
      : section === "POLYNOMIAL"
        ? (shapes.ChFi3d_Polynomial ?? shapes.ChFi3d_Rational)
        : shapes.ChFi3d_Rational;
  const laws: Array<{
    law: { delete(): void };
    handle: { delete(): void };
  }> = [];
  try {
    return runEdgeOp(
      oc,
      shape,
      edgeIndices,
      radius,
      skipFix,
      (prepared) =>
        new oc.BRepFilletAPI_MakeFillet(
          prepared,
          sectionEnum as typeof oc.ChFi3d_FilletShape,
        ),
      "Fillet",
      radii,
      variableRadii || (cornerRadius !== undefined && cornerRadius > 0)
        ? (builder, value, edge, k) => {
            const spec = variableRadii?.[k];
            if (spec) {
              const api = oc as unknown as {
                Law_Linear?: new () => {
                  Set: (
                    pdeb: number,
                    valdeb: number,
                    pfin: number,
                    valfin: number,
                  ) => void;
                  delete(): void;
                };
                Handle_Law_Linear_2?: new (law: unknown) => { delete(): void };
              };
              if (
                !api.Law_Linear ||
                !api.Handle_Law_Linear_2 ||
                !builder.Add_4
              ) {
                throw new Error(
                  "fillet: variable radius needs Law_Linear + Add_4; this OCC build lacks them",
                );
              }
              const law = new api.Law_Linear();
              law.Set(0, spec.start, 1, spec.end);
              const handle = new api.Handle_Law_Linear_2(law);
              laws.push({ law, handle });
              builder.Add_4(handle, edge);
            } else {
              builder.Add_2(value, edge);
            }
            if (
              cornerRadius !== undefined &&
              cornerRadius > 0 &&
              builder.SetRadius_6 &&
              builder.Contour &&
              builder.FirstVertex &&
              builder.LastVertex
            ) {
              const ic = builder.Contour(edge);
              builder.SetRadius_6(cornerRadius, ic, builder.FirstVertex(ic));
              builder.SetRadius_6(cornerRadius, ic, builder.LastVertex(ic));
            }
          }
        : undefined,
    );
  } finally {
    for (const { handle, law } of laws.reverse()) {
      handle.delete();
      law.delete();
    }
  }
}

export function chamferEdgesHelper(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  edgeIndices: number[],
  distance: number,
  skipFix: boolean = false,
  distances?: number[],
  mode?: "DIST_DISTS" | "DIST_ANG" | "ANG_DISTS" | "SYM_DISTS",
  angleDeg?: number,
): TopoDS_Shape {
  const angleMode = mode === "DIST_ANG" || mode === "ANG_DISTS";
  return runEdgeOp(
    oc,
    shape,
    edgeIndices,
    distance,
    skipFix,
    (prepared) => new oc.BRepFilletAPI_MakeChamfer(prepared),
    "Chamfer",
    distances,
    angleMode
      ? (builder, value, edge, _k, prepared) => {
          if (!builder.AddDA) {
            throw new Error(
              "chamfer: distance-angle needs AddDA; this OCC build lacks it",
            );
          }
          const map = new oc.TopTools_IndexedDataMapOfShapeListOfShape_1();
          try {
            oc.TopExp.MapShapesAndAncestors(
              prepared,
              oc.TopAbs_ShapeEnum.TopAbs_EDGE as typeof oc.TopAbs_ShapeEnum,
              oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
              map,
            );
            const idx = map.FindIndex(edge);
            if (idx <= 0) {
              throw new Error(
                "chamfer: no adjacent face found for a distance-angle edge",
              );
            }
            const face = map.FindFromIndex(idx).First_1() as TopoDS_Face;
            if (!face) {
              throw new Error(
                "chamfer: adjacent face list is empty for a distance-angle edge",
              );
            }
            const angle = ((angleDeg ?? 45) * Math.PI) / 180;
            builder.AddDA(value, angle, edge, face);
          } finally {
            map.delete();
          }
        }
      : undefined,
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
