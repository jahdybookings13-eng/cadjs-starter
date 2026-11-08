import { describe, expect, it } from "vitest";
import {
  assemblyLodForDistance,
  buildRefMap,
  customConnectorFrame,
  dofAnalysis,
  dragInstance,
  emptyAssemblyTab,
  flattenAssembly,
  identity,
  parseAssemblyTab,
  planAssemblyRender,
  serializeAssemblyTab,
  setMateSuppressed,
  solve,
  updateMate,
  validateMates,
  type Assembly,
  type BodyBounds,
} from "../index";

const cube: BodyBounds = {
  min: { x: -1, y: -1, z: -1 },
  max: { x: 1, y: 1, z: 1 },
};

function asmWithMate(): Assembly {
  return {
    id: "a",
    instances: [
      { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
      { id: "i2", partId: "p", bodyId: "b1", transform: identity() },
    ],
    mates: [
      {
        id: "m1",
        kind: "coincident",
        a: { bodyId: "i1", ref: "center" },
        b: { bodyId: "i2", ref: "center" },
      },
    ],
  };
}

describe("Phase 4 assembly parity gaps", () => {
  it("suppresses mates independently of enable, solving and DOF", () => {
    const asm = asmWithMate();
    const suppressed = setMateSuppressed(asm, "m1", true);
    expect(suppressed.mates[0]?.suppressed).toBe(true);
    expect(suppressed.mates[0]?.enabled).not.toBe(false);
    expect(validateMates(suppressed)).toEqual([]);
    expect(
      dofAnalysis(suppressed, buildRefMap(suppressed, { b1: cube }))
        .constraints,
    ).toBe(0);
    const solved = solve(suppressed, buildRefMap(suppressed, { b1: cube }));
    expect(solved.mateIds ?? []).not.toContain("m1");
    expect(
      setMateSuppressed(suppressed, "m1", false).mates[0]?.suppressed,
    ).toBe(false);
  });

  it("edits mate kind and both connector references in place", () => {
    const edited = updateMate(asmWithMate(), "m1", {
      kind: "distance",
      a: { bodyId: "i1", ref: "right" },
      b: { bodyId: "i2", ref: "left" },
      value: 5,
    });
    expect(edited.mates[0]).toMatchObject({
      kind: "distance",
      a: { bodyId: "i1", ref: "right" },
      b: { bodyId: "i2", ref: "left" },
      value: 5,
    });
  });

  it("drags an instance inside a nested subassembly", () => {
    const asm: Assembly = {
      id: "a",
      instances: [
        {
          id: "sub",
          partId: "sub",
          transform: identity(),
          subassembly: {
            id: "inner",
            instances: [{ id: "leaf", partId: "p", transform: identity() }],
            mates: [],
          },
        },
      ],
      mates: [],
    };
    const moved = dragInstance(asm, "leaf", [0.01, 0.02, 0.03]);
    const leaf = flattenAssembly(moved)[0]!;
    expect([leaf.transform[3], leaf.transform[7], leaf.transform[11]]).toEqual([
      0.01, 0.02, 0.03,
    ]);
    expect(dragInstance(asm, "missing", [1, 1, 1])).toBe(asm);
  });

  it("persists connector axis/point picks and mate suppression", () => {
    const data = emptyAssemblyTab("source");
    data.assembly.instances = [
      {
        id: "i1",
        partId: "p",
        transform: identity(),
        connectors: [
          {
            id: "c1",
            name: "Picked axis 1",
            base: "body",
            kind: "axis",
            offset: [0.1, 0.2, 0.3],
            axis: [0, 0, 1],
          },
        ],
      },
    ];
    data.assembly.mates = [
      {
        id: "m1",
        kind: "concentric",
        a: { bodyId: "i1", ref: "c1" },
        b: { bodyId: "i1", ref: "body" },
        suppressed: true,
      },
    ];
    const parsed = parseAssemblyTab(serializeAssemblyTab(data));
    expect(parsed?.assembly.instances[0]?.connectors?.[0]).toMatchObject({
      kind: "axis",
      axis: [0, 0, 1],
    });
    expect(parsed?.assembly.mates[0]?.suppressed).toBe(true);
  });

  it("uses picked axis direction for a custom connector frame", () => {
    const frame = customConnectorFrame(
      {
        id: "c1",
        name: "axis",
        base: "body",
        kind: "axis",
        offset: [0, 0, 0],
        axis: [1, 0, 0],
      },
      cube,
    )!;
    // +Z of the connector frame is the picked axis.
    expect([
      frame.transform[8],
      frame.transform[9],
      frame.transform[10],
    ]).toEqual([1, 0, 0]);
  });

  it("classifies camera distance LOD", () => {
    expect(assemblyLodForDistance(0.1)).toBe("full");
    expect(assemblyLodForDistance(1.2)).toBe("reduced");
    expect(assemblyLodForDistance(10)).toBe("proxy");
  });

  it("batches repeated bodies and reports per-tier LOD counts", () => {
    const asm: Assembly = {
      id: "a",
      instances: [
        { id: "i1", partId: "p", bodyId: "b1", transform: identity() },
        {
          id: "i2",
          partId: "p",
          bodyId: "b1",
          transform: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
        {
          id: "i3",
          partId: "p",
          bodyId: "b1",
          transform: [1, 0, 0, 20, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
      mates: [],
    };
    const plan = planAssemblyRender(flattenAssembly(asm), [0, 0, 0]);
    expect(plan.repeatedBodies).toBe(1);
    expect(plan.instancedLeaves).toBe(2);
    expect(plan.lodCounts.full).toBe(1);
    expect(plan.lodCounts.reduced).toBe(1);
    expect(plan.lodCounts.proxy).toBe(1);
    expect(plan.groups.map((group) => group.lod)).toContain("proxy");
  });
});
