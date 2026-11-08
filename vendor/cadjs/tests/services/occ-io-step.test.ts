import { describe, expect, it } from "vitest";
import { getOcInstance } from "../../src/services/opencascade-instance";
import {
  configureStepDefaults,
  readSTEPCAFHelper,
  readSTEPHelper,
  writeSTEPHelper,
} from "../../src/services/occ-io";
import { collectSubShapes } from "../../src/services/occ-facade";

describe("OCC STEP read/write helpers", () => {
  it("writes millimetre STEP and preserves two roots", async () => {
    const oc = await getOcInstance();
    configureStepDefaults(oc);
    const a = new oc.BRepPrimAPI_MakeBox_2(10, 20, 30);
    const b = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5);
    const shapes = [a.Shape(), b.Shape()];
    try {
      const bytes = writeSTEPHelper(oc, shapes);
      const text = new TextDecoder().decode(bytes);
      expect(text.startsWith("ISO-10303-21")).toBe(true);
      expect(text).toContain("SI_UNIT");
      expect(text).toContain("MILLI");

      const restored = readSTEPHelper(oc, bytes);
      expect(restored.IsNull()).toBe(false);
      const solids = collectSubShapes(
        oc,
        restored,
        oc.TopAbs_ShapeEnum.TopAbs_SOLID as typeof oc.TopAbs_ShapeEnum,
      );
      expect(solids).toHaveLength(2);
    } finally {
      for (const shape of shapes) shape.delete();
      a.delete();
      b.delete();
    }
  });

  it("round-trips product names and RGB colors through CAF", async () => {
    const oc = await getOcInstance();
    configureStepDefaults(oc);
    const a = new oc.BRepPrimAPI_MakeBox_2(10, 20, 30);
    const b = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5);
    try {
      const bytes = writeSTEPHelper(
        oc,
        [a.Shape(), b.Shape()],
        [
          { name: "Alpha Body", color: "#ff8000" },
          { name: "Beta Body", color: "#3366cc" },
        ],
      );
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain("Alpha Body");
      expect(text).toContain("Beta Body");
      expect(text.toUpperCase()).toContain("COLOUR_RGB");
      const restored = readSTEPCAFHelper(oc, bytes);
      expect(restored).toHaveLength(2);
      expect(restored.map((entry) => entry.name)).toEqual([
        "Alpha Body",
        "Beta Body",
      ]);
      expect(restored[0]?.color?.toLowerCase()).toBe("#ff8000");
      expect(restored[1]?.color?.toLowerCase()).toBe("#3366cc");
      for (const entry of restored) entry.shape.delete();
    } finally {
      a.delete();
      b.delete();
    }
  });

  it("rejects malformed STEP with a named read failure", async () => {
    const oc = await getOcInstance();
    expect(() =>
      readSTEPHelper(oc, new TextEncoder().encode("not a STEP file")),
    ).toThrow(/STEP read failed/);
  });

  it("refuses to write an empty shape list", async () => {
    const oc = await getOcInstance();
    expect(() => writeSTEPHelper(oc, [])).toThrow(/no shapes/);
  });
});
