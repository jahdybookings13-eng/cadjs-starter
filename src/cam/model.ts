// CAM Studio document model.
//
// All positions and sizes are in the document's declared unit. No cloud
// service is involved: stock, tools, operations and post settings are plain
// document data so they survive tab switches and save/reload.

import type { CamFlatPattern } from "./flatPattern";

export const CAM_SCHEMA = "scadgen.camstudio";
export const CAM_VERSION = 1 as const;
/** Hard ceilings so a malformed operation cannot allocate without bound. */
export const CAM_MAX_OPERATIONS = 512;
export const CAM_MAX_MOVES = 250_000;
export const CAM_MAX_MOVES_PER_OPERATION = 100_000;

export type CamUnit = "mm" | "in";
export type StockKind = "box" | "cylinder" | "custom";
export type ToolKind = "endmill" | "ballmill" | "drill" | "chamfer";
export type OperationKind =
  | "face"
  | "contour"
  | "pocket"
  | "drill"
  | "chamfer"
  | "adaptive"
  | "parallel"
  | "pencil"
  | "rest";
export const CAM_3D_OPERATION_KINDS: readonly OperationKind[] = [
  "adaptive",
  "parallel",
  "pencil",
  "rest",
];
export type PostId = "grbl" | "linuxcnc" | "fanuc";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface CamStock {
  kind: StockKind;
  /** Box stock dimensions. */
  size: Vec3;
  /** Cylinder diameter, ignored for box/custom stock. */
  diameter: number;
  /** Cylinder height, ignored for box/custom stock. */
  height: number;
  /** Uniform XY/Z allowance around the fitted body. */
  margin: number;
  /** Minimum corner of the stock; also the work-origin frame. */
  origin: Vec3;
  units: CamUnit;
  /** Bounds used by custom stock. */
  customBounds?: Box3 | undefined;
}

export interface CamTool {
  id: string;
  name: string;
  kind: ToolKind;
  diameter: number;
  flutes: number;
  material: string;
  fluteLength: number;
  /** Cutting feed in units/minute. */
  feed: number;
  /** Spindle speed in RPM. */
  speed: number;
  /** Safe retract height, positive above the stock top. */
  safeZ: number;
}

export interface CamProfile {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CamTabOptions {
  count: number;
  width: number;
  /** Material left under the tab. Must be less than the operation depth. */
  height: number;
}

export interface CamOperation {
  id: string;
  name: string;
  kind: OperationKind;
  toolId: string;
  /** Finished depth below the stock top. */
  depth: number;
  stepdown: number;
  stepover: number;
  leadIn: number;
  leadOut: number;
  /** Rectangular XY profile used by contour, pocket and chamfer. */
  profile: CamProfile;
  /** Drill centres. Ignored by milling operations. */
  holes: Array<{ x: number; y: number }>;
  tabs: CamTabOptions | null;
  order: number;
}

export interface CamSurface {
  /** XY origin of the height grid in document units. */
  origin: Vec3;
  /** Grid spacing in document units. */
  cell: number;
  cols: number;
  rows: number;
  /** Depth below the stock top; 0 is uncut top, positive is material removed. */
  heights: number[];
}

export interface CamDocument {
  schema: typeof CAM_SCHEMA;
  v: typeof CAM_VERSION;
  name: string;
  stock: CamStock;
  tools: CamTool[];
  operations: CamOperation[];
  post: PostId;
  /** Optional height-map part surface used by the 3D operations. */
  surface?: CamSurface | undefined;
  /** Optional Phase 6 flat pattern used by flat-pattern CAM. */
  flatPattern?: CamFlatPattern | undefined;
}

export interface CamIssue {
  code: string;
  path: string;
  message: string;
}

export class CamError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: CamIssue[] = [],
  ) {
    super(message);
    this.name = "CamError";
  }
}

export const CAM_TOOL_LIBRARY: readonly Omit<CamTool, "id">[] = [
  {
    name: "6 mm flat endmill",
    kind: "endmill",
    diameter: 6,
    flutes: 3,
    material: "carbide",
    fluteLength: 18,
    feed: 900,
    speed: 18000,
    safeZ: 5,
  },
  {
    name: "3 mm flat endmill",
    kind: "endmill",
    diameter: 3,
    flutes: 3,
    material: "carbide",
    fluteLength: 12,
    feed: 600,
    speed: 22000,
    safeZ: 5,
  },
  {
    name: "6 mm ballmill",
    kind: "ballmill",
    diameter: 6,
    flutes: 2,
    material: "carbide",
    fluteLength: 18,
    feed: 750,
    speed: 16000,
    safeZ: 5,
  },
  {
    name: "5 mm drill",
    kind: "drill",
    diameter: 5,
    flutes: 2,
    material: "HSS",
    fluteLength: 25,
    feed: 120,
    speed: 3000,
    safeZ: 5,
  },
  {
    name: "6 mm chamfer 90°",
    kind: "chamfer",
    diameter: 6,
    flutes: 2,
    material: "carbide",
    fluteLength: 10,
    feed: 500,
    speed: 12000,
    safeZ: 5,
  },
];

let idSeq = 0;

export function camId(prefix: "tool" | "op"): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

export function emptyCamStock(units: CamUnit = "mm"): CamStock {
  return {
    kind: "box",
    size: { x: 100, y: 80, z: 20 },
    diameter: 80,
    height: 20,
    margin: 2,
    origin: { x: 0, y: 0, z: 0 },
    units,
  };
}

export function emptyCamDocument(name = "CAM Studio"): CamDocument {
  return {
    schema: CAM_SCHEMA,
    v: CAM_VERSION,
    name,
    stock: emptyCamStock(),
    tools: [],
    operations: [],
    post: "grbl",
  };
}

export function camToolFromLibrary(preset: Omit<CamTool, "id">): CamTool {
  return { ...preset, id: camId("tool") };
}

export function camToolFromPreset(index: number): CamTool | null {
  const preset = CAM_TOOL_LIBRARY[index];
  return preset ? camToolFromLibrary(preset) : null;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Minimum/maximum stock extent in document units. */
export function stockBounds(stock: CamStock): Box3 {
  if (stock.kind === "custom") {
    const bounds = stock.customBounds;
    if (!bounds) {
      throw new CamError("STOCK_BOUNDS", "Custom stock has no bounds.");
    }
    return {
      min: {
        x: bounds.min.x - stock.margin,
        y: bounds.min.y - stock.margin,
        z: bounds.min.z - stock.margin,
      },
      max: {
        x: bounds.max.x + stock.margin,
        y: bounds.max.y + stock.margin,
        z: bounds.max.z + stock.margin,
      },
    };
  }
  if (stock.kind === "cylinder") {
    const radius = stock.diameter / 2;
    return {
      min: {
        x: stock.origin.x - radius,
        y: stock.origin.y - radius,
        z: stock.origin.z,
      },
      max: {
        x: stock.origin.x + radius,
        y: stock.origin.y + radius,
        z: stock.origin.z + stock.height,
      },
    };
  }
  return {
    min: { ...stock.origin },
    max: {
      x: stock.origin.x + stock.size.x,
      y: stock.origin.y + stock.size.y,
      z: stock.origin.z + stock.size.z,
    },
  };
}

/** Build stock around a body bound, leaving the requested margin. */
export function stockFromBody(
  body: Box3,
  kind: StockKind,
  margin: number,
  units: CamUnit = "mm",
): CamStock {
  const size = {
    x: Math.max(0, body.max.x - body.min.x),
    y: Math.max(0, body.max.y - body.min.y),
    z: Math.max(0, body.max.z - body.min.z),
  };
  if (kind === "custom") {
    return {
      kind,
      size,
      diameter: Math.max(size.x, size.y),
      height: size.z,
      margin,
      origin: { x: body.min.x, y: body.min.y, z: body.min.z },
      units,
      customBounds: {
        min: { ...body.min },
        max: { ...body.max },
      },
    };
  }
  if (kind === "cylinder") {
    return {
      kind,
      size,
      diameter: Math.max(size.x, size.y) + margin * 2,
      height: size.z + margin * 2,
      margin,
      origin: {
        x: body.min.x + size.x / 2,
        y: body.min.y + size.y / 2,
        z: body.min.z - margin,
      },
      units,
    };
  }
  return {
    kind,
    size: {
      x: size.x + margin * 2,
      y: size.y + margin * 2,
      z: size.z + margin * 2,
    },
    diameter: Math.max(size.x, size.y) + margin * 2,
    height: size.z + margin * 2,
    margin,
    origin: {
      x: body.min.x - margin,
      y: body.min.y - margin,
      z: body.min.z - margin,
    },
    units,
  };
}

export function validateStock(stock: CamStock): CamIssue[] {
  const issues: CamIssue[] = [];
  const positive = (value: number, path: string, label: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: "STOCK_SIZE",
        path,
        message: `${label} must be a positive finite number.`,
      });
    }
  };
  const nonNegative = (value: number, path: string, label: string) => {
    if (!Number.isFinite(value) || value < 0) {
      issues.push({
        code: "STOCK_MARGIN",
        path,
        message: `${label} must be zero or greater.`,
      });
    }
  };
  if (stock.kind === "box") {
    positive(stock.size.x, "stock.size.x", "Stock X");
    positive(stock.size.y, "stock.size.y", "Stock Y");
    positive(stock.size.z, "stock.size.z", "Stock Z");
  } else if (stock.kind === "cylinder") {
    positive(stock.diameter, "stock.diameter", "Stock diameter");
    positive(stock.height, "stock.height", "Stock height");
  } else if (stock.kind === "custom") {
    if (!stock.customBounds) {
      issues.push({
        code: "STOCK_BOUNDS",
        path: "stock.customBounds",
        message: "Custom stock needs a minimum and maximum bound.",
      });
    } else {
      for (const axis of ["x", "y", "z"] as const) {
        if (!(stock.customBounds.max[axis] > stock.customBounds.min[axis])) {
          issues.push({
            code: "STOCK_BOUNDS",
            path: `stock.customBounds.${axis}`,
            message: `Custom stock ${axis} maximum must exceed its minimum.`,
          });
        }
      }
    }
  } else {
    issues.push({
      code: "STOCK_KIND",
      path: "stock.kind",
      message: `Unknown stock kind "${String(stock.kind)}".`,
    });
  }
  nonNegative(stock.margin, "stock.margin", "Stock margin");
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(stock.origin[axis])) {
      issues.push({
        code: "STOCK_ORIGIN",
        path: `stock.origin.${axis}`,
        message: `Stock origin ${axis} must be finite.`,
      });
    }
  }
  return issues;
}

export function validateTool(tool: CamTool): CamIssue[] {
  const issues: CamIssue[] = [];
  const positive = (value: number, path: string, label: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: "TOOL_GEOMETRY",
        path,
        message: `${label} must be a positive finite number.`,
      });
    }
  };
  if (!tool.name.trim()) {
    issues.push({
      code: "TOOL_NAME",
      path: "name",
      message: "Tool name cannot be blank.",
    });
  }
  if (!["endmill", "ballmill", "drill", "chamfer"].includes(tool.kind)) {
    issues.push({
      code: "TOOL_KIND",
      path: "kind",
      message: `Unknown tool kind "${String(tool.kind)}".`,
    });
  }
  positive(tool.diameter, "diameter", "Tool diameter");
  positive(tool.fluteLength, "fluteLength", "Flute length");
  positive(tool.safeZ, "safeZ", "Safe Z");
  if (!Number.isInteger(tool.flutes) || tool.flutes <= 0) {
    issues.push({
      code: "TOOL_FLUTES",
      path: "flutes",
      message: "Flutes must be a positive whole number.",
    });
  }
  if (!Number.isFinite(tool.feed) || tool.feed <= 0) {
    issues.push({
      code: "TOOL_FEED",
      path: "feed",
      message: "Feed must be a positive finite number.",
    });
  }
  if (!Number.isFinite(tool.speed) || tool.speed <= 0) {
    issues.push({
      code: "TOOL_SPEED",
      path: "speed",
      message: "Spindle speed must be a positive finite number.",
    });
  }
  if (!tool.material.trim()) {
    issues.push({
      code: "TOOL_MATERIAL",
      path: "material",
      message: "Tool material cannot be blank.",
    });
  }
  return issues;
}

export function validateOperation(
  operation: CamOperation,
  tools: readonly CamTool[] = [],
): CamIssue[] {
  const issues: CamIssue[] = [];
  const positive = (value: number, path: string, label: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: "OPERATION_VALUE",
        path,
        message: `${label} must be a positive finite number.`,
      });
    }
  };
  if (!operation.name.trim()) {
    issues.push({
      code: "OPERATION_NAME",
      path: "name",
      message: "Operation name cannot be blank.",
    });
  }
  if (
    ![
      "face",
      "contour",
      "pocket",
      "drill",
      "chamfer",
      "adaptive",
      "parallel",
      "pencil",
      "rest",
    ].includes(operation.kind)
  ) {
    issues.push({
      code: "OPERATION_KIND",
      path: "kind",
      message: `Unknown operation kind "${String(operation.kind)}".`,
    });
  }
  if (tools.length > 0 && !tools.some((tool) => tool.id === operation.toolId)) {
    issues.push({
      code: "OPERATION_TOOL",
      path: "toolId",
      message: "Operation references a tool that is not in the library.",
    });
  }
  positive(operation.depth, "depth", "Cut depth");
  positive(operation.stepdown, "stepdown", "Stepdown");
  positive(operation.stepover, "stepover", "Stepover");
  if (!Number.isFinite(operation.leadIn) || operation.leadIn < 0) {
    issues.push({
      code: "OPERATION_LEAD",
      path: "leadIn",
      message: "Lead-in must be zero or greater.",
    });
  }
  if (!Number.isFinite(operation.leadOut) || operation.leadOut < 0) {
    issues.push({
      code: "OPERATION_LEAD",
      path: "leadOut",
      message: "Lead-out must be zero or greater.",
    });
  }
  if (operation.kind !== "drill") {
    positive(operation.profile.width, "profile.width", "Profile width");
    positive(operation.profile.height, "profile.height", "Profile height");
  }
  if (
    operation.kind === "adaptive" ||
    operation.kind === "parallel" ||
    operation.kind === "pencil" ||
    operation.kind === "rest"
  ) {
    if (!Number.isFinite(operation.stepover) || operation.stepover <= 0) {
      issues.push({
        code: "OPERATION_STEPOVER",
        path: "stepover",
        message: "3D operations need a positive stepover.",
      });
    }
  }
  if (operation.kind === "drill") {
    if (operation.holes.length === 0) {
      issues.push({
        code: "OPERATION_HOLES",
        path: "holes",
        message: "A drill operation needs at least one hole.",
      });
    }
    for (const [index, hole] of operation.holes.entries()) {
      if (!Number.isFinite(hole.x) || !Number.isFinite(hole.y)) {
        issues.push({
          code: "OPERATION_HOLES",
          path: `holes.${index}`,
          message: "Drill hole coordinates must be finite.",
        });
      }
    }
  }
  if (operation.tabs) {
    if (
      !Number.isInteger(operation.tabs.count) ||
      operation.tabs.count < 0 ||
      operation.tabs.count > 32
    ) {
      issues.push({
        code: "OPERATION_TABS",
        path: "tabs.count",
        message: "Tab count must be a whole number from 0 to 32.",
      });
    }
    if (!Number.isFinite(operation.tabs.width) || operation.tabs.width <= 0) {
      issues.push({
        code: "OPERATION_TABS",
        path: "tabs.width",
        message: "Tab width must be positive.",
      });
    }
    if (
      !Number.isFinite(operation.tabs.height) ||
      operation.tabs.height < 0 ||
      operation.tabs.height >= operation.depth
    ) {
      issues.push({
        code: "OPERATION_TABS",
        path: "tabs.height",
        message: "Tab height must be zero or greater and less than cut depth.",
      });
    }
  }
  if (!Number.isFinite(operation.order)) {
    issues.push({
      code: "OPERATION_ORDER",
      path: "order",
      message: "Operation order must be finite.",
    });
  }
  return issues;
}

export function validateCamDocument(document: CamDocument): CamIssue[] {
  const issues: CamIssue[] = [];
  if (!document.name.trim()) {
    issues.push({
      code: "CAM_NAME",
      path: "name",
      message: "CAM program name cannot be blank.",
    });
  }
  issues.push(
    ...validateStock(document.stock).map((issue) => ({
      ...issue,
      path: `stock.${issue.path}`,
    })),
  );
  const toolIds = new Set<string>();
  for (const [index, tool] of document.tools.entries()) {
    const path = `tools.${index}`;
    if (toolIds.has(tool.id)) {
      issues.push({
        code: "TOOL_DUPLICATE",
        path: `${path}.id`,
        message: "Tool ids must be unique.",
      });
    }
    toolIds.add(tool.id);
    issues.push(
      ...validateTool(tool).map((issue) => ({
        ...issue,
        path: `${path}.${issue.path}`,
      })),
    );
  }
  if (document.operations.length > CAM_MAX_OPERATIONS) {
    issues.push({
      code: "CAM_OPERATION_LIMIT",
      path: "operations",
      message: `A CAM document may contain at most ${CAM_MAX_OPERATIONS} operations.`,
    });
  }
  for (const [index, operation] of document.operations.entries()) {
    issues.push(
      ...validateOperation(operation, document.tools).map((issue) => ({
        ...issue,
        path: `operations.${index}.${issue.path}`,
      })),
    );
    if (CAM_3D_OPERATION_KINDS.includes(operation.kind) && !document.surface) {
      issues.push({
        code: "OPERATION_SURFACE",
        path: `operations.${index}.kind`,
        message: `Operation "${operation.name}" needs a part surface height map.`,
      });
    }
  }
  if (document.surface) {
    issues.push(...validateSurface(document.surface));
  }
  if (document.flatPattern) {
    const pattern = document.flatPattern;
    if (pattern.outline.length < 4) {
      issues.push({
        code: "FLAT_PATTERN_OUTLINE",
        path: "flatPattern.outline",
        message: "Flat pattern needs a closed outline.",
      });
    }
    if (pattern.units !== document.stock.units) {
      issues.push({
        code: "FLAT_PATTERN_UNITS",
        path: "flatPattern.units",
        message: "Flat pattern units must match the CAM document units.",
      });
    }
    for (const [index, bend] of pattern.bends.entries()) {
      if (!Number.isFinite(bend.angleDeg)) {
        issues.push({
          code: "FLAT_PATTERN_BEND",
          path: `flatPattern.bends.${index}`,
          message: "Bend angle must be finite.",
        });
      }
    }
  }
  if (!["grbl", "linuxcnc", "fanuc"].includes(document.post)) {
    issues.push({
      code: "POST_ID",
      path: "post",
      message: `Unknown post processor "${String(document.post)}".`,
    });
  }
  return issues;
}

export function validateSurface(surface: CamSurface): CamIssue[] {
  const issues: CamIssue[] = [];
  if (!Number.isFinite(surface.cell) || surface.cell <= 0) {
    issues.push({
      code: "SURFACE_CELL",
      path: "surface.cell",
      message: "Surface cell size must be positive.",
    });
  }
  if (!Number.isInteger(surface.cols) || surface.cols < 2) {
    issues.push({
      code: "SURFACE_GRID",
      path: "surface.cols",
      message: "Surface needs at least two columns.",
    });
  }
  if (!Number.isInteger(surface.rows) || surface.rows < 2) {
    issues.push({
      code: "SURFACE_GRID",
      path: "surface.rows",
      message: "Surface needs at least two rows.",
    });
  }
  if (surface.heights.length !== surface.cols * surface.rows) {
    issues.push({
      code: "SURFACE_HEIGHTS",
      path: "surface.heights",
      message: "Surface height count must equal cols × rows.",
    });
  }
  for (const [index, height] of surface.heights.entries()) {
    if (!Number.isFinite(height) || height < 0) {
      issues.push({
        code: "SURFACE_HEIGHT",
        path: `surface.heights.${index}`,
        message: "Surface depths must be finite and zero or greater.",
      });
      break;
    }
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (!Number.isFinite(surface.origin[axis])) {
      issues.push({
        code: "SURFACE_ORIGIN",
        path: `surface.origin.${axis}`,
        message: "Surface origin must be finite.",
      });
    }
  }
  return issues;
}

export function assertValidCamDocument(document: CamDocument): void {
  const issues = validateCamDocument(document);
  if (issues.length > 0) {
    throw new CamError(
      "CAM_VALIDATION",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  const record = asRecord(value);
  return record
    ? {
        x: numberOr(record.x, fallback.x),
        y: numberOr(record.y, fallback.y),
        z: numberOr(record.z, fallback.z),
      }
    : { ...fallback };
}

function normalizeStock(value: unknown, base: CamStock): CamStock {
  const record = asRecord(value);
  if (!record) return base;
  const kind = ["box", "cylinder", "custom"].includes(String(record.kind))
    ? (record.kind as StockKind)
    : base.kind;
  const custom = asRecord(record.customBounds);
  return {
    kind,
    size: vec3(record.size, base.size),
    diameter: numberOr(record.diameter, base.diameter),
    height: numberOr(record.height, base.height),
    margin: numberOr(record.margin, base.margin),
    origin: vec3(record.origin, base.origin),
    units: record.units === "in" ? "in" : "mm",
    ...(custom
      ? {
          customBounds: {
            min: vec3(custom.min, base.origin),
            max: vec3(custom.max, {
              x: base.origin.x + base.size.x,
              y: base.origin.y + base.size.y,
              z: base.origin.z + base.size.z,
            }),
          },
        }
      : base.customBounds
        ? { customBounds: base.customBounds }
        : {}),
  };
}

function normalizeTool(value: unknown): CamTool | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = ["endmill", "ballmill", "drill", "chamfer"].includes(
    String(record.kind),
  )
    ? (record.kind as ToolKind)
    : "endmill";
  return {
    id: typeof record.id === "string" ? record.id : camId("tool"),
    name: typeof record.name === "string" ? record.name : "Tool",
    kind,
    diameter: numberOr(record.diameter, 6),
    flutes: Math.max(1, Math.round(numberOr(record.flutes, 2))),
    material: typeof record.material === "string" ? record.material : "carbide",
    fluteLength: numberOr(record.fluteLength, 12),
    feed: numberOr(record.feed, 600),
    speed: numberOr(record.speed, 12000),
    safeZ: numberOr(record.safeZ, 5),
  };
}

function normalizeProfile(value: unknown): CamProfile {
  const record = asRecord(value) ?? {};
  return {
    x: numberOr(record.x, 0),
    y: numberOr(record.y, 0),
    width: numberOr(record.width, 50),
    height: numberOr(record.height, 40),
  };
}

function normalizeTabs(value: unknown): CamTabOptions | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    count: Math.max(0, Math.round(numberOr(record.count, 0))),
    width: numberOr(record.width, 4),
    height: numberOr(record.height, 1),
  };
}

function normalizeOperation(value: unknown): CamOperation | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = [
    "face",
    "contour",
    "pocket",
    "drill",
    "chamfer",
    "adaptive",
    "parallel",
    "pencil",
    "rest",
  ].includes(String(record.kind))
    ? (record.kind as OperationKind)
    : "contour";
  const holes = Array.isArray(record.holes)
    ? record.holes
        .map((hole) => asRecord(hole))
        .filter((hole): hole is Record<string, unknown> => hole !== null)
        .map((hole) => ({
          x: numberOr(hole.x, 0),
          y: numberOr(hole.y, 0),
        }))
    : [];
  return {
    id: typeof record.id === "string" ? record.id : camId("op"),
    name: typeof record.name === "string" ? record.name : "Operation",
    kind,
    toolId: typeof record.toolId === "string" ? record.toolId : "",
    depth: numberOr(record.depth, 2),
    stepdown: numberOr(record.stepdown, 1),
    stepover: numberOr(record.stepover, 3),
    leadIn: numberOr(record.leadIn, 2),
    leadOut: numberOr(record.leadOut, 1),
    profile: normalizeProfile(record.profile),
    holes,
    tabs: normalizeTabs(record.tabs),
    order: numberOr(record.order, 0),
  };
}

function normalizeFlatPattern(value: unknown): CamFlatPattern | null {
  const record = asRecord(value);
  if (!record) return null;
  const point = (raw: unknown): { x: number; y: number } => {
    const p = asRecord(raw);
    return { x: numberOr(p?.x, 0), y: numberOr(p?.y, 0) };
  };
  const outline = Array.isArray(record.outline)
    ? record.outline.map(point)
    : [];
  if (outline.length < 3) return null;
  return {
    source:
      typeof record.source === "string"
        ? record.source
        : "Phase 6 flat pattern",
    units: record.units === "in" ? "in" : "mm",
    outline,
    holes: Array.isArray(record.holes)
      ? record.holes
          .filter(Array.isArray)
          .map((hole) => (hole as unknown[]).map(point))
      : [],
    bends: Array.isArray(record.bends)
      ? record.bends
          .map((raw) => asRecord(raw))
          .filter((bend): bend is Record<string, unknown> => bend !== null)
          .map((bend) => ({
            start: point(bend.start),
            end: point(bend.end),
            angleDeg: numberOr(bend.angleDeg, 90),
            direction:
              bend.direction === "up" || bend.direction === "down"
                ? bend.direction
                : "either",
            ...(typeof bend.id === "string" ? { id: bend.id } : {}),
          }))
      : [],
    width: numberOr(record.width, 0),
    height: numberOr(record.height, 0),
  };
}

function normalizeSurface(value: unknown): CamSurface | null {
  const record = asRecord(value);
  if (!record) return null;
  const cols = Math.max(2, Math.round(numberOr(record.cols, 2)));
  const rows = Math.max(2, Math.round(numberOr(record.rows, 2)));
  const rawHeights = Array.isArray(record.heights) ? record.heights : [];
  return {
    origin: vec3(record.origin, { x: 0, y: 0, z: 0 }),
    cell: numberOr(record.cell, 1),
    cols,
    rows,
    heights: Array.from({ length: cols * rows }, (_, index) =>
      Math.max(0, numberOr(rawHeights[index], 0)),
    ),
  };
}

/**
 * Parse a persisted CAM tab. Version 0/missing is migrated by filling only
 * missing fields; a future version is refused instead of guessed at.
 */
export function parseCamDocument(text: string): CamDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CamError("CAM_JSON", "CAM Studio payload is not valid JSON.");
  }
  const record = asRecord(raw);
  if (!record) {
    throw new CamError("CAM_SCHEMA", "CAM Studio payload must be an object.");
  }
  if (record.schema !== undefined && record.schema !== CAM_SCHEMA) {
    throw new CamError(
      "CAM_SCHEMA",
      `Expected ${CAM_SCHEMA}, received ${String(record.schema)}.`,
    );
  }
  const version = numberOr(record.v, 0);
  if (version > CAM_VERSION) {
    throw new CamError(
      "CAM_FUTURE_SCHEMA",
      `CAM Studio version ${version} is newer than this build (${CAM_VERSION}).`,
    );
  }
  const base = emptyCamDocument(
    typeof record.name === "string" && record.name.trim()
      ? record.name
      : "CAM Studio",
  );
  const tools = Array.isArray(record.tools)
    ? record.tools
        .map(normalizeTool)
        .filter((tool): tool is CamTool => tool !== null)
    : [];
  const operations = Array.isArray(record.operations)
    ? record.operations
        .map(normalizeOperation)
        .filter((operation): operation is CamOperation => operation !== null)
    : [];
  const post = ["grbl", "linuxcnc", "fanuc"].includes(String(record.post))
    ? (record.post as PostId)
    : "grbl";
  const surface = normalizeSurface(record.surface);
  const flatPattern = normalizeFlatPattern(record.flatPattern);
  return {
    schema: CAM_SCHEMA,
    v: CAM_VERSION,
    name: base.name,
    stock: normalizeStock(record.stock, base.stock),
    tools,
    operations,
    post,
    ...(surface ? { surface } : {}),
    ...(flatPattern ? { flatPattern } : {}),
  };
}

export function serializeCamDocument(document: CamDocument): string {
  return JSON.stringify(document);
}

export function camStudioTabDesign(document: CamDocument): string {
  return serializeCamDocument(document);
}

export function camStudioFromDesign(text: string): CamDocument | null {
  try {
    return parseCamDocument(text);
  } catch {
    return null;
  }
}

export function camToolById(
  document: CamDocument,
  toolId: string,
): CamTool | null {
  return document.tools.find((tool) => tool.id === toolId) ?? null;
}

export function nextOperationOrder(document: CamDocument): number {
  return document.operations.reduce(
    (max, operation) => Math.max(max, operation.order + 1),
    0,
  );
}

export function formatCamLength(value: number, units: CamUnit): string {
  return `${Number.isFinite(value) ? value.toFixed(2) : "0.00"} ${units}`;
}
