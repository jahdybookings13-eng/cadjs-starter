import * as THREE from "three";
import { extrudeBRep } from "../../src/scene-operations/resize-operations";
import { Brep, Vertex, Edge, Face } from "../../src/geometry";
describe("resize-operations", () => {
  describe("extrudeBRep", () => {
    describe("Basic Extrusion", () => {
      it("should extrude 2D rectangle to 3D box", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const v4 = new Vertex(0, 1, 0);

        const edges = [
          new Edge(v1, v2),
          new Edge(v2, v3),
          new Edge(v3, v4),
          new Edge(v4, v1),
        ];

        const face = new Face([v1, v2, v3, v4]);
        const brep = new Brep([v1, v2, v3, v4], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
        expect(extruded.value.brep.faces.length).toBeGreaterThan(0);

        // Z-range should match extrusion depth
        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const zRange = Math.max(...zValues) - Math.min(...zValues);
        expect(zRange).toBeCloseTo(2, 0);
      });

      it("should extrude 2D triangle to 3D prism", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(0.5, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];

        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
        expect(extruded.value.brep.faces.length).toBeGreaterThan(0);
      });

      it("should handle positive depth (extrude up)", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const minZ = Math.min(...zValues);
        const maxZ = Math.max(...zValues);

        expect(maxZ - minZ).toBeCloseTo(2, 0);

        // Position offset = bounding box center of the extruded result
        // Triangle at (0,0,0)→(1,0,0)→(1,1,0) extruded by 2 in Z:
        // bbox center = (0.5, 0.5, 1.0)
        expect(extruded.value.positionOffset.z).toBeCloseTo(1, 0);
        expect(typeof extruded.value.positionOffset.x).toBe("number");
        expect(typeof extruded.value.positionOffset.y).toBe("number");
      });

      it("should handle negative direction", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, -1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        // Should still create valid geometry
        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
        expect(extruded.value.brep.faces.length).toBeGreaterThan(0);

        // Position offset should be -1 in Z (depth/2 * direction = -1)
        expect(extruded.value.positionOffset.z).toBeCloseTo(-1, 0);
      });
    });

    describe("Geometry Validation", () => {
      it("should produce a 3D solid with Z extent matching depth", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const v4 = new Vertex(0, 1, 0);
        const v5 = new Vertex(0.5, 0.5, 0);

        const edges = [
          new Edge(v1, v2),
          new Edge(v2, v3),
          new Edge(v3, v4),
          new Edge(v4, v5),
          new Edge(v5, v1),
        ];

        const face = new Face([v1, v2, v3, v4, v5]);
        const brep = new Brep([v1, v2, v3, v4, v5], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
        expect(extruded.value.brep.faces.length).toBeGreaterThan(0);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const zRange = Math.max(...zValues) - Math.min(...zValues);
        expect(zRange).toBeCloseTo(2, 0);
      });

      it("should center geometry around Z=0", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 4, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const minZ = Math.min(...zValues);
        const maxZ = Math.max(...zValues);

        // BRep is centered, so Z range should be roughly symmetric around 0
        // The centering uses bounding box center, so (minZ+maxZ)/2 ≈ 0
        const zCenter = (minZ + maxZ) / 2;
        expect(zCenter).toBeCloseTo(0, 0);
      });

      it("should include edge geometry in result", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const v4 = new Vertex(0, 1, 0);

        const edges = [
          new Edge(v1, v2),
          new Edge(v2, v3),
          new Edge(v3, v4),
          new Edge(v4, v1),
        ];
        const face = new Face([v1, v2, v3, v4]);
        const brep = new Brep([v1, v2, v3, v4], edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.edgeGeometry).toBeDefined();
        expect(extruded.value.edgeGeometry).toBeInstanceOf(
          THREE.BufferGeometry,
        );
        expect(
          extruded.value.edgeGeometry!.attributes.position.count,
        ).toBeGreaterThan(0);
      });
    });

    describe("Edge Cases", () => {
      it("should handle very small depth (0.001)", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 0.001, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const thickness = Math.max(...zValues) - Math.min(...zValues);
        expect(thickness).toBeCloseTo(0.001, 2);
      });

      it("should handle large depth (1000)", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);

        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        const extruded = await extrudeBRep(brep, 1000, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const thickness = Math.max(...zValues) - Math.min(...zValues);
        expect(thickness).toBeCloseTo(1000, -1);
      });

      it("should handle direction=0 (zero-height extrusion)", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3], edges, [face]);

        // direction=0 means depth*0 = 0 vector — worker decides whether to accept or reject.
        const result = await extrudeBRep(brep, 2, 0);
        expect(result).toBeDefined();
      });

      it("should handle normalVec parameter for non-Z extrusion", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const v4 = new Vertex(0, 1, 0);
        const edges = [
          new Edge(v1, v2),
          new Edge(v2, v3),
          new Edge(v3, v4),
          new Edge(v4, v1),
        ];
        const face = new Face([v1, v2, v3, v4]);
        const brep = new Brep([v1, v2, v3, v4], edges, [face]);

        // Extrude along X axis
        const result = await extrudeBRep(brep, 3, 1, { x: 1, y: 0, z: 0 });

        if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
        expect(result.value.brep.vertices.length).toBeGreaterThan(0);
        expect(result.value.brep.faces.length).toBeGreaterThan(0);
      });

      it("should handle complex polygon (hexagon)", async () => {
        const vertices: Vertex[] = [];
        const edges: Edge[] = [];

        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          vertices.push(new Vertex(Math.cos(angle), Math.sin(angle), 0));
        }

        for (let i = 0; i < 6; i++) {
          edges.push(new Edge(vertices[i], vertices[(i + 1) % 6]));
        }

        const face = new Face(vertices);
        const brep = new Brep(vertices, edges, [face]);

        const extruded = await extrudeBRep(brep, 2, 1);
        if (!extruded.ok)
          throw new Error(`expected ok, got: ${extruded.reason}`);

        expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
        expect(extruded.value.brep.faces.length).toBeGreaterThan(0);

        const zValues = extruded.value.brep.vertices.map((v) => v.z);
        const zRange = Math.max(...zValues) - Math.min(...zValues);
        expect(zRange).toBeCloseTo(2, 0);
      });
    });

    describe("Error Handling", () => {
      it("should return error for empty BRep", async () => {
        const brep = new Brep([], [], []);

        const result = await extrudeBRep(brep, 2, 1);

        expect(result.ok).toBe(false);
      });

      it("should return error for BRep with no faces", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const edge = new Edge(v1, v2);
        const brep = new Brep([v1, v2], [edge], []);

        const result = await extrudeBRep(brep, 2, 1);

        expect(result.ok).toBe(false);
      });

      it("should return error for already-3D BRep", async () => {
        const v1 = new Vertex(0, 0, 0);
        const v2 = new Vertex(1, 0, 0);
        const v3 = new Vertex(1, 1, 0);
        const v4 = new Vertex(0, 0, 1);

        const face = new Face([v1, v2, v3]);
        const brep = new Brep([v1, v2, v3, v4], [], [face]);

        const result = await extrudeBRep(brep, 2, 1);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain("not flat");
      });
    });
  });
});
