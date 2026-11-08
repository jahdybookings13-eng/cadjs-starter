import { describe, expect, it } from "vitest";
import {
  buildRefMap,
  connectorFrame,
  flattenAssembly,
  groupSubassembly,
  identity,
  interferencePairs,
  matMul,
  patternLinear,
  setInstanceVisible,
  transformPoint,
  ungroupSubassembly,
  type BodyBounds,
} from "../index";

const cube: BodyBounds = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10, y: 10, z: 10 },
};

describe("assembly workspace primitives", () => {
  it("builds named connector frames and falls back to body", () => {
    const center = connectorFrame("center", cube)!;
    expect([center[3], center[7], center[11]]).toEqual([5, 5, 5]);
    const top = connectorFrame("top", cube)!;
    expect([top[3], top[7], top[11]]).toEqual([5, 5, 10]);

    const asm = {
      id: "a",
      mates: [],
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        { id: "i2", partId: "p", transform: identity() },
      ],
    };
    const refs = buildRefMap(asm, { b1: cube });
    expect(Object.keys(refs.i1!)).toContain("right");
    expect(refs.i2!.body).toBeDefined();
  });

  it("reports coincident world boxes and honors visibility", () => {
    const base = {
      id: "a",
      mates: [],
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        { id: "i2", partId: "p", bodyId: "b1", transform: identity() },
      ],
    };
    expect(interferencePairs(base, { b1: cube })[0]!.penetration).toBe(10);
    expect(
      interferencePairs(setInstanceVisible(base, "i2", false), { b1: cube }),
    ).toHaveLength(0);
  });

  it("patterns instances along the selected axis", () => {
    const asm = {
      id: "a",
      mates: [],
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
      ],
    };
    const next = patternLinear(asm, "i1", "x", 3, 20);
    expect(next.instances).toHaveLength(3);
    expect(next.instances.map((i) => i.transform[3])).toEqual([0, 20, 40]);
    expect(next.instances[2]!.id).toBe("i1_3");
  });

  it("groups leaves into a nested subassembly and flattens world transforms", () => {
    const asm = {
      id: "a",
      mates: [],
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        {
          id: "i2",
          partId: "p",
          bodyId: "b1",
          transform: [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
    };
    const nested = groupSubassembly(asm, ["i1", "i2"], "Gear set");
    expect(nested.instances).toHaveLength(1);
    expect(nested.instances[0]!.subassembly?.instances).toHaveLength(2);
    const leaves = flattenAssembly(nested);
    expect(leaves).toHaveLength(2);
    expect(leaves[0]!.path).toEqual([nested.instances[0]!.id, "i1"]);
    expect(leaves[1]!.transform[3]).toBe(10);
    const parent = nested.instances[0]!;
    parent.transform = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(flattenAssembly(nested)[1]!.transform[3]).toBe(15);
    const ungrouped = ungroupSubassembly(nested, parent.id);
    expect(ungrouped.instances).toHaveLength(2);
    expect(ungrouped.instances[1]!.transform[3]).toBe(15);
  });

  it("composes nested rigid transforms", () => {
    const translate = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const rotate = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const p = transformPoint(matMul(translate, rotate), [1, 0, 0]);
    expect(p[0]).toBeCloseTo(5);
    expect(p[1]).toBeCloseTo(1);
  });

  it("uses face triangles instead of reporting a bounds-only false positive", () => {
    const asm = {
      id: "a",
      mates: [],
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        { id: "i2", partId: "p", bodyId: "b1", transform: identity() },
      ],
    };
    const bounds = { b1: cube };
    const twoBodies = {
      ...asm,
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        { id: "i2", partId: "p", bodyId: "b2", transform: identity() },
      ],
    };
    const mesh = [
      { x: 1, y: 1, z: 5 },
      { x: 9, y: 1, z: 5 },
      { x: 1, y: 9, z: 5 },
    ] as const;
    const overlapping = interferencePairs(
      twoBodies,
      { b1: cube, b2: cube },
      0,
      { b1: { triangles: [mesh] }, b2: { triangles: [mesh] } },
    );
    expect(overlapping[0]?.method).toBe("face");

    const disjoint = interferencePairs(twoBodies, { b1: cube, b2: cube }, 0, {
      b1: { triangles: [mesh] },
      b2: {
        triangles: [
          [
            { x: 1, y: 1, z: 1 },
            { x: 9, y: 1, z: 1 },
            { x: 1, y: 9, z: 1 },
          ],
        ],
      },
    });
    expect(disjoint).toHaveLength(0);
  });
});
