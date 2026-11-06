import { describe, it, expect } from "vitest";
import { mateResidual, totalResidual } from "../geometry";

describe("assembly geometry", () => {
  it("coincident zero residual", () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const refs: any = {
      a: { f: { transform: I } },
      b: { f: { transform: I } },
    };
    const m = {
      id: "m",
      kind: "coincident",
      aInst: "a",
      aRef: "f",
      bInst: "b",
      bRef: "f",
    };
    expect(mateResidual(m, refs)).toBe(0);
  });
  it("distance residual", () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const T = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const refs: any = {
      a: { f: { transform: I } },
      b: { f: { transform: T } },
    };
    const m = {
      id: "m",
      kind: "distance",
      aInst: "a",
      aRef: "f",
      bInst: "b",
      bRef: "f",
      value: 5,
    };
    expect(mateResidual(m, refs)).toBeCloseTo(0);
  });
  it("totalResidual sums", () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const refs: any = {
      a: { f: { transform: I } },
      b: { f: { transform: I } },
    };
    const mates = [
      {
        id: "m",
        kind: "coincident",
        aInst: "a",
        aRef: "f",
        bInst: "b",
        bRef: "f",
      },
    ];
    expect(totalResidual(mates, refs)).toBe(0);
  });
});
