import { describe, expect, it } from "vitest";
import { solveRevolveEndAngle } from "../revolveEndCondition";

const origin = { x: 0, y: 0, z: 0 };
const zAxis = { x: 0, y: 0, z: 1 };

describe("solveRevolveEndAngle", () => {
  it("stops a quarter turn at a face the point reaches first", () => {
    const result = solveRevolveEndAngle({
      endBound: "UP_TO_FACE",
      profilePoints: [{ x: 1, y: 0, z: 0 }],
      axisOrigin: origin,
      axisDir: zAxis,
      // x = 0 plane, reached after a quarter turn from +X about +Z.
      face: [
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 2, z: 1 },
        { x: 0, y: 2, z: -1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("ignores a face hit that lies outside the polygon", () => {
    const result = solveRevolveEndAngle({
      endBound: "UP_TO_FACE",
      profilePoints: [{ x: 1, y: 0, z: 5 }],
      axisOrigin: origin,
      axisDir: zAxis,
      // The plane exists at y=0 but the polygon sits far away in z.
      face: [
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("measures the turn to a vertex", () => {
    const result = solveRevolveEndAngle({
      endBound: "UP_TO_VERTEX",
      profilePoints: [{ x: 1, y: 0, z: 0 }],
      axisOrigin: origin,
      axisDir: zAxis,
      vertex: { x: 0, y: 1, z: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("uses the reverse axis direction as a negative turn", () => {
    const result = solveRevolveEndAngle({
      endBound: "UP_TO_VERTEX",
      profilePoints: [{ x: 1, y: 0, z: 0 }],
      axisOrigin: origin,
      axisDir: { x: 0, y: 0, z: -1 },
      vertex: { x: 0, y: 1, z: 0 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.angle).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it("names a profile that lies on the axis", () => {
    const result = solveRevolveEndAngle({
      endBound: "UP_TO_VERTEX",
      profilePoints: [{ x: 0, y: 0, z: 2 }],
      axisOrigin: origin,
      axisDir: zAxis,
      vertex: { x: 0, y: 1, z: 0 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("axis");
  });

  it("names a missing reference", () => {
    const face = solveRevolveEndAngle({
      endBound: "UP_TO_FACE",
      profilePoints: [{ x: 1, y: 0, z: 0 }],
      axisOrigin: origin,
      axisDir: zAxis,
    });
    expect(face.ok).toBe(false);
    const vertex = solveRevolveEndAngle({
      endBound: "UP_TO_VERTEX",
      profilePoints: [{ x: 1, y: 0, z: 0 }],
      axisOrigin: origin,
      axisDir: zAxis,
    });
    expect(vertex.ok).toBe(false);
  });
});
