import { describe, expect, it } from "vitest";
import {
  createSketchPlane,
  type Sketch,
  type SketchArc,
  type SketchCircle,
  type SketchLine,
  type SketchPoint,
} from "@vitekk02/cadjs";
import { joinSketchLines, offsetSketchPrimitive } from "../sketchModify";

let nextId = 0;
const id = (prefix: string) => `${prefix}_${++nextId}`;

const point = (id: string, x: number, y: number): SketchPoint => ({
  id,
  type: "point",
  x,
  y,
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

const line = (id: string, p1Id: string, p2Id: string): SketchLine => ({
  id,
  type: "line",
  p1Id,
  p2Id,
});

const circle = (
  id: string,
  centerId: string,
  radius: number,
): SketchCircle => ({
  id,
  type: "circle",
  centerId,
  radius,
});

const arc = (
  id: string,
  centerId: string,
  startId: string,
  endId: string,
  radius: number,
): SketchArc => ({ id, type: "arc", centerId, startId, endId, radius });

describe("offsetSketchPrimitive", () => {
  it("offsets a line to its left and preserves construction", () => {
    const result = offsetSketchPrimitive(
      sketchWith([
        point("a", 0, 0),
        point("b", 2, 0),
        { ...line("l", "a", "b"), construction: true },
      ]),
      "l",
      1,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [0, 1],
      [2, 1],
    ]);
    expect(result.primitives[0]).toMatchObject({ construction: true });
    expect(result.primitives[0]?.type).toBe("line");
  });

  it("offsets a circle radius", () => {
    const result = offsetSketchPrimitive(
      sketchWith([point("c", 0, 0), circle("c1", "c", 2)]),
      "c1",
      1.5,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const offset = result.primitives[0] as SketchCircle;
    expect(offset.type).toBe("circle");
    expect(offset.radius).toBe(3.5);
    expect(offset.centerId).toBe("c");
  });

  it("offsets an arc with new radial endpoints", () => {
    const result = offsetSketchPrimitive(
      sketchWith([
        point("c", 0, 0),
        point("s", 1, 0),
        point("e", 0, 1),
        arc("a", "c", "s", "e", 1),
      ]),
      "a",
      1,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const offset = result.primitives[0] as SketchArc;
    expect(offset.radius).toBe(2);
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [2, 0],
      [0, 2],
    ]);
  });

  it("refuses a zero offset and an offset that collapses a circle", () => {
    const sketch = sketchWith([point("c", 0, 0), circle("c1", "c", 1)]);
    expect(offsetSketchPrimitive(sketch, "c1", 0, id).ok).toBe(false);
    expect(offsetSketchPrimitive(sketch, "c1", -1, id).ok).toBe(false);
  });
});

describe("joinSketchLines", () => {
  it("joins collinear lines through their shared endpoint", () => {
    const result = joinSketchLines(
      sketchWith([
        point("a", 0, 0),
        point("b", 1, 0),
        point("c", 2, 0),
        line("l1", "a", "b"),
        line("l2", "b", "c"),
      ]),
      ["l1", "l2"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).toEqual({ id: "l1", p2Id: "c" });
    expect(result.removeLineId).toBe("l2");
    expect(result.removePointId).toBe("b");
  });

  it("refuses non-collinear lines", () => {
    const result = joinSketchLines(
      sketchWith([
        point("a", 0, 0),
        point("b", 1, 0),
        point("c", 1, 1),
        line("l1", "a", "b"),
        line("l2", "b", "c"),
      ]),
      ["l1", "l2"],
    );
    expect(result.ok).toBe(false);
  });

  it("refuses lines that do not share an endpoint", () => {
    const result = joinSketchLines(
      sketchWith([
        point("a", 0, 0),
        point("b", 1, 0),
        point("c", 2, 0),
        point("d", 3, 0),
        line("l1", "a", "b"),
        line("l2", "c", "d"),
      ]),
      ["l1", "l2"],
    );
    expect(result.ok).toBe(false);
  });
});
