import { describe, it, expect } from "vitest";
import {
  identity,
  matMul,
  transformPoint,
  addInstance,
  addMate,
  dof,
  solve,
} from "../model";

describe("assemblies model", () => {
  it("identity leaves point unchanged", () => {
    expect(transformPoint(identity(), [1, 2, 3])).toEqual([1, 2, 3]);
  });
  it("matMul identity", () => {
    const r = matMul(identity(), identity());
    expect(r).toEqual(identity());
  });
  it("dof reduces with mates", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: identity() });
    expect(dof(asm)).toBe(6); // 12 - 0 - 6 ground
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "i1", ref: "face" },
      b: { bodyId: "i2", ref: "face" },
    });
    expect(dof(asm)).toBe(3);
  });
  it("solve detects issues", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    const r = solve(asm);
    expect(r.ok).toBe(true);
    const r2 = solve({
      ...asm,
      mates: [
        {
          id: "m",
          kind: "coincident",
          a: { bodyId: "nope", ref: "x" },
          b: { bodyId: "i1", ref: "x" },
        },
      ],
    });
    expect(r2.ok).toBe(false);
  });
});
