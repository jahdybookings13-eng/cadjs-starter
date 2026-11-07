import { Brep, Face, Vertex } from "../../src/geometry";
import {
  brepToOCShapeHelper,
  ocShapeToBRepHelper,
} from "../../src/services/occ-helpers";
import { getOcInstance } from "../../src/services/opencascade-instance";

/**
 * Re-centering after `ocShapeToBRepHelper(shape, true)` MUST use the
 * bounding-box centre, not the vertex centroid. The two diverge for any
 * non-symmetric face: a regression that swapped them would silently
 * misposition imported / boolean-result solids.
 */
describe("ocShapeToBRepHelper centering uses bbox, not vertex centroid", () => {
  it("right triangle (0,0)-(10,0)-(0,10): centred to bbox center (5, 5, 0), not centroid (3.33, 3.33, 0)", async () => {
    const oc = await getOcInstance();

    // Build a flat right-isoceles triangle. bbox = (0..10, 0..10, 0..0); bbox
    // centre = (5, 5, 0). Vertex centroid = (10/3, 10/3, 0) ≈ (3.33, 3.33, 0).
    // The two are demonstrably distinct.
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(10, 0, 0);
    const v3 = new Vertex(0, 10, 0);
    const triangle = new Brep([v1, v2, v3], [], [new Face([v1, v2, v3])]);

    const ocShape = brepToOCShapeHelper(oc, triangle.toJSON());
    const { center } = ocShapeToBRepHelper(oc, ocShape, true);

    // Bbox center is (5, 5, 0). Allow a small tolerance for tessellation jitter.
    expect(center.x).toBeCloseTo(5, 2);
    expect(center.y).toBeCloseTo(5, 2);
    expect(center.z).toBeCloseTo(0, 2);

    // Vertex centroid would be ~3.33, 3.33 — explicitly assert we did NOT pick
    // that path. If `center.x` ever drifts to ~3.33, this test catches it.
    expect(center.x).toBeGreaterThan(4);
    expect(center.y).toBeGreaterThan(4);
  });
});
