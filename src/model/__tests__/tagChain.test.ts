import { describe, expect, it } from "vitest";
import { TagChain } from "../tagChain";

describe("TagChain (persistent naming)", () => {
  it("seeds from first match set", () => {
    const c = new TagChain();
    c.apply(new Map([["F1", "F2"]]));
    expect(c.get("F1")).toBe("F2");
  });
  it("composes old→mid→new across rebuilds", () => {
    const c = new TagChain();
    c.apply(new Map([["A_F1", "A_F2"]]));
    c.apply(new Map([["A_F2", "A_F7"]]));
    expect(c.get("A_F1")).toBe("A_F7");
  });
  it("drops entries when a face vanishes or goes ambiguous", () => {
    const c = new TagChain();
    c.apply(new Map([["A_F1", "A_F2"]]));
    c.apply(new Map([["X", "Y"]])); // A_F2 not present → gone
    expect(c.get("A_F1")).toBeNull();
  });
  it("fresh heads still seed alongside existing chain", () => {
    const c = new TagChain();
    c.apply(new Map([["A_F1", "A_F2"]]));
    c.apply(
      new Map([
        ["A_F2", "A_F2"],
        ["A_F5", "A_F6"],
      ]),
    );
    expect(c.get("A_F1")).toBe("A_F2");
    expect(c.get("A_F5")).toBe("A_F6");
    expect(c.snapshot()).toEqual({ A_F1: "A_F2", A_F5: "A_F6" });
  });
  it("clear resets", () => {
    const c = new TagChain();
    c.apply(new Map([["a", "b"]]));
    c.clear();
    expect(c.get("a")).toBeNull();
  });
});
