import { describe, it, expect } from "vitest";
import { identity, addInstance, addMate, solve, type RefMap } from "../model";

const I = identity();
// a translation by (5,2,3)
const T52: number[] = [1, 0, 0, 5, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1];

describe("geometry closure (real)", () => {
  it("drives coincident residual to ~0", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: I });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: T52 });
    asm = addMate(asm, {
      id: "m",
      kind: "coincident",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });

    const refs: RefMap = {
      i1: { f: { transform: I } },
      i2: { f: { transform: I } },
    };
    const r = solve(asm, refs);
    expect(r.residual).toBeLessThan(1e-4);
    expect(r.converged).toBe(true);
  });

  it("drives distance mate to requested gap", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: I });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: T52 });
    asm = addMate(asm, {
      id: "m",
      kind: "distance",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
      value: 10,
    });

    const refs: RefMap = {
      i1: { f: { transform: I } },
      i2: { f: { transform: I } },
    };
    const r = solve(asm, refs);
    expect(r.residual).toBeLessThan(1e-3);
  });

  it("concentric aligns axes (residual ~0)", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    // i2 initially rotated 90deg about Y
    const rotY = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 4, 0, 0, 0, 1];
    asm = addInstance(asm, { id: "i1", partId: "p", transform: I });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: rotY });
    asm = addMate(asm, {
      id: "m",
      kind: "concentric",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });

    const refs: RefMap = {
      i1: { f: { transform: I } },
      i2: { f: { transform: I } },
    };
    const r = solve(asm, refs);
    expect(r.residual).toBeLessThan(1e-3);
  });
});
