import { describe, expect, it } from "vitest";
import { chainPathPoints, extendPathEnds } from "../sweepPath";

const plane = {
  origin: [0, 0, 0],
  xAxis: [1, 0, 0],
  yAxis: [0, 1, 0],
};

const point = (id: string, x: number, y: number) => ({
  id,
  type: "point",
  x,
  y,
});

describe("sweep path sampling", () => {
  it("chains straight lines into one polyline", () => {
    const points = chainPathPoints({
      plane,
      primitives: [
        point("p1", 0, 0),
        point("p2", 1, 0),
        point("p3", 1, 1),
        point("l1", 1, 0),
        point("l2", 0, 0),
        { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
        { id: "l2", type: "line", p1Id: "p2", p2Id: "p3" },
      ].filter((p) => p.type === "point" || p.type === "line"),
    });
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(points[2]).toEqual({ x: 1, y: 1, z: 0 });
  });

  it("samples an arc between its endpoints and chains it to a line", () => {
    const points = chainPathPoints({
      plane,
      primitives: [
        point("p0", 0, 0),
        point("p1", 1, 0),
        point("c", 0, 0),
        point("p2", 0, 1),
        { id: "l1", type: "line", p1Id: "p0", p2Id: "p1" },
        {
          id: "a1",
          type: "arc",
          centerId: "c",
          startId: "p1",
          endId: "p2",
          radius: 1,
        },
      ],
    });
    expect(points.length).toBeGreaterThan(4);
    expect(points[0]).toEqual({ x: 0, y: 0, z: 0 });
    const last = points[points.length - 1]!;
    expect(last.x).toBeCloseTo(0);
    expect(last.y).toBeCloseTo(1);
  });

  it("returns a closed loop for a circle", () => {
    const points = chainPathPoints({
      plane,
      primitives: [
        point("c", 0, 0),
        { id: "c1", type: "circle", centerId: "c", radius: 1 },
      ],
    });
    expect(points.length).toBeGreaterThan(8);
    expect(points[0]!.x).toBeCloseTo(points[points.length - 1]!.x);
    expect(points[0]!.y).toBeCloseTo(points[points.length - 1]!.y);
  });

  it("samples a spline through its ordered points", () => {
    const points = chainPathPoints({
      plane,
      primitives: [
        point("a", 0, 0),
        point("b", 1, 1),
        point("c", 2, 0),
        { id: "s1", type: "spline", pointIds: ["a", "b", "c"] },
      ],
    });
    expect(points[0]).toEqual({ x: 0, y: 0, z: 0 });
    const last = points[points.length - 1]!;
    expect(last.x).toBeCloseTo(2);
    expect(last.y).toBeCloseTo(0);
    expect(points.some((p) => p.y > 0.5)).toBe(true);
  });

  it("returns nothing for a sketch with no path geometry", () => {
    expect(chainPathPoints({ plane, primitives: [point("p", 0, 0)] })).toEqual(
      [],
    );
  });
});

describe("sweep path offsets", () => {
  const line = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ];

  it("extends both ends along their tangents", () => {
    const extended = extendPathEnds(line, 0.5, 0.25);
    expect(extended).toHaveLength(4);
    expect(extended[0]).toEqual({ x: -0.5, y: 0, z: 0 });
    expect(extended[3]).toEqual({ x: 1.25, y: 0, z: 0 });
  });

  it("leaves the path alone with zero offsets", () => {
    expect(extendPathEnds(line, 0, 0)).toEqual(line);
  });
});
