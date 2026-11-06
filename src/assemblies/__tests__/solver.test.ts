import { describe, it, expect } from "vitest";
import {
  identity,
  addInstance,
  addMate,
  solveTransforms,
  buildTree,
  countInstances,
  solve,
} from "../model";

describe("assemblies solver/tree", () => {
  it("solveTransforms aligns coincident origins", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, {
      id: "i2",
      partId: "p",
      transform: [1, 0, 0, 5, 0, 1, 0, 7, 0, 0, 1, 9, 0, 0, 0, 1],
    });
    asm = addMate(asm, {
      id: "m",
      kind: "coincident",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });
    const { assembly, residual } = solveTransforms(asm);
    const i2 = assembly.instances.find((x: any) => x.id === "i2")!;
    expect(i2.transform[3]).toBe(0); // aligned to i1 origin
    expect(residual).toBe(0);
  });
  it("buildTree counts all instances", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "i3", partId: "p", transform: identity() });
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });
    asm = addMate(asm, {
      id: "m2",
      kind: "coincident",
      a: { bodyId: "i2", ref: "f" },
      b: { bodyId: "i3", ref: "f" },
    });
    const tree = buildTree(asm);
    expect(countInstances(tree)).toBe(3);
  });
  it("solve reports residual", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    const r = solve(asm);
    expect(r.ok).toBe(true);
    expect(r.residual).toBe(0);
  });
});
