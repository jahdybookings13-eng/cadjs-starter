import { describe, it, expect } from "vitest";
import {
  identity,
  addInstance,
  addMate,
  moveInstance,
  removeInstance,
  removeMate,
  overConstrained,
  toJSON,
  fromJSON,
  solve,
} from "../model";

describe("assemblies extra", () => {
  it("moveInstance updates transform", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    const t = [2, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1];
    const asm2 = moveInstance(asm, "i1", t);
    expect(asm2.instances[0]!.transform[3]).toBe(1);
  });
  it("removeInstance removes mates", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: identity() });
    asm = addMate(asm, {
      id: "m",
      kind: "coincident",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });
    const asm2 = removeInstance(asm, "i2");
    expect(asm2.instances.length).toBe(1);
    expect(asm2.mates.length).toBe(0);
  });
  it("overConstrained accepts complementary mates and rejects duplicates", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: identity() });
    asm = addMate(asm, {
      id: "m1",
      kind: "coincident",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
    });
    asm = addMate(asm, {
      id: "m2",
      kind: "distance",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
      value: 5,
    });
    expect(overConstrained(asm).length).toBe(0);

    const duplicate = addMate(asm, {
      id: "m3",
      kind: "distance",
      a: { bodyId: "i1", ref: "f" },
      b: { bodyId: "i2", ref: "f" },
      value: 5,
    });
    expect(overConstrained(duplicate)).toContain(
      "duplicate distance constraint",
    );
  });
  it("serialization roundtrip", () => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: identity() });
    const s = toJSON(asm);
    const asm2 = fromJSON(s);
    expect(asm2.instances.length).toBe(1);
  });
});
