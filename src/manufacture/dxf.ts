// manufacture/dxf.ts — DXF R12 technical drawing generator.
//
// Pure function: a set of view windows (each a body + a third-angle view) → a
// full multi-view, fully-dimensioned drawing as an ASCII DXF R12 string.
//
// Conventions:
//   * Third-angle projection: FRONT top-left, TOP below FRONT, RIGHT to the
//     right of FRONT (ANSI Y14.3 / ISO 128-30).
//   * Each view sits in a window (origin + size + scale). The body is scaled
//     to fit 70% of its window so the geometry never touches the title block.
//   * Dimensions: extension lines, dimension line, closed arrowheads, and a
//     text label; per-view width/height dims of the projected bbox.
//   * Title block bottom-right: title, part no., material, units, scale, date,
//     sheet. A GD&T / general-notes block rides above it.
//
// Output is deterministic (no randomness) so it is testable and diffable.

import {
  type BodyGeometry,
  type Pt2,
  type ViewBasis,
  projectEdges,
} from "./geometry";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DxfViewWindow {
  /** View name (front/top/right/...) — used for the view label. */
  name: string;
  /** View basis (third-angle projection). */
  view: ViewBasis;
  /** World body the window shows. */
  body: BodyGeometry;
}

export interface DxfViewLayout {
  origin: { x: number; y: number };
  size: { w: number; h: number };
  scale: number;
}

export interface TitleBlock {
  title: string;
  partNo?: string;
  material?: string;
  units?: string;
  scale?: string;
  drawnBy?: string;
  date?: string;
  sheet?: string;
}

export interface DxfOptions {
  titleBlock: TitleBlock;
  windows: DxfViewWindow[];
  /** General notes / GD&T lines drawn above the title block. */
  notes?: string[];
  /** Tolerance callout (e.g. "±0.05"). Omit for none. */
  generalTolerance?: string;
}

// ---------------------------------------------------------------------------
// DXF primitives (R12 group codes)
// ---------------------------------------------------------------------------

type Lines = string[];

function push(dxf: Lines, pairs: [number, string | number][]): void {
  for (const [code, val] of pairs) {
    dxf.push(String(code));
    dxf.push(String(val));
  }
}

function line(dxf: Lines, a: Pt2, b: Pt2, layerName: string = "GEOM"): void {
  push(dxf, [
    [0, "LINE"],
    [8, layerName],
    [10, a.x],
    [20, a.y],
    [30, 0],
    [11, b.x],
    [21, b.y],
    [31, 0],
  ]);
}

function text(
  dxf: Lines,
  x: number,
  y: number,
  str: string,
  height: number,
  layerName = "ANNO",
  align: "left" | "center" | "right" = "left",
): void {
  const halign = align === "left" ? 0 : align === "center" ? 1 : 2;
  push(dxf, [
    [0, "TEXT"],
    [8, layerName],
    [10, x],
    [20, y],
    [30, 0],
    [40, height],
    [1, str],
    [72, halign],
    [11, x],
    [21, y],
  ]);
}

// Closed filled arrowhead.
function arrowhead(
  dxf: Lines,
  tip: Pt2,
  dir: Pt2, // unit, pointing into the tip
  size: number,
  layerName = "ANNO",
): void {
  void size;
  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const side = { x: -dir.y, y: dir.x };
  const w = size * 0.35;
  const p1 = { x: back.x + side.x * w, y: back.y + side.y * w };
  const p2 = { x: back.x - side.x * w, y: back.y - side.y * w };
  line(dxf, tip, p1, layerName);
  line(dxf, tip, p2, layerName);
}

// ---------------------------------------------------------------------------
// Dimension drawing
// ---------------------------------------------------------------------------

function dimension2D(
  dxf: Lines,
  a: Pt2,
  b: Pt2,
  offset: Pt2,
  value: number,
  textStr: string,
  textH = 2.0,
): void {
  const ext = 1.2;
  line(dxf, a, { x: a.x + offset.x * ext, y: a.y + offset.y * ext }, "ANNO");
  line(dxf, b, { x: b.x + offset.x * ext, y: b.y + offset.y * ext }, "ANNO");
  const l1 = { x: a.x + offset.x, y: a.y + offset.y };
  const l2 = { x: b.x + offset.x, y: b.y + offset.y };
  line(dxf, l1, l2, "ANNO");
  const ab = { x: l2.x - l1.x, y: l2.y - l1.y };
  const L = Math.hypot(ab.x, ab.y);
  if (L < 1e-6) return;
  const u = { x: ab.x / L, y: ab.y / L };
  arrowhead(dxf, l1, { x: u.x, y: u.y }, 2.5);
  arrowhead(dxf, l2, { x: -u.x, y: -u.y }, 2.5);
  const mid = { x: (l1.x + l2.x) / 2, y: (l1.y + l2.y) / 2 };
  const perp = { x: -u.y, y: u.x };
  text(
    dxf,
    mid.x + perp.x * textH * 0.6,
    mid.y + perp.y * textH * 0.6,
    textStr,
    textH,
    "ANNO",
    "center",
  );
}

// ---------------------------------------------------------------------------
// View rendering
// ---------------------------------------------------------------------------

interface RenderWindow extends DxfViewWindow {
  origin: { x: number; y: number };
  size: { w: number; h: number };
  scale: number;
}

function renderView(dxf: Lines, win: RenderWindow, textH: number): void {
  const { body, view, origin, size, scale } = win;
  const c = body.bbox.center;
  // World→paper: project to 2-D (centered on body center), then scale+translate.
  const toPaper = (p: Pt2): Pt2 => ({
    x: origin.x + (p.x + size.w / 2) * scale,
    y: origin.y + (p.y + size.h / 2) * scale,
  });

  const edges = projectEdges(body, view);
  for (const e of edges) {
    const a = toPaper(e.a);
    const b = toPaper(e.b);
    line(dxf, a, b, "GEOM");
  }

  // Width dim (bottom of window) and height dim (left of window) of the
  // projected bbox.
  dimension2D(
    dxf,
    { x: origin.x, y: origin.y },
    { x: origin.x + size.w, y: origin.y },
    { x: 0, y: -8 * scale },
    body.bbox.size.x,
    fmt(body.bbox.size.x),
    textH,
  );
  dimension2D(
    dxf,
    { x: origin.x, y: origin.y },
    { x: origin.x, y: origin.y + size.h },
    { x: -8 * scale, y: 0 },
    body.bbox.size.y,
    fmt(body.bbox.size.y),
    textH,
  );

  text(
    dxf,
    origin.x + size.w,
    origin.y + size.h + textH,
    viewLabel(win.name, size.w, size.h),
    textH * 0.9,
    "ANNO",
    "right",
  );
}

function viewLabel(name: string, w: number, h: number): string {
  return `${name.toUpperCase()} VIEW  (X${Math.round(w / 10)}Y${Math.round(
    h / 10,
  )})`;
}

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return `${r.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Title block
// ---------------------------------------------------------------------------

function titleBlock(
  dxf: Lines,
  tb: TitleBlock,
  x: number,
  y: number,
  w: number,
  h: number,
  textH: number,
): void {
  const bx = x;
  const by = y;
  line(dxf, { x: bx, y: by }, { x: bx + w, y: by }, "FRAME");
  line(dxf, { x: bx + w, y: by }, { x: bx + w, y: by + h }, "FRAME");
  line(dxf, { x: bx + w, y: by + h }, { x: bx, y: by + h }, "FRAME");
  line(dxf, { x: bx, y: by + h }, { x: bx, y: by }, "FRAME");
  line(
    dxf,
    { x: bx, y: by + h - h * 0.35 },
    { x: bx + w, y: by + h - h * 0.35 },
    "FRAME",
  );
  text(
    dxf,
    bx + w / 2,
    by + h - h * 0.52,
    tb.title.toUpperCase(),
    textH * 1.4,
    "ANNO",
    "center",
  );
  const rows: [string, string][] = [
    ["PART NO.", tb.partNo ?? "-"],
    ["MATERIAL", tb.material ?? "-"],
    ["UNITS", tb.units ?? "mm"],
    ["SCALE", tb.scale ?? "1:1"],
    ["DRAWN", tb.drawnBy ?? "-"],
    ["DATE", tb.date ?? isoDate()],
    ["SHEET", tb.sheet ?? "1 of 1"],
  ];
  const rowH = (h * 0.65) / rows.length;
  rows.forEach(([label, value], i) => {
    const ry = by + h - h * 0.35 - rowH * (i + 1);
    if (i > 0) {
      line(dxf, { x: bx, y: ry }, { x: bx + w, y: ry }, "FRAME");
    }
    text(
      dxf,
      bx + w * 0.02,
      ry + rowH * 0.18,
      label,
      textH * 0.7,
      "ANNO",
      "left",
    );
    text(
      dxf,
      bx + w * 0.45,
      ry + rowH * 0.18,
      value,
      textH * 0.7,
      "ANNO",
      "left",
    );
  });
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Notes / GD&T
// ---------------------------------------------------------------------------

function notesBlock(
  dxf: Lines,
  notes: string[],
  tol: string | undefined,
  x: number,
  y: number,
  textH: number,
): void {
  const lines: string[] = ["NOTES:"];
  if (tol) lines.push(`GENERAL TOLERANCE: ${tol} UNLESS OTHERWISE SPECIFIED.`);
  for (const n of notes) lines.push(n);
  lines.forEach((l, i) => {
    text(dxf, x, y - i * textH * 1.3, l, textH * 0.8, "ANNO", "left");
  });
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Third-angle layout of view windows on a sheet.
 *   Row 0: FRONT (left, col 0), RIGHT (right, col 1)
 *   Row 1: TOP (below FRONT, col 0)
 *
 * The layout is bounded: each window fits inside `[margin,
 * paper − margin] × [margin, paper − margin]` with room for the title block
 * (bottom-right) and the notes line above it. This is deterministic.
 */
export function layoutWindows(
  windows: DxfViewWindow[],
  paper: { w: number; h: number },
  margin: number,
  frameW: number,
  frameH: number,
): DxfViewLayout[] {
  if (windows.length === 0) return [];

  // Bounded drawing frame: inset by `margin` on all four sides, then reserve
  // the bottom-right title-block zone (frameW × frameH) + a notes line.
  const leftX = margin;
  const botY = margin;
  const topY = paper.h - margin;
  const rightX = paper.w - margin;
  // Reserved title-block strip across the bottom of the frame.
  const usableW = rightX - leftX;
  const usableH = topY - (botY + frameH + 12); // notes line + title block
  if (usableW <= 0 || usableH <= 0) return [];

  // Two columns (FRONT | RIGHT) by two rows (TOP below FRONT). Each slot is
  // half the usable area; the window is centered inside its slot.
  const colW = usableW / 2;
  const rowH = usableH / 2;
  const winW = Math.min(colW, 120);
  const winH = Math.min(rowH, 90);

  const windowOrigin = (col: number, row: number): { x: number; y: number } => {
    // Slot bottom-left, then center the (smaller) window inside the slot.
    const slotX = leftX + col * colW;
    const slotBotY = botY + frameH + 12 + row * rowH;
    return {
      x: slotX + (colW - winW) / 2,
      y: slotBotY + (rowH - winH) / 2,
    };
  };

  // Third-angle: FRONT top-left, RIGHT top-right, TOP bottom-left.
  const slotOf: [number, number][] = [
    [0, 1], // front
    [1, 1], // right
    [0, 0], // top
  ];

  return windows.slice(0, 3).map((w, i) => {
    const [col, row] = slotOf[i] ?? [0, 0];
    const origin = windowOrigin(col, row);
    return {
      origin: { x: origin.x, y: origin.y },
      size: { w: winW, h: winH },
      scale: scaleToFit(w.body, { w: winW, h: winH }),
    };
  });
}

/** Uniform scale so the body's larger projected dimension fits ~70% of the
 *  window while the origin/center alignment holds. */
function scaleToFit(
  body: BodyGeometry,
  size: { w: number; h: number },
): number {
  const bodyMax = Math.max(body.bbox.size.x, body.bbox.size.y, 1e-6);
  const pad = 0.3; // 70% of the window
  return bodyMax <= 0 ? 1 : (size.w * pad * 2) / bodyMax;
}

// ---------------------------------------------------------------------------
// Top-level API
// ---------------------------------------------------------------------------

/**
 * Generate a full multi-view DXF R12 drawing.
 * Paper: A4 landscape (297×210 mm). Deterministic output.
 */
export function generateDxf(opts: DxfOptions): string {
  const paper = { w: 297, h: 210 };
  const margin = 15;
  const textH = 3;
  const frameH = 30;
  const frameW = 130;
  const dxf: Lines = [];

  dxf.push("0", "SECTION", "2", "HEADER");
  dxf.push("9", "$INSUNITS", "70", "4");
  dxf.push("9", "$MEASUREMENT", "70", "1");
  dxf.push("0", "ENDSEC");

  dxf.push("0", "SECTION", "2", "TABLES");
  for (const [name, color, lt] of [
    ["0", 7, "CONTINUOUS"],
    ["GEOM", 7, "CONTINUOUS"],
    ["ANNO", 3, "CONTINUOUS"],
    ["FRAME", 8, "CONTINUOUS"],
  ] as [string, number, string][]) {
    push(dxf, [
      [0, "LAYER"],
      [2, name],
      [70, 0],
      [62, color],
      [6, lt],
      [370, -1],
    ]);
  }
  dxf.push("0", "ENDTAB");
  dxf.push("0", "ENDSEC");

  dxf.push("0", "SECTION", "2", "ENTITIES");

  line(
    dxf,
    { x: margin, y: margin },
    { x: paper.w - margin, y: margin },
    "FRAME",
  );
  line(
    dxf,
    { x: paper.w - margin, y: margin },
    { x: paper.w - margin, y: paper.h - margin },
    "FRAME",
  );
  line(
    dxf,
    { x: paper.w - margin, y: paper.h - margin },
    { x: margin, y: paper.h - margin },
    "FRAME",
  );
  line(
    dxf,
    { x: margin, y: paper.h - margin },
    { x: margin, y: margin },
    "FRAME",
  );

  const layouts = layoutWindows(opts.windows, paper, margin, frameW, frameH);
  for (let i = 0; i < opts.windows.length; i += 1) {
    const win = opts.windows[i];
    if (!win) continue;
    const lay = layouts[i];
    if (!lay) continue;
    renderView(dxf, { ...win, ...lay }, textH);
  }

  titleBlock(
    dxf,
    opts.titleBlock,
    paper.w - margin - frameW,
    margin,
    frameW,
    frameH,
    textH,
  );

  notesBlock(
    dxf,
    opts.notes ?? [],
    opts.generalTolerance,
    paper.w - margin - frameW,
    margin + frameH + 6,
    textH,
  );

  dxf.push("0", "ENDSEC", "0", "EOF");
  return dxf.join("\n");
}
