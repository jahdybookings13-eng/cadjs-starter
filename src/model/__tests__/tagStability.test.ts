import { describe, expect, it } from "vitest";
import type { Brep } from "@vitekk02/cadjs";
import { matchFaceTags } from "../tagStability";

const brep = (faces: { x: number; y: number; z: number }[][]) =>
  ({ faces: faces.map((vertices) => ({ vertices })) }) as unknown as Brep;

const v = (x: number, y: number, z: number) => ({ x, y, z });
const A = [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0)];
const B = [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1)];
const C = [v(0, 0, 2), v(2, 0, 2), v(2, 2, 2)];

describe("face-tag stability", () => {
  it("identity map when geometry order is unchanged", () => {
    const m = matchFaceTags(brep([A, B]), ["F_F0", "F_F1"], brep([A, B]), [
      "F_F0",
      "F_F1",
    ]);
    expect([...m.entries()]).toEqual([
      ["F_F0", "F_F0"],
      ["F_F1", "F_F1"],
    ]);
  });
  it("remaps tags when the face order shifts", () => {
    const m = matchFaceTags(brep([A, B]), ["F_F0", "F_F1"], brep([B, A]), [
      "F_F0",
      "F_F1",
    ]);
    expect(m.get("F_F0")).toBe("F_F1");
    expect(m.get("F_F1")).toBe("F_F0");
  });
  it("leaves ambiguous geometry unmatched (unknown, never guessed)", () => {
    const m = matchFaceTags(brep([A, A]), ["F_F0", "F_F1"], brep([A, C]), [
      "F_F0",
      "F_F1",
    ]);
    expect(m.has("F_F0")).toBe(false);
    expect(m.has("F_F1")).toBe(false);
    expect(m.get("F_F0")).toBeUndefined();
  });
  it("new faces simply have no predecessor", () => {
    const m = matchFaceTags(brep([A]), ["F_F0"], brep([A, B]), [
      "F_F0",
      "F_F1",
    ]);
    expect(m.get("F_F0")).toBe("F_F0");
    expect(m.size).toBe(1);
  });
});
