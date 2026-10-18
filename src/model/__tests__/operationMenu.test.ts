import { describe, expect, it } from "vitest";
import {
  allowedOperations,
  MENU_BY_SELECTION,
  menuFor,
} from "../operationMenu";

describe("operation menu (Onshape port)", () => {
  it("edge menu surfaces the two ready ops only in allowedOperations", () => {
    const ids = allowedOperations("edge").map((o) => o.id);
    expect(ids).toEqual([
      "fillet",
      "modify-fillet",
      "chamfer",
      "split",
      "measure",
      "variables",
    ]);
  });
  it("body menu exposes boolean/mirror/pattern ready, shell+draft planned-but-visible, sheet hidden", () => {
    const m = menuFor("body");
    const ids = m.map((o) => o.id);
    expect(ids).toContain("boolean");
    expect(ids).toContain("shell");
    expect(ids).toContain("linear-pattern");
    expect(allowedOperations("body").map((o) => o.id)).toContain(
      "curve-pattern",
    );
    expect(ids).not.toContain("sheet-metal");
    const shell = m.find((o) => o.id === "shell");
    expect(shell?.status).toBe("ready");
  });
  it("plane face offers sketch+extrude+revolve ready and move-face planned", () => {
    expect(allowedOperations("plane-face").map((o) => o.id)).toEqual([
      "new-sketch",
      "extrude",
      "revolve",
      "delete-face",
      "ruled-fill-surface",
      "measure",
    ]);
    expect(
      MENU_BY_SELECTION["plane-face"].find((o) => o.id === "move-face")?.status,
    ).toBe("planned");
  });
  it("curved faces cannot start a sketch (Onshape forbids it)", () => {
    const ids = MENU_BY_SELECTION["curved-face"].map((o) => o.id);
    expect(ids).not.toContain("new-sketch");
    expect(ids).toContain("hole");
  });
  it("every selection kind is non-empty", () => {
    for (const list of Object.values(MENU_BY_SELECTION))
      expect(list.length).toBeGreaterThan(0);
  });
});
