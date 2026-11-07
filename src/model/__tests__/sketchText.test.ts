import { describe, expect, it } from "vitest";
import { sketchTextWidth, textToSketchPrimitives } from "../sketchText";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;

describe("textToSketchPrimitives", () => {
  it("emits one line per font stroke and folds lowercase", () => {
    const upper = textToSketchPrimitives("AB", { height: 6, generateId: id });
    const lower = textToSketchPrimitives("ab", { height: 6, generateId: id });
    expect(upper.lineCount).toBe(15);
    expect(lower.lineCount).toBe(15);
    expect(upper.width).toBeCloseTo(10);
    expect(lower.width).toBeCloseTo(10);
    expect(
      upper.primitives.every((primitive) => primitive.type === "line"),
    ).toBe(true);
  });

  it("scales height and supports text width", () => {
    expect(sketchTextWidth("A", 12)).toBeCloseTo(8);
    const result = textToSketchPrimitives("A", {
      height: 12,
      generateId: id,
    });
    const ys = result.points.map((point) => point.y);
    expect(Math.max(...ys)).toBeCloseTo(12);
    expect(Math.min(...ys)).toBeCloseTo(0);
  });

  it("advances newlines and blanks unsupported characters", () => {
    const result = textToSketchPrimitives("A\nB", {
      height: 6,
      generateId: id,
    });
    expect(result.lineCount).toBe(15);
    expect(result.height).toBeGreaterThan(10);
    const blank = textToSketchPrimitives("@", {
      height: 6,
      generateId: id,
    });
    expect(blank.primitives).toHaveLength(0);
  });
});
