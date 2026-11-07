import { describe, expect, it } from "vitest";
import {
  getAvailableConstraints,
  getConstraintIcon,
  getConstraintLabel,
  type SketchArc,
  type SketchLine,
  type SketchPoint,
  type SketchPrimitive,
} from "@vitekk02/cadjs";

const point = (id: string, x: number, y: number): SketchPoint => ({
  id,
  type: "point",
  x,
  y,
});

const line = (id: string, p1Id: string, p2Id: string): SketchLine => ({
  id,
  type: "line",
  p1Id,
  p2Id,
});

const arc = (
  id: string,
  centerId: string,
  startId: string,
  endId: string,
  radius: number,
): SketchArc => ({
  id,
  type: "arc",
  centerId,
  startId,
  endId,
  radius,
});

const available = (selected: SketchPrimitive[], all: SketchPrimitive[]) =>
  getAvailableConstraints(
    selected.map((primitive) => primitive.id),
    all,
  );

describe("midpoint and symmetric constraint availability", () => {
  const p1 = point("p1", 0, 0);
  const p2 = point("p2", 2, 0);
  const axisPoint = point("axis", 1, 0);
  const axisLine = line("axis-line", "p1", "p2");

  it("offers midpoint for a point and a line", () => {
    expect(available([p1, axisLine], [p1, p2, axisLine])).toContain("midpoint");
  });

  it("offers symmetric for two points and a line", () => {
    expect(available([p1, p2, axisLine], [p1, p2, axisLine])).toContain(
      "symmetric",
    );
  });

  it("offers symmetric for three points", () => {
    expect(available([p1, p2, axisPoint], [p1, p2, axisPoint])).toContain(
      "symmetric",
    );
  });

  it("does not offer symmetric for a point and a line", () => {
    expect(available([p1, axisLine], [p1, p2, axisLine])).not.toContain(
      "symmetric",
    );
  });

  it("does not offer midpoint for two points", () => {
    expect(available([p1, p2], [p1, p2])).not.toContain("midpoint");
  });

  it("offers equal for two arcs", () => {
    const arcA = arc("arc-a", "center-a", "start-a", "end-a", 1);
    const arcB = arc("arc-b", "center-b", "start-b", "end-b", 1);
    expect(getAvailableConstraints(["arc-a", "arc-b"], [arcA, arcB])).toContain(
      "equal",
    );
  });

  it("has labels and icons for both constraints", () => {
    expect(getConstraintLabel("midpoint")).toBe("Midpoint");
    expect(getConstraintLabel("symmetric")).toBe("Symmetric");
    expect(getConstraintIcon("midpoint")).toBe("M");
    expect(getConstraintIcon("symmetric")).toBe("⇔");
  });
});
