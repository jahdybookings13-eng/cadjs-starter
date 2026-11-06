import { describe, it, expect } from "vitest";
import {
  identity,
  addInstance,
  addMate,
  solve,
  buildTree,
  countInstances,
  dof,
  overConstrained,
  defaultRefs,
  setRef,
  type Assembly,
  type RefMap,
} from "../model";

describe("assembly arm end-to-end", () => {
  it("two bodies, coincident mate → solved + placed", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "base", partId: "p", transform: identity() });
    asm = addInstance(asm, {
      id: "cap",
      partId: "p",
      transform: [1, 0, 0, 5, 0, 1, 0, 7, 0, 0, 1, 9, 0, 0, 0, 1],
    });
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "base", ref: "f" },
      b: { bodyId: "cap", ref: "f" },
    });

    const refs: RefMap = {
      base: { f: { transform: identity() } },
      cap: { f: { transform: identity() } },
    };
    const r = solve(asm, refs);
    expect(r.ok).toBe(true);
    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-4);
    const cap = r.assembly!.instances.find((i) => i.id === "cap")!;
    expect([cap.transform[3], cap.transform[7], cap.transform[11]]).toEqual([
      0, 0, 0,
    ]);
  });

  it("defaultRefs identity → coincident converges without explicit refs", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, {
      id: "i2",
      partId: "p",
      transform: [1, 0, 0, 5, 0, 1, 0, 7, 0, 0, 1, 9, 0, 0, 0, 1],
    });
    asm = addMate(asm, {
      id: "m",
      kind: "coincident",
      a: { bodyId: "i1", ref: "body" },
      b: { bodyId: "i2", ref: "body" },
    });
    const r = solve(asm, defaultRefs(asm));
    expect(r.ok).toBe(true);
    expect(r.converged).toBe(true);
    expect(r.residual).toBeLessThan(1e-4);
  });

  it("buildTree + countInstances reflect the mate graph", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "a1", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "a2", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "a3", partId: "p", transform: identity() });
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "a1", ref: "f" },
      b: { bodyId: "a2", ref: "f" },
    });
    asm = addMate(asm, {
      id: "m2",
      kind: "coincident",
      a: { bodyId: "a2", ref: "f" },
      b: { bodyId: "a3", ref: "f" },
    });
    const tree = buildTree(asm);
    expect(countInstances(tree)).toBe(3);
  });

  it("overConstrained flags two mates between the same pair", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "x", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "y", partId: "p", transform: identity() });
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "x", ref: "f" },
      b: { bodyId: "y", ref: "f" },
    });
    asm = addMate(asm, {
      id: "m2",
      kind: "coincident",
      a: { bodyId: "x", ref: "f" },
      b: { bodyId: "y", ref: "f" },
    });
    const msgs = overConstrained(asm);
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("three coincident mates between a pair → over-constrained flag", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "x", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "y", partId: "p", transform: identity() });
    for (let k = 0; k < 3; k++) {
      asm = addMate(asm, {
        id: `m${k}`,
        kind: "coincident",
        a: { bodyId: "x", ref: "f" },
        b: { bodyId: "y", ref: "f" },
      });
    }
    expect(overConstrained(asm).length).toBeGreaterThan(0);
    // two coincident between a pair already saturates 6 DOF/2 cols
    expect(dof(asm)).toBe(0);
  });

  it("setRef adds a custom frame", () => {
    let asm: Assembly = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "p1", partId: "p", transform: identity() });
    const map = setRef(asm, "p1", "slot", {
      transform: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1],
    });
    expect(map["p1"]!.slot!.transform[3]).toBe(1);
  });
});
