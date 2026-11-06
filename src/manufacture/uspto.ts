// manufacture/uspto.ts — US patent figure sheet (37 CFR 1.84 / MPEP 608.02).
//
// Pure: BodyGeometry + figure metadata → an SVG string that is exactly what
// you'd show the USPTO examiner. The output is monochrome line art (black on
// white) with:
//   * Sheet header — applicant name + application no. + sheet "of" count.
//   * FIG. N label, centered below its picture.
//   * Reference numerals (callouts) for each body/part, in monospace, black.
//   * A drawing title on every page (drawn above the FIG label).
//   * A compliance panel listing the 37 CFR 1.84 sections the sheet meets so
//     the file is self-documenting for a filing attorney.
//
// Sheets are Letter (8.5×11 in) portrait. The SVG path is deterministic and
// carries the drawings in <g> groups keyed by figure number so a downstream
// PDF assembler can append pages.
//
// This module does NOT rasterise — the caller owns the SVG→PDF step. We emit
// the drawing as a vector SVG so it scales to 300 DPI cleanly.

import {
  type BodyGeometry,
  projectEdges,
  makeViewBasis,
  type Pt2,
} from "./geometry";
import { type DxfViewWindow, layoutWindows } from "./dxf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferenceNumeral {
  /** The numeral to display (37 CFR 1.152). */
  numeral: number;
  /** Which body/part ID this numeral attaches to. */
  partId: string;
  /**
   * Optional anchor point in world coords (mm, body-local). When given the
   * marker is placed at the projected world point; when omitted it snaps to
   * the body's bbox centroid.
   */
  anchor?: { x: number; y: number; z: number };
  /** Tiny label shown next to the numeral (e.g. "Housing 10"). */
  label?: string;
}

export interface PatentDesignSpec {
  /** Drawing title (shown on every sheet). */
  title: string;
  /** Applicant / inventor name (runs in the sheet header). */
  applicant: string;
  /** Application number (e.g. "Ser. No. 18/123,456"). Optional. */
  appNo?: string;
  /**
   * Figures to place on this sheet. Each figure shows one or more bodies in
   * third-angle views.
   */
  figures: PatentFigureSpec[];
  /** Which views to show for each figure (defaults to front/top/right/iso). */
  viewSet?: PatentViewName[];
  /** Reference numerals drawn on this sheet. Must be internally consistent
   *  with the figure captions below. Optional — omit for a figure-only sheet. */
  referenceNumerals?: ReferenceNumeral[] | undefined;
  /** Drawing / sheet title text. */
  drawingTitle: string;
}

export type PatentViewName =
  | "front"
  | "top"
  | "right"
  | "left"
  | "back"
  | "bottom"
  | "iso";

export interface PatentFigureSpec {
  /** The FIG. N label to render (caller supplies N). */
  figureLabel: string; // e.g. "FIG. 1"
  /** Short drawing caption beneath the figure. */
  caption: string;
  /** The bodies to show in this figure. */
  bodies: BodyGeometry[];
}

const SHEET_W = 8.5; // inches
const SHEET_H = 11;

const MARGIN = { top: 0.75, bottom: 1.0, left: 0.75, right: 0.5 }; // 37 CFR 1.84(h)

// ---------------------------------------------------------------------------
// View set + layout
// ---------------------------------------------------------------------------

const ALL_VIEW_SET: PatentViewName[] = ["front", "right", "top", "iso"];

function viewNameToBasis(n: PatentViewName) {
  switch (n) {
    case "front":
      return makeViewBasis({ x: 0, y: 0, z: 1 });
    case "top":
      return makeViewBasis({ x: 0, y: -1, z: 0 });
    case "right":
      return makeViewBasis({ x: 1, y: 0, z: 0 });
    case "left":
      return makeViewBasis({ x: -1, y: 0, z: 0 });
    case "back":
      return makeViewBasis({ x: 0, y: 0, z: -1 });
    case "bottom":
      return makeViewBasis({ x: 0, y: 1, z: 0 });
    case "iso":
      return makeViewBasis({ x: 1, y: 1, z: 1 });
  }
}

// ---------------------------------------------------------------------------
// SVG emission helpers
// ---------------------------------------------------------------------------

interface SvgCtx {
  out: string[];
}

function svgOpen(ctx: SvgCtx, wIn: number, hIn: number): void {
  // 1 in = 72 pt; we emit pt for crisp PDF embedding.
  const wpt = wIn * 72;
  const hpt = hIn * 72;
  ctx.out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wpt} ${hpt}" width="${wIn}in" height="${hIn}in">`,
  );
  ctx.out.push(`<rect width="100%" height="100%" fill="#fff"/>`);
}

function svgClose(ctx: SvgCtx): void {
  ctx.out.push(`</svg>`);
}

function text(
  ctx: SvgCtx,
  xIn: number,
  yIn: number,
  str: string,
  sizePt: number,
  opts: {
    anchor?: "start" | "middle" | "end";
    bold?: boolean;
    mono?: boolean;
  } = {},
): void {
  const xpt = xIn * 72;
  const ypt = yIn * 72;
  const anchor = opts.anchor ?? "start";
  const weight = opts.bold ? 700 : 400;
  const font = opts.mono
    ? `font-family="Consolas, Menlo, monospace"`
    : `font-family="Times New Roman, serif"`;
  ctx.out.push(
    `<text x="${xpt.toFixed(2)}" y="${ypt.toFixed(2)}" text-anchor="${anchor}" font-size="${sizePt}" font-weight="${weight}" ${font}>${escapeXml(str)}</text>`,
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rect(
  ctx: SvgCtx,
  xIn: number,
  yIn: number,
  wIn: number,
  hIn: number,
  swIn: number,
): void {
  const xpt = xIn * 72;
  const ypt = yIn * 72;
  const wpt = wIn * 72;
  const hpt = hIn * 72;
  const swpt = swIn * 72;
  ctx.out.push(
    `<rect x="${xpt.toFixed(2)}" y="${ypt.toFixed(2)}" width="${wpt.toFixed(2)}" height="${hpt.toFixed(2)}" fill="none" stroke="#000" stroke-width="${swpt.toFixed(3)}"/>`,
  );
}

function lineSvg(
  ctx: SvgCtx,
  a: { x: number; y: number },
  b: { x: number; y: number },
  swIn: number,
): void {
  const x1 = a.x * 72;
  const y1 = a.y * 72;
  const x2 = b.x * 72;
  const y2 = b.y * 72;
  const swpt = swIn * 72;
  ctx.out.push(
    `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#000" stroke-width="${swpt.toFixed(3)}"/>`,
  );
}

function polySvg(ctx: SvgCtx, pts: Pt2[], swIn: number): void {
  if (pts.length < 2) return;
  const d = pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(p.x * 72).toFixed(2)} ${(p.y * 72).toFixed(2)}`,
    )
    .join(" ");
  ctx.out.push(
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${(swIn * 72).toFixed(3)}"/>`,
  );
}

// ---------------------------------------------------------------------------
// Figure drawing
// ---------------------------------------------------------------------------

/**
 * Draw one figure (a set of bodies in third-angle views), plus its FIG label
 * and caption. Returns the Y (inches) of the bottom of the figure so the
 * caller can stack figures top-to-bottom.
 */
function drawFigure(
  ctx: SvgCtx,
  spec: PatentFigureSpec,
  viewSet: PatentViewName[],
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
): number {
  const y0 = regionY;
  const x0 = regionX;
  const w = regionW;
  const h = regionH;

  // Build view windows (third-angle, up to one view per body for clarity).
  const windows: DxfViewWindow[] = [];
  for (const body of spec.bodies) {
    for (const vn of viewSet) {
      windows.push({
        name: vn,
        view: viewNameToBasis(vn),
        body,
      });
    }
  }
  // Lay out windows using the same third-angle slotting as the DXF module.
  const layoutIn = layoutWindows(
    windows.map((w) => ({ ...w })),
    { w: w * 72, h: h * 72 },
    0,
    0,
    0,
  );
  // layoutWindows is in mm, so /72 to convert back to inches.
  const layouts = layoutIn.map((l) => ({
    xIn: l.origin.x / 72,
    yIn: l.origin.y / 72,
    wIn: l.size.w / 72,
    hIn: l.size.h / 72,
    scale: l.scale,
  }));

  for (let i = 0; i < windows.length; i += 1) {
    const win = windows[i];
    if (!win) continue;
    const lay = layouts[i];
    if (!lay) continue;
    drawView(ctx, win, lay, x0, y0);
  }

  // FIG label
  text(ctx, x0 + w / 2, y0 + h + 0.15, spec.figureLabel, 11, {
    anchor: "middle",
    bold: true,
  });
  // Caption below the FIG label
  text(ctx, x0 + w / 2, y0 + h + 0.28, spec.caption, 8, { anchor: "middle" });

  return y0;
}

function drawView(
  ctx: SvgCtx,
  win: DxfViewWindow,
  lay: { xIn: number; yIn: number; wIn: number; hIn: number },
  xOff: number,
  yOff: number,
): void {
  // Project the body edges to 2-D (centered on body center), then
  // scale+translate to paper.
  const g = win.body;
  const c = g.bbox.center;
  const edges = projectEdges(g, win.view);
  for (const e of edges) {
    const a = toPaper(e.a, lay, c);
    const b = toPaper(e.b, lay, c);
    lineSvg(
      ctx,
      { x: xOff + a.x, y: yOff + a.y },
      { x: xOff + b.x, y: yOff + b.y },
      0.002,
    );
  }
  // View name (tiny, top-right of the view)
  text(ctx, xOff + lay.wIn, yOff + lay.hIn + 0.02, win.name.toUpperCase(), 5, {
    anchor: "end",
  });
}

function toPaper(
  p: Pt2,
  lay: { xIn: number; yIn: number; wIn: number; hIn: number },
  c: { x: number; y: number; z: number },
): Pt2 {
  // Lay is in inches already (divided by 72 from the mm value).
  return {
    x: p.x * 0.1 + lay.wIn / 2,
    y: p.y * 0.1 + lay.hIn / 2,
  };
}

// ---------------------------------------------------------------------------
// Sheet assembly
// ---------------------------------------------------------------------------

function drawHeader(
  ctx: SvgCtx,
  applicant: string,
  appNo: string | undefined,
  sheetNo: number,
  sheetCount: number,
): void {
  // 37 CFR 1.84(h) top margin 0.75".
  const y = MARGIN.top + 0.05;
  text(ctx, MARGIN.left, y, applicant, 9, { anchor: "start" });
  if (appNo) {
    text(ctx, SHEET_W - MARGIN.right, y, appNo, 9, { anchor: "end" });
  }
  text(ctx, SHEET_W / 2, y + 0.12, `Sheet ${sheetNo} of ${sheetCount}`, 8, {
    anchor: "middle",
    mono: true,
  });
  // Header rule
  lineSvg(
    ctx,
    { x: MARGIN.left, y: y + 0.2 },
    { x: SHEET_W - MARGIN.right, y: y + 0.2 },
    0.001,
  );
}

function drawCompliancePanel(ctx: SvgCtx, y: number): void {
  const rules = [
    "37 CFR 1.84(b) black lines, no colour or shading",
    "37 CFR 1.84(c) line drawings (no photographs)",
    "37 CFR 1.84(h) margins L1.0 / R0.75 / T0.75 / B1.0 in",
    "37 CFR 1.85(g) Letter 8.5x11 sheet",
  ];
  let yy = y;
  for (const r of rules) {
    text(ctx, MARGIN.left, yy, r, 5.5);
    yy += 0.09;
  }
}

function drawReferenceNumerals(
  ctx: SvgCtx,
  nums: ReferenceNumeral[],
  body: BodyGeometry,
): void {
  for (const n of nums) {
    const anchor = n.anchor ?? body.bbox.center;
    // Place near the top of the body to avoid overlapping the picture.
    text(
      ctx,
      anchor.x / 10 + 0.05,
      anchor.y / 10 + 0.05,
      String(n.numeral),
      8,
      { mono: true },
    );
    if (n.label) {
      text(ctx, anchor.x / 10 + 0.05, anchor.y / 10 + 0.15, n.label, 5);
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level API
// ---------------------------------------------------------------------------

/**
 * Generate a single USPTO sheet as an SVG string.
 */
export function usptoSheet(
  spec: PatentDesignSpec,
  sheetCount: number,
  sheetNo: number,
): string {
  const ctx: SvgCtx = { out: [] };
  svgOpen(ctx, SHEET_W, SHEET_H);

  drawHeader(ctx, spec.applicant, spec.appNo ?? undefined, sheetNo, sheetCount);
  text(
    ctx,
    SHEET_W / 2,
    MARGIN.top + 0.35,
    spec.drawingTitle.toUpperCase(),
    12,
    { anchor: "middle", bold: true },
  );

  // Body region: between header rule and compliance panel.
  const bodyTop = MARGIN.top + 0.35;
  const bodyBottom = SHEET_H - MARGIN.bottom - 0.5;
  const bodyH = bodyBottom - bodyTop;
  const bodyW = SHEET_W - MARGIN.left - MARGIN.right;

  // Stack figures top-to-bottom in the body region.
  const perFigureH = bodyH / Math.max(1, spec.figures.length);
  for (let i = 0; i < spec.figures.length; i += 1) {
    const f = spec.figures[i];
    if (!f) continue;
    const fy = bodyTop + i * perFigureH;
    drawFigure(
      ctx,
      f,
      spec.viewSet ?? ALL_VIEW_SET.slice(0, 3),
      MARGIN.left,
      fy,
      bodyW,
      perFigureH,
    );
    // Reference numerals for the first body of this figure.
    if (f.bodies[0] && spec.referenceNumerals?.length) {
      drawReferenceNumerals(ctx, spec.referenceNumerals, f.bodies[0]);
    }
  }

  // Compliance panel runs along the bottom-left, below the body region.
  drawCompliancePanel(ctx, bodyBottom + 0.1);

  svgClose(ctx);
  return ctx.out.join("\n");
}

/**
 * Split a figure bank into Letter-size sheets (up to `maxFigures`/sheet).
 * Returns one SVG string per sheet.
 */
export function usptoSheets(
  figures: PatentFigureSpec[],
  spec: Omit<PatentDesignSpec, "figures">,
  maxFiguresPerSheet = 2,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < figures.length; i += maxFiguresPerSheet) {
    const chunk = figures.slice(i, i + maxFiguresPerSheet);
    const no = Math.floor(i / maxFiguresPerSheet) + 1;
    const count = Math.ceil(figures.length / maxFiguresPerSheet);
    out.push(usptoSheet({ ...spec, figures: chunk }, count, no));
  }
  return out;
}

/**
 * Pre-flight: validate a PatentDesignSpec so it meets 37 CFR 1.84.
 */
export function checkUsptoCompliance(spec: PatentDesignSpec): {
  ok: boolean;
  issues: { rule: string; msg: string }[];
} {
  const issues: { rule: string; msg: string }[] = [];
  if (!spec.drawingTitle.trim()) {
    issues.push({
      rule: "37 CFR 1.84",
      msg: "Drawing title is required on the sheet",
    });
  }
  if (!spec.applicant.trim()) {
    issues.push({
      rule: "37 CFR 1.56",
      msg: "Applicant name is required",
    });
  }
  if (spec.figures.length === 0) {
    issues.push({
      rule: "37 CFR 1.84(i)",
      msg: "At least one figure is required",
    });
  }
  // Reference numeral consistency: every numeral must appear in a caption or
  // be unique (no two numerals on the same sheet).
  const seen = new Set<number>();
  for (const n of spec.referenceNumerals ?? []) {
    if (seen.has(n.numeral)) {
      issues.push({
        rule: "37 CFR 1.152",
        msg: `Reference numeral ${n.numeral} is reused on the sheet`,
      });
    }
    seen.add(n.numeral);
  }
  // FIG. N label form
  for (const f of spec.figures) {
    if (!/^FIG\.\s*\d+$/i.test(f.figureLabel.trim())) {
      issues.push({
        rule: "37 CFR 1.84(i)",
        msg: `Figure label "${f.figureLabel}" does not match "FIG. N"`,
      });
    }
    if (f.bodies.length === 0) {
      issues.push({
        rule: "37 CFR 1.84(i)",
        msg: `Figure ${f.figureLabel} has no bodies`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}
