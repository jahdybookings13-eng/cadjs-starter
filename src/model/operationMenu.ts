export type SelectionKind =
  | "empty"
  | "body"
  | "plane-face"
  | "curved-face"
  | "edge"
  | "vertex"
  | "sketch-line"
  | "sketch-arc"
  | "sketch-circle"
  | "sketch-point";

export type OpStatus = "ready" | "kernel-unwired" | "planned" | "deferred";

export interface MenuOp {
  id: string;
  label: string;
  status: OpStatus;
  featureType: string | null;
  note?: string;
}

const op = (
  id: string,
  label: string,
  status: OpStatus,
  featureType: string | null,
  note?: string,
): MenuOp => ({ id, label, status, featureType, ...(note ? { note } : {}) });

const READY_EXTRUDE = op("extrude", "Extrude", "ready", "extrude");
const READY_REVOLVE = op("revolve", "Revolve", "ready", "revolve");
const READY_LOFT = op("loft", "Loft", "ready", "loft");
const READY_SWEEP = op("sweep", "Sweep", "ready", "sweep");
const READY_FILLET = op("fillet", "Fillet", "ready", "fillet");
const READY_MODIFY_FILLET = op(
  "modify-fillet",
  "Modify Fillet",
  "ready",
  "fillet",
  "history edit: radius/edge re-spec on existing fillet feature; rebuild-per-edit",
);
const READY_CHAMFER = op("chamfer", "Chamfer", "ready", "chamfer");
const READY_BOOLEAN = op("boolean", "Boolean", "ready", "boolean");
const READY_PATTERN = op(
  "linear-pattern",
  "Linear Pattern",
  "ready",
  "pattern",
  "client-side translate + fuse; circular/curve route to worker",
);
const READY_MIRROR = op("mirror", "Mirror", "ready", "mirror");
const READY_SKETCH = op("new-sketch", "Sketch", "ready", "newSketch");
const READY_INSERT = op(
  "insert",
  "Insert Part (STL/STEP)",
  "ready",
  "insertedBody",
);
const READY_MEASURE = op(
  "measure",
  "Measure",
  "ready",
  null,
  "edge length/direction via kernel worker; polyline stats pure",
);
const P_HOLE = op(
  "hole",
  "Hole",
  "ready",
  "hole",
  "drill cylinders + cut in worker; profile enums (countersink) pending",
);
const P_DRAFT = op(
  "draft",
  "Draft",
  "ready",
  "draft",
  "DraftAngle in worker; neutral-face heuristic for convex bodies",
);
const P_SHELL = op(
  "shell",
  "Shell",
  "ready",
  "shell",
  "opShell via wire-offset prism recipe (planar caps); MakeThickSolid verified bound but hangs/slow in wasm — curved caps deferred",
);
const P_THICKEN = op(
  "thicken",
  "Thicken",
  "planned",
  null,
  "tier 1: opThicken",
);
const P_MOVEFACE = op(
  "move-face",
  "Move Face",
  "planned",
  null,
  "tier 3: opMoveFace — the direct-edit flagship",
);
const P_DELETEFACE = op(
  "delete-face",
  "Delete Face",
  "ready",
  "deleteFace",
  "delete + sewn refill heal (planar or MakeFilling cap); adjacent-merge heal deferred",
);
const P_SPLIT = op(
  "split",
  "Split",
  "ready",
  "split",
  "plane split via BRepAlgoAPI_Splitter; keep param selects side — split twice for both halves",
);
const P_CIRC_PATTERN = op(
  "circular-pattern",
  "Circular Pattern",
  "ready",
  "pattern",
  "patternType=circular routed to worker fuse",
);
const P_CURVE_PATTERN = op(
  "curve-pattern",
  "Curve Pattern",
  "ready",
  "pattern",
  "patternType=curve: equal-arc path sampling, optional tangent align",
);
const P_FITNESS = op(
  "feature-pattern",
  "Pattern Features",
  "planned",
  null,
  "applyPattern w/ feature list",
);
const P_DIM = op(
  "dimension",
  "Dimension",
  "ready",
  "constraint",
  "planegcs solver feature: constraint node re-solves sketch snapshot",
);
const P_RELATION = op(
  "constraint",
  "Constrain",
  "ready",
  "constraint",
  "geometric constraint via same constraint feature",
);
const P_TRIM = op(
  "trim-extend",
  "Trim / Extend",
  "ready",
  null,
  "pure snapshot trim/extend (sketch-edit layer)",
);
const P_CPLANE = op(
  "create-plane",
  "Plane",
  "deferred",
  null,
  "datums-as-features tier 6",
);
const P_CURVE_ON_FACE = op(
  "curve-on-face",
  "Curve on Face",
  "planned",
  null,
  "tier 4: opCreateCurvesOnFace",
);
const P_PROJECT_CURVE = op(
  "project-curves",
  "Project Curves",
  "ready",
  "projectCurves",
  "BRepProj linear projection of source edges onto target body along a direction",
);
const P_SECTION = op(
  "section",
  "Section",
  "planned",
  null,
  "requires split/section curves tier 3+",
);
const P_SURFACE = op(
  "ruled-fill-surface",
  "Ruled / Fill / Offset Surface",
  "ready",
  "surface",
  "ThruSections-ruled, MakeFilling patches, planar normal-offset refill",
);
const P_WRAP = op("wrap", "Wrap", "deferred", null, "tier 6");
const P_THREAD = op(
  "thread",
  "Thread",
  "deferred",
  null,
  "tier 6: externalThread",
);
const P_SHEET = op(
  "sheet-metal",
  "Sheet Metal",
  "deferred",
  null,
  "tier 7 backlog",
);
const P_DERIVED = op(
  "derived",
  "Derived",
  "deferred",
  null,
  "tier 6: importDerived/mergeContexts",
);
const READY_VARIABLES = op(
  "variables",
  "Variables…",
  "ready",
  "variable",
  "panel = variablesForFeature(query), P6c",
);
const READY_TRANSFORM_SCALE = op(
  "scale",
  "Scale (relative)",
  "planned",
  null,
  "bridge #4: expression write, not baked matrix",
);
const P_COMPOSITE = op(
  "delete-bodies",
  "Delete Bodies",
  "kernel-unwired",
  null,
  "opDeleteBodies trivial; UI delete exists in cadjs",
);

export const MENU_BY_SELECTION: Record<SelectionKind, MenuOp[]> = {
  empty: [
    READY_SKETCH,
    READY_INSERT,
    READY_VARIABLES,
    READY_MEASURE,
    P_CPLANE,
    P_DERIVED,
  ],
  body: [
    READY_BOOLEAN,
    READY_MIRROR,
    READY_PATTERN,
    P_CIRC_PATTERN,
    P_CURVE_PATTERN,
    P_SHELL,
    P_HOLE,
    P_DRAFT,
    P_SPLIT,
    READY_TRANSFORM_SCALE,
    P_COMPOSITE,
    P_THREAD,
    P_SHEET,
    P_WRAP,
  ],
  "plane-face": [
    READY_SKETCH,
    READY_EXTRUDE,
    READY_REVOLVE,
    P_MOVEFACE,
    P_DELETEFACE,
    P_SECTION,
    P_CPLANE,
    P_CURVE_ON_FACE,
    P_SURFACE,
    READY_MEASURE,
  ],
  "curved-face": [
    READY_MODIFY_FILLET,
    P_HOLE,
    P_DRAFT,
    P_THICKEN,
    P_MOVEFACE,
    P_CURVE_ON_FACE,
    P_PROJECT_CURVE,
    P_SURFACE,
    READY_MEASURE,
  ],
  edge: [
    READY_FILLET,
    READY_MODIFY_FILLET,
    READY_CHAMFER,
    P_MOVEFACE,
    P_SPLIT,
    READY_MEASURE,
    READY_VARIABLES,
  ],
  vertex: [READY_MEASURE, P_CPLANE],
  "sketch-line": [
    READY_EXTRUDE,
    READY_REVOLVE,
    READY_LOFT,
    READY_SWEEP,
    P_DIM,
    P_RELATION,
    P_TRIM,
    P_FITNESS,
  ],
  "sketch-arc": [
    READY_EXTRUDE,
    READY_REVOLVE,
    READY_LOFT,
    READY_SWEEP,
    P_DIM,
    P_RELATION,
    P_TRIM,
  ],
  "sketch-circle": [
    READY_EXTRUDE,
    READY_REVOLVE,
    READY_LOFT,
    READY_SWEEP,
    P_DIM,
    P_RELATION,
  ],
  "sketch-point": [P_DIM, P_RELATION, P_CPLANE],
};

export function allowedOperations(kind: SelectionKind): MenuOp[] {
  return MENU_BY_SELECTION[kind].filter((m) => m.status === "ready");
}

export function menuFor(
  kind: SelectionKind,
  includeUnavailable = false,
): MenuOp[] {
  return includeUnavailable
    ? MENU_BY_SELECTION[kind]
    : MENU_BY_SELECTION[kind].filter((m) => m.status !== "deferred");
}
