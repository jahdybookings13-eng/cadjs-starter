import { describe, expect, it } from "vitest";
import { createSketchPlane, type Sketch } from "@vitekk02/cadjs";
import { analyzeSketch } from "../sketchAnalysis";

function sketch(primitives: Sketch["primitives"]): Sketch {
  return {
    id: "s",
    plane: createSketchPlane("XY"),
    primitives,
    constraints: [],
    dof: 0,
    status: "underconstrained",
  };
}

const point = (id: string, x: number, y: number) => ({
  id,
  type: "point" as const,
  x,
  y,
});
const line = (id: string, p1Id: string, p2Id: string) => ({
  id,
  type: "line" as const,
  p1Id,
  p2Id,
});

describe("analyzeSketch", () => {
  it("counts a closed rectangle as one closed profile", () => {
    const result = analyzeSketch(
      sketch([
        point("p1", 0, 0),
        point("p2", 2, 0),
        point("p3", 2, 1),
        point("p4", 0, 1),
        line("l1", "p1", "p2"),
        line("l2", "p2", "p3"),
        line("l3", "p3", "p4"),
        line("l4", "p4", "p1"),
      ]),
    );
    expect(result.closedProfiles).toBe(1);
    expect(result.openProfiles).toBe(0);
  });

  it("reports an open chain and crossing lines", () => {
    const result = analyzeSketch(
      sketch([
        point("a", 0, 0),
        point("b", 2, 2),
        point("c", 0, 2),
        point("d", 2, 0),
        point("e", 4, 0),
        line("l1", "a", "b"),
        line("l2", "c", "d"),
        line("l3", "d", "e"),
      ]),
    );
    expect(result.intersections).toBe(1);
    expect(result.openProfiles).toBeGreaterThan(0);
  });

  it("reports the tightest circle/arc curvature", () => {
    const result = analyzeSketch(
      sketch([
        point("c1", 0, 0),
        { id: "circle1", type: "circle", centerId: "c1", radius: 2 },
        point("c2", 5, 0),
        { id: "circle2", type: "circle", centerId: "c2", radius: 0.5 },
      ]),
    );
    expect(result.maxCurvature).toBeCloseTo(2);
  });
});
