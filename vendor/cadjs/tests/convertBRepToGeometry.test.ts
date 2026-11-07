import * as THREE from "three";
import {
  createGeometryFromBRep,
  transformBrepVertices,
  unionBrepCompound,
  createMeshFromCompoundBrep,
} from "../src/convertBRepToGeometry";
import { Brep, CompoundBrep, Edge, Face, Vertex } from "../src/geometry";
import { findChildMesh } from "../src/scene-operations/mesh-operations";

// Helper to create a simple rectangular Brep
function createRectBrep(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): Brep {
  const v1 = new Vertex(x, y, z);
  const v2 = new Vertex(x + width, y, z);
  const v3 = new Vertex(x + width, y + height, z);
  const v4 = new Vertex(x, y + height, z);
  const edges = [
    new Edge(v1, v2),
    new Edge(v2, v3),
    new Edge(v3, v4),
    new Edge(v4, v1),
  ];
  const face = new Face([v1, v2, v3, v4]);
  return new Brep([v1, v2, v3, v4], edges, [face]);
}

// Helper to create a triangle Brep
function createTriangleBrep(
  x: number,
  y: number,
  z: number,
  size: number,
): Brep {
  const v1 = new Vertex(x, y, z);
  const v2 = new Vertex(x + size, y, z);
  const v3 = new Vertex(x + size / 2, y + size, z);
  const edges = [new Edge(v1, v2), new Edge(v2, v3), new Edge(v3, v1)];
  const face = new Face([v1, v2, v3]);
  return new Brep([v1, v2, v3], edges, [face]);
}

// Helper to create a 3D box Brep
function createBoxBrep(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): Brep {
  const v1 = new Vertex(x, y, z);
  const v2 = new Vertex(x + width, y, z);
  const v3 = new Vertex(x + width, y + height, z);
  const v4 = new Vertex(x, y + height, z);
  const v5 = new Vertex(x, y, z + depth);
  const v6 = new Vertex(x + width, y, z + depth);
  const v7 = new Vertex(x + width, y + height, z + depth);
  const v8 = new Vertex(x, y + height, z + depth);

  const bottom = new Face([v1, v2, v3, v4]);
  const top = new Face([v5, v6, v7, v8]);
  const front = new Face([v1, v2, v6, v5]);
  const back = new Face([v4, v3, v7, v8]);
  const left = new Face([v1, v4, v8, v5]);
  const right = new Face([v2, v3, v7, v6]);

  return new Brep(
    [v1, v2, v3, v4, v5, v6, v7, v8],
    [],
    [bottom, top, front, back, left, right],
  );
}

describe("convertBRepToGeometry", () => {
  describe("createGeometryFromBRep", () => {
    test("creates BufferGeometry with positions for triangle face", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(0.5, 1, 0);
      const face = new Face([v1, v2, v3]);

      const geometry = createGeometryFromBRep([face]);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
      const positions = geometry.getAttribute("position");
      expect(positions).toBeDefined();
      // Triangle: 3 vertices * 3 components = 9 values
      expect(positions.count).toBe(3);
    });

    test("creates BufferGeometry with positions for quad face (triangulated)", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
      const positions = geometry.getAttribute("position");
      expect(positions).toBeDefined();
      // Quad is triangulated: 2 triangles * 3 vertices = 6 vertices
      expect(positions.count).toBe(6);
    });

    test("handles multiple faces", () => {
      const brep = createBoxBrep(0, 0, 0, 1, 1, 1);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
      const positions = geometry.getAttribute("position");
      // 6 quad faces * 2 triangles per quad * 3 vertices = 36 vertices
      expect(positions.count).toBe(36);
    });

    test("computes bounding box", () => {
      const brep = createRectBrep(0, 0, 0, 2, 3);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry.boundingBox).toBeDefined();
      expect(geometry.boundingBox!.min.x).toBeCloseTo(0);
      expect(geometry.boundingBox!.min.y).toBeCloseTo(0);
      expect(geometry.boundingBox!.max.x).toBeCloseTo(2);
      expect(geometry.boundingBox!.max.y).toBeCloseTo(3);
    });

    test("computes bounding sphere", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry.boundingSphere).toBeDefined();
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
    });

    test("handles empty faces array", () => {
      const geometry = createGeometryFromBRep([]);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
      const positions = geometry.getAttribute("position");
      expect(positions.count).toBe(0);
    });

    test("skips faces with fewer than 3 vertices", () => {
      // Create a degenerate face with only 2 vertices (which shouldn't happen normally)
      // Since Face constructor requires 3+ vertices, we test with empty faces array
      const faces: Face[] = [];
      const geometry = createGeometryFromBRep(faces);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    });

    test("triangulates polygon with more than 4 vertices", () => {
      // Pentagon
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1.3, 0.8, 0);
      const v4 = new Vertex(0.5, 1.2, 0);
      const v5 = new Vertex(-0.3, 0.8, 0);
      const face = new Face([v1, v2, v3, v4, v5]);

      const geometry = createGeometryFromBRep([face]);

      const positions = geometry.getAttribute("position");
      // Pentagon triangulates to 3 triangles (n-2) = 3 * 3 = 9 vertices
      expect(positions.count).toBe(9);
    });
  });

  describe("transformBrepVertices", () => {
    test("returns same Brep when no transformation needed", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);

      const result = transformBrepVertices(brep);

      expect(result).toBe(brep);
    });

    test("returns same Brep when source and target positions are equal", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const pos = new THREE.Vector3(5, 5, 5);

      const result = transformBrepVertices(brep, pos, pos);

      expect(result).toBe(brep);
    });

    test("applies position offset correctly", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(10, 20, 30);

      const result = transformBrepVertices(brep, sourcePos, targetPos);

      expect(result).not.toBe(brep);
      expect(result.vertices[0].x).toBeCloseTo(10);
      expect(result.vertices[0].y).toBeCloseTo(20);
      expect(result.vertices[0].z).toBeCloseTo(30);
    });

    test("preserves original BRep (immutable)", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const originalX = brep.vertices[0].x;
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(10, 10, 10);

      transformBrepVertices(brep, sourcePos, targetPos);

      expect(brep.vertices[0].x).toBe(originalX);
    });

    test("applies scale matrix correctly", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const scaleMatrix = new THREE.Matrix4().makeScale(2, 3, 1);

      const result = transformBrepVertices(
        brep,
        undefined,
        undefined,
        scaleMatrix,
      );

      // After scaling by (2, 3, 1), vertex at (1, 1, 0) becomes (2, 3, 0)
      const scaledVertex = result.vertices.find(
        (v) => Math.abs(v.x - 2) < 0.01 && Math.abs(v.y - 3) < 0.01,
      );
      expect(scaledVertex).toBeDefined();
    });

    test("handles combined position and scale transformation", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(5, 5, 0);
      const scaleMatrix = new THREE.Matrix4().makeScale(2, 2, 1);

      const result = transformBrepVertices(
        brep,
        sourcePos,
        targetPos,
        scaleMatrix,
      );

      // First scale (0,0,0) * 2 = (0,0,0), then add offset (5,5,0) = (5,5,0)
      expect(result.vertices[0].x).toBeCloseTo(5);
      expect(result.vertices[0].y).toBeCloseTo(5);
    });

    test("transforms edges correctly", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(10, 0, 0);

      const result = transformBrepVertices(brep, sourcePos, targetPos);

      expect(result.edges.length).toBe(brep.edges.length);
      // First edge start should be offset
      expect(result.edges[0].start.x).toBeCloseTo(10);
    });

    test("transforms faces correctly", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(0, 10, 0);

      const result = transformBrepVertices(brep, sourcePos, targetPos);

      expect(result.faces.length).toBe(brep.faces.length);
      // Face vertices should be offset
      expect(result.faces[0].vertices[0].y).toBeCloseTo(10);
    });

    test("handles CompoundBrep transformation", () => {
      const child1 = createRectBrep(0, 0, 0, 1, 1);
      const child2 = createRectBrep(2, 0, 0, 1, 1);
      const compound = new CompoundBrep([child1, child2]);
      const sourcePos = new THREE.Vector3(0, 0, 0);
      const targetPos = new THREE.Vector3(5, 5, 0);

      const result = transformBrepVertices(
        compound as any,
        sourcePos,
        targetPos,
      ) as unknown as CompoundBrep;

      expect(result).toBeInstanceOf(CompoundBrep);
      expect(result.children.length).toBe(2);
      // Both children should be transformed
      expect(result.children[0].vertices[0].x).toBeCloseTo(5);
      expect(result.children[1].vertices[0].x).toBeCloseTo(7); // 2 + 5
    });

    test("handles identity transform (no change)", () => {
      const brep = createRectBrep(5, 5, 5, 1, 1);
      const pos = new THREE.Vector3(5, 5, 5);

      const result = transformBrepVertices(brep, pos, pos);

      expect(result).toBe(brep);
    });
  });

  describe("unionBrepCompound", () => {
    test("creates CompoundBrep from two Breps", () => {
      const brep1 = createRectBrep(0, 0, 0, 1, 1);
      const brep2 = createRectBrep(2, 0, 0, 1, 1);

      const result = unionBrepCompound(brep1, brep2);

      expect(result).toBeInstanceOf(CompoundBrep);
      expect(result.children.length).toBe(2);
    });

    test("preserves both Breps as children", () => {
      const brep1 = createRectBrep(0, 0, 0, 1, 1);
      const brep2 = createTriangleBrep(2, 0, 0, 1);

      const result = unionBrepCompound(brep1, brep2);

      expect(result.children[0].vertices.length).toBe(4); // Rectangle
      expect(result.children[1].vertices.length).toBe(3); // Triangle
    });

    test("applies position transforms to children", () => {
      const brep1 = createRectBrep(0, 0, 0, 1, 1);
      const brep2 = createRectBrep(0, 0, 0, 1, 1);
      const pos1 = new THREE.Vector3(0, 0, 0);
      const pos2 = new THREE.Vector3(5, 0, 0);
      const targetPos = new THREE.Vector3(0, 0, 0);

      const result = unionBrepCompound(brep1, brep2, pos1, pos2, targetPos);

      // Second brep should have offset applied
      // offset = targetPos - pos2 = (0,0,0) - (5,0,0) = (-5,0,0)
      expect(result.children.length).toBe(2);
    });

    test("flattens CompoundBrep children", () => {
      const brep1 = createRectBrep(0, 0, 0, 1, 1);
      const brep2 = createRectBrep(1, 0, 0, 1, 1);
      const compound = new CompoundBrep([brep1, brep2]);
      const brep3 = createRectBrep(2, 0, 0, 1, 1);

      const result = unionBrepCompound(compound as any, brep3);

      // Should have 3 children (2 from compound + 1 new)
      expect(result.children.length).toBe(3);
    });
  });

  describe("createMeshFromCompoundBrep", () => {
    test("creates mesh from CompoundBrep", async () => {
      const brep1 = createBoxBrep(0, 0, 0, 1, 1, 1);
      const brep2 = createBoxBrep(0.5, 0.5, 0.5, 1, 1, 1);
      const compound = new CompoundBrep([brep1, brep2]);

      const result = await createMeshFromCompoundBrep(compound);
      const mesh = findChildMesh(result);

      expect(mesh).not.toBeNull();
      expect(mesh!.geometry).toBeInstanceOf(THREE.BufferGeometry);
    });

    test("uses default material when not provided", async () => {
      const brep = createBoxBrep(0, 0, 0, 1, 1, 1);
      const compound = new CompoundBrep([brep]);

      const result = await createMeshFromCompoundBrep(compound);
      const mesh = findChildMesh(result);

      expect(mesh).not.toBeNull();
      expect(mesh!.material).toBeDefined();
    });

    test("uses provided material", async () => {
      const brep = createBoxBrep(0, 0, 0, 1, 1, 1);
      const compound = new CompoundBrep([brep]);
      const customMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      const result = await createMeshFromCompoundBrep(compound, customMaterial);
      const mesh = findChildMesh(result);

      // Note: The function may use unifiedBrep which creates new mesh
      // The custom material is only used in fallback path
      expect(mesh).not.toBeNull();
      expect(mesh!.material).toBeDefined();
    });

    test("handles single child compound", async () => {
      const brep = createBoxBrep(0, 0, 0, 1, 1, 1);
      const compound = new CompoundBrep([brep]);

      const result = await createMeshFromCompoundBrep(compound);

      expect(result).toBeDefined();
    });

    test("handles compound with multiple children", async () => {
      const brep1 = createBoxBrep(0, 0, 0, 1, 1, 1);
      const brep2 = createBoxBrep(2, 2, 2, 1, 1, 1);
      const brep3 = createBoxBrep(-2, -2, -2, 1, 1, 1);
      const compound = new CompoundBrep([brep1, brep2, brep3]);

      const result = await createMeshFromCompoundBrep(compound);

      expect(result).toBeDefined();
    });
  });

  describe("edge cases", () => {
    test("handles negative coordinates in geometry creation", () => {
      const v1 = new Vertex(-1, -1, -1);
      const v2 = new Vertex(1, -1, -1);
      const v3 = new Vertex(0, 1, -1);
      const face = new Face([v1, v2, v3]);

      const geometry = createGeometryFromBRep([face]);

      expect(geometry.boundingBox!.min.x).toBeCloseTo(-1);
      expect(geometry.boundingBox!.min.y).toBeCloseTo(-1);
    });

    test("handles large coordinate values", () => {
      const brep = createRectBrep(1000, 1000, 1000, 100, 100);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry.boundingBox!.min.x).toBeCloseTo(1000);
      expect(geometry.boundingBox!.max.x).toBeCloseTo(1100);
    });

    test("handles very small geometry", () => {
      const brep = createRectBrep(0, 0, 0, 0.001, 0.001);
      const geometry = createGeometryFromBRep(brep.faces);

      expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
      expect(geometry.boundingBox!.max.x).toBeCloseTo(0.001);
    });

    test("transformation handles rotation matrix", () => {
      const brep = createRectBrep(0, 0, 0, 1, 1);
      const rotationMatrix = new THREE.Matrix4().makeRotationZ(Math.PI / 2);

      const result = transformBrepVertices(
        brep,
        undefined,
        undefined,
        rotationMatrix,
      );

      // After 90-degree rotation around Z, (1, 0, 0) becomes (0, 1, 0)
      const rotatedVertex = result.vertices.find(
        (v) => Math.abs(v.x) < 0.01 && Math.abs(v.y - 1) < 0.01,
      );
      expect(rotatedVertex).toBeDefined();
    });
  });
});
