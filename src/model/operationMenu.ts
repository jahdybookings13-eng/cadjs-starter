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
  "multi-entity group patterns; linear client-side, circular/curve via worker",
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
  "ready",
  "thicken",
  "face slabs via normal-offset wires + ruled solid (planar exact, curved ruled-approx)",
);
const P_MOVEFACE = op(
  "move-face",
  "Move Face",
  "ready",
  "moveFace",
  "planar trim (negative) + prism boss (positive); neighbor-follow extension deferred",
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
const P_APPEARANCE = op(
  "appearance",
  "Appearance",
  "ready",
  null,
  "per-feature color/opacity stored on the feature node (tree data); re-applied after every rebuild",
);
const P_FITNESS = op(
  "feature-pattern",
  "Pattern Features",
  "ready",
  "featurePattern",
  "clones a serialized feature chain (id-remapped, plane-origin shifted), independent bodies; join-mode deferred",
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
  "ready",
  "createPlane",
  "datum plane BODY (planar quad); sketch-on-datum wired (planeRef on newSketch, orthonormalized)",
);
const P_CURVE_ON_FACE = op(
  "curve-on-face",
  "Curve on Face",
  "ready",
  "curveOnFace",
  "projects source edges along target face normal (projectCurves + heuristic normal)",
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
  "ready",
  "section",
  "BRepAlgoAPI_Section plane cut: section wires (edges, no faces)",
);
const P_SURFACE = op(
  "ruled-fill-surface",
  "Ruled / Fill / Offset Surface",
  "ready",
  "surface",
  "ThruSections-ruled, MakeFilling patches, planar normal-offset refill",
);
const P_WRAP = op(
  "wrap",
  "Wrap",
  "ready",
  "wrap",
  "curve mode v1: unfolded (arc,height) polylines mapped onto the target cylinder as on-surface wires; cut/emboss modes follow the helix rebuild",
);
const P_THREAD = op(
  "thread",
  "Thread",
  "ready",
  "thread",
  "ISO metric/unified/NPT tables + groove cut (torus-stack v1; true helix boolean parked for native-speed wasm rebuild)",
);
const P_SHEET = op(
  "sheet-metal",
  "Flange",
  "ready",
  "flange",
  "sheet-metal v1: flange + radius + relief + two-stage Z-hem + flat pattern (unfold)",
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
  "Scale",
  "ready",
  "scale",
  "uniform/local-origin vertex scale (expression factor), position-stable",
);
const P_COMPOSITE = op(
  "delete-bodies",
  "Delete Bodies",
  "ready",
  "deleteBodies",
  "body-set filter: removes selected owners (fid or fid#k) from output",
);

const P_PRIM_BOX = op(
  "primitive-box",
  "Box",
  "ready",
  "primitive.box",
  "sketch+extrude via library",
);
const P_PRISM_PRISM = op(
  "primitive-prism",
  "Prism",
  "ready",
  "primitive.prism",
  "polygon extrude via library",
);
const P_PRISM_PYRAMID = op(
  "primitive-pyramid",
  "Pyramid",
  "ready",
  "primitive.pyramid",
  "loft via library",
);
const P_PRISM_WEDGE = op(
  "primitive-wedge",
  "Wedge",
  "ready",
  "primitive.wedge",
  "tri-slab extrude via library",
);
const P_PRISM_CYL = op(
  "primitive-cylinder",
  "Cylinder",
  "ready",
  "primitive.cylinder",
  "revolve via library",
);
const P_PRISM_CONE = op(
  "primitive-cone",
  "Cone",
  "ready",
  "primitive.cone",
  "revolve via library",
);
const P_PRISM_TORUS = op(
  "primitive-torus",
  "Torus",
  "ready",
  "primitive.torus",
  "revolve via library",
);
const P_PRISM_PIPE = op(
  "primitive-pipe",
  "Pipe",
  "ready",
  "primitive.pipe",
  "sweep via library",
);

export const MENU_BY_SELECTION: Record<SelectionKind, MenuOp[]> = {
  empty: [
    READY_SKETCH,
    READY_INSERT,
    READY_VARIABLES,
    READY_MEASURE,
    P_CPLANE,
    P_PRIM_BOX,
    P_PRISM_PRISM,
    P_PRISM_PYRAMID,
    P_PRISM_WEDGE,
    P_PRISM_CYL,
    P_PRISM_CONE,
    P_PRISM_TORUS,
    P_PRISM_PIPE,
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
    P_APPEARANCE,
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
