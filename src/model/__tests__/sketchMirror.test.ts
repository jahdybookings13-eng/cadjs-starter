import { describe, expect, it } from "vitest";
import {
  createSketchPlane,
  type Sketch,
  type SketchArc,
  type SketchCircle,
  type SketchEllipse,
  type SketchLine,
  type SketchPoint,
  type SketchPrimitive,
  type SketchSpline,
  type SketchBezier,
  type SketchConic,
} from "@vitekk02/cadjs";
import { mirrorSelectedPrimitives } from "../sketchMirror";

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

const ellipse = (
  id: string,
  centerId: string,
  majorRadius: number,
  minorRadius: number,
  rotation: number,
): SketchEllipse => ({
  id,
  type: "ellipse",
  centerId,
  majorRadius,
  minorRadius,
  rotation,
});

const spline = (id: string, pointIds: string[]): SketchSpline => ({
  id,
  type: "spline",
  pointIds,
});

const sketchWith = (primitives: SketchPrimitive[]): Sketch => ({
  id: "sketch_test",
  plane: createSketchPlane("XY"),
  primitives,
  constraints: [],
  dof: 0,
  status: "underconstrained",
});

const idGenerator = () => {
  let next = 0;
  return (prefix: string) => `${prefix}_${++next}`;
};

const pointById = (primitives: SketchPrimitive[], id: string): SketchPoint => {
  const found = primitives.find((primitive) => primitive.id === id);
  expect(found?.type).toBe("point");
  return found as SketchPoint;
};

describe("mirrorSelectedPrimitives", () => {
  const axisStart = point("axis_a", 0, -2);
  const axisEnd = point("axis_b", 0, 2);
  const axis = line("axis", "axis_a", "axis_b");

  it("mirrors a line across the selected axis", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("p1", 1, 0),
        point("p2", 2, 1),
        line("source", "p1", "p2"),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "line",
    ) as SketchLine;
    const start = pointById(result.primitives, mirrored.p1Id);
    const end = pointById(result.primitives, mirrored.p2Id);
    expect(start).toMatchObject({ x: -1, y: 0 });
    expect(end).toMatchObject({ x: -2, y: 1 });
  });

  it("mirrors a circle without changing its radius", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("center", 2, 1),
        circle("source", "center", 0.75),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "circle",
    ) as SketchCircle;
    const center = pointById(result.primitives, mirrored.centerId);
    expect(center).toMatchObject({ x: -2, y: 1 });
    expect(mirrored.radius).toBe(0.75);
  });

  it("mirrors an ellipse centre and reflects its major-axis angle", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("center", 2, 1),
        ellipse("source", "center", 2, 1, 0),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "ellipse",
    ) as SketchEllipse;
    const center = pointById(result.primitives, mirrored.centerId);
    expect(center).toMatchObject({ x: -2, y: 1 });
    expect(mirrored.majorRadius).toBe(2);
    expect(mirrored.minorRadius).toBe(1);
    expect(mirrored.rotation).toBeCloseTo(Math.PI);
  });

  it("mirrors every point in a spline and keeps their order", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("s1", 1, 1),
        point("s2", 2, -1),
        point("s3", 3, 1),
        spline("source", ["s1", "s2", "s3"]),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "spline",
    ) as SketchSpline;
    const points = mirrored.pointIds.map((id) =>
      pointById(result.primitives, id),
    );
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [-1, 1],
      [-2, -1],
      [-3, 1],
    ]);
  });

  it("mirrors a Bezier's four control points in order", () => {
    const bezier: SketchPrimitive = {
      id: "source",
      type: "bezier",
      pointIds: ["b1", "b2", "b3", "b4"],
    };
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("b1", 1, 1),
        point("b2", 2, 2),
        point("b3", 3, -1),
        point("b4", 4, 0.5),
        bezier,
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "bezier",
    ) as SketchBezier;
    const points = mirrored.pointIds.map((id) =>
      pointById(result.primitives, id),
    );
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [-1, 1],
      [-2, 2],
      [-3, -1],
      [-4, 0.5],
    ]);
  });

  it("mirrors a conic and preserves rho", () => {
    const conic: SketchPrimitive = {
      id: "source",
      type: "conic",
      startId: "k1",
      controlId: "k2",
      endId: "k3",
      rho: 0.35,
    };
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("k1", 1, 1),
        point("k2", 2, 3),
        point("k3", 3, 1),
        conic,
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "conic",
    ) as SketchConic;
    expect(mirrored.rho).toBe(0.35);
    expect(pointById(result.primitives, mirrored.startId)).toMatchObject({
      x: -1,
      y: 1,
    });
    expect(pointById(result.primitives, mirrored.controlId)).toMatchObject({
      x: -2,
      y: 3,
    });
    expect(pointById(result.primitives, mirrored.endId)).toMatchObject({
      x: -3,
      y: 1,
    });
  });

  it("swaps arc endpoints so the reflected sweep keeps its shape", () => {
    const sourceSketch = sketchWith([
      axisStart,
      axisEnd,
      axis,
      point("center", 0, 0),
      point("start", 1, 0),
      point("end", 0, 1),
      arc("source", "center", "start", "end", 1),
    ]);
    const result = mirrorSelectedPrimitives(
      sourceSketch,
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "arc",
    ) as SketchArc;
    const allPrimitives = [...sourceSketch.primitives, ...result.primitives];
    const start = pointById(allPrimitives, mirrored.startId);
    const end = pointById(allPrimitives, mirrored.endId);
    expect(start).toMatchObject({ x: 0, y: 1 });
    expect(end).toMatchObject({ x: -1, y: 0 });
  });

  it("shares a point that lies on the mirror axis", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("on_axis", 0, 0),
        point("off_axis", 2, 0),
        line("source", "on_axis", "off_axis"),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "line",
    ) as SketchLine;
    expect(mirrored.p1Id).toBe("on_axis");
    const offAxis = pointById(result.primitives, mirrored.p2Id);
    expect(offAxis).toMatchObject({ x: -2, y: 0 });
    expect(
      result.primitives.filter((primitive) => primitive.type === "point"),
    ).toHaveLength(1);
  });

  it("preserves the construction flag", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("p1", 1, 0),
        point("p2", 2, 1),
        { ...line("source", "p1", "p2"), construction: true },
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mirrored = result.primitives.find(
      (primitive) => primitive.type === "line",
    ) as SketchLine;
    expect(mirrored.construction).toBe(true);
  });

  it("rejects a zero-length axis", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        point("same_a", 1, 1),
        point("same_b", 1, 1),
        line("axis", "same_a", "same_b"),
        point("source", 2, 2),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result).toEqual({
      ok: false,
      reason: "The mirror axis has zero length.",
    });
  });

  it("rejects geometry that is already symmetric about the axis", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([
        axisStart,
        axisEnd,
        axis,
        point("center", 0, 1),
        circle("source", "center", 1),
      ]),
      ["axis", "source"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Nothing to mirror");
  });

  it("requires geometry besides the axis", () => {
    const result = mirrorSelectedPrimitives(
      sketchWith([axisStart, axisEnd, axis]),
      ["axis"],
      "axis",
      idGenerator(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("plus the geometry");
  });
});
