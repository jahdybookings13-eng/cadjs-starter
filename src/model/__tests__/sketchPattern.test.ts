import { describe, expect, it } from "vitest";
import {
  createSketchPlane,
  type Sketch,
  type SketchLine,
  type SketchPoint,
} from "@vitekk02/cadjs";
import { linearPatternSelected } from "../sketchPattern";
import {
  circularPatternSelected,
  pathPatternSelected,
} from "../sketchTransform";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;

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

function sketchWith(primitives: Sketch["primitives"]): Sketch {
  return {
    id: "sketch",
    plane: createSketchPlane("XY"),
    primitives,
    constraints: [],
    dof: 0,
    status: "underconstrained",
  };
}

describe("linearPatternSelected", () => {
  it("creates count - 1 independent line copies at the spacing", () => {
    const result = linearPatternSelected(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["l"],
      3,
      5,
      0,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(4);
    expect(result.primitives).toHaveLength(2);
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [5, 0],
      [7, 0],
      [10, 0],
      [12, 0],
    ]);
  });

  it("supports two-dimensional spacing", () => {
    const result = linearPatternSelected(
      sketchWith([point("a", 0, 0)]),
      ["a"],
      4,
      2,
      -1,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [2, -1],
      [4, -2],
      [6, -3],
    ]);
  });

  it("creates circular copies around the selection centre", () => {
    const result = circularPatternSelected(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["l"],
      4,
      Math.PI * 2,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(6);
    expect(result.primitives).toHaveLength(3);
    expect(result.points[0]!.x).toBeCloseTo(1);
    expect(result.points[0]!.y).toBeCloseTo(-1);
  });

  it("refuses invalid circular counts and zero angles", () => {
    const sketch = sketchWith([point("a", 0, 0)]);
    expect(circularPatternSelected(sketch, ["a"], 1, 360, id).ok).toBe(false);
    expect(circularPatternSelected(sketch, ["a"], 4, 0, id).ok).toBe(false);
  });

  it("refuses invalid counts and zero spacing", () => {
    const sketch = sketchWith([point("a", 0, 0)]);
    expect(linearPatternSelected(sketch, ["a"], 1, 1, 0, id).ok).toBe(false);
    expect(linearPatternSelected(sketch, ["a"], 3, 0, 0, id).ok).toBe(false);
    expect(linearPatternSelected(sketch, ["a"], 51, 1, 0, id).ok).toBe(false);
  });
});

describe("pathPatternSelected", () => {
  it("copies geometry at even stations along an open line path", () => {
    const result = pathPatternSelected(
      sketchWith([
        point("a", 0, 0),
        point("b", 2, 0),
        point("path-a", 0, 0),
        point("path-b", 10, 0),
        line("shape", "a", "b"),
        line("path", "path-a", "path-b"),
      ]),
      ["shape", "path"],
      { count: 3, pathId: "path", align: false },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(4);
    expect(result.primitives).toHaveLength(2);
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [-1, 0],
      [1, 0],
      [4, 0],
      [6, 0],
    ]);
  });

  it("aligns copies to the path tangent", () => {
    const result = pathPatternSelected(
      sketchWith([
        point("a", 0, 0),
        point("b", 2, 0),
        point("path-a", 0, 0),
        point("path-b", 0, 10),
        line("shape", "a", "b"),
        line("path", "path-a", "path-b"),
      ]),
      ["shape", "path"],
      { count: 2, pathId: "path", align: true },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points[0]!.x).toBeCloseTo(0);
    expect(result.points[0]!.y).toBeCloseTo(-1);
    expect(result.points[1]!.x).toBeCloseTo(0);
    expect(result.points[1]!.y).toBeCloseTo(1);
  });

  it("rejects a path without separate geometry", () => {
    const result = pathPatternSelected(
      sketchWith([
        point("path-a", 0, 0),
        point("path-b", 10, 0),
        line("path", "path-a", "path-b"),
      ]),
      ["path"],
      { count: 4, pathId: "path", align: true },
      id,
    );
    expect(result.ok).toBe(false);
  });
});
