import type { ConstraintType } from "@vitekk02/cadjs";
import type { SketchSubMode } from "@vitekk02/cadjs/react";

/**
 * The 2D sketch control map. One entry per behaviour the sketch editor can
 * actually perform. The toolbar, the command palette and the help sheet all
 * read from here, so a control cannot drift between them.
 *
 * `keys` are the keys the CAD engine already handles. This module does not
 * register a second key listener for tools; it documents and discovers the
 * real bindings. `autocad` aliases are accepted by the palette; they are not
 * direct single-key shortcuts when they would collide with an app binding.
 */
export const SKETCH_GROUPS = [
  { id: "draw", label: "Draw" },
  { id: "modify", label: "Modify" },
  { id: "constraints", label: "Constraints" },
  { id: "selection", label: "Selection" },
  { id: "sketch", label: "Sketch" },
  { id: "interface", label: "Interface" },
] as const;

export type SketchCommandGroup = (typeof SKETCH_GROUPS)[number]["id"];

export type SketchCommandAction =
  | { type: "tool"; mode: SketchSubMode }
  | { type: "mirror" }
  | { type: "corner"; operation: "fillet" | "chamfer" }
  | { type: "offset" }
  | { type: "join" }
  | {
      type: "transform";
      mode: "move" | "copy" | "rotate" | "scale";
    }
  | { type: "pattern" }
  | { type: "patternCircular" }
  | { type: "patternPath" }
  | { type: "text" }
  | { type: "import-dxf" }
  | { type: "toggle-construction" }
  | { type: "toggle-fix" }
  | { type: "constraint"; constraint: ConstraintType; needsValue: boolean }
  | { type: "delete" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "solve" }
  | { type: "finish" }
  | { type: "cancel" }
  | { type: "grid-snap" }
  | { type: "command-palette" }
  | { type: "controls-help" };

export interface SketchCommand {
  /** Stable id for voice, tests and future ActionBus registration. */
  id: string;
  label: string;
  group: SketchCommandGroup;
  description: string;
  /** Keys the engine already handles, for display and discovery. */
  keys: readonly string[];
  /** AutoCAD command names/aliases accepted in the palette. */
  autocad: readonly string[];
  /** cadjs-facing names. The first is shown in the palette. */
  cadjs: readonly string[];
  action: SketchCommandAction;
  requires?: "selection" | "point-selection" | "two-lines";
  /** Interface commands that would be circular inside the palette. */
  hiddenInPalette?: boolean;
}

export const SKETCH_COMMANDS: readonly SketchCommand[] = [
  {
    id: "sketch.select",
    label: "Select",
    group: "selection",
    description: "Pick sketch geometry; drag a window to select several.",
    keys: ["S"],
    autocad: ["SELECT"],
    cadjs: ["sketch.select"],
    action: { type: "tool", mode: "select" },
  },
  {
    id: "sketch.line",
    label: "Line",
    group: "draw",
    description: "Draw connected line segments; Enter or Esc ends the chain.",
    keys: ["L"],
    autocad: ["LINE"],
    cadjs: ["sketch.line"],
    action: { type: "tool", mode: "line" },
  },
  {
    id: "sketch.midpointLine",
    label: "Midpoint line",
    group: "draw",
    description:
      "Start a line at the true midpoint of an existing line, then pick its other endpoint.",
    keys: [],
    autocad: ["MIDLINE", "ML"],
    cadjs: ["sketch.midpointLine"],
    action: { type: "tool", mode: "midpointLine" },
  },
  {
    id: "sketch.rectangle",
    label: "Rectangle",
    group: "draw",
    description: "Draw a rectangle from two opposite corners.",
    keys: ["R"],
    autocad: ["REC", "RECTANG"],
    cadjs: ["sketch.rectangle"],
    action: { type: "tool", mode: "rectangle" },
  },
  {
    id: "sketch.centerRectangle",
    label: "Center rectangle",
    group: "draw",
    description:
      "Draw a rectangle from its centre and one corner; the centre is constrained to both diagonals' midpoints.",
    keys: [],
    autocad: ["CRECT", "CENTEREC"],
    cadjs: ["sketch.centerRectangle"],
    action: { type: "tool", mode: "centerRectangle" },
  },
  {
    id: "sketch.slot",
    label: "Slot",
    group: "draw",
    description:
      "Draw a center-to-center slot from two centres and a width; the caps stay symmetric and equal.",
    keys: [],
    autocad: ["SLOT"],
    cadjs: ["sketch.slot"],
    action: { type: "tool", mode: "slot" },
  },
  {
    id: "sketch.polygon",
    label: "Polygon",
    group: "draw",
    description:
      "Draw a regular polygon from a centre, a vertex and the selected side count.",
    keys: [],
    autocad: ["POLYGON", "POL"],
    cadjs: ["sketch.polygon"],
    action: { type: "tool", mode: "polygon" },
  },
  {
    id: "sketch.circle",
    label: "Circle",
    group: "draw",
    description: "Draw a circle from centre and radius.",
    keys: ["C"],
    autocad: ["CIRCLE"],
    cadjs: ["sketch.circle"],
    action: { type: "tool", mode: "circle" },
  },
  {
    id: "sketch.circle3p",
    label: "Circle (3-point)",
    group: "draw",
    description:
      "Draw a circle through three picked points; all three stay constrained to the circle.",
    keys: [],
    autocad: ["CIRCLE3P", "3P"],
    cadjs: ["sketch.circle3p"],
    action: { type: "tool", mode: "circle3p" },
  },
  {
    id: "sketch.ellipse",
    label: "Ellipse",
    group: "draw",
    description:
      "Draw an ellipse from its centre, a major-axis point, and a minor radius.",
    keys: [],
    autocad: ["ELLIPSE", "EL"],
    cadjs: ["sketch.ellipse"],
    action: { type: "tool", mode: "ellipse" },
  },
  {
    id: "sketch.ellipticalArc",
    label: "Elliptical arc",
    group: "draw",
    description:
      "Draw an elliptical arc from its centre, major and minor picks, and two endpoints.",
    keys: [],
    autocad: ["ELLIPTICALARC", "EAR"],
    cadjs: ["sketch.ellipticalArc"],
    action: { type: "tool", mode: "ellipticalArc" },
  },
  {
    id: "sketch.spline",
    label: "Spline",
    group: "draw",
    description:
      "Draw an interpolated spline through picked points; double-click the last point to finish.",
    keys: [],
    autocad: ["SPLINE", "SPL"],
    cadjs: ["sketch.spline"],
    action: { type: "tool", mode: "spline" },
  },
  {
    id: "sketch.bezier",
    label: "Bezier",
    group: "draw",
    description: "Draw a cubic Bezier from four control points.",
    keys: [],
    autocad: ["BEZIER", "BZ"],
    cadjs: ["sketch.bezier"],
    action: { type: "tool", mode: "bezier" },
  },
  {
    id: "sketch.conic",
    label: "Conic",
    group: "draw",
    description:
      "Draw a rational quadratic conic from start, end and control points; set rho in the toolbar.",
    keys: [],
    autocad: ["CONIC", "CO"],
    cadjs: ["sketch.conic"],
    action: { type: "tool", mode: "conic" },
  },
  {
    id: "sketch.arc",
    label: "Arc",
    group: "draw",
    description: "Draw a three-point arc.",
    keys: ["A"],
    autocad: ["ARC"],
    cadjs: ["sketch.arc"],
    action: { type: "tool", mode: "arc" },
  },
  {
    id: "sketch.point",
    label: "Point",
    group: "draw",
    description: "Place a sketch point.",
    keys: ["P"],
    autocad: ["PO", "POINT"],
    cadjs: ["sketch.point"],
    action: { type: "tool", mode: "point" },
  },
  {
    id: "sketch.dimension",
    label: "Dimension",
    group: "draw",
    description: "Select geometry to add or edit a driving dimension.",
    keys: ["D"],
    autocad: ["DIM"],
    cadjs: ["sketch.dimension"],
    action: { type: "tool", mode: "dimension" },
  },
  {
    id: "sketch.trim",
    label: "Trim",
    group: "modify",
    description: "Cut a segment back to its intersection with another.",
    keys: ["T"],
    autocad: ["TR", "TRIM"],
    cadjs: ["sketch.trim"],
    action: { type: "tool", mode: "trim" },
  },
  {
    id: "sketch.extend",
    label: "Extend",
    group: "modify",
    description: "Extend a segment to its next intersection.",
    keys: ["E"],
    autocad: ["EX", "EXTEND"],
    cadjs: ["sketch.extend"],
    action: { type: "tool", mode: "extend" },
  },
  {
    id: "sketch.mirror",
    label: "Mirror",
    group: "modify",
    description:
      "Mirror selected geometry about one selected line. The axis line is not mirrored.",
    keys: [],
    autocad: ["MI"],
    cadjs: ["sketch.mirror"],
    action: { type: "mirror" },
    requires: "selection",
  },
  {
    id: "sketch.fillet",
    label: "Fillet",
    group: "modify",
    description:
      "Trim a selected line/line, line/arc or arc/arc corner and insert a tangent fillet arc.",
    keys: [],
    autocad: ["FILLET", "F"],
    cadjs: ["sketch.fillet"],
    action: { type: "corner", operation: "fillet" },
    requires: "selection",
  },
  {
    id: "sketch.chamfer",
    label: "Chamfer",
    group: "modify",
    description:
      "Trim two selected lines and insert a straight chamfer at their corner.",
    keys: [],
    autocad: ["CHAMFER", "CHA"],
    cadjs: ["sketch.chamfer"],
    action: { type: "corner", operation: "chamfer" },
    requires: "two-lines",
  },
  {
    id: "sketch.offset",
    label: "Offset",
    group: "modify",
    description: "Create an offset copy of a selected line, circle or arc.",
    keys: [],
    autocad: ["OFFSET", "O"],
    cadjs: ["sketch.offset"],
    action: { type: "offset" },
    requires: "selection",
  },
  {
    id: "sketch.join",
    label: "Join",
    group: "modify",
    description: "Join two selected collinear lines that share an endpoint.",
    keys: [],
    autocad: ["JOIN", "J"],
    cadjs: ["sketch.join"],
    action: { type: "join" },
    requires: "two-lines",
  },
  {
    id: "sketch.split",
    label: "Split",
    group: "modify",
    description:
      "Split a line, arc, circle, ellipse arc, spline, Bezier or conic at a clicked point into two real primitives.",
    keys: [],
    autocad: ["SPLIT", "SP"],
    cadjs: ["sketch.split"],
    action: { type: "tool", mode: "split" },
  },
  {
    id: "sketch.move",
    label: "Move",
    group: "modify",
    description: "Move selected sketch geometry by an X/Y vector.",
    keys: [],
    autocad: ["MOVE", "M"],
    cadjs: ["sketch.move"],
    action: { type: "transform", mode: "move" },
    requires: "selection",
  },
  {
    id: "sketch.copy",
    label: "Copy",
    group: "modify",
    description: "Copy selected sketch geometry at an X/Y offset.",
    keys: [],
    autocad: ["COPY", "CP"],
    cadjs: ["sketch.copy"],
    action: { type: "transform", mode: "copy" },
    requires: "selection",
  },
  {
    id: "sketch.rotate",
    label: "Rotate",
    group: "modify",
    description:
      "Rotate selected geometry around a selected point or the selection centre.",
    keys: [],
    autocad: ["ROTATE", "RO"],
    cadjs: ["sketch.rotate"],
    action: { type: "transform", mode: "rotate" },
    requires: "selection",
  },
  {
    id: "sketch.scale",
    label: "Scale",
    group: "modify",
    description:
      "Scale selected geometry around a selected point or the selection centre.",
    keys: [],
    autocad: ["SCALE", "SC"],
    cadjs: ["sketch.scale"],
    action: { type: "transform", mode: "scale" },
    requires: "selection",
  },
  {
    id: "sketch.patternLinear",
    label: "Linear pattern",
    group: "modify",
    description:
      "Copy selected geometry in a linear pattern with a count and X/Y spacing.",
    keys: [],
    autocad: ["PATTERN", "AR"],
    cadjs: ["sketch.patternLinear"],
    action: { type: "pattern" },
    requires: "selection",
  },
  {
    id: "sketch.patternPath",
    label: "Path pattern",
    group: "modify",
    description:
      "Copy selected geometry along a selected line, arc, circle, ellipse, spline, Bezier or conic path.",
    keys: [],
    autocad: ["PATHPATTERN"],
    cadjs: ["sketch.patternPath"],
    action: { type: "patternPath" },
    requires: "selection",
  },
  {
    id: "sketch.patternCircular",
    label: "Circular pattern",
    group: "modify",
    description:
      "Copy selected geometry around a selected point or the selection centre.",
    keys: [],
    autocad: ["PATTERNCIRCULAR", "CIRCULAR"],
    cadjs: ["sketch.patternCircular"],
    action: { type: "patternCircular" },
    requires: "selection",
  },
  {
    id: "sketch.text",
    label: "Text",
    group: "draw",
    description:
      "Insert single-stroke text as editable sketch lines. Select a point first to place it there.",
    keys: [],
    autocad: ["TEXT", "T", "MTEXT"],
    cadjs: ["sketch.text"],
    action: { type: "text" },
  },
  {
    id: "sketch.importDxf",
    label: "Import DXF",
    group: "draw",
    description:
      "Import LINE, CIRCLE, ARC, LWPOLYLINE, ELLIPSE and POINT entities from an ASCII DXF into the sketch.",
    keys: [],
    autocad: ["DXFIN", "IMPORT"],
    cadjs: ["sketch.importDxf"],
    action: { type: "import-dxf" },
  },
  {
    id: "sketch.construction",
    label: "Construction",
    group: "modify",
    description:
      "Toggle selected geometry between normal and construction. The app uses X; AutoCAD X is EXPLODE.",
    keys: ["X"],
    autocad: [],
    cadjs: ["sketch.construction"],
    action: { type: "toggle-construction" },
    requires: "selection",
  },
  {
    id: "sketch.fix",
    label: "Fix point",
    group: "modify",
    description:
      "Fix or unfix the selected point so the solver cannot move it.",
    keys: [],
    autocad: ["FIX"],
    cadjs: ["sketch.fix"],
    action: { type: "toggle-fix" },
    requires: "point-selection",
  },
  {
    id: "sketch.delete",
    label: "Delete",
    group: "modify",
    description: "Delete the selected primitives or selected constraint.",
    keys: ["Delete", "Backspace"],
    autocad: ["ERASE", "E"],
    cadjs: ["sketch.delete"],
    action: { type: "delete" },
    requires: "selection",
  },
  {
    id: "sketch.constraint.horizontal",
    label: "Horizontal",
    group: "constraints",
    description: "Constrain selected lines to horizontal.",
    keys: [],
    autocad: ["HOR"],
    cadjs: ["sketch.constraint.horizontal"],
    action: { type: "constraint", constraint: "horizontal", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.vertical",
    label: "Vertical",
    group: "constraints",
    description: "Constrain selected lines to vertical.",
    keys: [],
    autocad: ["VER"],
    cadjs: ["sketch.constraint.vertical"],
    action: { type: "constraint", constraint: "vertical", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.parallel",
    label: "Parallel",
    group: "constraints",
    description: "Make two selected lines parallel.",
    keys: [],
    autocad: ["PAR"],
    cadjs: ["sketch.constraint.parallel"],
    action: { type: "constraint", constraint: "parallel", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.perpendicular",
    label: "Perpendicular",
    group: "constraints",
    description: "Make two selected lines perpendicular.",
    keys: [],
    autocad: ["PER"],
    cadjs: ["sketch.constraint.perpendicular"],
    action: {
      type: "constraint",
      constraint: "perpendicular",
      needsValue: false,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.tangent",
    label: "Tangent",
    group: "constraints",
    description: "Make a selected line tangent to a selected arc or circle.",
    keys: [],
    autocad: ["TAN"],
    cadjs: ["sketch.constraint.tangent"],
    action: { type: "constraint", constraint: "tangent", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.equal",
    label: "Equal",
    group: "constraints",
    description: "Make selected lines or circles equal.",
    keys: [],
    autocad: ["EQL"],
    cadjs: ["sketch.constraint.equal"],
    action: { type: "constraint", constraint: "equal", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.coincident",
    label: "Coincident",
    group: "constraints",
    description: "Make two selected points coincident.",
    keys: [],
    autocad: ["COI"],
    cadjs: ["sketch.constraint.coincident"],
    action: { type: "constraint", constraint: "coincident", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.concentric",
    label: "Concentric",
    group: "constraints",
    description: "Make selected circles or arcs share a centre.",
    keys: [],
    autocad: ["CON"],
    cadjs: ["sketch.constraint.concentric"],
    action: { type: "constraint", constraint: "concentric", needsValue: false },
    requires: "selection",
  },
  {
    id: "sketch.constraint.point-on-line",
    label: "Point on line",
    group: "constraints",
    description: "Constrain a selected point to lie on a selected line.",
    keys: [],
    autocad: ["POINTONLINE"],
    cadjs: ["sketch.constraint.pointOnLine"],
    action: {
      type: "constraint",
      constraint: "pointOnLine",
      needsValue: false,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.point-on-circle",
    label: "Point on circle",
    group: "constraints",
    description: "Constrain a selected point to lie on a selected circle.",
    keys: [],
    autocad: ["POINTONCIRCLE"],
    cadjs: ["sketch.constraint.pointOnCircle"],
    action: {
      type: "constraint",
      constraint: "pointOnCircle",
      needsValue: false,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.midpoint",
    label: "Midpoint",
    group: "constraints",
    description:
      "Constrain a selected point to the midpoint of a selected line.",
    keys: [],
    autocad: ["MID"],
    cadjs: ["sketch.constraint.midpoint"],
    action: {
      type: "constraint",
      constraint: "midpoint",
      needsValue: false,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.symmetric",
    label: "Symmetric",
    group: "constraints",
    description:
      "Make two selected points symmetric about a selected line or point.",
    keys: [],
    autocad: ["SYM"],
    cadjs: ["sketch.constraint.symmetric"],
    action: {
      type: "constraint",
      constraint: "symmetric",
      needsValue: false,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.distance",
    label: "Distance",
    group: "constraints",
    description: "Add a driving distance dimension to the selection.",
    keys: [],
    autocad: ["DISTANCE"],
    cadjs: ["sketch.constraint.distance"],
    action: { type: "constraint", constraint: "distance", needsValue: true },
    requires: "selection",
  },
  {
    id: "sketch.constraint.distance-x",
    label: "Distance X",
    group: "constraints",
    description:
      "Add a driving horizontal distance between a line's endpoints or two points.",
    keys: [],
    autocad: ["DISTX", "DX"],
    cadjs: ["sketch.constraint.distanceX"],
    action: {
      type: "constraint",
      constraint: "distanceX",
      needsValue: true,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.distance-y",
    label: "Distance Y",
    group: "constraints",
    description:
      "Add a driving vertical distance between a line's endpoints or two points.",
    keys: [],
    autocad: ["DISTY", "DY"],
    cadjs: ["sketch.constraint.distanceY"],
    action: {
      type: "constraint",
      constraint: "distanceY",
      needsValue: true,
    },
    requires: "selection",
  },
  {
    id: "sketch.constraint.angle",
    label: "Angle",
    group: "constraints",
    description: "Add a driving angle dimension in degrees.",
    keys: [],
    autocad: ["ANG"],
    cadjs: ["sketch.constraint.angle"],
    action: { type: "constraint", constraint: "angle", needsValue: true },
    requires: "selection",
  },
  {
    id: "sketch.constraint.radius",
    label: "Radius",
    group: "constraints",
    description: "Add a driving radius dimension to a circle or arc.",
    keys: [],
    autocad: ["RAD"],
    cadjs: ["sketch.constraint.radius"],
    action: { type: "constraint", constraint: "radius", needsValue: true },
    requires: "selection",
  },
  {
    id: "sketch.constraint.diameter",
    label: "Diameter",
    group: "constraints",
    description: "Add a driving diameter dimension to a circle or arc.",
    keys: [],
    autocad: ["DIA"],
    cadjs: ["sketch.constraint.diameter"],
    action: { type: "constraint", constraint: "diameter", needsValue: true },
    requires: "selection",
  },
  {
    id: "sketch.undo",
    label: "Undo",
    group: "sketch",
    description: "Undo the last sketch edit.",
    keys: ["Ctrl+Z"],
    autocad: ["U", "UNDO"],
    cadjs: ["sketch.undo"],
    action: { type: "undo" },
  },
  {
    id: "sketch.redo",
    label: "Redo",
    group: "sketch",
    description: "Redo the last undone sketch edit.",
    keys: ["Ctrl+Shift+Z", "Ctrl+Y"],
    autocad: ["REDO"],
    cadjs: ["sketch.redo"],
    action: { type: "redo" },
  },
  {
    id: "sketch.solve",
    label: "Solve",
    group: "sketch",
    description: "Run the constraint solver on the current sketch.",
    keys: [],
    autocad: ["SOLVE"],
    cadjs: ["sketch.solve"],
    action: { type: "solve" },
  },
  {
    id: "sketch.finish",
    label: "Finish sketch",
    group: "sketch",
    description: "Close the profile and return to the model.",
    keys: ["Enter"],
    autocad: ["FINISH"],
    cadjs: ["sketch.finish"],
    action: { type: "finish" },
  },
  {
    id: "sketch.cancel",
    label: "Cancel sketch",
    group: "sketch",
    description: "Discard the sketch and leave sketch mode.",
    keys: ["Esc"],
    autocad: [],
    cadjs: ["sketch.cancel"],
    action: { type: "cancel" },
  },
  {
    id: "sketch.grid-snap",
    label: "Grid snap",
    group: "sketch",
    description: "Toggle snapping to the sketch grid.",
    keys: [],
    autocad: ["SNAP"],
    cadjs: ["sketch.gridSnap"],
    action: { type: "grid-snap" },
  },
  {
    id: "sketch.command-palette",
    label: "Command palette",
    group: "interface",
    description: "Search every 2D command by name, key or AutoCAD alias.",
    keys: ["Ctrl+K", "Cmd+K"],
    autocad: ["COMMAND"],
    cadjs: ["sketch.commands"],
    action: { type: "command-palette" },
    hiddenInPalette: true,
  },
  {
    id: "sketch.controls-help",
    label: "Controls and shortcuts",
    group: "interface",
    description: "Show the full control map and the known parity gaps.",
    keys: ["F1", "?"],
    autocad: ["HELP"],
    cadjs: ["sketch.help"],
    action: { type: "controls-help" },
    hiddenInPalette: true,
  },
];

/** Commands offered inside the palette (interface commands are excluded). */
export const SKETCH_PALETTE_COMMANDS: readonly SketchCommand[] =
  SKETCH_COMMANDS.filter((command) => !command.hiddenInPalette);

/**
 * AutoCAD 2D tools with no real engine support yet. These are intentionally
 * not buttons: the help sheet lists them so the parity gap is visible.
 */
export interface SketchParityGap {
  name: string;
  autocad: string;
  note: string;
}

export const SKETCH_PARITY_GAPS: readonly SketchParityGap[] = [
  {
    name: "Polyline",
    autocad: "PL",
    note: "The engine draws individual lines; there is no polyline primitive or vertex editing.",
  },
  {
    name: "Hatch",
    autocad: "H",
    note: "No filled hatch region.",
  },
  {
    name: "Block",
    autocad: "B",
    note: "No sketch block definition or insert.",
  },
  {
    name: "Explode",
    autocad: "X",
    note: "X is Construction here; there is no explode for sketch geometry.",
  },
  {
    name: "Layers / Linetypes",
    autocad: "LA / LT",
    note: "Sketch geometry has no layer or linetype model.",
  },
  {
    name: "Plot",
    autocad: "PLOT",
    note: "No 2D plotting or sheet output.",
  },
  {
    name: "Expressions",
    autocad: "EXPR",
    note: "Arithmetic and unit expressions work in numeric sketch fields; project-variable references are not wired in yet.",
  },
];

export function normalizeCommandQuery(query: string): string {
  return query.trim().toLowerCase();
}

function commandTokens(command: SketchCommand): string[] {
  return [
    command.id,
    command.label,
    ...command.keys,
    ...command.autocad,
    ...command.cadjs,
  ].map(normalizeCommandQuery);
}

/** Exact match by id, label, key, AutoCAD alias or cadjs name. */
export function findSketchCommand(query: string): SketchCommand | null {
  const q = normalizeCommandQuery(query);
  if (!q) return null;
  return (
    SKETCH_COMMANDS.find((command) => commandTokens(command).includes(q)) ??
    null
  );
}

/** Substring search for the palette; preserves registry order. */
export function searchSketchCommands(
  query: string,
  commands: readonly SketchCommand[] = SKETCH_COMMANDS,
): readonly SketchCommand[] {
  const q = normalizeCommandQuery(query);
  if (!q) return commands;
  return commands.filter((command) =>
    commandTokens(command).some((token) => token.includes(q)),
  );
}

export interface SketchCommandState {
  hasSelection: boolean;
  hasPointSelection: boolean;
  hasTwoLineSelection?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Constraints the solver offers for the current selection. */
  availableConstraints?: readonly string[];
}

export interface SketchCommandAvailability {
  enabled: boolean;
  reason?: string;
}

export function sketchCommandAvailability(
  command: SketchCommand,
  state: SketchCommandState,
): SketchCommandAvailability {
  if (command.requires === "selection" && !state.hasSelection) {
    return { enabled: false, reason: "Select sketch geometry first." };
  }
  if (command.requires === "point-selection" && !state.hasPointSelection) {
    return { enabled: false, reason: "Select a sketch point first." };
  }
  if (command.requires === "two-lines" && !state.hasTwoLineSelection) {
    return { enabled: false, reason: "Select exactly two lines first." };
  }
  if (
    command.action.type === "constraint" &&
    state.availableConstraints &&
    !state.availableConstraints.includes(command.action.constraint)
  ) {
    return {
      enabled: false,
      reason: "Not available for the current selection.",
    };
  }
  if (command.action.type === "undo" && !state.canUndo) {
    return { enabled: false, reason: "Nothing to undo." };
  }
  if (command.action.type === "redo" && !state.canRedo) {
    return { enabled: false, reason: "Nothing to redo." };
  }
  return { enabled: true };
}
