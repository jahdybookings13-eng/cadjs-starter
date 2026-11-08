import { describe, expect, it } from "vitest";
import {
  drawingSvg,
  emptyDrawingTab,
  parseDrawingTab,
  serializeDrawingTab,
  sheetDimensions,
  viewBoxes,
  type DrawingBody,
} from "../model";
import type { BomRow } from "../../assemblies/bom";

const cube: DrawingBody = {
  id: "body-1",
  name: "Cube",
  partNumber: "C-01",
  materialId: "steel",
  edges: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 10, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
    ],
    [
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
  ],
};

const bom: BomRow[] = [
  {
    key: "part-1",
    name: "Cube",
    number: "C-01",
    description: "",
    materialId: "steel",
    qty: 2,
    depth: 0,
  },
];

describe("drawing model", () => {
  it("round-trips a Drawing tab payload and sheet settings", () => {
    const tab = emptyDrawingTab("tab_part", "tab_asm");
    tab.sheet = {
      ...tab.sheet,
      size: "A3",
      orientation: "portrait",
      title: "Housing & Cover",
      number: "D-42",
      scale: "1:2",
      showBom: false,
    };
    const parsed = parseDrawingTab(serializeDrawingTab(tab));
    expect(parsed).toEqual(tab);
    expect(sheetDimensions(tab.sheet)).toEqual({ width: 297, height: 420 });
  });

  it("renders standard views, title block and BOM into one SVG sheet", () => {
    const tab = emptyDrawingTab("tab_part", "tab_asm");
    tab.sheet = { ...tab.sheet, title: "Housing & Cover", number: "D-42" };
    const svg = drawingSvg(tab, [cube], bom);
    expect(svg).toContain('data-testid="drawing-sheet"');
    expect(svg).toContain("FRONT");
    expect(svg).toContain("TOP");
    expect(svg).toContain("RIGHT");
    expect(svg).toContain("ISOMETRIC");
    expect(svg).toContain("Housing &amp; Cover");
    expect(svg).toContain('data-testid="drawing-title-block"');
    expect(svg).toContain('data-testid="drawing-bom"');
    expect(svg).toContain("C-01");
  });

  it("omits the BOM when the sheet has it turned off", () => {
    const tab = emptyDrawingTab("tab_part", null);
    tab.sheet = { ...tab.sheet, showBom: false };
    expect(drawingSvg(tab, [cube], bom)).not.toContain(
      'data-testid="drawing-bom"',
    );
  });

  it("supports ISO A0-A2 sizes and first-angle view placement", () => {
    const tab = emptyDrawingTab("tab_part", null);
    tab.sheet = { ...tab.sheet, size: "A0" };
    expect(sheetDimensions(tab.sheet)).toEqual({ width: 1189, height: 841 });
    tab.sheet = { ...tab.sheet, size: "A1", orientation: "portrait" };
    expect(sheetDimensions(tab.sheet)).toEqual({ width: 594, height: 841 });
    const third = viewBoxes(297, 210, "third");
    const first = viewBoxes(297, 210, "first");
    expect(third.top.y).toBeLessThan(third.front.y);
    expect(third.right.x).toBeGreaterThan(third.front.x);
    expect(first.top.y).toBeGreaterThan(first.front.y);
    expect(first.right.x).toBeLessThan(first.front.x);
  });

  it("honours the NONE template and renders ordinate dimensions", () => {
    const tab = emptyDrawingTab("tab_part", null);
    tab.sheet = { ...tab.sheet, template: "NONE" };
    const bare = drawingSvg(tab, [cube], bom);
    expect(bare).toContain('data-template="NONE"');
    expect(bare).not.toContain('data-testid="drawing-title-block"');
    tab.sheet = { ...tab.sheet, template: "ISO" };
    tab.dimensions = [
      {
        id: "ord-1",
        sheet: 0,
        view: "front",
        axis: "horizontal",
        kind: "ordinate",
        bodyId: "body-1",
      },
    ];
    const svg = drawingSvg(tab, [cube], bom);
    expect(svg).toContain('data-dimension-kind="ordinate"');
    expect(svg).toContain('data-dimension="ord-1"');
  });
});
