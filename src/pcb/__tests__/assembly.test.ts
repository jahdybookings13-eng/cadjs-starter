import { describe, expect, it } from "vitest";
import {
  checkPcbAssembly,
  enclosureLid,
  pcbAssemblySolids,
  pcbAssemblyTransforms,
} from "../assembly";
import { createPcbDemo } from "../build";
import { pcb3dBoxes } from "../model";

describe("PCB 3D assembly", () => {
  it("exposes board and component transforms at real millimetre scale", () => {
    const doc = createPcbDemo();
    const solids = pcbAssemblySolids(doc);
    expect(solids).toHaveLength(7);
    expect(solids[0]!.kind).toBe("board");
    expect(solids[0]!.width).toBe(doc.board.widthMM);
    const transforms = pcbAssemblyTransforms(doc);
    expect(transforms).toHaveLength(7);
    expect(transforms.every((t) => t.size.every((n) => n > 0))).toBe(true);
    expect(pcb3dBoxes(doc)).toHaveLength(7);
  });

  it("detects a lid that clips tall components", () => {
    const doc = createPcbDemo();
    const clear = checkPcbAssembly(doc);
    expect(clear.pass).toBe(true);
    expect(clear.maxComponentHeightMM).toBeGreaterThan(doc.board.thicknessMM);

    const tight = checkPcbAssembly(doc, [enclosureLid(doc, 0.5)]);
    expect(tight.pass).toBe(false);
    expect(tight.collisions.length).toBeGreaterThan(0);
    expect(tight.collisions[0]!.depthMM).toBeGreaterThan(0);
    expect(tight.collisions[0]!.msg).toContain("collides");
  });
});
