import { describe, it, expect } from "vitest";
import {
  generateDxf,
  layoutWindows,
  type DxfViewWindow,
  type DxfOptions,
} from "../dxf";
import { extractGeometry, makeViewBasis, type Pt3 } from "../geometry";

const V = (x: number, y: number, z: number): Pt3 => ({ x, y, z });
const [b0, b1, b2, b3, b4, b5, b6, b7] = [
  V(0, 0, 0),
  V(10, 0, 0),
  V(10, 5, 0),
  V(0, 5, 0),
  V(0, 0, 4),
  V(10, 0, 4),
  V(10, 5, 4),
  V(0, 5, 4),
];
const BOX_EDGES: { start: Pt3; end: Pt3 }[] = [
  { start: b0, end: b1 },
  { start: b1, end: b2 },
  { start: b2, end: b3 },
  { start: b3, end: b0 },
  { start: b4, end: b5 },
  { start: b5, end: b6 },
  { start: b6, end: b7 },
  { start: b7, end: b4 },
  { start: b0, end: b4 },
  { start: b1, end: b5 },
  { start: b2, end: b6 },
  { start: b3, end: b7 },
];
const BOX_FACES: { vertices: Pt3[] }[] = [
  { vertices: [b0, b1, b2, b3] },
  { vertices: [b4, b7, b6, b5] },
  { vertices: [b0, b1, b5, b4] },
  { vertices: [b2, b6, b7, b3] },
  { vertices: [b1, b2, b6, b5] },
  { vertices: [b0, b4, b7, b3] },
];
const body = extractGeometry({
  vertices: [b0, b1, b2, b3, b4, b5, b6, b7],
  edges: BOX_EDGES,
  faces: BOX_FACES,
});

function windows(): DxfViewWindow[] {
  return [
    { name: "front", view: makeViewBasis({ x: 0, y: 0, z: 1 }), body },
    { name: "top", view: makeViewBasis({ x: 0, y: -1, z: 0 }), body },
    { name: "right", view: makeViewBasis({ x: 1, y: 0, z: 0 }), body },
  ];
}

function opts(): DxfOptions {
  return {
    titleBlock: { title: "Test Part", partNo: "TP-1" },
    windows: windows(),
  };
}

describe("layoutWindows", () => {
  it("lays out 3 windows with origins inside the sheet", () => {
    const layouts = layoutWindows(windows(), { w: 297, h: 210 }, 15, 130, 30);
    expect(layouts).toHaveLength(3);
    for (const l of layouts) {
      expect(l.origin.x).toBeGreaterThanOrEqual(0);
      expect(l.origin.x).toBeLessThan(297);
      expect(l.origin.y).toBeGreaterThanOrEqual(0);
      expect(l.origin.y).toBeLessThan(210);
      expect(l.size.w).toBeGreaterThan(0);
      expect(l.size.h).toBeGreaterThan(0);
      expect(l.scale).toBeGreaterThan(0);
    }
  });

  it("returns empty for an empty window list", () => {
    expect(layoutWindows([], { w: 297, h: 210 }, 15, 130, 30)).toEqual([]);
  });
});

describe("generateDxf", () => {
  it("emits a valid DXF R12 skeleton", () => {
    const s = generateDxf(opts());
    expect(s).toContain("SECTION");
    expect(s).toContain("HEADER");
    expect(s).toContain("TABLES");
    expect(s).toContain("ENTITIES");
    expect(s).toContain("EOF");
    // MM units
    expect(s).toContain("$INSUNITS");
    expect(s).toContain("$MEASUREMENT");
  });

  it("declares the GEOM/ANNO/FRAME layers", () => {
    const s = generateDxf(opts());
    expect(s).toContain("GEOM");
    expect(s).toContain("ANNO");
    expect(s).toContain("FRAME");
  });

  it("writes one LINE per projected edge in each view (12×3)", () => {
    const s = generateDxf(opts());
    const lineCount = (s.match(/^0\nLINE$/gm) ?? []).length;
    // 3 views × 12 edges = 36 geometry lines, plus frame/dim/arrow lines.
    expect(lineCount).toBeGreaterThanOrEqual(36);
  });

  it("wires the title block fields into the output", () => {
    const s = generateDxf(opts());
    expect(s).toContain("TEST PART");
    expect(s).toContain("TP-1");
    expect(s).toContain("PART NO.");
  });

  it("includes view labels", () => {
    const s = generateDxf(opts());
    expect(s).toContain("FRONT VIEW");
    expect(s).toContain("TOP VIEW");
    expect(s).toContain("RIGHT VIEW");
  });

  it("includes dimension text (the 10mm width)", () => {
    const s = generateDxf(opts());
    expect(s).toContain("10.00");
  });

  it("is deterministic across calls", () => {
    const a = generateDxf(opts());
    const b = generateDxf(opts());
    expect(a).toBe(b);
  });

  it("handles a single window and no notes/tolerance", () => {
    const s = generateDxf({
      titleBlock: { title: "Solo" },
      windows: [windows()[0]!],
    });
    expect(s).toContain("SOLO");
    expect(s).toContain("EOF");
  });

  it("renders general tolerance into the notes block", () => {
    const s = generateDxf({
      titleBlock: { title: "Tol" },
      windows: windows(),
      generalTolerance: "±0.05",
      notes: ["Burr free."],
    });
    expect(s).toContain("GENERAL TOLERANCE:");
    expect(s).toContain("Burr free.");
  });
});
