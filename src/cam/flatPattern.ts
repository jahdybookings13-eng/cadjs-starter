// Flat-pattern CAM adapter.
//
// Phase 6 owns the developed flat pattern (outline, holes, bend lines). This
// module converts it into the CAM document unit, cuts only CUT contours and
// preserves BEND_UP/BEND_DOWN as non-cut DXF layers. It never substitutes a
// stock bounding box for the unfolded outline.

import {
  validateFlatPatternDrawing,
  type FlatPatternDrawing,
  type Phase6LengthUnit,
} from "../model/phase6";
import {
  CamError,
  stockBounds,
  type CamDocument,
  type CamTool,
  type CamUnit,
} from "./model";
import type { CamMove, CamToolpath } from "./toolpath";

export interface CamFlatPatternPoint {
  x: number;
  y: number;
}

export interface CamFlatPatternBend {
  start: CamFlatPatternPoint;
  end: CamFlatPatternPoint;
  angleDeg: number;
  direction: "up" | "down" | "either";
  id?: string;
}

export interface CamFlatPattern {
  source: string;
  units: CamUnit;
  outline: CamFlatPatternPoint[];
  holes: CamFlatPatternPoint[][];
  bends: CamFlatPatternBend[];
  width: number;
  height: number;
}

export interface FlatPatternDxfResult {
  dxf: string;
  fileName: string;
  cutEntities: number;
  bendEntities: number;
}

function convertPoint(
  point: CamFlatPatternPoint,
  from: Phase6LengthUnit,
  to: CamUnit,
): CamFlatPatternPoint {
  if (from === to) return { ...point };
  const factor = from === "in" ? 25.4 : 1 / 25.4;
  return { x: point.x * factor, y: point.y * factor };
}

function closeRing(
  points: readonly CamFlatPatternPoint[],
): CamFlatPatternPoint[] {
  if (!points.length) return [];
  const out = points.map((point) => ({ ...point }));
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (Math.abs(first.x - last.x) > 1e-9 || Math.abs(first.y - last.y) > 1e-9) {
    out.push({ ...first });
  }
  return out;
}

/** Validate and convert the Phase 6 developed pattern, preserving bend layers. */
export function camFlatPatternFromPhase6(
  drawing: FlatPatternDrawing,
  opts: { source?: string; units?: CamUnit } = {},
): CamFlatPattern {
  const issues = validateFlatPatternDrawing(drawing);
  if (issues.length > 0) {
    throw new CamError(
      "FLAT_PATTERN",
      issues.map((issue) => issue.message).join("; "),
      issues.map((issue) => ({
        code: "FLAT_PATTERN",
        path: issue.path,
        message: issue.message,
      })),
    );
  }
  const units = opts.units ?? drawing.units;
  const outline = closeRing(
    drawing.outline.map((point) => convertPoint(point, drawing.units, units)),
  );
  const holes = (drawing.holes ?? []).map((hole) =>
    closeRing(hole.map((point) => convertPoint(point, drawing.units, units))),
  );
  const bends = (drawing.bends ?? []).map((bend) => ({
    start: convertPoint(bend.start, drawing.units, units),
    end: convertPoint(bend.end, drawing.units, units),
    angleDeg: bend.angleDeg,
    direction: bend.direction,
    ...(bend.id ? { id: bend.id } : {}),
  }));
  const xs = [...outline, ...holes.flat()].map((point) => point.x);
  const ys = [...outline, ...holes.flat()].map((point) => point.y);
  return {
    source: opts.source ?? "Phase 6 flat pattern",
    units,
    outline,
    holes,
    bends,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function ringPath(
  stockTop: number,
  depth: number,
  ring: readonly CamFlatPatternPoint[],
  tool: CamTool,
  safeZ: number,
  lead: number,
): CamMove[] {
  if (ring.length < 2) return [];
  const moves: CamMove[] = [];
  const first = ring[0]!;
  const z = stockTop - depth;
  moves.push({
    kind: "rapid",
    x: first.x - lead,
    y: first.y - lead,
    z: safeZ,
  });
  moves.push({
    kind: "cut",
    x: first.x - lead,
    y: first.y - lead,
    z,
    feed: tool.feed,
  });
  for (const point of ring) {
    moves.push({ kind: "cut", x: point.x, y: point.y, z, feed: tool.feed });
  }
  moves.push({ kind: "rapid", x: first.x, y: first.y, z: safeZ });
  return moves;
}

/**
 * One profile pass per ring at the requested depth. Bend lines are deliberately
 * not cut: they remain DXF annotation and are never emitted as feed moves.
 */
export function generateFlatPatternToolpath(
  document: CamDocument,
  pattern: CamFlatPattern,
  opts: {
    toolId?: string;
    depth?: number;
    leadIn?: number;
    name?: string;
  } = {},
): CamToolpath {
  const tool =
    document.tools.find((entry) => entry.id === opts.toolId) ??
    document.tools.find((entry) => entry.kind === "endmill") ??
    document.tools[0];
  if (!tool) {
    throw new CamError(
      "FLAT_PATTERN_TOOL",
      "Flat-pattern CAM needs an endmill in the local tool library.",
    );
  }
  const stock = stockBounds(document.stock);
  const depth = opts.depth ?? Math.max(0.1, document.stock.size.z);
  if (!(depth > 0)) {
    throw new CamError(
      "FLAT_PATTERN_DEPTH",
      "Flat-pattern cut depth must be greater than zero.",
    );
  }
  const lead = Math.max(0, opts.leadIn ?? 0);
  const safeZ = stock.max.z + tool.safeZ;
  const moves: CamMove[] = [];
  moves.push(
    ...ringPath(stock.max.z, depth, pattern.outline, tool, safeZ, lead),
  );
  for (const hole of pattern.holes) {
    moves.push(...ringPath(stock.max.z, depth, hole, tool, safeZ, lead));
  }
  if (moves.length === 0) {
    throw new CamError(
      "FLAT_PATTERN_EMPTY",
      "Flat pattern has no cut contours.",
    );
  }
  let cutLength = 0;
  let rapidLength = 0;
  for (let i = 1; i < moves.length; i++) {
    const previous = moves[i - 1]!;
    const current = moves[i]!;
    const distance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    );
    if (current.kind === "cut") cutLength += distance;
    else rapidLength += distance;
  }
  return {
    operationId: `flat_${pattern.source}`,
    operationName: opts.name ?? "Flat-pattern profile",
    toolId: tool.id,
    moves,
    cutLength,
    rapidLength,
    estimatedMinutes: tool.feed > 0 ? cutLength / tool.feed : Infinity,
  };
}

function line(
  layer: string,
  a: CamFlatPatternPoint,
  b: CamFlatPatternPoint,
): string {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    a.x.toFixed(6),
    "20",
    a.y.toFixed(6),
    "30",
    "0.0",
    "11",
    b.x.toFixed(6),
    "21",
    b.y.toFixed(6),
    "31",
    "0.0",
  ].join("\n");
}

function text(layer: string, at: CamFlatPatternPoint, value: string): string {
  return [
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    at.x.toFixed(6),
    "20",
    at.y.toFixed(6),
    "30",
    "0.0",
    "40",
    "2.5",
    "1",
    value.replace(/[\r\n]/g, " "),
  ].join("\n");
}

/**
 * ASCII DXF with cut and bend layers kept distinct. The layer names match
 * Phase 6 (`CUT`, `BEND_UP`, `BEND_DOWN`, `BEND`) so downstream nesting does
 * not lose which lines are cuts and which are bend annotations.
 */
export function flatPatternCamDxf(
  pattern: CamFlatPattern,
  opts: { title?: string; fileName?: string } = {},
): FlatPatternDxfResult {
  if (pattern.outline.length < 4) {
    throw new CamError(
      "FLAT_PATTERN_OUTLINE",
      "Flat pattern needs a closed outline with at least three points.",
    );
  }
  const lines: string[] = [];
  let cutEntities = 0;
  let bendEntities = 0;
  const rings = [pattern.outline, ...pattern.holes];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      lines.push(line("CUT", ring[i]!, ring[i + 1]!));
      cutEntities += 1;
    }
  }
  for (const bend of pattern.bends) {
    const layer =
      bend.direction === "up"
        ? "BEND_UP"
        : bend.direction === "down"
          ? "BEND_DOWN"
          : "BEND";
    lines.push(line(layer, bend.start, bend.end));
    bendEntities += 1;
    lines.push(
      text(
        layer,
        {
          x: (bend.start.x + bend.end.x) / 2,
          y: (bend.start.y + bend.end.y) / 2,
        },
        `${bend.angleDeg.toFixed(1)} deg ${bend.direction}`,
      ),
    );
  }
  if (opts.title?.trim())
    lines.push(text("ANNO", { x: 0, y: 0 }, opts.title.trim()));
  const units = pattern.units === "in" ? 1 : 4;
  const header = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "9",
    "$INSUNITS",
    "70",
    String(units),
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
  ];
  const dxf = [...header, ...lines, "0", "ENDSEC", "0", "EOF"].join("\n");
  const safe =
    (opts.fileName ?? pattern.source)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "flat-pattern";
  return {
    dxf,
    fileName: `${safe}-flat-pattern-${pattern.units}.dxf`,
    cutEntities,
    bendEntities,
  };
}
