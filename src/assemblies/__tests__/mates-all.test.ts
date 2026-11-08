import { describe, expect, it } from "vitest";
import {
  addInstance,
  addMate,
  identity,
  solve,
  type MateKind,
  type RefMap,
} from "../model";

const I = identity();
// A deliberately rotated and translated second instance, so each mate has to
// do real work rather than starting already solved.
const START = [0, 0, -1, 4, 0, 1, 0, 7, 1, 0, 0, 9, 0, 0, 0, 1];

const refs: RefMap = {
  i1: { body: { transform: I } },
  i2: { body: { transform: I } },
};

const cases: Array<[MateKind, number | undefined]> = [
  ["fasten", undefined],
  ["coincident", undefined],
  ["concentric", undefined],
  ["distance", 5],
  ["angle", 30],
  ["parallel", undefined],
  ["perpendicular", undefined],
  ["tangent", undefined],
  ["planar", undefined],
  ["ball", undefined],
  ["pin-slot", undefined],
  ["slider", undefined],
  ["cylindrical", undefined],
  ["revolute", undefined],
  ["prismatic", undefined],
  ["screw", 10],
  ["width", 10],
];

describe("every exposed mate kind converges", () => {
  it.each(cases)("%s", (kind, value) => {
    let asm: any = { id: "a", instances: [], mates: [] };
    asm = addInstance(asm, { id: "i1", partId: "p", transform: I });
    asm = addInstance(asm, { id: "i2", partId: "p", transform: START });
    asm = addMate(asm, {
      id: `m-${kind}`,
      kind,
      a: { bodyId: "i1", ref: "body" },
      b: { bodyId: "i2", ref: "body" },
      ...(value === undefined ? {} : { value }),
    });

    const result = solve(asm, refs);
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-5);
  });
});
