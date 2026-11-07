import { describe, expect, it } from "vitest";
import {
  createSketchPlane,
  type Sketch,
  type SketchCircle,
  type SketchLine,
  type SketchPoint,
} from "@vitekk02/cadjs";
import {
  moveOrCopySelected,
  rotateSelectedGeometry,
  scaleSelectedGeometry,
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

describe("moveOrCopySelected", () => {
  it("moves the defining points of a line without duplicating them", () => {
    const result = moveOrCopySelected(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["l", "a"],
      "move",
      1,
      2,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pointUpdates).toEqual([
      { id: "a", x: 1, y: 2 },
      { id: "b", x: 3, y: 2 },
    ]);
    expect(result.points).toEqual([]);
    expect(result.primitives).toEqual([]);
  });

  it("copies a line with independent points", () => {
    const source = sketchWith([
      point("a", 0, 0),
      point("b", 2, 0),
      line("l", "a", "b"),
    ]);
    const result = moveOrCopySelected(source, ["l"], "copy", 2, 1, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(2);
    expect(result.points.map((p) => [p.x, p.y])).toEqual([
      [2, 1],
      [4, 1],
    ]);
    const copied = result.primitives[0] as SketchLine;
    expect(copied.id).not.toBe("l");
    expect(copied.p1Id).toBe(result.points[0]!.id);
    expect(copied.p2Id).toBe(result.points[1]!.id);
    expect(source.primitives).toHaveLength(3);
  });

  it("copies shared points once when a point and line are both selected", () => {
    const result = moveOrCopySelected(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["a", "l"],
      "copy",
      1,
      1,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(2);
    expect(result.primitives).toHaveLength(1);
  });

  it("copies a circle centre and radius unchanged", () => {
    const result = moveOrCopySelected(
      sketchWith([point("c", 0, 0), circle("c1", "c", 2)]),
      ["c1"],
      "copy",
      1,
      1,
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(1);
    const copied = result.primitives[0] as SketchCircle;
    expect(copied.radius).toBe(2);
    expect(copied.centerId).toBe(result.points[0]!.id);
  });

  it("rotates around a selected centre point", () => {
    const result = rotateSelectedGeometry(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["a", "l"],
      Math.PI / 2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pointUpdates).toHaveLength(1);
    expect(result.pointUpdates[0]!.id).toBe("b");
    expect(result.pointUpdates[0]!.x).toBeCloseTo(0);
    expect(result.pointUpdates[0]!.y).toBeCloseTo(2);
    expect(result.primitiveUpdates).toEqual([]);
  });

  it("rotates an ellipse orientation around its centre", () => {
    const result = rotateSelectedGeometry(
      sketchWith([
        point("c", 1, 1),
        {
          id: "e",
          type: "ellipse",
          centerId: "c",
          majorRadius: 3,
          minorRadius: 1,
          rotation: 0.25,
        },
      ]),
      ["e"],
      Math.PI / 2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pointUpdates).toEqual([]);
    expect(result.primitiveUpdates).toEqual([
      { id: "e", updates: { rotation: 0.25 + Math.PI / 2 } },
    ]);
  });

  it("scales circle and ellipse radii", () => {
    const result = scaleSelectedGeometry(
      sketchWith([
        point("c", 0, 0),
        circle("c1", "c", 2),
        {
          id: "e",
          type: "ellipse",
          centerId: "c",
          majorRadius: 4,
          minorRadius: 1,
          rotation: 0,
        },
      ]),
      ["c1", "e"],
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.primitiveUpdates).toEqual([
      { id: "c1", updates: { radius: 4 } },
      { id: "e", updates: { majorRadius: 8, minorRadius: 2 } },
    ]);
  });

  it("scales a line around a selected endpoint", () => {
    const result = scaleSelectedGeometry(
      sketchWith([point("a", 0, 0), point("b", 2, 0), line("l", "a", "b")]),
      ["a", "l"],
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pointUpdates).toEqual([{ id: "b", x: 4, y: 0 }]);
  });

  it("refuses zero rotation and scale factor 1", () => {
    const sketch = sketchWith([
      point("a", 0, 0),
      point("b", 2, 0),
      line("l", "a", "b"),
    ]);
    expect(rotateSelectedGeometry(sketch, ["l"], 0).ok).toBe(false);
    expect(scaleSelectedGeometry(sketch, ["l"], 1).ok).toBe(false);
  });

  it("refuses zero vectors and origin geometry", () => {
    const sketch = sketchWith([
      point("a", 0, 0),
      point("b", 2, 0),
      { ...line("l", "a", "b"), origin: true },
    ]);
    expect(moveOrCopySelected(sketch, ["l"], "move", 0, 0, id).ok).toBe(false);
    expect(moveOrCopySelected(sketch, ["l"], "move", 1, 0, id).ok).toBe(false);
  });
});
