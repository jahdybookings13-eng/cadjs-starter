import { describe, expect, it } from "vitest";
import { CatmullRomCurve3, Vector3 } from "three";
import {
  splitArcAtPoint,
  splitBezierAtPoint,
  splitCircleAtPoint,
  splitConicAtPoint,
  splitEllipticalArcAtPoint,
  splitLineAtPoint,
  splitSplineAtPoint,
} from "../../src/hooks/sketch/sketch-split";
import {
  createSketchPlane,
  type SketchArc,
  type SketchBezier,
  type SketchCircle,
  type SketchConic,
  type SketchEllipticalArc,
  type SketchSpline,
  type Sketch,
  type SketchLine,
  type SketchPoint,
} from "../../src/types/sketch-types";

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

const bezier = (id: string, pointIds: string[]): SketchBezier => ({
  id,
  type: "bezier",
  pointIds,
});

const spline = (id: string, pointIds: string[]): SketchSpline => ({
  id,
  type: "spline",
  pointIds,
});

const conic = (
  id: string,
  startId: string,
  controlId: string,
  endId: string,
  rho: number,
  startWeight = 1,
  endWeight = 1,
): SketchConic => ({
  id,
  type: "conic",
  startId,
  controlId,
  endId,
  rho,
  startWeight,
  endWeight,
});

function evalConic(
  conicValue: SketchConic,
  points: Map<string, { x: number; y: number }>,
  t: number,
) {
  const start = points.get(conicValue.startId)!;
  const control = points.get(conicValue.controlId)!;
  const end = points.get(conicValue.endId)!;
  const u = 1 - t;
  const w0 = conicValue.startWeight ?? 1;
  const w1 = conicValue.rho;
  const w2 = conicValue.endWeight ?? 1;
  const denominator = w0 * u * u + 2 * w1 * u * t + w2 * t * t;
  return {
    x:
      (w0 * u * u * start.x + 2 * w1 * u * t * control.x + w2 * t * t * end.x) /
      denominator,
    y:
      (w0 * u * u * start.y + 2 * w1 * u * t * control.y + w2 * t * t * end.y) /
      denominator,
  };
}

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

describe("splitLineAtPoint", () => {
  it("projects the click to the line and preserves construction", () => {
    const result = splitLineAtPoint(
      sketchWith([
        point("a", 0, 0),
        point("b", 4, 0),
        { ...line("l", "a", "b"), construction: true },
      ]),
      "l",
      { x: 1, y: 0.5 },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.point.x, result.point.y]).toEqual([1, 0]);
    expect(result.newLine).toMatchObject({
      type: "line",
      p1Id: result.point.id,
      p2Id: "b",
      construction: true,
    });
  });

  it("refuses a click at an endpoint", () => {
    const result = splitLineAtPoint(
      sketchWith([point("a", 0, 0), point("b", 4, 0), line("l", "a", "b")]),
      "l",
      { x: 0.01, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses origin lines", () => {
    const result = splitLineAtPoint(
      sketchWith([
        point("a", 0, 0),
        point("b", 4, 0),
        { ...line("l", "a", "b"), origin: true },
      ]),
      "l",
      { x: 2, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitArcAtPoint", () => {
  it("splits a quarter arc at the projected click and keeps construction", () => {
    const result = splitArcAtPoint(
      sketchWith([
        point("c", 0, 0),
        point("a", 4, 0),
        point("b", 0, 4),
        { ...arc("arc", "c", "a", "b", 4), construction: true },
      ]),
      "arc",
      { x: 3, y: 3 },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.point.x).toBeCloseTo(Math.SQRT2 * 2);
    expect(result.point.y).toBeCloseTo(Math.SQRT2 * 2);
    expect(result.newArc).toMatchObject({
      type: "arc",
      centerId: "c",
      startId: result.point.id,
      endId: "b",
      radius: 4,
      construction: true,
    });
  });

  it("refuses a click outside the arc sweep", () => {
    const result = splitArcAtPoint(
      sketchWith([
        point("c", 0, 0),
        point("a", 4, 0),
        point("b", 0, 4),
        arc("arc", "c", "a", "b", 4),
      ]),
      "arc",
      { x: -4, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a click at an arc endpoint", () => {
    const result = splitArcAtPoint(
      sketchWith([
        point("c", 0, 0),
        point("a", 4, 0),
        point("b", 0, 4),
        arc("arc", "c", "a", "b", 4),
      ]),
      "arc",
      { x: 0.001, y: 4 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitBezierAtPoint", () => {
  it("splits a cubic Bezier into two real halves at the clicked point", () => {
    const original = {
      ...bezier("bez", ["p0", "p1", "p2", "p3"]),
      construction: true,
    };
    const result = splitBezierAtPoint(
      sketchWith([
        point("p0", 0, 0),
        point("p1", 1, 0),
        point("p2", 2, 1),
        point("p3", 3, 1),
        original,
      ]),
      "bez",
      { x: 1.5, y: 0.5 },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.point.x).toBeCloseTo(1.5);
    expect(result.point.y).toBeCloseTo(0.5);
    expect(result.leftPointIds).toHaveLength(4);
    expect(result.newBezier).toMatchObject({
      type: "bezier",
      pointIds: [result.point.id, expect.any(String), expect.any(String), "p3"],
      construction: true,
    });
    expect(result.points).toHaveLength(5);
  });

  it("refuses a click at a Bezier endpoint", () => {
    const result = splitBezierAtPoint(
      sketchWith([
        point("p0", 0, 0),
        point("p1", 1, 0),
        point("p2", 2, 1),
        point("p3", 3, 1),
        bezier("bez", ["p0", "p1", "p2", "p3"]),
      ]),
      "bez",
      { x: 0.01, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitEllipticalArcAtPoint", () => {
  it("splits an elliptical arc at the clicked ellipse parameter", () => {
    const ellipticalArc: SketchEllipticalArc = {
      id: "earc",
      type: "ellipticalArc",
      centerId: "c",
      majorRadius: 4,
      minorRadius: 2,
      rotation: 0,
      startAngle: 0,
      endAngle: Math.PI / 2,
      construction: true,
    };
    const result = splitEllipticalArcAtPoint(
      sketchWith([point("c", 0, 0), ellipticalArc]),
      "earc",
      { x: 4 * Math.cos(Math.PI / 4), y: 2 * Math.sin(Math.PI / 4) },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.splitAngle).toBeCloseTo(Math.PI / 4, 6);
    expect(result.newArc).toMatchObject({
      type: "ellipticalArc",
      centerId: "c",
      startAngle: result.splitAngle,
      endAngle: Math.PI / 2,
      construction: true,
    });
  });

  it("refuses a click at an elliptical-arc end", () => {
    const result = splitEllipticalArcAtPoint(
      sketchWith([
        point("c", 0, 0),
        {
          id: "earc",
          type: "ellipticalArc",
          centerId: "c",
          majorRadius: 4,
          minorRadius: 2,
          rotation: 0,
          startAngle: 0,
          endAngle: Math.PI / 2,
        },
      ]),
      "earc",
      { x: 4, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitSplineAtPoint", () => {
  it("splits a spline into two non-overlapping raw parameter ranges", () => {
    const points = [
      point("p0", 0, 0),
      point("p1", 1, 2),
      point("p2", 2, 0),
      point("p3", 3, 2),
    ];
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(p.x, p.y, 0)),
      false,
      "catmullrom",
      0.5,
    );
    const click = curve.getPoint(0.5);
    const result = splitSplineAtPoint(
      sketchWith([...points, spline("spline", ["p0", "p1", "p2", "p3"])]),
      "spline",
      { x: click.x, y: click.y },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.point.x).toBeCloseTo(click.x, 6);
    expect(result.point.y).toBeCloseTo(click.y, 6);
    expect(result.endT).toBeCloseTo(0.5, 2);
    expect(result.newSpline).toMatchObject({
      type: "spline",
      pointIds: ["p0", "p1", "p2", "p3"],
      startT: result.endT,
      endT: 1,
      startId: result.point.id,
      endId: "p3",
    });
  });

  it("refuses a click at a spline endpoint", () => {
    const result = splitSplineAtPoint(
      sketchWith([
        point("p0", 0, 0),
        point("p1", 1, 2),
        point("p2", 2, 0),
        spline("spline", ["p0", "p1", "p2"]),
      ]),
      "spline",
      { x: 0, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitConicAtPoint", () => {
  it("splits a weighted conic into exact homogeneous halves", () => {
    const original = conic("conic", "p0", "p1", "p2", 0.5, 1, 2);
    const result = splitConicAtPoint(
      sketchWith([
        point("p0", 0, 0),
        point("p1", 2, 3),
        point("p2", 4, 0),
        { ...original, construction: true },
      ]),
      "conic",
      { x: 2.5, y: 0.75 },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const points = new Map<string, { x: number; y: number }>([
      ["p0", { x: 0, y: 0 }],
      ["p1", { x: 2, y: 3 }],
      ["p2", { x: 4, y: 0 }],
      ...result.points.map((p) => [p.id, { x: p.x, y: p.y }] as const),
    ]);
    const left = conic(
      "left",
      "p0",
      result.leftControlId,
      result.point.id,
      result.leftRho,
      result.leftStartWeight,
      result.leftEndWeight,
    );
    const right = { ...result.newConic, id: "right" };
    for (const s of [0.25, 0.5, 0.75]) {
      const originalLeft = evalConic(original, points, 0.5 * s);
      const leftPoint = evalConic(left, points, s);
      expect(leftPoint.x).toBeCloseTo(originalLeft.x, 9);
      expect(leftPoint.y).toBeCloseTo(originalLeft.y, 9);
      const originalRight = evalConic(original, points, 0.5 + 0.5 * s);
      const rightPoint = evalConic(right, points, s);
      expect(rightPoint.x).toBeCloseTo(originalRight.x, 9);
      expect(rightPoint.y).toBeCloseTo(originalRight.y, 9);
    }
    expect(result.newConic.construction).toBe(true);
  });

  it("refuses a click at a conic endpoint", () => {
    const result = splitConicAtPoint(
      sketchWith([
        point("p0", 0, 0),
        point("p1", 2, 3),
        point("p2", 4, 0),
        conic("conic", "p0", "p1", "p2", 0.5),
      ]),
      "conic",
      { x: 0.01, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});

describe("splitCircleAtPoint", () => {
  it("breaks a circle into two arcs sharing both new vertices", () => {
    const result = splitCircleAtPoint(
      sketchWith([
        point("c", 0, 0),
        { ...circle("circ", "c", 5), construction: true },
      ]),
      "circ",
      { x: 10, y: 0 },
      id,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points[0].x).toBeCloseTo(5);
    expect(result.points[1].x).toBeCloseTo(-5);
    expect(result.arcs[0]).toMatchObject({
      type: "arc",
      centerId: "c",
      startId: result.points[0].id,
      endId: result.points[1].id,
      radius: 5,
      construction: true,
    });
    expect(result.arcs[1]).toMatchObject({
      type: "arc",
      centerId: "c",
      startId: result.points[1].id,
      endId: result.points[0].id,
      radius: 5,
      construction: true,
    });
  });

  it("refuses a circle with no centre point", () => {
    const result = splitCircleAtPoint(
      sketchWith([circle("circ", "missing", 5)]),
      "circ",
      { x: 5, y: 0 },
      id,
    );
    expect(result.ok).toBe(false);
  });
});
