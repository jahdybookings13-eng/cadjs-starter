import { describe, expect, it } from "vitest";
import { selectionBboxMM } from "../exportSelection";

describe("selection bbox", () => {
  it("converts local vertices plus world offset from metres to mm", () => {
    const bbox = selectionBboxMM(
      [
        {
          nodeId: "n1",
          position: { x: 0.01, y: 0, z: 0 },
          vertexPositions: new Float32Array([0, 0, 0, 0.05, 0.04, 0.03]),
        },
      ],
      ["n1"],
    );
    expect(bbox).not.toBeNull();
    expect(bbox![0]).toBeCloseTo(10, 5);
    expect(bbox![1]).toBeCloseTo(0, 5);
    expect(bbox![2]).toBeCloseTo(0, 5);
    expect(bbox![3]).toBeCloseTo(60, 5);
    expect(bbox![4]).toBeCloseTo(40, 5);
    expect(bbox![5]).toBeCloseTo(30, 5);
  });

  it("falls back to the element position and still converts", () => {
    const bbox = selectionBboxMM(
      [{ nodeId: "n1", position: { x: 0.01, y: 0.02, z: 0.03 } }],
      ["n1"],
    );
    expect(bbox).toEqual([10, 20, 30, 10, 20, 30]);
  });

  it("only includes requested ids", () => {
    const bbox = selectionBboxMM(
      [
        {
          nodeId: "n1",
          vertexPositions: new Float32Array([0, 0, 0]),
        },
        {
          nodeId: "n2",
          vertexPositions: new Float32Array([1, 1, 1]),
        },
      ],
      ["n2"],
    );
    expect(bbox).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
  });
});
