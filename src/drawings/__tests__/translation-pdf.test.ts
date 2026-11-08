import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drawingPdf, emptyDrawingTab, type DrawingBody } from "../model";

const body: DrawingBody = {
  id: "b1",
  name: "Bracket",
  partNumber: "B-01",
  materialId: "steel",
  edges: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    [
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
    ],
  ],
  faces: [],
};

describe("vector PDF translation", () => {
  it("uses the requested A3 landscape sheet size in PDF points", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = {
      ...tab.sheet,
      size: "A3",
      orientation: "landscape",
      title: "BRACKET",
    };
    const pdf = drawingPdf(tab, [body], []);
    mkdirSync("src/translation/fixtures", { recursive: true });
    writeFileSync("src/translation/fixtures/ansi-a-drawing.pdf", pdf);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    // A3 landscape is 420 x 297 mm. PDF units are 72 pt/in.
    expect(pdf).toContain("/MediaBox [0 0 1190.551 841.890]");
    expect(pdf).not.toContain("/Subtype /Image");
  });

  it("emits vector strokes, line weights, text and page units", () => {
    const tab = emptyDrawingTab("part", "asm");
    tab.sheet = { ...tab.sheet, title: "VECTOR TITLE" };
    const pdf = drawingPdf(tab, [body], []);
    expect(pdf).toContain("0.5 w");
    expect(pdf).toContain(" m ");
    expect(pdf).toContain(" l S");
    expect(pdf).toContain("BT /F1");
    expect(pdf).toContain("VECTOR TITLE");
    expect(pdf).toContain("%%EOF");
  });
});
