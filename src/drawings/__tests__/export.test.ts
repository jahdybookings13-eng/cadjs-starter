import { readDwg, readDxf } from "nasjidwg";
import { describe, expect, it } from "vitest";
import {
  addDrawingSheet,
  drawingDxf,
  drawingPdf,
  drawingRender,
  drawingSvg,
  drawingSvgSheets,
  emptyDrawingTab,
  parseDrawingTab,
  serializeDrawingTab,
  type DrawingBody,
} from "../model";
import { drawingDwg, drawingDxfSheets } from "../dwg";
import type { BomRow } from "../../assemblies/bom";

const hiddenCube: DrawingBody = {
  id: "b1",
  name: "Cube",
  partNumber: "C-01",
  materialId: "steel",
  edges: [
    [
      { x: 2, y: 2, z: 0 },
      { x: 8, y: 2, z: 0 },
    ],
    [
      { x: 12, y: 2, z: 0 },
      { x: 14, y: 2, z: 0 },
    ],
  ],
  faces: [
    [
      { x: 0, y: 0, z: 5 },
      { x: 10, y: 0, z: 5 },
      { x: 0, y: 10, z: 5 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
      { x: 0, y: 10, z: 10 },
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
    qty: 1,
    depth: 0,
  },
];

describe("drawing exports and advanced views", () => {
  it("removes edges hidden behind projected faces and keeps visible ones", () => {
    const tab = emptyDrawingTab("part", "asm");
    const render = drawingRender(tab, [hiddenCube], []);
    const front = render.views.find((v) => v.id === "front")!;
    expect(front.hidden.length).toBeGreaterThan(0);
    expect(front.visible.length).toBeGreaterThan(0);
    expect(drawingSvg(tab, [hiddenCube], [])).not.toContain("DASHED");
  });

  it("generates a section cut from face/plane intersections", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      section: { axis: "z", offset: 5 },
    };
    const render = drawingRender(tab, [hiddenCube], []);
    const section = render.views.find((v) => v.id === "section")!;
    expect(section.visible.length).toBeGreaterThan(0);
    expect(section.label).toContain("SECTION A-A");
    expect(drawingSvg(tab, [hiddenCube], [])).toContain("SECTION A-A");
  });

  it("renders notes and balloons on the active sheet", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.notes = [{ id: "n1", sheet: 0, text: "DEBURR", x: 12, y: 12 }];
    tab.balloons = [{ id: "b1", sheet: 0, label: "1", x: 40, y: 40 }];
    const svg = drawingSvg(tab, [hiddenCube], bom);
    expect(svg).toContain('data-testid="drawing-notes"');
    expect(svg).toContain('data-testid="drawing-balloons"');
    expect(svg).toContain("DEBURR");
  });

  it("exports every sheet as SVG, DXF layouts, and DWG layouts", () => {
    let tab = emptyDrawingTab("part", "asm");
    tab = addDrawingSheet(tab);
    tab.sheet = { ...tab.sheet, title: "SECOND" };
    tab = {
      ...tab,
      sheets: [tab.sheets![0]!, tab.sheet],
    };
    const svg = drawingSvgSheets(tab, [hiddenCube], []);
    expect(svg).toContain("DRAWING");
    expect(svg).toContain("SECOND");
    expect(svg).toContain('data-sheet="1"');
    expect(svg).toContain('data-sheet="2"');

    const dxf = readDxf(drawingDxfSheets(tab, [hiddenCube], []));
    expect((dxf.layouts ?? []).map((layout) => layout.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Sheet 1"),
        expect.stringContaining("Sheet 2"),
      ]),
    );

    const dwg = readDwg(drawingDwg(tab, [hiddenCube], [], "R2018").data);
    expect((dwg.layouts ?? []).map((layout) => layout.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Sheet 1"),
        expect.stringContaining("Sheet 2"),
      ]),
    );
  });

  it("round-trips multiple sheets and exports every PDF page", () => {
    let tab = emptyDrawingTab("part", "asm");
    tab = addDrawingSheet(tab);
    tab.sheet = { ...tab.sheet, title: "SECOND" };
    tab = {
      ...tab,
      sheets: [tab.sheets![0]!, tab.sheet],
      notes: [{ id: "n2", sheet: 1, text: "SHEET 2", x: 10, y: 10 }],
    };
    const parsed = parseDrawingTab(serializeDrawingTab(tab));
    expect(parsed).toEqual(tab);
    const pdf = drawingPdf(tab, [hiddenCube], bom);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("%%EOF");
    expect(drawingSvg(tab, [hiddenCube], bom, 1)).toContain("SECOND");
  });

  it("renders detail and auxiliary views", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      detail: {
        label: "DETAIL A",
        parent: "front",
        centerX: 5,
        centerY: 5,
        radius: 12,
        scale: 2,
      },
      auxiliary: {
        label: "AUXILIARY B",
        direction: { x: 1, y: 0, z: 1 },
      },
    };
    const render = drawingRender(tab, [hiddenCube], []);
    expect(render.views.find((view) => view.id === "detail")).toBeDefined();
    expect(render.views.find((view) => view.id === "auxiliary")).toBeDefined();
    expect(drawingSvg(tab, [hiddenCube], [])).toContain("AUXILIARY B");
    expect(drawingSvg(tab, [hiddenCube], [])).toContain("DETAIL A");
  });

  it("anchors balloons and GD&T to projected body geometry", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.balloons = [
      { id: "b1", sheet: 0, label: "1", x: 1, y: 1, bodyId: "b1" },
    ];
    tab.gdt = [
      {
        id: "g1",
        sheet: 0,
        type: "position",
        x: 1,
        y: 1,
        characteristic: "position",
        tolerance: 0.1,
        bodyId: "b1",
      } as never,
    ];
    const svg = drawingSvg(tab, [hiddenCube], []);
    expect(svg).toContain('data-balloon-for="b1"');
    expect(svg).not.toContain('x="1" y="1"');
  });

  it("renders zones, templates, broken-out views, and weld symbols", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      template: "ANSI",
      showZones: true,
      brokenOut: {
        label: "BROKEN OUT",
        parent: "front",
        centerX: 5,
        centerY: 5,
        radius: 12,
        scale: 2,
      },
    };
    tab.gdt = [
      {
        id: "w1",
        sheet: 0,
        type: "weld",
        x: 20,
        y: 40,
        weldType: "fillet",
        weldSize: 4,
        weldLength: 20,
        weldPitch: 40,
        allAround: true,
      },
    ];
    const svg = drawingSvg(tab, [hiddenCube], []);
    expect(svg).toContain('data-testid="drawing-zones"');
    expect(svg).toContain("BROKEN OUT");
    expect(svg).toContain("WELD FILLET 4 L20 P40 ALL AROUND");
    expect(svg).toContain("ANSI");
    const parsed = parseDrawingTab(serializeDrawingTab(tab));
    expect(parsed?.sheet.template).toBe("ANSI");
    expect(parsed?.sheet.showZones).toBe(true);
    expect(parsed?.sheet.brokenOut?.label).toBe("BROKEN OUT");
    expect(parsed?.gdt?.[0]?.type).toBe("weld");
  });

  it("renders and exports GD&T annotations", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.gdt = [
      {
        id: "g1",
        sheet: 0,
        type: "feature-control",
        x: 20,
        y: 40,
        characteristic: "position",
        tolerance: 0.2,
        diameter: true,
        datums: ["A", "B"],
      },
      { id: "g2", sheet: 0, type: "datum", x: 20, y: 55, datum: "A" },
      { id: "g3", sheet: 0, type: "surface-finish", x: 20, y: 65, ra: 1.6 },
    ];
    const svg = drawingSvg(tab, [hiddenCube], []);
    expect(svg).toContain('data-testid="drawing-gdt"');
    expect(svg).toContain("POS");
    expect(svg).toContain("Ra 1.6");
    expect(drawingDxf(tab, [hiddenCube], [])).toContain("POS");
    expect(drawingPdf(tab, [hiddenCube], [])).toContain("POS");
  });

  it("writes ASCII DXF line entities for the active sheet", () => {
    const tab = emptyDrawingTab("part", "asm");
    const dxf = drawingDxf(tab, [hiddenCube], bom);
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("VISIBLE");
    expect(dxf).toContain("DWG-001");
    expect(dxf).toContain("EOF");
  });

  it.each([
    ["R2000", "AC1015"],
    ["R2004", "AC1018"],
    ["R2018", "AC1032"],
  ] as const)(
    "writes a real binary %s DWG that round-trips through its reader",
    (version, signature) => {
      const tab = emptyDrawingTab("part", "asm");
      tab.balloons = [{ id: "b1", sheet: 0, label: "1", x: 40, y: 40 }];
      const result = drawingDwg(tab, [hiddenCube], bom, version);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result.data.slice(0, 6))).toBe(signature);
      expect(result.version).toBe(version);
      expect(result.signature).toBe(signature);
      expect(result.warnings).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.downgraded).toEqual([]);

      const readBack = readDwg(result.data);
      expect(readBack.header.version).toBe(version);
      expect(readBack.layers.map((layer) => layer.name)).toEqual(
        expect.arrayContaining(["VISIBLE", "HIDDEN", "ANNOTATION"]),
      );
      const types = new Set(readBack.entities.map((entity) => entity.type));
      expect(types.has("line")).toBe(true);
      expect(types.has("text")).toBe(true);
      expect(types.has("polyline")).toBe(true);
      expect(types.has("circle")).toBe(true);
    },
  );
});
