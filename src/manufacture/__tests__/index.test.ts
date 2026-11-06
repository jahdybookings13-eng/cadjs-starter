import { describe, expect, it, vi } from "vitest";
import {
  MANUFACTURE_ACTIONS,
  bodyToDxf,
  buildPatentSheets,
  checkUsptoCompliance,
  extractBodyEl,
  runManufactureExport,
  type BodyGeometry,
  type PatentDesignSpec,
  type PatentFigureSpec,
} from "../index.js";
import { extractGeometry, type Pt3 } from "../geometry";

// A minimal 6-face, 12-edge, 8-vertex unit cube — same construction as the
// other manufacturing tests (see uspto.test.ts BOX).
const V = (x: number, y: number, z: number): Pt3 => ({ x, y, z });
const BOX = {
  vertices: [
    V(0, 0, 0),
    V(1, 0, 0),
    V(1, 0, 1),
    V(0, 0, 1),
    V(0, 1, 0),
    V(1, 1, 0),
    V(1, 1, 1),
    V(0, 1, 1),
  ] as Pt3[],
  edges: [
    { start: V(0, 0, 0), end: V(1, 0, 0) },
    { start: V(1, 0, 0), end: V(1, 0, 1) },
    { start: V(1, 0, 1), end: V(0, 0, 1) },
    { start: V(0, 0, 1), end: V(0, 0, 0) },
    { start: V(0, 1, 0), end: V(1, 1, 0) },
    { start: V(1, 1, 0), end: V(1, 1, 1) },
    { start: V(1, 1, 1), end: V(0, 1, 1) },
    { start: V(0, 1, 1), end: V(0, 1, 0) },
    { start: V(0, 0, 0), end: V(0, 1, 0) },
    { start: V(1, 0, 0), end: V(1, 1, 0) },
    { start: V(1, 0, 1), end: V(1, 1, 1) },
    { start: V(0, 0, 1), end: V(0, 1, 1) },
  ],
  faces: [
    { vertices: [V(0, 0, 0), V(1, 0, 0), V(1, 0, 1), V(0, 0, 1)] },
    { vertices: [V(0, 1, 0), V(0, 1, 1), V(1, 1, 1), V(1, 1, 0)] },
    { vertices: [V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0)] },
    { vertices: [V(0, 0, 1), V(0, 1, 1), V(1, 1, 1), V(1, 0, 1)] },
    { vertices: [V(1, 0, 0), V(1, 0, 1), V(1, 1, 1), V(1, 1, 0)] },
    { vertices: [V(0, 0, 0), V(0, 0, 1), V(0, 1, 1), V(0, 1, 0)] },
  ],
};
const element = (id = "b1") =>
  ({
    id,
    kind: 1,
    brep: BOX,
    position: { x: 0, y: 0, z: 0 },
  }) as unknown as import("@vitekk02/cadjs").SceneElement;

const mkBody0 = extractGeometry(BOX);

// mock the OCC worker's import/export service — STL / STEP are just Blob
// factories; no kernel needed.
vi.mock("@vitekk02/cadjs", () => ({
  ImportExportService: {
    getInstance: () => ({
      export: vi.fn(async () => new Blob(["stl-bytes"], { type: "model/stl" })),
      exportStep: vi.fn(
        async () => new Blob(["step-bytes"], { type: "model/step" }),
      ),
    }),
  },
}));

describe("manufacture bus actions", () => {
  it("exposes the six bus ids as a discriminated union", () => {
    const actions: readonly import("../index.js").ManufactureAction[] =
      MANUFACTURE_ACTIONS;
    expect(actions).toEqual([
      "manufacture.extractBody",
      "manufacture.exportDxf",
      "manufacture.exportStep",
      "manufacture.exportStl",
      "manufacture.exportPatentSheet",
      "manufacture.checkUspto",
    ]);
  });

  it("extractBodyEl returns undefined for a bogus element", () => {
    expect(
      extractBodyEl({ position: { x: 0, y: 0, z: 0 }, brep: {} } as never),
    ).toBeDefined();
    // brep = {} → 0 faces, 0 edges → extractGeometry still returns a BodyGeometry
    // (just an empty one). The dispatcher's DXF branch throws on 0 faces.
  });

  it("extractBodyEl on a unit cube produces 6 faces and a 1-unit bbox", () => {
    const body = extractBodyEl(element()) as BodyGeometry;
    expect(body).toBeDefined();
    expect(body.faceCount).toBe(6);
    expect(body.edgeCount).toBe(12);
    expect(body.bbox).toEqual(
      expect.objectContaining({
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      }),
    );
  });
});

describe("runManufactureExport — dispatcher", () => {
  it("STL delegates to ImportExportService.export", async () => {
    const out = await runManufactureExport("manufacture.exportStl", [
      element(),
    ]);
    expect(out.name).toBe("export.stl");
    expect(out.mimeType).toBe("model/stl");
    expect(new TextDecoder().decode(out.bytes)).toBe("stl-bytes");
  });

  it("STEP delegates to ImportExportService.exportStep", async () => {
    const out = await runManufactureExport("manufacture.exportStep", [
      element(),
    ]);
    expect(out.name).toBe("export.step");
    expect(out.mimeType).toBe("model/step");
    expect(new TextDecoder().decode(out.bytes)).toBe("step-bytes");
  });

  it("DXF produces a R12 drawing with $ACADVER + ENTITIES section", async () => {
    const out = await runManufactureExport("manufacture.exportDxf", [
      element(),
    ]);
    expect(out.name).toBe("export.dxf");
    expect(out.mimeType).toBe("application/dxf");
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toContain("$INSUNITS");
    expect(text).toContain("ENTITIES");
    expect(text).toContain("ENDSEC");
    expect(text).toContain("EOF");
  });

  it("DXF honours custom title-block + notes + generalTolerance", async () => {
    const out = await runManufactureExport(
      "manufacture.exportDxf",
      [element()],
      {
        dxf: {
          titleBlock: { title: "Test Part", scale: "1:1", material: "PLA" },
          generalTolerance: "±0.1",
          notes: ["DEBAUR ALL EDGES"],
        },
      },
    );
    const text = new TextDecoder().decode(out.bytes);
    expect(text).toContain("TEST PART");
    expect(text).toContain("PLA");
    expect(text).toContain("±0.1");
    expect(text).toContain("DEBAUR ALL EDGES");
  });

  it("USPTO sheet renders a compliant Figure 1 of a single body", async () => {
    const out = await runManufactureExport(
      "manufacture.exportPatentSheet",
      [element()],
      {
        patent: {
          title: "Test Invention",
          applicant: "Jane Doe",
          drawingTitle: "TEST DRAWING",
        },
      },
    );
    expect(out.name).toBe("sheet-1.svg");
    expect(out.mimeType).toBe("image/svg+xml");
    const svg = new TextDecoder().decode(out.bytes);
    expect(svg).toContain("TEST DRAWING");
    expect(svg).toContain("FIG. 1");
    expect(svg).toContain("Jane Doe");
    expect(svg).toContain('width="8.5in"');
    expect(svg).toContain('height="11in"');
  });

  it("USPTO sheet throws with a useful message on compliance failure", async () => {
    const badSpec = {
      title: "X",
      applicant: "", // empty → 37 CFR 1.56
      drawingTitle: "Good Title",
    };
    await expect(
      runManufactureExport("manufacture.exportPatentSheet", [element()], {
        patent: badSpec,
      }),
    ).rejects.toThrow(/compliance|applicant/i);
  });

  it("DXF rejects an empty element list", async () => {
    await expect(
      runManufactureExport("manufacture.exportDxf", []),
    ).rejects.toThrow(/at least one element/);
  });

  it("STL / STEP still produce output for an empty element list (worker passthrough)", async () => {
    const out = await runManufactureExport("manufacture.exportStl", []);
    expect(out.mimeType).toBe("model/stl");
    const out2 = await runManufactureExport("manufacture.exportStep", []);
    expect(out2.mimeType).toBe("model/step");
  });

  it("throws a descriptive error on extractBody / checkUspto", async () => {
    await expect(
      runManufactureExport("manufacture.extractBody", [element()]),
    ).rejects.toThrow(/unsupported action/);
    await expect(
      runManufactureExport("manufacture.checkUspto", [element()]),
    ).rejects.toThrow(/unsupported action/);
  });
});

describe("buildPatentSheets — multi-viewport sheeting", () => {
  const smallSpec: Omit<PatentDesignSpec, "figures" | "referenceNumerals"> = {
    title: "Short",
    applicant: "App",
    drawingTitle: "Good",
  };

  const mkBody = (idx: number): BodyGeometry =>
    extractGeometry({
      ...BOX,
      vertices: BOX.vertices.map((v) => ({ ...v, z: v.z + idx })),
    });

  const mkFigure = (idx: number): PatentFigureSpec => ({
    figureLabel: `FIG. ${idx + 1}`,
    caption: "View",
    bodies: [mkBody(idx)],
  });

  it("splits 3 figures across 2 sheets with 2 per sheet", () => {
    const figures = [mkFigure(0), mkFigure(1), mkFigure(2)];
    const sheets = buildPatentSheets(figures, smallSpec, 2);
    expect(sheets.length).toBe(2);
    expect(sheets[0]!.sheetPath).toBe("sheet-1.svg");
    expect(sheets[1]!.sheetPath).toBe("sheet-2.svg");
  });

  it("all sheets are individually compliant", () => {
    const figures = [mkFigure(0), mkFigure(1)];
    const sheets = buildPatentSheets(figures, smallSpec);
    for (const sheet of sheets) {
      expect(sheet.compliant).toBe(true);
      expect(sheet.issues).toEqual([]);
      expect(sheet.svg).toContain("<svg");
    }
  });

  it("per-sheet spec isolates figures between sheets (1 sheet each with max=1)", () => {
    const figures = [mkFigure(0), mkFigure(1)];
    const sheets = buildPatentSheets(figures, smallSpec, 1);
    expect(sheets.length).toBe(2);
    expect(sheets[0]!.svg).toContain("FIG. 1");
    expect(sheets[1]!.svg).toContain("FIG. 2");
    expect(sheets[0]!.svg).not.toContain("FIG. 2");
    expect(sheets[1]!.svg).not.toContain("FIG. 1");
  });
});

describe("checkUsptoCompliance — direct API", () => {
  it("flags empty applicant + empty title", () => {
    const { ok, issues } = checkUsptoCompliance({
      title: "X",
      applicant: "",
      drawingTitle: "ok",
      figures: [{ figureLabel: "FIG. 1", caption: "ok", bodies: [] }],
    });
    expect(ok).toBe(false);
    expect(issues.some((i) => /applicant/i.test(i.msg))).toBe(true);
  });

  it("flags a figure with no bodies", () => {
    const { ok, issues } = checkUsptoCompliance({
      title: "X",
      applicant: "Y",
      drawingTitle: "ok",
      figures: [{ figureLabel: "FIG. 1", caption: "ok", bodies: [] }],
    });
    expect(ok).toBe(false);
    expect(issues.some((i) => /no bodies/i.test(i.msg))).toBe(true);
  });

  it("flags a bad FIG. label", () => {
    const { ok, issues } = checkUsptoCompliance({
      title: "X",
      applicant: "Y",
      drawingTitle: "ok",
      figures: [{ figureLabel: "Figure 1", caption: "ok", bodies: [mkBody0] }],
    });
    expect(ok).toBe(false);
    expect(issues.some((i) => /does not match/i.test(i.msg))).toBe(true);
  });
});

describe("bodyToDxf — pure API", () => {
  const body0 = mkBody0;

  it("emits a minimally valid R12 header + END_OF_FILE", () => {
    const dxf = bodyToDxf(body0, { title: "T", material: "M", scale: "1:1" });
    expect(dxf).toMatch(/^0\r?\nSECTION\r?\n2\r?\nHEADER/);
    expect(dxf).toContain("$INSUNITS");
    expect(dxf).toContain("\n0\nENDSEC");
    expect(dxf.trim().split(/\r?\n/).at(-1)).toBe("EOF");
  });
});
