import { brepToOCShapeHelper } from "../../src/services/occ-helpers";
import { getOcInstance } from "../../src/services/opencascade-instance";
import { Brep, Edge, Face, Vertex } from "../../src/geometry";

/**
 * `TopTools_IndexedMapOfShape` edge indices depend on the shape's internal
 * topology. The display path (`getEdgeLineSegmentsPerEdge`) and the
 * operation path (`filletEdges`) MUST agree on edge indices, or the
 * user-clicked edge gets a different fillet applied than intended.
 *
 * The simplest invariant we can pin: a no-op identity transform via
 * `BRepBuilderAPI_Transform` with `copyGeom=true` MUST preserve the edge map
 * extent. If a future OCC version (or library config) ever reorders edges
 * across this transform, the entire fillet UI breaks.
 */
describe("edge-index stability across identity transform", () => {
  it("identity Transform with copyGeom=true preserves edge count", async () => {
    const oc = await getOcInstance();

    // Build an 8-vertex box BRep — has well-defined topology with 12 edges.
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(1, 0, 0);
    const v3 = new Vertex(1, 1, 0);
    const v4 = new Vertex(0, 1, 0);
    const v5 = new Vertex(0, 0, 1);
    const v6 = new Vertex(1, 0, 1);
    const v7 = new Vertex(1, 1, 1);
    const v8 = new Vertex(0, 1, 1);
    // 12 cube edges
    const edges = [
      new Edge(v1, v2),
      new Edge(v2, v3),
      new Edge(v3, v4),
      new Edge(v4, v1),
      new Edge(v5, v6),
      new Edge(v6, v7),
      new Edge(v7, v8),
      new Edge(v8, v5),
      new Edge(v1, v5),
      new Edge(v2, v6),
      new Edge(v3, v7),
      new Edge(v4, v8),
    ];
    const faces = [
      new Face([v1, v2, v3, v4]),
      new Face([v5, v6, v7, v8]),
      new Face([v1, v2, v6, v5]),
      new Face([v2, v3, v7, v6]),
      new Face([v3, v4, v8, v7]),
      new Face([v4, v1, v5, v8]),
    ];
    const box = new Brep([v1, v2, v3, v4, v5, v6, v7, v8], edges, faces);
    const ocShape = brepToOCShapeHelper(oc, box.toJSON());

    // Build IndexedMapOfShape for the original.
    const originalMap = new oc.TopTools_IndexedMapOfShape_1();
    oc.TopExp.MapShapes_1(
      ocShape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      originalMap,
    );
    const originalEdgeCount = originalMap.Extent();
    expect(originalEdgeCount).toBeGreaterThan(0);

    // Apply identity transform with copyGeom=true (the same flag the rest of
    // the codebase uses for "make a deep copy that's safe to fillet on").
    const trsf = new oc.gp_Trsf_1(); // identity
    const transformer = new oc.BRepBuilderAPI_Transform_2(ocShape, trsf, true);
    expect(transformer.IsDone()).toBe(true);
    const transformedShape = transformer.Shape();

    // Map edges on the transformed shape.
    const transformedMap = new oc.TopTools_IndexedMapOfShape_1();
    oc.TopExp.MapShapes_1(
      transformedShape,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      transformedMap,
    );
    const transformedEdgeCount = transformedMap.Extent();

    // Pin: edge count MUST match. If a future OCC version drops edges through
    // copyGeom transform, every fillet/chamfer click would land on a stale
    // index.
    expect(transformedEdgeCount).toBe(originalEdgeCount);

    // Cleanup
    originalMap.delete?.();
    transformedMap.delete?.();
    trsf.delete?.();
    transformer.delete?.();
    transformedShape.delete?.();
    ocShape.delete?.();
  });
});
