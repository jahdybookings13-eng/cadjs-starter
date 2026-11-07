import * as THREE from "three";
import { extrudeBRep } from "../../src/scene-operations/resize-operations";
import { deserializeShapeHelper } from "../../src/services/occ-helpers";
import { getOcInstance } from "../../src/services/opencascade-instance";
import { buildAnalyticCircleProfile } from "../helpers/profileBuilders";

/**
 * Serializing an OCC result via `occBrep` and deserializing back must
 * preserve analytic geometry. Specifically, an extruded analytic circle
 * MUST round-trip as a small set of topological edges (3: top circle,
 * bottom circle, side seam), NOT hundreds of tessellated polyline segments.
 *
 * If a regression replaces the analytic-aware path with the lossy
 * `brepToOCShape` fallback, the edge count would jump from O(3) to O(100)
 * and this test fails loudly.
 */
describe("occBrep round-trip preserves analytic geometry", () => {
  it("extruded analytic circle: serialize → deserialize → small topological edge count", async () => {
    const oc = await getOcInstance();

    const { brep, occBrep } = await buildAnalyticCircleProfile(5);
    const result = await extrudeBRep(
      brep,
      10,
      1,
      { x: 0, y: 0, z: 1 },
      occBrep,
    );
    if (!result.ok) throw new Error(`extrude failed: ${result.reason}`);
    expect(result.value.occBrep).toBeDefined();

    // Round-trip: deserialize the produced occBrep string back into an OCC shape
    // and count topological edges via TopExp_Explorer.
    const reShape = deserializeShapeHelper(oc, result.value.occBrep!);

    let edgeCount = 0;
    const explorer = new oc.TopExp_Explorer_2(
      reShape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    while (explorer.More()) {
      edgeCount++;
      explorer.Next();
    }
    explorer.delete?.();
    reShape.delete?.();

    // A cylinder built from an analytic circle has exactly 3 topological edges:
    // top arc, bottom arc, and one vertical seam edge linking them.
    // If analytic geometry is preserved, count is small. If a regression
    // tessellated the profile, count would be hundreds.
    expect(edgeCount).toBeLessThan(10);
    expect(edgeCount).toBeGreaterThanOrEqual(3);

    // Reference unused values so Brep import is not pruned by tree-shaking
    // (the original `brep` is part of the data flow into extrudeBRep).
    void THREE;
    void brep;
  });
});
