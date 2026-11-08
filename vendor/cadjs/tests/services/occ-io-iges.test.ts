import { describe, expect, it } from "vitest";
import { getOcInstance } from "../../src/services/opencascade-instance";
import { readIGESHelper, writeIGESHelper } from "../../src/services/occ-io";
import { collectSubShapes } from "../../src/services/occ-facade";

describe("OCC IGES read/write helpers", () => {
  it("round-trips a box through IGES with its solid faces intact", async () => {
    const oc = await getOcInstance();
    const box = new oc.BRepPrimAPI_MakeBox_2(10, 20, 30);
    const source = box.Shape();
    try {
      const bytes = writeIGESHelper(oc, [source]);
      const text = new TextDecoder().decode(bytes);
      expect(text).toContain("IGES");
      expect(bytes.byteLength).toBeGreaterThan(200);

      const restored = readIGESHelper(oc, bytes);
      expect(restored.IsNull()).toBe(false);
      expect(restored.ShapeType()).toBe(oc.TopAbs_ShapeEnum.TopAbs_SOLID);

      const faces = collectSubShapes(
        oc,
        restored,
        oc.TopAbs_ShapeEnum.TopAbs_FACE as typeof oc.TopAbs_ShapeEnum,
      );
      expect(faces).toHaveLength(6);
    } finally {
      source.delete();
      box.delete();
    }
  });

  it("rejects malformed IGES input with a named error", async () => {
    const oc = await getOcInstance();
    const bogus = new TextEncoder().encode("this is not an IGES file");
    expect(() => readIGESHelper(oc, bogus)).toThrow(/IGES read failed/);
  });
});
