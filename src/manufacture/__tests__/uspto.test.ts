import { describe, it, expect } from "vitest";
import {
  usptoSheet,
  usptoSheets,
  checkUsptoCompliance,
  type PatentDesignSpec,
  type PatentFigureSpec,
  type ReferenceNumeral,
} from "../uspto";
import { extractGeometry, type Pt3 } from "../geometry";

const V = (x: number, y: number, z: number): Pt3 => ({ x, y, z });
const BOX = {
  vertices: [
    V(0, 0, 0),
    V(20, 0, 0),
    V(20, 10, 0),
    V(0, 10, 0),
    V(0, 0, 8),
    V(20, 0, 8),
    V(20, 10, 8),
    V(0, 10, 8),
  ] as Pt3[],
  edges: [
    { start: V(0, 0, 0), end: V(20, 0, 0) },
    { start: V(20, 0, 0), end: V(20, 10, 0) },
    { start: V(20, 10, 0), end: V(0, 10, 0) },
    { start: V(0, 10, 0), end: V(0, 0, 0) },
    { start: V(0, 0, 8), end: V(20, 0, 8) },
    { start: V(20, 0, 8), end: V(20, 10, 8) },
    { start: V(20, 10, 8), end: V(0, 10, 8) },
    { start: V(0, 10, 8), end: V(0, 0, 8) },
    { start: V(0, 0, 0), end: V(0, 0, 8) },
    { start: V(20, 0, 0), end: V(20, 0, 8) },
    { start: V(20, 10, 0), end: V(20, 10, 8) },
    { start: V(0, 10, 0), end: V(0, 10, 8) },
  ],
  faces: [
    { vertices: [V(0, 0, 0), V(20, 0, 0), V(20, 10, 0), V(0, 10, 0)] },
    { vertices: [V(0, 0, 8), V(0, 10, 8), V(20, 10, 8), V(20, 0, 8)] },
    { vertices: [V(0, 0, 0), V(20, 0, 0), V(20, 0, 8), V(0, 0, 8)] },
    { vertices: [V(20, 10, 0), V(20, 10, 8), V(0, 10, 8), V(0, 10, 0)] },
    { vertices: [V(20, 0, 0), V(20, 10, 0), V(20, 10, 8), V(20, 0, 8)] },
    { vertices: [V(0, 0, 0), V(0, 0, 8), V(0, 10, 8), V(0, 10, 0)] },
  ],
};
const body = extractGeometry(BOX);

const figure: PatentFigureSpec = {
  figureLabel: "FIG. 1",
  caption: "Housing in perspective",
  bodies: [body],
};

const spec: Omit<PatentDesignSpec, "figures"> = {
  title: "Housing drawing",
  applicant: "Test Inventor",
  appNo: "Ser. No. 18/000,000",
  drawingTitle: "HOUSING DRAWING",
};

function fullSpec(nums?: ReferenceNumeral[]): PatentDesignSpec {
  return { ...spec, figures: [figure], referenceNumerals: nums };
}

describe("usptoSheet", () => {
  it("emits a Letter-size (8.5×11in) SVG", () => {
    const s = usptoSheet(fullSpec(), 1, 1);
    expect(s).toContain('width="8.5in"');
    expect(s).toContain('height="11in"');
    expect(s).toContain("<svg");
    expect(s).toContain("</svg>");
  });

  it("puts the applicant + sheet count in the header", () => {
    const s = usptoSheet(fullSpec(), 3, 1);
    expect(s).toContain("Test Inventor");
    expect(s).toContain("Sheet 1 of 3");
    expect(s).toContain("Ser. No. 18/000,000");
  });

  it("centers the drawing title", () => {
    const s = usptoSheet(fullSpec(), 1, 1);
    expect(s).toContain("HOUSING DRAWING");
    expect(s).toContain('text-anchor="middle"');
  });

  it("labels the figure with the FIG. N caption", () => {
    const s = usptoSheet(fullSpec(), 1, 1);
    expect(s).toContain("FIG. 1");
    expect(s).toContain("Housing in perspective");
  });

  it("draws one line element per projected edge per view (≥ 3 views × 12 edges)", () => {
    const s = usptoSheet(fullSpec(), 1, 1);
    const lines = (s.match(/<line /g) ?? []).length;
    expect(lines).toBeGreaterThanOrEqual(36);
  });

  it("draws reference numerals when supplied", () => {
    const s = usptoSheet(
      fullSpec([{ numeral: 10, partId: "housing", label: "Housing" }]),
      1,
      1,
    );
    expect(s).toContain(">10<");
    expect(s).toContain("Housing");
  });

  it("includes the CFR compliance panel", () => {
    const s = usptoSheet(fullSpec(), 1, 1);
    expect(s).toContain("37 CFR 1.84");
  });

  it("is deterministic", () => {
    const a = usptoSheet(fullSpec(), 1, 1);
    const b = usptoSheet(fullSpec(), 1, 1);
    expect(a).toBe(b);
  });
});

describe("usptoSheets", () => {
  it("chunks figures into sheets of maxFiguresPerSheet", () => {
    const figures = [
      figure,
      { ...figure, figureLabel: "FIG. 2" },
      { ...figure, figureLabel: "FIG. 3" },
    ];
    const sheets = usptoSheets(figures, spec, 2);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toContain("Sheet 1 of 2");
    expect(sheets[1]).toContain("Sheet 2 of 2");
  });

  it("one figure → one sheet", () => {
    const sheets = usptoSheets([figure], spec, 2);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain("Sheet 1 of 1");
  });
});

describe("checkUsptoCompliance", () => {
  it("passes a clean spec", () => {
    const r = checkUsptoCompliance(fullSpec());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("flags a missing drawing title", () => {
    const r = checkUsptoCompliance({ ...fullSpec(), drawingTitle: "  " });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.rule.includes("1.84"))).toBe(true);
  });

  it("flags a missing applicant", () => {
    const r = checkUsptoCompliance({ ...fullSpec(), applicant: "" });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.rule.includes("1.56"))).toBe(true);
  });

  it("flags a figure with no bodies", () => {
    const r = checkUsptoCompliance({
      ...fullSpec(),
      figures: [{ figureLabel: "FIG. 1", caption: "x", bodies: [] }],
    });
    expect(r.ok).toBe(false);
  });

  it("flags a malformed figure label", () => {
    const r = checkUsptoCompliance({
      ...fullSpec(),
      figures: [{ ...figure, figureLabel: "Figure One" }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.msg.includes("FIG. N"))).toBe(true);
  });

  it("allows 'fig. 2' lowercase form", () => {
    const r = checkUsptoCompliance({
      ...fullSpec(),
      figures: [{ ...figure, figureLabel: "fig. 2" }],
    });
    expect(r.ok).toBe(true);
  });

  it("flags a reused reference numeral", () => {
    const r = checkUsptoCompliance(
      fullSpec([
        { numeral: 10, partId: "a" },
        { numeral: 10, partId: "b" },
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.rule.includes("1.152"))).toBe(true);
  });

  it("flags zero figures", () => {
    const r = checkUsptoCompliance({
      title: "t",
      applicant: "a",
      drawingTitle: "d",
      figures: [],
    });
    expect(r.ok).toBe(false);
  });
});
