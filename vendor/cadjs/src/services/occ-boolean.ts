/** Boolean union/difference/intersection over solid shapes. */
import type {
  OpenCascadeInstance,
  TopoDS_Shape,
  BRepAlgoAPI_BooleanOperation,
} from "opencascade.js";
import { fixAndOrient } from "./occ-shape-conversion";
import {
  collectBuilderDiagnostics,
  fixShape,
  withOcc,
  withProgressRange,
} from "./occ-facade";
import { BOOLEAN_FUZZ } from "../tolerances";

type BooleanBuilder = BRepAlgoAPI_BooleanOperation & {
  HasErrors?: () => boolean;
  HasWarnings?: () => boolean;
};

/**
 * Run a `BRepAlgoAPI_BooleanOperation` (Fuse/Cut/Common) with the standard
 * fuzzy/non-destructive/glue/check settings used by every call site, and
 * fix-orient the result. Throws with diagnostic detail on failure.
 */
function runBooleanOp(
  oc: OpenCascadeInstance,
  op: BooleanBuilder,
  args: TopoDS_Shape,
  tools: TopoDS_Shape,
  opName: string,
): TopoDS_Shape {
  op.SetFuzzyValue(BOOLEAN_FUZZ);
  op.SetNonDestructive(true);
  op.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueOff as typeof oc.BOPAlgo_GlueEnum);
  op.SetCheckInverted(true);

  return withOcc(
    () => new oc.TopTools_ListOfShape_1(),
    (argsList) =>
      withOcc(
        () => new oc.TopTools_ListOfShape_1(),
        (toolsList) => {
          argsList.Append_1(args);
          op.SetArguments(argsList);
          toolsList.Append_1(tools);
          op.SetTools(toolsList);

          withProgressRange(oc, (pr) => op.Build(pr));
          if (!op.IsDone()) {
            throw new Error(
              `${opName} failed: ${collectBuilderDiagnostics(op)}`,
            );
          }
          return fixAndOrient(oc, op.Shape());
        },
      ),
  );
}

export function booleanUnionHelper(
  oc: OpenCascadeInstance,
  shape1: TopoDS_Shape,
  shape2: TopoDS_Shape,
): TopoDS_Shape {
  return withOcc(
    () => new oc.BRepAlgoAPI_Fuse_1(),
    (op) =>
      runBooleanOp(
        oc,
        op,
        fixShape(oc, shape1),
        fixShape(oc, shape2),
        "Boolean union",
      ),
  );
}

export function booleanDifferenceHelper(
  oc: OpenCascadeInstance,
  baseShape: TopoDS_Shape,
  toolShape: TopoDS_Shape,
): TopoDS_Shape {
  return withOcc(
    () => new oc.BRepAlgoAPI_Cut_1(),
    (op) =>
      runBooleanOp(
        oc,
        op,
        fixShape(oc, baseShape),
        fixShape(oc, toolShape),
        "Boolean difference",
      ),
  );
}

export function booleanIntersectionHelper(
  oc: OpenCascadeInstance,
  shape1: TopoDS_Shape,
  shape2: TopoDS_Shape,
): TopoDS_Shape {
  return withOcc(
    () => new oc.BRepAlgoAPI_Common_1(),
    (op) =>
      runBooleanOp(
        oc,
        op,
        fixShape(oc, shape1),
        fixShape(oc, shape2),
        "Boolean intersection",
      ),
  );
}
