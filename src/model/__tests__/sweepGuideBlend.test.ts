import { describe, expect, it } from "vitest";
import { blendGuidePoints } from "../sweepPath";

const line = (x: number) => [
  { x, y: 0, z: 0 },
  { x, y: 0, z: 1 },
  { x, y: 0, z: 2 },
];

describe("blendGuidePoints", () => {
  it("averages corresponding points on two guides", () => {
    const blended = blendGuidePoints([line(0), line(2)], 3)!;
    expect(blended).toHaveLength(3);
    for (const p of blended) expect(p.x).toBeCloseTo(1, 6);
    expect(blended[0]!.z).toBeCloseTo(0, 6);
    expect(blended[2]!.z).toBeCloseTo(2, 6);
  });

  it("returns a copy of a single guide unchanged", () => {
    const blended = blendGuidePoints([line(5)])!;
    expect(blended.map((p) => p.x)).toEqual([5, 5, 5]);
    expect(blended).not.toBe(line(5));
  });

  it("ignores empty guide chains and reports nothing when none remain", () => {
    expect(blendGuidePoints([])).toBeUndefined();
    expect(blendGuidePoints([[]])).toBeUndefined();
  });

  it("resamples guides with different point counts by arc length", () => {
    const sparse = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 4 },
    ];
    const dense = [
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 1 },
      { x: 4, y: 0, z: 2 },
      { x: 4, y: 0, z: 3 },
      { x: 4, y: 0, z: 4 },
    ];
    const blended = blendGuidePoints([sparse, dense], 5)!;
    expect(blended[0]).toEqual({ x: 2, y: 0, z: 0 });
    expect(blended[4]!.z).toBeCloseTo(4, 6);
    for (const p of blended) expect(p.x).toBeCloseTo(2, 6);
  });
});
