import { describe, expect, it } from "vitest";
import {
  camFlatPatternFromPhase6,
  flatPatternCamDxf,
  generateFlatPatternToolpath,
} from "../flatPattern";
import {
  camStudioFromDesign,
  serializeCamDocument,
  validateCamDocument,
} from "../model";
import { sampleDocument } from "./fixtures";
import type { FlatPatternDrawing } from "../../model/phase6";

function drawing(units: "mm" | "in" = "mm"): FlatPatternDrawing {
  return {
    units,
    outline: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0 },
    ],
    holes: [
      [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
        { x: 10, y: 10 },
      ],
    ],
    bends: [
      {
        start: { x: 35, y: 2 },
        end: { x: 35, y: 48 },
        angleDeg: 90,
        direction: "up",
        id: "b1",
        flangeLengthMM: 20,
      },
      {
        start: { x: 55, y: 2 },
        end: { x: 55, y: 48 },
        angleDeg: 90,
        direction: "down",
        id: "b2",
        flangeLengthMM: 20,
      },
    ],
  };
}

describe("Phase 6 flat-pattern CAM", () => {
  it("converts the developed outline, holes and bend lines", () => {
    const pattern = camFlatPatternFromPhase6(drawing(), {
      source: "Enclosure",
    });
    expect(pattern.source).toBe("Enclosure");
    expect(pattern.units).toBe("mm");
    expect(pattern.outline).toHaveLength(5);
    expect(pattern.holes).toHaveLength(1);
    expect(pattern.bends).toHaveLength(2);
    expect(pattern.width).toBe(80);
    expect(pattern.height).toBe(50);
  });

  it("converts inch patterns into the CAM document unit", () => {
    const pattern = camFlatPatternFromPhase6(drawing("in"), {
      units: "mm",
    });
    expect(pattern.units).toBe("mm");
    expect(pattern.width).toBeCloseTo(80 * 25.4, 6);
    expect(pattern.bends[0]!.start.x).toBeCloseTo(35 * 25.4, 6);
  });

  it("cuts the outline and holes but never cuts bend lines", () => {
    const document = sampleDocument();
    const pattern = camFlatPatternFromPhase6(drawing());
    const path = generateFlatPatternToolpath(document, pattern, {
      depth: 4,
      leadIn: 1,
    });
    expect(path.moves.some((move) => move.kind === "cut")).toBe(true);
    expect(path.moves.at(-1)!.kind).toBe("rapid");
    expect(path.moves.at(-1)!.z).toBeGreaterThan(20);
    expect(path.cutLength).toBeGreaterThan(80 * 2 + 50 * 2);
    // A bend line at x=35 is not a cut contour; all cut X values come from the
    // outline (0/80) or the 10–20 mm hole.
    const cutXs = path.moves
      .filter((move) => move.kind === "cut")
      .map((move) => move.x);
    expect(cutXs).toContain(0);
    expect(cutXs).toContain(80);
    expect(cutXs).toContain(10);
    expect(cutXs).toContain(20);
    expect(cutXs).not.toContain(35);
    expect(cutXs).not.toContain(56);
  });

  it("writes distinct CUT, BEND_UP and BEND_DOWN layers", () => {
    const pattern = camFlatPatternFromPhase6(drawing());
    const result = flatPatternCamDxf(pattern, { title: "Enclosure" });
    expect(result.cutEntities).toBe(8);
    expect(result.bendEntities).toBe(2);
    expect(result.dxf).toContain("BEND_UP");
    expect(result.dxf).toContain("BEND_DOWN");
    expect(result.dxf).toContain("CUT");
    expect(result.dxf).toContain("Enclosure");
    expect(result.fileName).toMatch(/flat-pattern-mm\.dxf$/);
  });

  it("rejects open or invalid Phase 6 patterns", () => {
    const open = drawing();
    open.closed = false;
    expect(() => camFlatPatternFromPhase6(open)).toThrowError(/open/);
  });

  it("persists the flat pattern with the CAM document", () => {
    const document = sampleDocument();
    document.flatPattern = camFlatPatternFromPhase6(drawing());
    const parsed = camStudioFromDesign(serializeCamDocument(document));
    expect(parsed?.flatPattern?.bends).toHaveLength(2);
    expect(validateCamDocument(document)).toEqual([]);
  });
});
