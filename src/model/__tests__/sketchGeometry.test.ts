import { describe, expect, it } from "vitest";
import {
  circleThroughThreePoints,
  distanceToLine,
  ellipseGeometry,
  ellipticalArcGeometry,
  polygonGeometry,
  slotGeometry,
} from "@vitekk02/cadjs";

describe("circleThroughThreePoints", () => {
  it("finds the circumcircle of three non-collinear points", () => {
    const circle = circleThroughThreePoints(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    );

    expect(circle).not.toBeNull();
    expect(circle?.center.x).toBeCloseTo(2);
    expect(circle?.center.y).toBeCloseTo(1.5);
    expect(circle?.radius).toBeCloseTo(2.5);
  });

  it("returns null for collinear points", () => {
    expect(
      circleThroughThreePoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }),
    ).toBeNull();
  });

  it("returns null for coincident points", () => {
    expect(
      circleThroughThreePoints({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }),
    ).toBeNull();
  });
});

describe("slotGeometry", () => {
  it("builds a stadium around two centre points", () => {
    const slot = slotGeometry({ x: 0, y: 0 }, { x: 4, y: 0 }, 1);

    expect(slot).not.toBeNull();
    expect(slot?.topA).toEqual({ x: 0, y: 1 });
    expect(slot?.topB).toEqual({ x: 4, y: 1 });
    expect(slot?.bottomA).toEqual({ x: 0, y: -1 });
    expect(slot?.bottomB).toEqual({ x: 4, y: -1 });
    expect(slot?.direction).toEqual({ x: 1, y: 0 });
  });

  it("rejects zero-length centres and zero radius", () => {
    expect(slotGeometry({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toBeNull();
    expect(slotGeometry({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBeNull();
  });
});

describe("polygonGeometry", () => {
  it("places the requested number of vertices on a circle", () => {
    const polygon = polygonGeometry({ x: 0, y: 0 }, { x: 2, y: 0 }, 6);

    expect(polygon).not.toBeNull();
    expect(polygon?.sides).toBe(6);
    expect(polygon?.vertices).toHaveLength(6);
    expect(polygon?.vertices[0]).toEqual({ x: 2, y: 0 });
    expect(polygon?.vertices[1]?.x).toBeCloseTo(1);
    expect(polygon?.vertices[1]?.y).toBeCloseTo(Math.sqrt(3));
  });

  it("rejects a zero-radius polygon", () => {
    expect(polygonGeometry({ x: 0, y: 0 }, { x: 0, y: 0 }, 6)).toBeNull();
  });
});

describe("ellipseGeometry", () => {
  it("builds an ellipse from centre, major-axis point and minor radius", () => {
    const ellipse = ellipseGeometry(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
    );

    expect(ellipse).not.toBeNull();
    expect(ellipse?.majorRadius).toBe(4);
    expect(ellipse?.minorRadius).toBe(2);
    expect(ellipse?.rotation).toBe(0);
  });

  it("swaps the axes when the second radius is larger", () => {
    const ellipse = ellipseGeometry(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 4 },
    );

    expect(ellipse).not.toBeNull();
    expect(ellipse?.majorRadius).toBe(4);
    expect(ellipse?.minorRadius).toBe(2);
    expect(ellipse?.rotation).toBeCloseTo(Math.PI / 2);
  });

  it("rejects zero major or minor axes", () => {
    expect(
      ellipseGeometry({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toBeNull();
    expect(
      ellipseGeometry({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }),
    ).toBeNull();
  });
});

describe("ellipticalArcGeometry", () => {
  it("maps two picks to ellipse parameters", () => {
    const arc = ellipticalArcGeometry(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
    );

    expect(arc).not.toBeNull();
    expect(arc?.startAngle).toBeCloseTo(0);
    expect(arc?.endAngle).toBeCloseTo(Math.PI / 2);
  });

  it("wraps the end angle past the start", () => {
    const arc = ellipticalArcGeometry(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: 2 },
      { x: 4, y: 0 },
    );

    expect(arc).not.toBeNull();
    expect((arc?.endAngle ?? 0) - (arc?.startAngle ?? 0)).toBeCloseTo(
      (Math.PI * 3) / 2,
    );
  });
});

describe("distanceToLine", () => {
  it("measures perpendicular distance to the infinite line", () => {
    expect(distanceToLine({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(
      3,
    );
  });

  it("falls back to the endpoint distance for a degenerate line", () => {
    expect(distanceToLine({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(
      5,
    );
  });
});
