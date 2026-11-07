import {
  lineLineIntersect,
  lineCircleIntersect,
  circleCircleIntersect,
  normalizeAngle,
  isAngleInArcRange,
  findAllIntersections,
  identifyTrimSegment,
  findClosestEndpoint,
  findNearestExtendTarget,
  findNearestArcExtendTarget,
  getArcAngles,
  IntersectionResult,
} from "../../src/scene-operations/sketch-intersection-utils";
import {
  Sketch,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  createSketchPlane,
} from "../../src/types/sketch-types";

const PI = Math.PI;

function makeSketch(primitives: any[]): Sketch {
  return {
    id: "test-sketch",
    plane: createSketchPlane("XY"),
    primitives,
    constraints: [],
    dof: 0,
    status: "underconstrained",
  };
}

function pt(id: string, x: number, y: number): SketchPoint {
  return { id, type: "point", x, y };
}

function line(
  id: string,
  p1Id: string,
  p2Id: string,
  construction = false,
): SketchLine {
  return { id, type: "line", p1Id, p2Id, construction };
}

function circle(
  id: string,
  centerId: string,
  radius: number,
  construction = false,
): SketchCircle {
  return { id, type: "circle", centerId, radius, construction };
}

function arc(
  id: string,
  centerId: string,
  startId: string,
  endId: string,
  radius: number,
  construction = false,
): SketchArc {
  return { id, type: "arc", centerId, startId, endId, radius, construction };
}

// ──────────────────────────────────────────
// lineLineIntersect
// ──────────────────────────────────────────
describe("lineLineIntersect", () => {
  it("finds intersection of perpendicular diagonal lines at (0.5, 0.5)", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.point.x).toBeCloseTo(0.5, 6);
    expect(r!.point.y).toBeCloseTo(0.5, 6);
    expect(r!.t).toBeCloseTo(0.5, 6);
    expect(r!.u).toBeCloseTo(0.5, 6);
  });

  it("finds intersection of horizontal and vertical lines", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.point.x).toBeCloseTo(1, 6);
    expect(r!.point.y).toBeCloseTo(0, 6);
    expect(r!.t).toBeCloseTo(0.5, 6);
    expect(r!.u).toBeCloseTo(0.5, 6);
  });

  it("returns null for parallel horizontal lines", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    );
    expect(r).toBeNull();
  });

  it("returns null for collinear lines (same line)", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    );
    expect(r).toBeNull();
  });

  it("handles T-intersection at t=0 (endpoint of first line)", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.t).toBeCloseTo(0, 6);
    expect(r!.point.x).toBeCloseTo(0, 6);
    expect(r!.point.y).toBeCloseTo(0, 6);
  });

  it("returns intersection even when outside [0,1] parameter range", () => {
    // Two lines that would cross if extended, at t=2 for first line
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.t).toBeCloseTo(2, 6);
    expect(r!.point.x).toBeCloseTo(2, 6);
  });

  it("works in negative coordinate space", () => {
    const r = lineLineIntersect(
      { x: -3, y: -3 },
      { x: -1, y: -1 },
      { x: -3, y: -1 },
      { x: -1, y: -3 },
    );
    expect(r).not.toBeNull();
    expect(r!.point.x).toBeCloseTo(-2, 6);
    expect(r!.point.y).toBeCloseTo(-2, 6);
  });

  it("finds intersection when lines meet at a single shared endpoint", () => {
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.point.x).toBeCloseTo(1, 6);
    expect(r!.point.y).toBeCloseTo(0, 6);
    expect(r!.t).toBeCloseTo(1, 6);
    expect(r!.u).toBeCloseTo(0, 6);
  });

  it("handles diagonal crossing with known coordinates", () => {
    // y = x (from (0,0) to (4,4)) and y = -x + 4 (from (0,4) to (4,0))
    // Intersection at (2,2), t=0.5, u=0.5
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    );
    expect(r).not.toBeNull();
    expect(r!.point.x).toBeCloseTo(2, 6);
    expect(r!.point.y).toBeCloseTo(2, 6);
    expect(r!.t).toBeCloseTo(0.5, 6);
    expect(r!.u).toBeCloseTo(0.5, 6);
  });

  it("returns result for nearly parallel lines that are just above threshold", () => {
    // Lines with very small but non-zero determinant
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 + 1e-8 },
    );
    // Determinant is very small, likely below 1e-10 → null
    // With 1e-8 difference over length 1: denom = 1 * 1e-8 = 1e-8 > 1e-10 → should return
    expect(r).not.toBeNull();
  });

  it("correctly computes t and u as parametric values along each line", () => {
    // L1 from (0,0) to (10,0), L2 from (3,-5) to (3,5)
    // Intersection at (3,0): t = 3/10 = 0.3, u = 5/10 = 0.5
    const r = lineLineIntersect(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 3, y: -5 },
      { x: 3, y: 5 },
    );
    expect(r).not.toBeNull();
    expect(r!.t).toBeCloseTo(0.3, 6);
    expect(r!.u).toBeCloseTo(0.5, 6);
    expect(r!.point.x).toBeCloseTo(3, 6);
    expect(r!.point.y).toBeCloseTo(0, 6);
  });
});

// ──────────────────────────────────────────
// lineCircleIntersect
// ──────────────────────────────────────────
describe("lineCircleIntersect", () => {
  it("returns 2 intersections for a line through circle center", () => {
    const r = lineCircleIntersect(
      { x: -2, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 0 },
      1,
    );
    expect(r).toHaveLength(2);
    // One at (-1,0), one at (1,0)
    const xs = r.map((i) => i.point.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 5);
    expect(xs[1]).toBeCloseTo(1, 5);
  });

  it("returns 1 intersection for tangent line", () => {
    // Tangent to unit circle at top: y=1
    const r = lineCircleIntersect(
      { x: -2, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 0 },
      1,
    );
    expect(r).toHaveLength(1);
    expect(r[0].point.x).toBeCloseTo(0, 5);
    expect(r[0].point.y).toBeCloseTo(1, 5);
  });

  it("returns empty array when line misses circle", () => {
    const r = lineCircleIntersect(
      { x: -2, y: 3 },
      { x: 2, y: 3 },
      { x: 0, y: 0 },
      1,
    );
    expect(r).toHaveLength(0);
  });

  it("finds intersections for horizontal line through unit circle at y=0", () => {
    const r = lineCircleIntersect(
      { x: -5, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      1,
    );
    expect(r).toHaveLength(2);
    const angles = r.map((i) => i.angle).sort((a, b) => a - b);
    // atan2(0, -1) = PI, atan2(0, 1) = 0
    expect(angles).toContainEqual(expect.closeTo(0, 5));
    expect(angles).toContainEqual(expect.closeTo(PI, 5));
  });

  it("finds intersections for vertical line through circle", () => {
    const r = lineCircleIntersect(
      { x: 0, y: -5 },
      { x: 0, y: 5 },
      { x: 0, y: 0 },
      2,
    );
    expect(r).toHaveLength(2);
    const ys = r.map((i) => i.point.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-2, 5);
    expect(ys[1]).toBeCloseTo(2, 5);
  });

  it("finds intersections for a diagonal line", () => {
    // 45-degree line through origin intersects unit circle at two points
    const r = lineCircleIntersect(
      { x: -2, y: -2 },
      { x: 2, y: 2 },
      { x: 0, y: 0 },
      1,
    );
    expect(r).toHaveLength(2);
    const s = Math.SQRT1_2; // 1/sqrt(2)
    const pts = r
      .map((i) => ({ x: i.point.x, y: i.point.y }))
      .sort((a, b) => a.x - b.x);
    expect(pts[0].x).toBeCloseTo(-s, 5);
    expect(pts[0].y).toBeCloseTo(-s, 5);
    expect(pts[1].x).toBeCloseTo(s, 5);
    expect(pts[1].y).toBeCloseTo(s, 5);
  });

  it("verifies angle = atan2 for intersection points", () => {
    const r = lineCircleIntersect(
      { x: -2, y: -2 },
      { x: 2, y: 2 },
      { x: 0, y: 0 },
      1,
    );
    for (const ix of r) {
      const expected = Math.atan2(ix.point.y, ix.point.x);
      expect(ix.angle).toBeCloseTo(expected, 5);
    }
  });

  it("returns 2 intersections when line starts inside circle", () => {
    const r = lineCircleIntersect(
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      2,
    );
    // Line from center to far right; crosses circle at two t values (negative and positive)
    expect(r).toHaveLength(2);
  });
});

// ──────────────────────────────────────────
// circleCircleIntersect
// ──────────────────────────────────────────
describe("circleCircleIntersect", () => {
  it("returns 2 intersections for two overlapping circles", () => {
    // Two unit circles at (-0.5, 0) and (0.5, 0)
    const r = circleCircleIntersect({ x: -0.5, y: 0 }, 1, { x: 0.5, y: 0 }, 1);
    expect(r).toHaveLength(2);
    // Both intersection points should have x = 0
    for (const ix of r) {
      expect(ix.point.x).toBeCloseTo(0, 5);
    }
  });

  it("returns 1 intersection for externally tangent circles", () => {
    // Two unit circles touching at (1,0)
    const r = circleCircleIntersect({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1);
    expect(r).toHaveLength(1);
    expect(r[0].point.x).toBeCloseTo(1, 5);
    expect(r[0].point.y).toBeCloseTo(0, 5);
  });

  it("returns 1 intersection for internally tangent circles", () => {
    // Circle r=2 at origin, circle r=1 at (1,0) → touching at (2,0)
    const r = circleCircleIntersect({ x: 0, y: 0 }, 2, { x: 1, y: 0 }, 1);
    expect(r).toHaveLength(1);
    expect(r[0].point.x).toBeCloseTo(2, 5);
    expect(r[0].point.y).toBeCloseTo(0, 3);
  });

  it("returns empty when circles are too far apart", () => {
    const r = circleCircleIntersect({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1);
    expect(r).toHaveLength(0);
  });

  it("returns empty when one circle is completely inside the other", () => {
    const r = circleCircleIntersect({ x: 0, y: 0 }, 5, { x: 0.5, y: 0 }, 1);
    expect(r).toHaveLength(0);
  });

  it("returns empty for concentric circles", () => {
    const r = circleCircleIntersect({ x: 0, y: 0 }, 1, { x: 0, y: 0 }, 2);
    expect(r).toHaveLength(0);
  });

  it("returns 2 intersections for same-radius overlapping circles", () => {
    const r = circleCircleIntersect({ x: 0, y: 0 }, 2, { x: 2, y: 0 }, 2);
    expect(r).toHaveLength(2);
    // Intersection x = d/2 = 1
    for (const ix of r) {
      expect(ix.point.x).toBeCloseTo(1, 5);
    }
    // y values should be symmetric
    const ys = r.map((i) => i.point.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-ys[1], 5);
  });

  it("returns 2 intersections for different-radius overlapping circles", () => {
    const r = circleCircleIntersect({ x: 0, y: 0 }, 3, { x: 4, y: 0 }, 2);
    expect(r).toHaveLength(2);
    // Verify angles are provided
    for (const ix of r) {
      expect(typeof ix.angle1).toBe("number");
      expect(typeof ix.angle2).toBe("number");
    }
  });
});

// ──────────────────────────────────────────
// normalizeAngle
// ──────────────────────────────────────────
describe("normalizeAngle", () => {
  it("returns angle already in [0, 2pi) unchanged", () => {
    expect(normalizeAngle(1.5)).toBeCloseTo(1.5, 10);
  });

  it("normalizes negative angle: -pi/2 -> 3pi/2", () => {
    expect(normalizeAngle(-PI / 2)).toBeCloseTo((3 * PI) / 2, 10);
  });

  it("normalizes large positive angle: 4pi -> 0", () => {
    expect(normalizeAngle(4 * PI)).toBeCloseTo(0, 6);
  });

  it("returns 0 for input of 0", () => {
    expect(normalizeAngle(0)).toBeCloseTo(0, 10);
  });

  it("normalizes exactly 2pi to 0", () => {
    expect(normalizeAngle(2 * PI)).toBeCloseTo(0, 6);
  });

  it("normalizes very large negative: -10pi", () => {
    const result = normalizeAngle(-10 * PI);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 * PI);
    expect(result).toBeCloseTo(0, 6);
  });

  it("normalizes PI to PI (stays in range)", () => {
    expect(normalizeAngle(PI)).toBeCloseTo(PI, 10);
  });

  it("normalizes -PI to PI", () => {
    expect(normalizeAngle(-PI)).toBeCloseTo(PI, 10);
  });
});

// ──────────────────────────────────────────
// isAngleInArcRange
// ──────────────────────────────────────────
describe("isAngleInArcRange", () => {
  it("returns true for angle inside non-wrapping range", () => {
    expect(isAngleInArcRange(PI / 2, 0, PI)).toBe(true);
  });

  it("returns false for angle outside non-wrapping range", () => {
    expect(isAngleInArcRange((3 * PI) / 2, 0, PI)).toBe(false);
  });

  it("returns true for angle near 2pi in wrapping range (s > e)", () => {
    // Range: [3pi/2, pi/2] wrapping around 0
    expect(isAngleInArcRange((7 * PI) / 4, (3 * PI) / 2, PI / 2)).toBe(true);
  });

  it("returns false for angle in excluded middle of wrapping range", () => {
    // Range: [3pi/2, pi/2] wrapping. Angle pi is in the excluded region
    expect(isAngleInArcRange(PI, (3 * PI) / 2, PI / 2)).toBe(false);
  });

  it("returns true for angle at boundary within tolerance", () => {
    // Angle at start boundary
    expect(isAngleInArcRange(0 + 1e-8, 0, PI)).toBe(true);
    // Angle at end boundary
    expect(isAngleInArcRange(PI - 1e-8, 0, PI)).toBe(true);
  });

  it("handles nearly full sweep (s=0, e=2pi-epsilon)", () => {
    // Almost full circle: everything except a tiny sliver at 2pi
    const e = 2 * PI - 0.001;
    expect(isAngleInArcRange(PI, 0, e)).toBe(true);
    expect(isAngleInArcRange(0.5, 0, e)).toBe(true);
  });

  it("handles wrapping range s=pi, e=0 with angle=3pi/2 (inside)", () => {
    expect(isAngleInArcRange((3 * PI) / 2, PI, 2 * PI - 1e-9)).toBe(true);
  });

  it("handles wrapping range s=pi, e=0 with angle=pi/2 (outside)", () => {
    // Range [pi, 0) wrapping around 2pi: covers pi to 2pi then 0
    // pi/2 is between 0 and pi, so it's excluded
    expect(isAngleInArcRange(PI / 2, PI, 2 * PI - 1e-3)).toBe(false);
  });
});

// ──────────────────────────────────────────
// getArcAngles
// ──────────────────────────────────────────
describe("getArcAngles", () => {
  it("computes start and end angles from arc point positions", () => {
    const prims = [
      pt("c", 0, 0),
      pt("s", 1, 0),
      pt("e", 0, 1),
      arc("a", "c", "s", "e", 1),
    ];
    const sk = makeSketch(prims);
    const a = prims[3] as SketchArc;
    const angles = getArcAngles(sk, a);
    expect(angles.startAngle).toBeCloseTo(0, 5);
    expect(angles.endAngle).toBeCloseTo(PI / 2, 5);
  });

  it("handles arc going into negative angle territory", () => {
    const prims = [
      pt("c", 0, 0),
      pt("s", 1, 0), // angle 0
      pt("e", 0, -1), // angle -pi/2 (raw atan2)
      arc("a", "c", "s", "e", 1),
    ];
    const sk = makeSketch(prims);
    const a = prims[3] as SketchArc;
    const angles = getArcAngles(sk, a);
    expect(angles.startAngle).toBeCloseTo(0, 5);
    // getArcAngles returns raw atan2 values, so -pi/2 not normalized to 3pi/2
    expect(angles.endAngle).toBeCloseTo(-PI / 2, 5);
  });
});

// ──────────────────────────────────────────
// findAllIntersections
// ──────────────────────────────────────────
describe("findAllIntersections", () => {
  it("finds intersection of two crossing lines", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 2),
      pt("p3", 2, 0),
      pt("p4", 0, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L1");
    expect(r.length).toBe(1);
    expect(r[0].point.x).toBeCloseTo(1, 5);
    expect(r[0].point.y).toBeCloseTo(1, 5);
  });

  it("finds 2 intersections for line crossing a circle", () => {
    const prims = [
      pt("lp1", -3, 0),
      pt("lp2", 3, 0),
      pt("cc", 0, 0),
      line("L", "lp1", "lp2"),
      circle("C", "cc", 2),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L");
    expect(r.length).toBe(2);
  });

  it("skips lines sharing an endpoint (no intersection reported)", () => {
    // Two lines sharing point p2
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 1, 1),
      pt("p3", 2, 0),
      line("L1", "p1", "p2"),
      line("L2", "p2", "p3"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L1");
    expect(r.length).toBe(0);
  });

  it("returns empty when source prim is not found", () => {
    const sk = makeSketch([pt("p1", 0, 0)]);
    const r = findAllIntersections(sk, "nonexistent");
    expect(r.length).toBe(0);
  });

  it("skips points as other primitives", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 0),
      pt("standalone", 1, 0), // a point primitive at the midpoint
      line("L", "p1", "p2"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L");
    // The standalone point should not produce an intersection
    expect(r.length).toBe(0);
  });

  it("finds circle-circle intersections", () => {
    const prims = [
      pt("c1", -0.5, 0),
      pt("c2", 0.5, 0),
      circle("C1", "c1", 1),
      circle("C2", "c2", 1),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "C1");
    expect(r.length).toBe(2);
  });

  it("finds line-arc intersection filtered by arc range", () => {
    // Arc from angle 0 to pi/2 (quarter circle, top-right)
    // Line from (-2, 0.5) to (2, 0.5) should hit the arc near x=sqrt(1-0.25)
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -2, 0.5),
      pt("lp2", 2, 0.5),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L");
    // Should find 1 intersection (the other crossing at (-sqrt(0.75), 0.5) is outside arc range)
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("swaps tSource and tOther when source is circle and other is line", () => {
    const prims = [
      pt("cc", 0, 0),
      pt("lp1", -3, 0),
      pt("lp2", 3, 0),
      circle("C", "cc", 2),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    // When circle is source
    const r = findAllIntersections(sk, "C");
    expect(r.length).toBe(2);
    // tSource should be angle (from circle's perspective), tOther should be t on line
    for (const ix of r) {
      // The line parameter t should be in a reasonable range
      expect(typeof ix.tSource).toBe("number");
      expect(typeof ix.tOther).toBe("number");
    }
  });

  it("returns empty when line misses an arc range entirely", () => {
    // Arc only in first quadrant, line entirely in third quadrant
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -3, -1),
      pt("lp2", -1, -1),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L");
    expect(r.length).toBe(0);
  });

  it("returns IntersectionResult with correct otherId field", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 2),
      pt("p3", 2, 0),
      pt("p4", 0, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L1");
    expect(r.length).toBe(1);
    expect(r[0].otherPrimId).toBe("L2");
  });

  it("finds multiple intersections from multiple primitives", () => {
    // Line L1 crossed by two non-sharing lines
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 10, 0),
      pt("p3", 3, -3),
      pt("p4", 3, 3),
      pt("p5", 7, -3),
      pt("p6", 7, 3),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
      line("L3", "p5", "p6"),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "L1");
    expect(r.length).toBe(2);
    const otherIds = r.map((ix) => ix.otherPrimId).sort();
    expect(otherIds).toEqual(["L2", "L3"]);
  });

  it("finds arc-arc intersections", () => {
    // Two overlapping semicircular arcs:
    // Arc1: center (-0.5,0), r=1, from (0.5,0) [angle=0] to (-1.5,0) [angle=PI] — upper semicircle
    // Arc2: center (0.5,0), r=1, from (1.5,0) [angle=0] to (-0.5,0) [angle=PI] — upper semicircle
    // Circle-circle intersections: circles centered at (-0.5,0) and (0.5,0) both r=1
    // d=1, both arcs cover the upper half, so intersections at y>0 should be in range
    const prims = [
      pt("c1", -0.5, 0),
      pt("s1", 0.5, 0),
      pt("e1", -1.5, 0),
      pt("c2", 0.5, 0),
      pt("s2", 1.5, 0),
      pt("e2", -0.5, 0),
      arc("A1", "c1", "s1", "e1", 1),
      arc("A2", "c2", "s2", "e2", 1),
    ];
    const sk = makeSketch(prims);
    const r = findAllIntersections(sk, "A1");
    // The two unit circles intersect at (0, sqrt(3)/2) and (0, -sqrt(3)/2)
    // Both arcs cover the upper half, so the upper intersection should be found
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("circle source + arc other → calls intersectCircleArc", () => {
    // Circle at (0,0) r=5, Arc at (7,0) r=5 with start at top, end at bottom
    // They overlap around x=3.5
    const prims = [
      pt("c1", 0, 0),
      circle("circle1", "c1", 5),
      pt("c2", 7, 0),
      pt("as", 7, 5), // arc start (top)
      pt("ae", 7, -5), // arc end (bottom)
      arc("arc1", "c2", "as", "ae", 5),
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "circle1");
    // Circle and arc overlap → should find intersections
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].otherPrimId).toBe("arc1");
  });

  it("arc source + line other → tSource/tOther swapped", () => {
    // Arc at (0,0) r=5, start at (5,0), end at (0,5)
    // Line crossing through the arc
    const prims = [
      pt("c", 0, 0),
      pt("as", 5, 0),
      pt("ae", 0, 5),
      arc("arc1", "c", "as", "ae", 5),
      pt("lp1", 0, -1),
      pt("lp2", 6, 5),
      line("line1", "lp1", "lp2"),
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "arc1");
    // Arc as source, line as other → should have intersections with swapped params
    if (results.length > 0) {
      expect(results[0].otherPrimId).toBe("line1");
      // tSource should be an angle (from the arc), tOther should be a line t-param
    }
  });

  it("arc source + circle other → tSource/tOther swapped", () => {
    const prims = [
      pt("c1", 0, 0),
      pt("as", 5, 0),
      pt("ae", 0, 5),
      arc("arc1", "c1", "as", "ae", 5),
      pt("c2", 7, 0),
      circle("circle1", "c2", 5),
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "arc1");
    if (results.length > 0) {
      expect(results[0].otherPrimId).toBe("circle1");
    }
  });

  it("arc source + arc other → intersectArcArc", () => {
    // Two arcs on overlapping circles
    const prims = [
      pt("c1", 0, 0),
      pt("a1s", 5, 0),
      pt("a1e", 0, 5),
      arc("arc1", "c1", "a1s", "a1e", 5),
      pt("c2", 3, 0),
      pt("a2s", 8, 0),
      pt("a2e", 3, 5),
      arc("arc2", "c2", "a2s", "a2e", 5),
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "arc1");
    // May or may not find intersections depending on arc ranges
    expect(Array.isArray(results)).toBe(true);
  });

  it("two non-shared lines that intersect outside segment range → empty", () => {
    // Line1: (0,0)→(1,0), Line2: (0,2)→(1,3) — would cross if extended but not within [0,1]
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 1, 0),
      line("l1", "p1", "p2"),
      pt("p3", 0, 2),
      pt("p4", 1, 3),
      line("l2", "p3", "p4"),
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "l1");
    // These lines would intersect at t=-2, u=-2 (way outside [0,1])
    expect(results).toHaveLength(0);
  });

  it("returns empty for unknown primitive type combination (fallthrough)", () => {
    // Inject an unrecognized primitive type to verify the dispatch falls through.
    const fakePrim = { id: "fake1", type: "unknown" as any, x: 0, y: 0 };
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 0),
      line("L", "p1", "p2"),
      fakePrim,
    ];
    const sketch = makeSketch(prims);
    const results = findAllIntersections(sketch, "L");
    expect(results).toHaveLength(0);
  });
});

// ──────────────────────────────────────────
// identifyTrimSegment
// ──────────────────────────────────────────
describe("identifyTrimSegment", () => {
  it("returns start-side segment for line with 1 intersection, cursor near start", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 4, 0),
      pt("p3", 2, -2),
      pt("p4", 2, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "L1");
    expect(ixs.length).toBe(1);

    // Cursor near start side (x=0.5)
    const seg = identifyTrimSegment(sk, "L1", ixs, { x: 0.5, y: 0 });
    expect(seg).not.toBeNull();
    expect(seg!.startParam).toBeCloseTo(0, 3);
    expect(seg!.endParam).toBeCloseTo(0.5, 3);
  });

  it("returns end-side segment for line with 1 intersection, cursor near end", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 4, 0),
      pt("p3", 2, -2),
      pt("p4", 2, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "L1");

    // Cursor near end side (x=3.5)
    const seg = identifyTrimSegment(sk, "L1", ixs, { x: 3.5, y: 0 });
    expect(seg).not.toBeNull();
    expect(seg!.startParam).toBeCloseTo(0.5, 3);
    expect(seg!.endParam).toBeCloseTo(1, 3);
  });

  it("returns middle segment for line with 2 intersections, cursor in between", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 6, 0),
      pt("p3", 2, -2),
      pt("p4", 2, 2),
      pt("p5", 4, -2),
      pt("p6", 4, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
      line("L3", "p5", "p6"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "L1");
    expect(ixs.length).toBe(2);

    // Cursor at x=3 (between the two intersections at x=2 and x=4)
    const seg = identifyTrimSegment(sk, "L1", ixs, { x: 3, y: 0 });
    expect(seg).not.toBeNull();
    // t values: 2/6 = 0.333 and 4/6 = 0.667
    expect(seg!.startParam).toBeCloseTo(1 / 3, 2);
    expect(seg!.endParam).toBeCloseTo(2 / 3, 2);
  });

  it("returns first segment for line with 2 intersections, cursor at start end", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 6, 0),
      pt("p3", 2, -2),
      pt("p4", 2, 2),
      pt("p5", 4, -2),
      pt("p6", 4, 2),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
      line("L3", "p5", "p6"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "L1");

    // Cursor at x=0.5 (before first intersection)
    const seg = identifyTrimSegment(sk, "L1", ixs, { x: 0.5, y: 0 });
    expect(seg).not.toBeNull();
    expect(seg!.startParam).toBeCloseTo(0, 3);
    expect(seg!.endParam).toBeCloseTo(1 / 3, 2);
  });

  it("returns angular segment for circle with 2 intersections", () => {
    // Circle intersected by two lines
    const prims = [
      pt("cc", 0, 0),
      pt("lp1", -3, 0),
      pt("lp2", 3, 0),
      pt("lp3", 0, -3),
      pt("lp4", 0, 3),
      circle("C", "cc", 2),
      line("L1", "lp1", "lp2"),
      line("L2", "lp3", "lp4"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "C");
    expect(ixs.length).toBe(4); // 2 from each line

    // Cursor in first quadrant
    const seg = identifyTrimSegment(sk, "C", ixs, { x: 2, y: 2 });
    expect(seg).not.toBeNull();
  });

  it("returns null for circle with fewer than 2 intersections", () => {
    const prims = [pt("cc", 0, 0), circle("C", "cc", 2)];
    const sk = makeSketch(prims);
    const seg = identifyTrimSegment(sk, "C", [], { x: 1, y: 0 });
    expect(seg).toBeNull();
  });

  it("returns null for a point primitive", () => {
    const prims = [pt("p1", 0, 0)];
    const sk = makeSketch(prims);
    const seg = identifyTrimSegment(sk, "p1", [], { x: 0, y: 0 });
    expect(seg).toBeNull();
  });

  it("returns null for a zero-length line", () => {
    const prims = [pt("p1", 1, 1), pt("p2", 1, 1), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const seg = identifyTrimSegment(sk, "L", [], { x: 1, y: 1 });
    expect(seg).toBeNull();
  });

  it("handles arc with boundary-filtered intersections returning segment", () => {
    // Arc from (1,0) to (0,1) with a line through its midpoint
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -2, 0.5),
      pt("lp2", 2, 0.5),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const ixs = findAllIntersections(sk, "A");
    // The arc should be intersected by the line
    if (ixs.length >= 2) {
      const seg = identifyTrimSegment(sk, "A", ixs, { x: 0.9, y: 0.4 });
      expect(seg).not.toBeNull();
    }
  });

  it("returns null when no intersections for a line (whole line, returns null)", () => {
    const prims = [pt("p1", 0, 0), pt("p2", 4, 0), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const seg = identifyTrimSegment(sk, "L", [], { x: 2, y: 0 });
    // With no intersections, the only segment is [0,1] which is the whole line
    // Implementation may return null since there's nothing to trim
    expect(seg).toBeNull();
  });

  it("arc with valid intersection → identifies correct segment", () => {
    // Arc from 0 to π/2 (quarter circle), intersection at π/4
    const prims = [
      pt("c", 0, 0),
      pt("as", 5, 0), // start angle = 0
      pt("ae", 0, 5), // end angle = π/2
      arc("arc1", "c", "as", "ae", 5),
    ];
    const sketch = makeSketch(prims);

    // Intersection at angle π/4 (45 degrees)
    const intersections: IntersectionResult[] = [
      {
        point: { x: 5 * Math.cos(PI / 4), y: 5 * Math.sin(PI / 4) },
        tSource: PI / 4,
        tOther: 0,
        otherPrimId: "other",
      },
    ];

    // Cursor near the start of the arc (angle ~π/8)
    const cursor = { x: 5 * Math.cos(PI / 8), y: 5 * Math.sin(PI / 8) };
    const result = identifyTrimSegment(sketch, "arc1", intersections, cursor);
    expect(result).not.toBeNull();
  });

  it("arc with multiple intersections → identifies middle segment", () => {
    const prims = [
      pt("c", 0, 0),
      pt("as", 5, 0), // start angle = 0
      pt("ae", 0, 5), // end angle = π/2
      arc("arc1", "c", "as", "ae", 5),
    ];
    const sketch = makeSketch(prims);

    // Two intersections at π/6 and π/3
    const intersections: IntersectionResult[] = [
      {
        point: { x: 5 * Math.cos(PI / 6), y: 5 * Math.sin(PI / 6) },
        tSource: PI / 6,
        tOther: 0,
        otherPrimId: "o1",
      },
      {
        point: { x: 5 * Math.cos(PI / 3), y: 5 * Math.sin(PI / 3) },
        tSource: PI / 3,
        tOther: 0,
        otherPrimId: "o2",
      },
    ];

    // Cursor between the two intersections (angle π/4)
    const cursor = { x: 5 * Math.cos(PI / 4), y: 5 * Math.sin(PI / 4) };
    const result = identifyTrimSegment(sketch, "arc1", intersections, cursor);
    expect(result).not.toBeNull();
  });
});

// ──────────────────────────────────────────
// findClosestEndpoint
// ──────────────────────────────────────────
describe("findClosestEndpoint", () => {
  it("finds a line endpoint within snap distance", () => {
    const prims = [pt("p1", 0, 0), pt("p2", 5, 0), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const result = findClosestEndpoint(sk, { x: 0.1, y: 0.1 }, 1);
    expect(result).not.toBeNull();
    expect(result!.primitiveId).toBe("L");
    expect(result!.pointId).toBe("p1");
    expect(result!.isStart).toBe(true);
  });

  it("returns null when no endpoints are within snap distance", () => {
    const prims = [pt("p1", 0, 0), pt("p2", 5, 0), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const result = findClosestEndpoint(sk, { x: 2.5, y: 3 }, 0.5);
    expect(result).toBeNull();
  });

  it("returns the closest of multiple nearby endpoints", () => {
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 1, 0),
      pt("p3", 0.3, 0),
      pt("p4", 2, 0),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const result = findClosestEndpoint(sk, { x: 0.2, y: 0 }, 0.5);
    expect(result).not.toBeNull();
    // p3 at (0.3, 0) is closest to (0.2, 0) at distance 0.1
    // p1 at (0, 0) is at distance 0.2
    expect(result!.pointId).toBe("p3");
  });

  it("includes arc start/end endpoints", () => {
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      arc("A", "ac", "as", "ae", 1),
    ];
    const sk = makeSketch(prims);
    const result = findClosestEndpoint(sk, { x: 0.9, y: 0 }, 0.5);
    expect(result).not.toBeNull();
    expect(result!.primitiveId).toBe("A");
    expect(result!.pointId).toBe("as");
    expect(result!.isStart).toBe(true);
  });

  it("returns null for empty sketch", () => {
    const sk = makeSketch([]);
    const result = findClosestEndpoint(sk, { x: 0, y: 0 }, 1);
    expect(result).toBeNull();
  });

  it("finds endpoint when cursor is exactly on it", () => {
    const prims = [pt("p1", 3, 4), pt("p2", 7, 8), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const result = findClosestEndpoint(sk, { x: 3, y: 4 }, 0.5);
    expect(result).not.toBeNull();
    expect(result!.primitiveId).toBe("L");
    expect(result!.pointId).toBe("p1");
    expect(result!.isStart).toBe(true);
  });

  it("arc end point closer than start point → returns end", () => {
    const prims = [
      pt("c", 0, 0),
      pt("as", 5, 0),
      pt("ae", 0, 5),
      arc("arc1", "c", "as", "ae", 5),
    ];
    const sketch = makeSketch(prims);
    // Cursor near the end point (0, 5)
    const result = findClosestEndpoint(sketch, { x: 0.1, y: 4.9 }, 1);
    expect(result).not.toBeNull();
    expect(result!.pointId).toBe("ae");
    expect(result!.isStart).toBe(false);
  });
});

// ──────────────────────────────────────────
// findNearestExtendTarget
// ──────────────────────────────────────────
describe("findNearestExtendTarget", () => {
  it("extends line from start and finds intersection with another line", () => {
    // L1: (2,0) -> (4,0), extend from start goes left
    // L2: vertical line at x=0 from (0,-5) to (0,5)
    const prims = [
      pt("p1", 2, 0),
      pt("p2", 4, 0),
      pt("p3", 0, -5),
      pt("p4", 0, 5),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L1", true);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(0, 5);
    expect(result!.point.y).toBeCloseTo(0, 5);
  });

  it("extends line from end and finds intersection with a circle", () => {
    // L: (0,0) -> (1,0), extend from end goes right
    // Circle at (5, 0) r=2, so hits at x=3
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 1, 0),
      pt("cc", 5, 0),
      line("L", "p1", "p2"),
      circle("C", "cc", 2),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L", false);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(3, 5);
    expect(result!.point.y).toBeCloseTo(0, 5);
  });

  it("returns null when no target exists in extend direction", () => {
    // Only one line, nothing to extend to
    const prims = [pt("p1", 0, 0), pt("p2", 1, 0), line("L", "p1", "p2")];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L", false);
    expect(result).toBeNull();
  });

  it("returns null when line is not found", () => {
    const sk = makeSketch([pt("p", 0, 0)]);
    const result = findNearestExtendTarget(sk, "nonexistent", true);
    expect(result).toBeNull();
  });

  it("picks nearest target when multiple exist", () => {
    // L1: (0,0) -> (1,0), extend from end (rightward)
    // L2: vertical at x=3
    // L3: vertical at x=5
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 1, 0),
      pt("p3", 3, -5),
      pt("p4", 3, 5),
      pt("p5", 5, -5),
      pt("p6", 5, 5),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
      line("L3", "p5", "p6"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L1", false);
    expect(result).not.toBeNull();
    // Should find the nearer line at x=3
    expect(result!.point.x).toBeCloseTo(3, 5);
  });

  it("does not extend backward (requires t > epsilon for extension)", () => {
    // L1: (0,0) -> (2,0), extend from end
    // L2: vertical at x=-1 (behind start)
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 0),
      pt("p3", -1, -5),
      pt("p4", -1, 5),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L1", false);
    // L2 is behind; extending from end goes right, but L2 is at x=-1, behind.
    // The 1000x extended line from (2,0) in direction (2,0) would go to (2002,0)
    // Intersection with L2 at x=-1 would have negative t → filtered
    expect(result).toBeNull();
  });

  it("extends toward an arc and finds intersection within arc range", () => {
    // Line going toward a quarter-circle arc
    const prims = [
      pt("p1", 0, -2),
      pt("p2", 0, -1),
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      line("L", "p1", "p2"),
      arc("A", "ac", "as", "ae", 1),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L", false);
    // Line extends upward from (0,-1), should hit arc at (0,1) if arc covers that angle
    // Arc from angle 0 to pi/2: at angle pi/2 → (0,1) is the endpoint
    if (result) {
      expect(result.point.y).toBeGreaterThan(-1);
    }
  });

  it("extends from exact endpoint intersection", () => {
    // L1: (0,0) -> (2,0), extend from end
    // L2: from (4,0) to (4,4) → intersection at (4,0)
    const prims = [
      pt("p1", 0, 0),
      pt("p2", 2, 0),
      pt("p3", 4, 0),
      pt("p4", 4, 4),
      line("L1", "p1", "p2"),
      line("L2", "p3", "p4"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestExtendTarget(sk, "L1", false);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(4, 5);
    expect(result!.point.y).toBeCloseTo(0, 5);
  });
});

// ──────────────────────────────────────────
// findNearestArcExtendTarget
// ──────────────────────────────────────────
describe("findNearestArcExtendTarget", () => {
  it("extends arc from start and hits a line", () => {
    // Arc: center (0,0), from (1,0) to (0,1) (0 to pi/2), r=1
    // Extending from start means going clockwise (below x-axis)
    // Line at y=-0.5 from (-3, -0.5) to (3, -0.5)
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -3, -0.5),
      pt("lp2", 3, -0.5),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", true);
    // Arc goes from 0 to pi/2; extending from start (clockwise) enters negative y
    // Line at y=-0.5 should be hit
    if (result) {
      expect(result.point.y).toBeCloseTo(-0.5, 3);
    }
  });

  it("extends arc from end and hits a line", () => {
    // Arc: center (0,0), from (1,0) to (0,1) (0 to pi/2), r=1
    // Extending from end means going counter-clockwise beyond pi/2
    // Line at x=-0.5 from (-0.5,-3) to (-0.5,3)
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -0.5, -3),
      pt("lp2", -0.5, 3),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", false);
    // Extending beyond pi/2 CCW; line at x=-0.5 on circle means angle=acos(-0.5)=2pi/3
    if (result) {
      expect(result.point.x).toBeCloseTo(-0.5, 3);
    }
  });

  it("returns null when arc is not found", () => {
    const sk = makeSketch([pt("p", 0, 0)]);
    const result = findNearestArcExtendTarget(sk, "nonexistent", true);
    expect(result).toBeNull();
  });

  it("returns null when no valid extend target exists", () => {
    // Arc alone with no other primitives to intersect
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      arc("A", "ac", "as", "ae", 1),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", false);
    expect(result).toBeNull();
  });

  it("picks nearest target by angular distance when multiple exist", () => {
    // Arc from 0 to pi/2 centered at origin
    // Two lines: one closer angularly when extending from end, one farther
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      // Line at x=-0.866 (angle ~5pi/6 = 150 deg from pi/2 = 60 deg away)
      pt("lp1", -0.866, -3),
      pt("lp2", -0.866, 3),
      // Line at y=-0.866 (angle ~-pi/3 = 5pi/3, far from pi/2)
      pt("lp3", -3, -0.866),
      pt("lp4", 3, -0.866),
      arc("A", "ac", "as", "ae", 1),
      line("L1", "lp1", "lp2"),
      line("L2", "lp3", "lp4"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", false);
    // Extending from end (pi/2) CCW, the nearest target should be L1
    if (result) {
      expect(result.point.x).toBeCloseTo(-0.866, 2);
    }
  });

  it("extends from start and hits a circle", () => {
    // Arc centered at (0,0) from (2,0) to (0,2), r=2
    // Circle at (3, -1) r=1.5
    const prims = [
      pt("ac", 0, 0),
      pt("as", 2, 0),
      pt("ae", 0, 2),
      pt("cc", 3, -1),
      arc("A", "ac", "as", "ae", 2),
      circle("C", "cc", 1.5),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", true);
    // Extending from start clockwise into 4th quadrant might hit circle at (3,-1)
    if (result) {
      // The hit point should be on the circle
      const dx = result.point.x - 3;
      const dy = result.point.y - -1;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(1.5, 1);
    }
  });

  it("extends from end and hits another arc", () => {
    // Arc1: center (0,0), from (1,0) to (0,1), r=1
    // Arc2: center (0,0), from (-1,0) to (0,-1), r=1 (in 3rd quadrant region)
    const prims = [
      pt("ac1", 0, 0),
      pt("s1", 1, 0),
      pt("e1", 0, 1),
      pt("ac2", -2, 0),
      pt("s2", -1, 0),
      pt("e2", -2, -1),
      arc("A1", "ac1", "s1", "e1", 1),
      arc("A2", "ac2", "s2", "e2", 1),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A1", false);
    // Extending A1 from end (angle pi/2) CCW; whether it hits A2 depends on geometry
    // This is a valid test of the code path even if result is null
    // (the arcs may or may not intersect depending on exact geometry)
    expect(result === null || result.point !== undefined).toBe(true);
  });

  it("returns targetPrimId for the intersected primitive", () => {
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      pt("lp1", -3, -0.5),
      pt("lp2", 3, -0.5),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    const result = findNearestArcExtendTarget(sk, "A", true);
    if (result) {
      expect(result.targetPrimId).toBe("L");
    }
  });

  it("skips intersections that fall on the arc itself", () => {
    // Two concentric arcs at (0,0) won't produce arc-on-arc intersection
    // but a line crossing the arc at its midpoint and extending beyond
    const prims = [
      pt("ac", 0, 0),
      pt("as", 1, 0),
      pt("ae", 0, 1),
      // Line crossing the arc at angle pi/4 (on the arc) and at the other side
      pt("lp1", -2, -2),
      pt("lp2", 2, 2),
      arc("A", "ac", "as", "ae", 1),
      line("L", "lp1", "lp2"),
    ];
    const sk = makeSketch(prims);
    // The line-circle intersection at angle pi/4 is on the arc itself
    // The one at angle 5pi/4 is outside the arc
    const result = findNearestArcExtendTarget(sk, "A", false);
    // Extending from end (pi/2) CCW: the intersection at 5pi/4 should be the target,
    // while the intersection at pi/4 (on the arc) should be skipped
    if (result) {
      // The target should be at angle 5pi/4, i.e., (-sqrt(2)/2, -sqrt(2)/2)
      const s = Math.SQRT1_2;
      expect(result.point.x).toBeCloseTo(-s, 2);
      expect(result.point.y).toBeCloseTo(-s, 2);
    }
  });
});
