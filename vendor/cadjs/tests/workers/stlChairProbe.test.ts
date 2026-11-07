import fs from "fs";
import { describe, it } from "vitest";
import { getOcInstance } from "../../src/services/opencascade-instance";
import { fixShape, tessellate } from "../../src/services/occ-facade";
import { ocShapeToBRepHelper } from "../../src/services/occ-shape-conversion";

describe("chair STL stepwise2", () => {
  it("bisects", async () => {
    const oc = await getOcInstance();
    const bytes = new Uint8Array(
      fs.readFileSync("/Users/user01/cadjs-starter/e2e/fixtures/seed-chair.stl"),
    );
    oc.FS.writeFile("/tmp/import.stl", bytes);
    const reader = new oc.StlAPI_Reader();
    const shape = new oc.TopoDS_Shape();
    reader.Read(shape, "/tmp/import.stl");
    const kids: any[] = [];
    {
      const it = new oc.TopoDS_Iterator_2(shape, true, true);
      while (it.More()) { kids.push(it.Value()); it.Next(); }
      it.delete();
    }
    console.log("KIDS", kids.length);
    for (const [i, k] of kids.entries()) {
      try {
        const r = ocShapeToBRepHelper(oc, k, true);
        console.log("OK child", i, "faces", (r.brepJson as any).faces?.length);
      } catch (e) {
        console.log("FAIL child", i, "→", String(e));
      }
    }
    try {
      const r = ocShapeToBRepHelper(oc, shape, true);
      console.log("OK whole", "faces", (r.brepJson as any).faces?.length);
    } catch (e) {
      console.log("FAIL whole →", String(e));
    }
    try {
      const f = fixShape(oc, shape);
      console.log("fixShape ok", f !== null);
    } catch (e) {
      console.log("fixShape FAIL →", String(e));
    }
  }, 180_000);
});
