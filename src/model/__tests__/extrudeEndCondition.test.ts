import { describe, expect, it } from "vitest";
import { solveExtrudeEndBound } from "../extrudeEndCondition";

const dir = { x: 0, y: 0, z: 1 };
const origin = { x: 0, y: 0, z: 0 };

const square = (z: number) => [
  { x: 0, y: 0, z },
  { x: 1, y: 0, z },
  { x: 1, y: 1, z },
  { x: 0, y: 1, z },
];

describe("extrude through-all", () => {
  it("reaches the farthest vertex ahead of the plane", () => {
    const result = solveExtrudeEndBound({
      endBound: "THROUGH_ALL",
      origin,
      direction: dir,
      throughBodies: [
        {
          vertices: [
            { x: 0, y: 0, z: 0.01 },
            { x: 0, y: 0, z: 0.04 },
          ],
          faces: [],
        },
      ],
    });
    expect(result).toEqual({ ok: true, depth: 0.04 });
  });

  it("adds the overshoot and rejects a negative one", () => {
    const body = {
      vertices: [{ x: 0, y: 0, z: 0.04 }],
      faces: [],
    };
    expect(
      solveExtrudeEndBound({
        endBound: "THROUGH_ALL_WITH_OFFSET",
        origin,
        direction: dir,
        throughBodies: [body],
        offset: 0.01,
      }),
    ).toEqual({ ok: true, depth: 0.05 });

    const negative = solveExtrudeEndBound({
      endBound: "THROUGH_ALL_WITH_OFFSET",
      origin,
      direction: dir,
      throughBodies: [body],
      offset: -0.01,
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.reason).toContain("zero or positive");
  });

  it("names the failure when nothing is ahead of the plane", () => {
    const result = solveExtrudeEndBound({
      endBound: "THROUGH_ALL",
      origin,
      direction: dir,
      throughBodies: [
        {
          vertices: [
            { x: 0, y: 0, z: -0.02 },
            { x: 0, y: 0, z: 0 },
          ],
          faces: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("no body ahead of the sketch plane");
    }
  });

  it("measures along the flipped direction", () => {
    const result = solveExtrudeEndBound({
      endBound: "THROUGH_ALL",
      origin,
      direction: { x: 0, y: 0, z: -1 },
      throughBodies: [{ vertices: [{ x: 0, y: 0, z: -0.03 }], faces: [] }],
    });
    expect(result).toEqual({ ok: true, depth: 0.03 });
  });
});

describe("extrude up-to bounds", () => {
  it("projects the selected vertex onto the direction", () => {
    expect(
      solveExtrudeEndBound({
        endBound: "UP_TO_VERTEX",
        origin,
        direction: dir,
        vertex: { x: 5, y: -2, z: 0.025 },
      }),
    ).toEqual({ ok: true, depth: 0.025 });
  });

  it("rejects a vertex behind the plane", () => {
    const result = solveExtrudeEndBound({
      endBound: "UP_TO_VERTEX",
      origin,
      direction: dir,
      vertex: { x: 0, y: 0, z: -0.01 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("behind the sketch plane");
  });

  it("intersects the selected face plane", () => {
    expect(
      solveExtrudeEndBound({
        endBound: "UP_TO_FACE",
        origin,
        direction: dir,
        face: square(0.05),
      }),
    ).toEqual({ ok: true, depth: 0.05 });
  });

  it("rejects a face parallel to the direction", () => {
    const result = solveExtrudeEndBound({
      endBound: "UP_TO_FACE",
      origin,
      direction: dir,
      face: [
        { x: 0.02, y: 0, z: 0 },
        { x: 0.02, y: 1, z: 0 },
        { x: 0.02, y: 1, z: 1 },
        { x: 0.02, y: 0, z: 1 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("parallel");
  });

  it("rejects a face behind the plane and a degenerate polygon", () => {
    const behind = solveExtrudeEndBound({
      endBound: "UP_TO_FACE",
      origin,
      direction: dir,
      face: square(-0.02),
    });
    expect(behind.ok).toBe(false);
    const flat = solveExtrudeEndBound({
      endBound: "UP_TO_FACE",
      origin,
      direction: dir,
      face: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    });
    expect(flat.ok).toBe(false);
    if (!flat.ok) expect(flat.reason).toContain("non-degenerate");
  });

  it("uses the farthest point of a non-planar surface", () => {
    expect(
      solveExtrudeEndBound({
        endBound: "UP_TO_SURFACE",
        origin,
        direction: dir,
        face: [
          { x: 0, y: 0, z: 0.02 },
          { x: 1, y: 0, z: 0.07 },
          { x: 1, y: 1, z: 0.03 },
        ],
      }),
    ).toEqual({ ok: true, depth: 0.07 });
  });
});

describe("extrude end-condition guards", () => {
  it("rejects a degenerate direction", () => {
    const result = solveExtrudeEndBound({
      endBound: "THROUGH_ALL",
      origin,
      direction: { x: 0, y: 0, z: 0 },
      throughBodies: [{ vertices: [{ x: 0, y: 0, z: 1 }], faces: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("degenerate");
  });

  it("refuses to derive a depth for BLIND or an unknown bound", () => {
    const blind = solveExtrudeEndBound({
      endBound: "BLIND",
      origin,
      direction: dir,
    });
    expect(blind.ok).toBe(false);
    if (!blind.ok) expect(blind.reason).toContain("explicit depth");

    const unknown = solveExtrudeEndBound({
      endBound: "UP_TO_NEXT" as never,
      origin,
      direction: dir,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toContain("unknown end condition");
  });
});
