import { Brep, Edge, Face, Vertex } from "@vitekk02/cadjs";
import { describe, expect, it } from "vitest";
import { type HitResolverDeps, resolveHitToTag } from "../hitResolver";

const v = (x: number, y: number, z: number) => new Vertex(x, y, z);

const mkBrep = () => {
  const a = v(0, 0, 0);
  const b = v(1, 0, 0);
  const c = v(1, 1, 0);
  const d = v(0, 1, 0);
  const e = v(0, 0, 1);
  return new Brep(
    [a, b, c, d, e],
    [new Edge(a, b), new Edge(a, c), new Edge(a, d)],
    [new Face([a, b, c]), new Face([a, c, d]), new Face([a, d, e])],
  );
};

const mkSiblingBrep = () => {
  const p = v(5, 5, 5);
  const q = v(6, 5, 5);
  const r = v(6, 6, 5);
  return new Brep([p, q, r], [], [new Face([p, q, r])]);
};

const deps = (
  authored: Record<string, string>,
  outputs: Map<string, unknown>,
): HitResolverDeps => ({
  featureForElement: (nodeId: string) => authored[nodeId] ?? null,
  outputs: outputs as unknown as HitResolverDeps["outputs"],
});

describe("resolveHitToTag", () => {
  it("maps a base-body triangle to its persistent face tag", () => {
    const outputs = new Map([
      ["F1", { featureId: "F1", brep: mkBrep(), additionalBodies: [] }],
    ]);
    const d = deps({ E1: "F1" }, outputs);
    const hit = resolveHitToTag(
      "E1",
      [
        { x: 1, y: 1, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      d,
    );
    expect(hit).toEqual({ featureId: "F1", faceTag: "F1_F0" });
  });

  it("searches sibling bodies and reports the sibling owner id", () => {
    const outputs = new Map([
      [
        "F1",
        {
          featureId: "F1",
          brep: mkBrep(),
          additionalBodies: [{ featureId: "F1#1", brep: mkSiblingBrep() }],
        },
      ],
    ]);
    const d = deps({ E1: "F1" }, outputs);
    const hit = resolveHitToTag(
      "E1",
      [
        { x: 6, y: 6, z: 5 },
        { x: 5, y: 5, z: 5 },
        { x: 6, y: 5, z: 5 },
      ],
      d,
    );
    expect(hit).toEqual({ featureId: "F1#1", faceTag: "F1#1_F0" });
  });

  it("returns null for unauthored elements and missing triangles", () => {
    const outputs = new Map([
      ["F1", { featureId: "F1", brep: mkBrep(), additionalBodies: [] }],
    ]);
    const d = deps({ E1: "F1" }, outputs);
    expect(
      resolveHitToTag(
        "E9",
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        d,
      ),
    ).toBeNull();
    expect(resolveHitToTag("E1", undefined, d)).toBeNull();
  });

  it("returns null when the triangle matches no face", () => {
    const outputs = new Map([
      ["F1", { featureId: "F1", brep: mkBrep(), additionalBodies: [] }],
    ]);
    const d = deps({ E1: "F1" }, outputs);
    expect(
      resolveHitToTag(
        "E1",
        [
          { x: 9, y: 9, z: 9 },
          { x: 8, y: 9, z: 9 },
          { x: 8, y: 8, z: 9 },
        ],
        d,
      ),
    ).toBeNull();
  });
});
