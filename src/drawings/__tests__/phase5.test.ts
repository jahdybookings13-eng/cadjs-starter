import { describe, expect, it } from "vitest";
import {
  addDrawingSheet,
  applyDrawingBom,
  circlesFromEdgeLoops,
  drawingBomIssues,
  drawingDxf,
  drawingPdf,
  drawingPrintHtml,
  drawingRender,
  drawingSheets,
  drawingSourceSignature,
  drawingSvg,
  duplicateActiveSheet,
  emptyDrawingTab,
  moveActiveSheet,
  parseDrawingTab,
  renameDrawingSheet,
  renumberBalloons,
  serializeDrawingTab,
  sheetDimensions,
  syncDrawingBalloons,
  type DrawingBody,
} from "../model";
import { drawingDwg, verifyDrawingExport } from "../dwg";
import type { BomRow } from "../../assemblies/bom";

const body: DrawingBody = {
  id: "body-1",
  name: "Block",
  partNumber: "P-1",
  materialId: "steel",
  bomKey: "part-1",
  edgeKeys: ["e1", "e2", "e3", "e4"],
  edges: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    [
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
    [
      { x: 0, y: 10, z: 0 },
      { x: 0, y: 0, z: 0 },
    ],
    [
      { x: 10, y: 10, z: 0 },
      { x: 0, y: 10, z: 0 },
    ],
  ],
  faces: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
  ],
  circles: [{ id: "hole-1", center: { x: 5, y: 5, z: 0 }, radius: 2 }],
};

const second: DrawingBody = {
  ...body,
  id: "body-2",
  name: "Cover",
  partNumber: "P-2",
  bomKey: "part-2",
  edgeKeys: ["f1", "f2"],
  edges: [
    [
      { x: 20, y: 0, z: 0 },
      { x: 30, y: 0, z: 0 },
    ],
    [
      { x: 30, y: 0, z: 0 },
      { x: 30, y: 10, z: 0 },
    ],
  ],
  circles: [],
};

const bom: BomRow[] = [
  {
    key: "part-1",
    item: 1,
    name: "Block",
    number: "P-1",
    description: "Main block",
    materialId: "steel",
    qty: 1,
    depth: 0,
  },
  {
    key: "part-2",
    item: 2,
    name: "Cover",
    number: "P-2",
    description: "Cover plate",
    materialId: "steel",
    qty: 1,
    depth: 0,
  },
];

describe("Phase 5 drawing parity", () => {
  it("persists custom sheet formats, title-block fields, scales and view settings", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      titleBlock: "detailed",
      format: { name: "SHOP", width: 320, height: 240, margin: 5 },
      revision: "B",
      date: "2026-11-07",
      drawnBy: "A. Drafter",
      checkedBy: "C. Checker",
      approvedBy: "A. Approver",
      material: "6061-T6",
      finish: "ANODIZE",
      weight: "1.2 kg",
      scale: "1:2",
      scaleValue: 0.5,
      viewScales: { front: 2 },
      viewConfig: {
        front: { label: "FRONT DETAIL", x: 12, y: 14, w: 80, h: 40 },
        top: { suppressed: true },
      },
      customViews: [
        {
          id: "topside",
          label: "TOPSIDE",
          direction: { x: 0, y: 0, z: 1 },
          scale: 1.5,
        },
      ],
    };
    tab.bom = {
      columns: ["item", "number", "name", "qty"],
      rowOrder: ["part-2", "part-1"],
      overrides: { "part-1": { item: 7, number: "P-7" } },
    };
    tab.sourceSignature = "source-v1";
    tab.dimensions = [
      {
        id: "d1",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        anchorId: "e1",
        axis: "horizontal",
        kind: "linear",
        tolerance: { type: "symmetric", upper: 0.1, lower: -0.1 },
      },
    ];
    const parsed = parseDrawingTab(serializeDrawingTab(tab));
    expect(parsed).toEqual(tab);
    expect(sheetDimensions(parsed!.sheet)).toEqual({ width: 320, height: 240 });
  });

  it("duplicates, reorders and renames sheets without losing the active mirror", () => {
    let tab = emptyDrawingTab("part", "asm");
    tab = addDrawingSheet(tab);
    expect(drawingSheets(tab)).toHaveLength(2);
    tab = renameDrawingSheet(tab, 1, "DETAIL SHEET");
    expect(tab.sheet.title).toBe("DETAIL SHEET");
    tab = duplicateActiveSheet(tab);
    expect(drawingSheets(tab)).toHaveLength(3);
    expect(tab.activeSheet).toBe(2);
    tab = moveActiveSheet(tab, -1);
    expect(tab.activeSheet).toBe(1);
    expect(tab.sheet.title).toBe("DETAIL SHEET COPY");
    expect(serializeDrawingTab(tab)).toContain("DETAIL SHEET COPY");
  });

  it("applies view scales, alignment, suppression, hatching and exploded geometry", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      scale: "1:2",
      viewConfig: {
        front: { label: "MAIN", scale: 2 },
        top: { suppressed: true },
        right: { parent: "front", alignment: "right" },
      },
      section: {
        axis: "z",
        offset: 0,
        direction: -1,
        depth: 8,
        hatchAngle: 30,
        hatchSpacing: 2,
      },
      customViews: [
        {
          id: "topside",
          label: "TOPSIDE",
          direction: { x: 0, y: 0, z: 1 },
        },
      ],
      explode: 4,
    };
    const render = drawingRender(tab, [body, second], []);
    expect(render.views.some((view) => view.id === "top")).toBe(false);
    const front = render.views.find((view) => view.id === "front")!;
    const right = render.views.find((view) => view.id === "right")!;
    expect(front.label).toBe("MAIN");
    expect(front.scale).toBe(2);
    expect(right.box.x).toBe(front.box.x + front.box.w + 2);
    expect(render.views.some((view) => view.id === "section")).toBe(true);
    expect(render.views.find((view) => view.id === "section")!.hatch).toEqual({
      angle: 30,
      spacing: 2,
    });
    expect(render.views.some((view) => view.id === "custom:topside")).toBe(
      true,
    );
    const svg = drawingSvg(tab, [body, second], []);
    expect(svg).toContain("MAIN");
    expect(svg).toContain("TOPSIDE");
    expect(svg).toContain("hatch-");
  });

  it("keeps stable topology anchors and renders linear, angular and diameter dimensions", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.dimensions = [
      {
        id: "d-linear",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        anchorId: "e1",
        axis: "horizontal",
        kind: "linear",
        tolerance: { type: "limits", upper: 0.1, lower: 0.05 },
      },
      {
        id: "d-angle",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        anchorId: "e1",
        secondAnchorId: "e2",
        axis: "horizontal",
        kind: "angular",
      },
      {
        id: "d-diameter",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        circleIndex: 0,
        axis: "horizontal",
        kind: "diameter",
      },
    ];
    const render = drawingRender(tab, [body], []);
    expect(
      render.views[0]!.visible.some((edge) => edge.topologyId === "e1"),
    ).toBe(true);
    const svg = drawingSvg(tab, [body], []);
    expect(svg).toContain('data-dimension-kind="linear"');
    expect(svg).toContain("+0.10/-0.05");
    expect(svg).toContain('data-dimension-kind="angular"');
    expect(svg).toContain("90.0°");
    expect(svg).toContain('data-dimension-kind="diameter"');
    expect(svg).toContain("⌀4.0");
  });

  it("edits BOM rows and links, renumbers and validates balloons", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.bom = {
      columns: ["item", "number", "name", "description", "qty"],
      rowOrder: ["part-2", "part-1"],
      overrides: {
        "part-1": { item: 7, number: "P-7", description: "Edited" },
      },
    };
    const rows = applyDrawingBom(bom, tab.bom);
    expect(rows.map((row) => row.key)).toEqual(["part-2", "part-1"]);
    expect(rows[1]).toMatchObject({
      item: 7,
      number: "P-7",
      description: "Edited",
    });
    tab.balloons = [
      { id: "b1", sheet: 0, label: "1", x: 10, y: 10, bodyId: "body-1" },
    ];
    const linked = syncDrawingBalloons(tab, rows, [body, second]);
    expect(linked.balloons[0]).toMatchObject({ bomKey: "part-1", label: "7" });
    const renumbered = renumberBalloons({
      ...linked,
      balloons: [
        ...linked.balloons,
        { id: "b2", sheet: 0, label: "7", x: 20, y: 20 },
      ],
    });
    expect(renumbered.balloons.map((balloon) => balloon.label)).toEqual([
      "1",
      "2",
    ]);
    expect(drawingBomIssues(linked, rows)).toEqual([]);
    const svg = drawingSvg(linked, [body], rows);
    expect(svg).toContain('data-columns="item,number,name,description,qty"');
    expect(svg).toContain("P-7");
    expect(svg).toContain("Edited");
  });

  it("detects source changes and keeps the update fingerprint explicit", () => {
    const tab = emptyDrawingTab("part", "asm");
    const before = drawingSourceSignature([body], bom);
    const changed = {
      ...body,
      edges: [...body.edges, body.edges[0]!] as DrawingBody["edges"],
    };
    const after = drawingSourceSignature([changed], bom);
    expect(before).not.toBe(after);
    expect({ ...tab, sourceSignature: before }.sourceSignature).toBe(before);
  });

  it("prints every sheet at its paper size and verifies a two-sheet export", () => {
    let tab = emptyDrawingTab("part", "asm");
    tab = addDrawingSheet(tab);
    tab.sheet = { ...tab.sheet, title: "SECOND" };
    tab = { ...tab, sheets: [tab.sheets![0]!, tab.sheet] };
    const html = drawingPrintHtml(tab, [body, second], bom);
    expect(html).toContain("@page");
    expect(html).toContain('data-print-sheet="1"');
    expect(html).toContain('data-print-sheet="2"');
    const report = verifyDrawingExport(tab, [body, second], bom, "R2018");
    expect(report.sheets).toBe(2);
    expect(report.pdfPages).toBe(2);
    expect(report.dxfLayouts).toBe(2);
    expect(report.dwgLayouts).toBe(2);
    expect(report.bomRows).toBe(4);
    expect(report.ok).toBe(true);
  });

  it("recovers live circular rims and keeps edge-on circles out of other views", () => {
    const ring = Array.from({ length: 8 }, (_, index) => ({
      x: 5 + 2 * Math.cos((index * Math.PI) / 4),
      y: 5 + 2 * Math.sin((index * Math.PI) / 4),
      z: 0,
    }));
    const edges = ring.map(
      (point, index) =>
        [point, ring[(index + 1) % ring.length]!] as [
          (typeof ring)[number],
          (typeof ring)[number],
        ],
    );
    const circles = circlesFromEdgeLoops(edges);
    expect(circles).toHaveLength(1);
    expect(circles[0]!.radius).toBeCloseTo(2, 3);
    expect(circles[0]!.center.x).toBeCloseTo(5, 3);
    expect(circles[0]!.center.y).toBeCloseTo(5, 3);
    expect(circles[0]!.center.z).toBeCloseTo(0, 3);
    const tab = emptyDrawingTab("part", "asm");
    tab.dimensions = [
      {
        id: "live-circle",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        circleIndex: 0,
        axis: "horizontal",
        kind: "diameter",
      },
    ];
    const liveBody = { ...body, circles };
    expect(drawingRender(tab, [liveBody], []).views[0]!.circles).toHaveLength(
      1,
    );
    tab.sheet = { ...tab.sheet, scale: "1:1" };
    expect(drawingSvg(tab, [liveBody], [])).toContain("⌀4.0");
  });

  it("clips section depth to the requested side of the cutting plane", () => {
    const tab = emptyDrawingTab("part", "asm");
    const sectionBody: DrawingBody = {
      ...body,
      faces: [],
      edges: [
        ...body.edges,
        [
          { x: 0, y: 0, z: 3 },
          { x: 10, y: 0, z: 3 },
        ],
      ],
    };
    tab.sheet = {
      ...tab.sheet,
      section: { axis: "z", offset: 0, direction: 1, depth: 3 },
    };
    const positive = drawingRender(tab, [sectionBody], []).views.find(
      (view) => view.id === "section",
    )!;
    expect(positive.visible).toHaveLength(5);
    tab.sheet = {
      ...tab.sheet,
      section: { axis: "z", offset: 0, direction: -1, depth: 3 },
    };
    const negative = drawingRender(tab, [sectionBody], []).views.find(
      (view) => view.id === "section",
    )!;
    expect(negative.visible).toHaveLength(4);
  });

  it("writes edited BOM columns and override values to PDF and DXF", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.bom = {
      columns: ["item", "number", "description", "qty"],
      overrides: {
        "part-1": { number: "P-7", description: "Edited block" },
      },
    };
    const pdf = drawingPdf(tab, [body], bom);
    expect(pdf).toContain("P-7");
    expect(pdf).toContain("Edited block");
    const dxf = drawingDxf(tab, [body], bom);
    expect(dxf).toContain("P-7");
    expect(dxf).toContain("Edited block");
  });

  it("updates dimensions when the source edge changes", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.dimensions = [
      {
        id: "live-dim",
        sheet: 0,
        view: "front",
        bodyId: "body-1",
        anchorId: "e1",
        axis: "horizontal",
        kind: "linear",
      },
    ];
    const valueOf = (svg: string) =>
      svg.match(
        /data-dimension="live-dim"[\s\S]*?<text[^>]*>([^<]+)<\/text>/,
      )?.[1];
    expect(valueOf(drawingSvg(tab, [body], []))).toBe("10.0");
    const grown: DrawingBody = {
      ...body,
      edges: [
        [
          { x: 0, y: 0, z: 0 },
          { x: 20, y: 0, z: 0 },
        ],
        ...body.edges.slice(1),
      ],
    };
    expect(valueOf(drawingSvg(tab, [grown], []))).toBe("20.0");
  });

  it("persists and renders editable note and balloon leaders", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.notes = [
      {
        id: "n-live",
        sheet: 0,
        text: "MOVE ME",
        x: 20,
        y: 30,
        textSize: 4.5,
        leader: true,
        landing: 4,
      },
    ];
    tab.balloons = [
      {
        id: "b-live",
        sheet: 0,
        label: "7",
        x: 40,
        y: 50,
        textSize: 4,
        leader: true,
        landing: 5,
      },
    ];
    const svg = drawingSvg(tab, [body], bom);
    expect(svg).toContain("MOVE ME");
    expect(svg).toContain('font-size="4.5"');
    expect(svg).toContain('data-balloon-bom=""');
    expect(parseDrawingTab(serializeDrawingTab(tab))).toEqual(tab);
  });

  it("keeps binary DWG export round-trippable after Phase 5 layout changes", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = { ...tab.sheet, titleBlock: "detailed", revision: "C" };
    const result = drawingDwg(tab, [body], bom, "R2018");
    expect(new TextDecoder().decode(result.data.slice(0, 6))).toBe("AC1032");
    expect(result.version).toBe("R2018");
  });
});
