// Manufacturing outputs: RS-274X Gerbers, Excellon drill, pick-and-place and
// BoM, zipped locally. No kernel, no network.
//
// Units are millimetres and the layer mapping is explicit in the README file
// and in `PcbFabFile.layer`. An empty copper layer, missing drill file or
// empty placement file is a named fabrication error, not a silent omission.

import { strToU8, zipSync } from "fflate";
import { buildBom } from "../flux/domains/pcb/rules";
import { bboxOfPoints } from "./geometry";
import { allPads, footprintOf, type PadPlacement } from "./layout";
import type { PcbFix, PcbLayer, PcbStudioDocument, Pt } from "./types";

export type FabFileKind = "gerber" | "drill" | "cpl" | "bom" | "readme";

export interface PcbFabFile {
  name: string;
  kind: FabFileKind;
  /** Layer mapping, spelled the way the fab house expects it. */
  layer?: string;
  content: string;
  bytes: number;
}

export interface PcbFabIssue {
  code: string;
  severity: "error" | "warning";
  layer?: string;
  msg: string;
  fix?: PcbFix;
}

export interface PcbFabStats {
  layers: number;
  pads: number;
  traces: number;
  vias: number;
  holes: number;
  components: number;
  bytes: number;
}

export interface PcbFabrication {
  ok: boolean;
  files: PcbFabFile[];
  zip: Uint8Array;
  issues: PcbFabIssue[];
  stats: PcbFabStats;
}

// ---------------------------------------------------------------------------
// RS-274X
// ---------------------------------------------------------------------------

function coord(mm: number): number {
  return Math.round(mm * 1_000_000);
}

function fmt(value: number, digits = 6): string {
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.?0+$/, "") || "0";
}

class GerberWriter {
  private lines: string[] = [];
  private apertures = new Map<string, number>();
  private next = 10;

  constructor(fileFunction: string) {
    this.lines.push(
      "%TF.GenerationSoftware,ScadStudio,PCB,2.0*%",
      `%TF.FileFunction,${fileFunction}*%`,
      "G04 ScadStudio PCB fabrication output*",
      "%FSLAX46Y46*%",
      "%MOMM*%",
      "%LPD*%",
      "G01*",
    );
  }

  private aperture(shape: string, params: string): number {
    const key = `${shape},${params}`;
    const existing = this.apertures.get(key);
    if (existing !== undefined) return existing;
    const code = this.next;
    this.next += 1;
    this.apertures.set(key, code);
    this.lines.push(`%ADD${code}${shape},${params}*%`);
    return code;
  }

  private select(code: number): void {
    this.lines.push(`D${code}*`);
  }

  flash(x: number, y: number, shape: "C" | "R" | "O", w: number, h = w): void {
    const params = shape === "C" ? fmt(w) : `${fmt(w)}X${fmt(h)}`;
    const code = this.aperture(shape, params);
    this.select(code);
    this.lines.push(`X${coord(x)}Y${coord(y)}D03*`);
  }

  draw(points: readonly Pt[], widthMM: number): void {
    if (points.length < 2) return;
    const code = this.aperture("C", fmt(widthMM));
    this.select(code);
    const first = points[0]!;
    this.lines.push(`X${coord(first.x)}Y${coord(first.y)}D02*`);
    for (const point of points.slice(1)) {
      this.lines.push(`X${coord(point.x)}Y${coord(point.y)}D01*`);
    }
  }

  region(points: readonly Pt[]): void {
    if (points.length < 3) return;
    this.lines.push("G36*");
    const first = points[0]!;
    this.lines.push(`X${coord(first.x)}Y${coord(first.y)}D02*`);
    for (const point of points.slice(1)) {
      this.lines.push(`X${coord(point.x)}Y${coord(point.y)}D01*`);
    }
    this.lines.push(`X${coord(first.x)}Y${coord(first.y)}D01*`);
    this.lines.push("G37*");
  }

  /** 5×7 block text, flashed as a tiny rectangle per lit pixel. */
  text(value: string, x: number, y: number, size = 0.18): void {
    const pitch = size;
    let cursor = x;
    for (const raw of value.toUpperCase()) {
      const glyph = FONT[raw];
      if (glyph) {
        for (let row = 0; row < 7; row += 1) {
          const bits = glyph[row] ?? 0;
          for (let col = 0; col < 5; col += 1) {
            if ((bits & (1 << (4 - col))) !== 0) {
              this.flash(
                cursor + col * pitch,
                y + (6 - row) * pitch,
                "R",
                pitch * 0.92,
                pitch * 0.92,
              );
            }
          }
        }
      }
      cursor += 6 * pitch;
    }
  }

  finish(): string {
    this.lines.push("M02*");
    return `${this.lines.join("\n")}\n`;
  }
}

const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  "6": [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  "-": [0, 0, 0, 0b11111, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b00110, 0b00110],
  " ": [0, 0, 0, 0, 0, 0, 0],
};

const LAYER_FILE_FUNCTION: Record<PcbLayer, string> = {
  top: "Copper,L1,Top",
  bottom: "Copper,L2,Bot",
  inner1: "Copper,L3,Inr",
  inner2: "Copper,L4,Inr",
};

const LAYER_NAMES: Record<PcbLayer, string> = {
  top: "Top copper",
  bottom: "Bottom copper",
  inner1: "Inner 1 copper",
  inner2: "Inner 2 copper",
};

function padLayers(pad: PadPlacement): PcbLayer[] {
  if (pad.layer === "both") return ["top", "bottom"];
  return [pad.layer];
}

function padShape(pad: PadPlacement): "C" | "R" | "O" {
  if (pad.shape === "round") return "C";
  if (pad.shape === "oval") return "O";
  return "R";
}

function subtractIntervals(
  parts: Array<[number, number]>,
  a: number,
  b: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [start, end] of parts) {
    if (b <= start || a >= end) {
      out.push([start, end]);
      continue;
    }
    if (a > start) out.push([start, Math.min(a, end)]);
    if (b < end) out.push([Math.max(b, start), end]);
  }
  return out;
}

/**
 * Raster-scan a pour polygon into horizontal copper strokes, subtracting every
 * foreign pad, trace, via and cutout with the pour clearance. This is real
 * copper geometry: the plane does not short to another net.
 */
function zoneScanSegments(
  doc: PcbStudioDocument,
  zone: PcbStudioDocument["zones"][number],
  pads: PadPlacement[],
): Array<[Pt, Pt]> {
  const bbox = bboxOfPoints(zone.points);
  if (bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY) return [];
  const step = 0.25;
  const stroke = 0.25;
  const edges = zone.points.map((point, index) => {
    const next = zone.points[(index + 1) % zone.points.length]!;
    return [point, next] as const;
  });
  const out: Array<[Pt, Pt]> = [];

  for (let y = bbox.minY + step / 2; y < bbox.maxY; y += step) {
    const xs: number[] = [];
    for (const [a, b] of edges) {
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    xs.sort((a, b) => a - b);
    let parts: Array<[number, number]> = [];
    for (let i = 0; i + 1 < xs.length; i += 2) parts.push([xs[i]!, xs[i + 1]!]);

    for (const pad of pads) {
      if (pad.net === zone.net) continue;
      if (!(pad.layer === "both" || pad.layer === zone.layer)) continue;
      const rx = pad.w / 2 + zone.clearanceMM + stroke / 2;
      const ry = pad.h / 2 + zone.clearanceMM + stroke / 2;
      if (y < pad.y - ry || y > pad.y + ry) continue;
      parts = subtractIntervals(parts, pad.x - rx, pad.x + rx);
    }

    for (const trace of doc.traces) {
      if (trace.layer !== zone.layer || trace.net === zone.net) continue;
      for (let i = 0; i + 1 < trace.points.length; i += 1) {
        const a = trace.points[i]!;
        const b = trace.points[i + 1]!;
        const pad = trace.widthMM / 2 + zone.clearanceMM + stroke / 2;
        if (y < Math.min(a.y, b.y) - pad || y > Math.max(a.y, b.y) + pad)
          continue;
        parts = subtractIntervals(
          parts,
          Math.min(a.x, b.x) - pad,
          Math.max(a.x, b.x) + pad,
        );
      }
    }

    for (const via of doc.vias) {
      if (via.net === zone.net) continue;
      const radius = via.padMM / 2 + zone.clearanceMM + stroke / 2;
      if (y < via.y - radius || y > via.y + radius) continue;
      parts = subtractIntervals(parts, via.x - radius, via.x + radius);
    }

    for (const cutout of doc.cutouts) {
      const cut = bboxOfPoints(cutout.points);
      if (y < cut.minY || y > cut.maxY) continue;
      parts = subtractIntervals(parts, cut.minX, cut.maxX);
    }

    for (const [start, end] of parts) {
      if (end - start <= stroke * 0.5) continue;
      out.push([
        { x: start + stroke / 2, y },
        { x: end - stroke / 2, y },
      ]);
    }
  }
  return out;
}

function copperLayer(
  doc: PcbStudioDocument,
  layer: PcbLayer,
  pads: PadPlacement[],
): { content: string; count: number } {
  const writer = new GerberWriter(LAYER_FILE_FUNCTION[layer]);
  let count = 0;
  for (const pad of pads) {
    if (!padLayers(pad).includes(layer)) continue;
    const rotation = ((pad.rotationDeg % 360) + 360) % 360;
    if (Math.abs(rotation % 90) < 1e-6) {
      const swap = Math.round(rotation / 90) % 2 === 1;
      writer.flash(
        pad.x,
        pad.y,
        padShape(pad),
        swap ? pad.h : pad.w,
        swap ? pad.w : pad.h,
      );
    } else {
      const hw = pad.w / 2;
      const hh = pad.h / 2;
      const r = (rotation * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      writer.region(
        [
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh },
        ].map((p) => ({
          x: pad.x + p.x * cos - p.y * sin,
          y: pad.y + p.x * sin + p.y * cos,
        })),
      );
    }
    count += 1;
  }
  for (const trace of doc.traces) {
    if (trace.layer !== layer) continue;
    writer.draw(trace.points, trace.widthMM);
    count += 1;
  }
  for (const zone of doc.zones) {
    if (zone.layer !== layer) continue;
    const segments = zoneScanSegments(doc, zone, pads);
    for (const [a, b] of segments) writer.draw([a, b], 0.25);
    count += segments.length;
  }
  return { content: writer.finish(), count };
}

function maskLayer(
  doc: PcbStudioDocument,
  layer: "top" | "bottom",
  pads: PadPlacement[],
): { content: string; count: number } {
  const writer = new GerberWriter(
    layer === "top" ? "Soldermask,Top" : "Soldermask,Bot",
  );
  let count = 0;
  for (const pad of pads) {
    if (!padLayers(pad).includes(layer)) continue;
    const rotation = ((pad.rotationDeg % 360) + 360) % 360;
    const swap = Math.round(rotation / 90) % 2 === 1;
    writer.flash(
      pad.x,
      pad.y,
      padShape(pad),
      (swap ? pad.h : pad.w) + 0.1,
      (swap ? pad.w : pad.h) + 0.1,
    );
    count += 1;
  }
  return { content: writer.finish(), count };
}

function silkLayer(
  doc: PcbStudioDocument,
  layer: "top" | "bottom",
): { content: string; count: number } {
  const writer = new GerberWriter(
    layer === "top" ? "Legend,Top" : "Legend,Bot",
  );
  let count = 0;
  if (layer === "top") {
    const walk = (
      node: import("../flux/domains/pcb/project").PcbNode,
    ): void => {
      if (node.kind === "element") {
        const part = footprintOf(doc, node);
        if (part) {
          const r = ((node.rotation % 360) + 360) % 360;
          const cos = Math.cos((r * Math.PI) / 180);
          const sin = Math.sin((r * Math.PI) / 180);
          const toBoard = (x: number, y: number): Pt => ({
            x: node.position.x + x * cos - y * sin,
            y: node.position.y + x * sin + y * cos,
          });
          for (const rect of part.silk) {
            const hw = rect.w / 2;
            const hh = rect.h / 2;
            writer.draw(
              [
                toBoard(rect.x - hw, rect.y - hh),
                toBoard(rect.x + hw, rect.y - hh),
                toBoard(rect.x + hw, rect.y + hh),
                toBoard(rect.x - hw, rect.y + hh),
                toBoard(rect.x - hw, rect.y - hh),
              ],
              0.15,
            );
            count += 1;
          }
          writer.text(
            node.designator,
            node.position.x - node.designator.length * 0.54,
            node.position.y + (part.heightMM / 2 + 0.9),
            0.16,
          );
          count += 1;
        }
      }
      if ("children" in node) for (const child of node.children) walk(child);
    };
    walk(doc.project.root);
  } else {
    // Bottom legend always identifies the board and revision, so the layer is
    // real output rather than an empty placeholder.
    writer.text(doc.name.toUpperCase().slice(0, 24), 2, 2, 0.2);
    writer.text("BOTTOM", 2, 4, 0.2);
    count += 2;
  }
  return { content: writer.finish(), count };
}

function outlineLayer(doc: PcbStudioDocument): {
  content: string;
  count: number;
} {
  const writer = new GerberWriter("Profile,NP");
  const w = doc.board.widthMM;
  const h = doc.board.heightMM;
  writer.draw(
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: 0 },
    ],
    0.1,
  );
  for (const cutout of doc.cutouts) {
    const points = [...cutout.points, cutout.points[0]!];
    writer.draw(points, 0.1);
  }
  return { content: writer.finish(), count: 1 + doc.cutouts.length };
}

function drillFile(
  doc: PcbStudioDocument,
  pads: PadPlacement[],
): {
  content: string;
  count: number;
} {
  const holes: Array<{ x: number; y: number; diameter: number }> = [];
  for (const pad of pads) {
    if (pad.drill === undefined) continue;
    holes.push({ x: pad.x, y: pad.y, diameter: pad.drill });
  }
  for (const via of doc.vias)
    holes.push({ x: via.x, y: via.y, diameter: via.drillMM });
  const tools = [...new Set(holes.map((hole) => hole.diameter))].sort(
    (a, b) => a - b,
  );
  const toolNumber = new Map(
    tools.map((diameter, index) => [diameter, index + 1]),
  );
  const lines = [
    "M48",
    ";TYPE=PLATED",
    ";FILE_FORMAT=4:4",
    "METRIC,TZ",
    ...tools.map(
      (diameter) => `T${toolNumber.get(diameter)}C${diameter.toFixed(4)}`,
    ),
    "%",
    "G90",
    "G05",
  ];
  for (const diameter of tools) {
    lines.push(`T${toolNumber.get(diameter)}`);
    for (const hole of holes) {
      if (Math.abs(hole.diameter - diameter) > 1e-9) continue;
      lines.push(`X${hole.x.toFixed(4)}Y${hole.y.toFixed(4)}`);
    }
  }
  lines.push("M30");
  return { content: `${lines.join("\n")}\n`, count: holes.length };
}

function csv(rows: Array<Array<string | number>>): string {
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${rows.map((row) => row.map(escape).join(",")).join("\n")}\n`;
}

function placementCsv(doc: PcbStudioDocument): {
  content: string;
  count: number;
} {
  const walk = (
    node: import("../flux/domains/pcb/project").PcbNode,
    rows: Array<Array<string | number>>,
  ): void => {
    if (node.kind === "element") {
      const part = footprintOf(doc, node);
      rows.push([
        node.designator,
        node.position.x.toFixed(3),
        node.position.y.toFixed(3),
        "top",
        (((node.rotation % 360) + 360) % 360).toFixed(1),
        part?.package ?? node.package ?? "",
      ]);
    }
    if ("children" in node)
      for (const child of node.children) walk(child, rows);
  };
  const rows: Array<Array<string | number>> = [
    ["Designator", "Mid X (mm)", "Mid Y (mm)", "Layer", "Rotation", "Package"],
  ];
  walk(doc.project.root, rows);
  return { content: csv(rows), count: rows.length - 1 };
}

function bomCsv(doc: PcbStudioDocument): { content: string; count: number } {
  const rows: Array<Array<string | number>> = [
    ["Designators", "Type", "Value", "MPN", "Qty", "Package"],
  ];
  for (const row of buildBom(doc.project)) {
    const first = row.designator[0];
    const element = first
      ? (() => {
          const walk = (
            node: import("../flux/domains/pcb/project").PcbNode,
          ): import("../flux/domains/pcb/project").PcbElement | null => {
            if (node.kind === "element" && node.designator === first)
              return node;
            if ("children" in node) {
              for (const child of node.children) {
                const hit = walk(child);
                if (hit) return hit;
              }
            }
            return null;
          };
          return walk(doc.project.root);
        })()
      : null;
    const part = element ? footprintOf(doc, element) : null;
    rows.push([
      row.designator.join(" "),
      row.type,
      row.value ?? "",
      row.mpn ?? "",
      row.qty,
      part?.package ?? element?.package ?? "",
    ]);
  }
  return { content: csv(rows), count: rows.length - 1 };
}

const README = (doc: PcbStudioDocument): string =>
  [
    `# ${doc.name} — fabrication package`,
    "",
    "Generated locally by ScadStudio PCB. Units: millimetres.",
    "Gerber: RS-274X, 4.6 mm coordinates, embedded apertures.",
    "Drill: Excellon, metric, trailing zeros, plated through holes.",
    "",
    "## Layer mapping",
    ...(doc.board.layers === 4
      ? [
          "- top-copper.gbr — L1 top",
          "- inner1-copper.gbr — L2 inner (GND plane)",
          "- inner2-copper.gbr — L3 inner (power plane)",
          "- bottom-copper.gbr — L4 bottom",
        ]
      : ["- top-copper.gbr — L1 top", "- bottom-copper.gbr — L2 bottom"]),
    "- top-mask.gbr / bottom-mask.gbr — solder mask openings",
    "- top-silk.gbr / bottom-silk.gbr — legend",
    "- board-outline.gbr — profile / cutouts (NP)",
    "- drill.drl — plated holes and vias",
    "- pick-and-place.csv — assembly placement (top side)",
    "- bom.csv — grouped bill of materials",
    "",
    `Board: ${doc.board.widthMM} × ${doc.board.heightMM} × ${doc.board.thicknessMM} mm`,
    `Layers: ${doc.board.layers}`,
    "",
  ].join("\n");

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export function buildFabrication(doc: PcbStudioDocument): PcbFabrication {
  const pads = allPads(doc);
  const issues: PcbFabIssue[] = [];
  const files: PcbFabFile[] = [];
  const add = (
    name: string,
    kind: FabFileKind,
    content: string,
    layer?: string,
  ): void => {
    files.push({
      name,
      kind,
      ...(layer ? { layer } : {}),
      content,
      bytes: strToU8(content).length,
    });
  };

  const copperLayers: PcbLayer[] =
    doc.board.layers === 4
      ? ["top", "inner1", "inner2", "bottom"]
      : ["top", "bottom"];
  for (const layer of copperLayers) {
    const built = copperLayer(doc, layer, pads);
    add(`${layer}-copper.gbr`, "gerber", built.content, LAYER_NAMES[layer]);
    if (built.count === 0) {
      issues.push({
        code: "FAB-EMPTY-LAYER",
        severity: "error",
        layer: LAYER_NAMES[layer],
        msg: `${LAYER_NAMES[layer]} has no pads, traces or pours`,
        fix: { kind: "board", id: layer },
      });
    }
  }

  for (const layer of ["top", "bottom"] as const) {
    const built = maskLayer(doc, layer, pads);
    add(`${layer}-mask.gbr`, "gerber", built.content, `Solder mask ${layer}`);
    if (built.count === 0) {
      issues.push({
        code: "FAB-EMPTY-LAYER",
        severity: "warning",
        layer: `Solder mask ${layer}`,
        msg: `${layer} solder mask has no openings`,
      });
    }
    const silk = silkLayer(doc, layer);
    add(`${layer}-silk.gbr`, "gerber", silk.content, `Legend ${layer}`);
    if (silk.count === 0) {
      issues.push({
        code: "FAB-EMPTY-LAYER",
        severity: "warning",
        layer: `Legend ${layer}`,
        msg: `${layer} silkscreen is empty`,
      });
    }
  }

  const outline = outlineLayer(doc);
  add("board-outline.gbr", "gerber", outline.content, "Profile");
  if (doc.board.widthMM < 5 || doc.board.heightMM < 5) {
    issues.push({
      code: "FAB-NO-OUTLINE",
      severity: "error",
      layer: "Profile",
      msg: `Board outline ${doc.board.widthMM}×${doc.board.heightMM} mm is invalid`,
      fix: { kind: "board", id: "board" },
    });
  }

  const drill = drillFile(doc, pads);
  add("drill.drl", "drill", drill.content, "Drill");
  if (drill.count === 0) {
    issues.push({
      code: "FAB-NO-HOLES",
      severity: "error",
      layer: "Drill",
      msg: "Drill file has no holes (add through-hole pads or vias)",
      fix: { kind: "board", id: "drill" },
    });
  }

  const cpl = placementCsv(doc);
  add("pick-and-place.csv", "cpl", cpl.content, "Top assembly");
  if (cpl.count === 0) {
    issues.push({
      code: "FAB-NO-PARTS",
      severity: "error",
      msg: "Pick-and-place file has no components",
      fix: { kind: "board", id: "placement" },
    });
  }

  const bom = bomCsv(doc);
  add("bom.csv", "bom", bom.content, "BOM");
  if (bom.count === 0) {
    issues.push({
      code: "FAB-EMPTY-BOM",
      severity: "error",
      msg: "Bill of materials is empty",
    });
  }

  add("README.txt", "readme", README(doc));

  // Pad / trace validity checks that would fail at the fab house.
  for (const pad of pads) {
    if (
      pad.x - pad.w / 2 < -0.001 ||
      pad.y - pad.h / 2 < -0.001 ||
      pad.x + pad.w / 2 > doc.board.widthMM + 0.001 ||
      pad.y + pad.h / 2 > doc.board.heightMM + 0.001
    ) {
      issues.push({
        code: "FAB-PAD-OFF-BOARD",
        severity: "error",
        msg: `Pad ${pad.designator}.${pad.pin} is outside the board`,
        fix: { kind: "element", id: pad.designator },
      });
    }
  }
  for (const trace of doc.traces) {
    if (trace.widthMM < doc.rules.minTraceMM - 1e-9) {
      issues.push({
        code: "FAB-TRACE-WIDTH",
        severity: "error",
        msg: `Trace on ${trace.net} is below the minimum width`,
        fix: { kind: "trace", id: trace.id },
      });
    }
  }

  const zip = zipSync(
    Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])),
    { level: 6 },
  );

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    files,
    zip,
    issues,
    stats: {
      layers: copperLayers.length,
      pads: pads.length,
      traces: doc.traces.length,
      vias: doc.vias.length,
      holes: drill.count,
      components: cpl.count,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    },
  };
}

export function fabIssueSummary(issues: readonly PcbFabIssue[]): {
  errors: number;
  warnings: number;
  ok: boolean;
} {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return { errors, warnings: issues.length - errors, ok: errors === 0 };
}
