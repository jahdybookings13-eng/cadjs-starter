import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import {
  createMeshFromBrep,
  createMeshFromGeometry,
  findChildMesh,
  getAllFaces,
  getObject,
  getAllObjects,
  isDescendantOf,
} from "../../src/scene-operations/mesh-operations";
import { Brep, CompoundBrep, Face, Vertex } from "../../src/geometry";
import { BODY } from "../../src/theme";

describe("mesh-operations", () => {
  describe("createMeshFromBrep", () => {
    test("creates group with mesh and edge overlay from valid brep", () => {
      // Create a simple Brep with one face
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const v4 = new Vertex(0, 1, 0);
      const face = new Face([v1, v2, v3, v4]);
      const brep = new Brep([v1, v2, v3, v4], [], [face]);

      const group = createMeshFromBrep(brep);

      expect(group).toBeInstanceOf(THREE.Group);
      const mesh = findChildMesh(group);
      expect(mesh).not.toBeNull();
      expect(mesh!.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(
        (mesh!.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
    });

    test("mesh material uses DoubleSide", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const v4 = new Vertex(0, 1, 0);
      const face = new Face([v1, v2, v3, v4]);
      const brep = new Brep([v1, v2, v3, v4], [], [face]);

      const group = createMeshFromBrep(brep);
      const mesh = findChildMesh(group);

      expect(mesh).not.toBeNull();
      expect((mesh!.material as THREE.MeshStandardMaterial).side).toBe(
        THREE.DoubleSide,
      );
    });

    test("creates error mesh group when brep has no faces", () => {
      // Create an empty brep
      const brep = new Brep([], [], []);

      const group = createMeshFromBrep(brep);

      expect(group).toBeInstanceOf(THREE.Group);
      const mesh = findChildMesh(group);
      expect(mesh).not.toBeNull();
      expect(mesh!.geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(
        (mesh!.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(0xff0000);
    });
  });

  describe("getAllFaces", () => {
    test("returns faces from simple brep", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const face = new Face([v1, v2, v3]);
      const brep = new Brep([v1, v2, v3], [], [face]);

      const faces = getAllFaces(brep);

      expect(faces).toHaveLength(1);
      expect(faces[0]).toBe(face);
    });

    test("returns all faces from compound brep", () => {
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(1, 1, 0);
      const face1 = new Face([v1, v2, v3]);
      const brep1 = new Brep([v1, v2, v3], [], [face1]);

      const v4 = new Vertex(0, 0, 1);
      const v5 = new Vertex(1, 0, 1);
      const v6 = new Vertex(1, 1, 1);
      const face2 = new Face([v4, v5, v6]);
      const brep2 = new Brep([v4, v5, v6], [], [face2]);

      const compound = new CompoundBrep([brep1, brep2]);

      const faces = getAllFaces(compound);

      expect(faces).toHaveLength(2);
      expect(faces).toContain(face1);
      expect(faces).toContain(face2);
    });

    test("returns empty array for invalid brep", () => {
      // Create a brep-like object with no faces array
      const invalidBrep = { notFaces: [] } as unknown as Brep;

      const faces = getAllFaces(invalidBrep);

      expect(faces).toHaveLength(0);
    });
  });

  describe("getObject and getAllObjects", () => {
    let objectsMap: Map<string, THREE.Object3D>;

    beforeEach(() => {
      objectsMap = new Map<string, THREE.Object3D>();
      objectsMap.set("node_1", new THREE.Mesh());
      objectsMap.set("node_2", new THREE.Group());
    });

    test("getObject returns the correct object", () => {
      const object = getObject(objectsMap, "node_1");
      expect(object).toBeInstanceOf(THREE.Mesh);

      const object2 = getObject(objectsMap, "node_2");
      expect(object2).toBeInstanceOf(THREE.Group);

      const nonExistent = getObject(objectsMap, "non_existent");
      expect(nonExistent).toBeUndefined();
    });

    test("getAllObjects returns the complete map", () => {
      const allObjects = getAllObjects(objectsMap);
      expect(allObjects).toBe(objectsMap);
      expect(allObjects.size).toBe(2);
      expect(allObjects.has("node_1")).toBe(true);
      expect(allObjects.has("node_2")).toBe(true);
    });
  });

  describe("createMeshFromGeometry", () => {
    test("creates group with mesh and auto EdgesGeometry fallback", () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const group = createMeshFromGeometry(geometry);

      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.children).toHaveLength(2);

      const mesh = group.children[0] as THREE.Mesh;
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.geometry).toBe(geometry);
      expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
        BODY.default,
      );

      const edgeLines = group.children[1];
      expect(edgeLines).toBeInstanceOf(LineSegments2);
      expect(edgeLines.userData.isEdgeOverlay).toBe(true);
    });

    test("uses provided edgeGeometry instead of auto-generating", () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3),
      );

      const group = createMeshFromGeometry(geometry, edgeGeometry);

      expect(group.children).toHaveLength(2);
      const edgeLines = group.children[1];
      expect(edgeLines).toBeInstanceOf(LineSegments2);
      expect(edgeLines.userData.isEdgeOverlay).toBe(true);
    });

    test("mesh material uses BODY.default color with correct properties", () => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
      );

      const group = createMeshFromGeometry(geometry);
      const mesh = group.children[0] as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;

      expect(material.side).toBe(THREE.DoubleSide);
      expect(material.roughness).toBe(0.6);
      expect(material.metalness).toBe(0.2);
    });
  });

  describe("isDescendantOf", () => {
    test("direct child returns true", () => {
      const parent = new THREE.Group();
      const child = new THREE.Mesh();
      parent.add(child);

      expect(isDescendantOf(child, parent)).toBe(true);
    });

    test("grandchild returns true", () => {
      const grandparent = new THREE.Group();
      const parent = new THREE.Group();
      const child = new THREE.Mesh();
      grandparent.add(parent);
      parent.add(child);

      expect(isDescendantOf(child, grandparent)).toBe(true);
    });

    test("unrelated objects return false", () => {
      const a = new THREE.Group();
      const b = new THREE.Mesh();

      expect(isDescendantOf(b, a)).toBe(false);
    });

    test("self returns true", () => {
      const obj = new THREE.Group();

      expect(isDescendantOf(obj, obj)).toBe(true);
    });

    test("parent is not descendant of child", () => {
      const parent = new THREE.Group();
      const child = new THREE.Mesh();
      parent.add(child);

      expect(isDescendantOf(parent, child)).toBe(false);
    });
  });

  describe("findChildMesh", () => {
    test("returns null on empty Group", () => {
      const group = new THREE.Group();
      expect(findChildMesh(group)).toBeNull();
    });

    test("returns null on Group with only edge overlay Mesh", () => {
      const group = new THREE.Group();
      const overlay = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial(),
      );
      overlay.userData.isEdgeOverlay = true;
      group.add(overlay);

      expect(findChildMesh(group)).toBeNull();
    });

    test("returns real Mesh when Group has overlay + real Mesh", () => {
      const group = new THREE.Group();
      const overlay = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial(),
      );
      overlay.userData.isEdgeOverlay = true;
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial(),
      );
      group.add(overlay);
      group.add(realMesh);

      const found = findChildMesh(group);
      expect(found).toBe(realMesh);
    });

    test("returns null on bare LineSegments (not Mesh)", () => {
      const lineSegments = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial(),
      );

      expect(findChildMesh(lineSegments)).toBeNull();
    });

    test("returns the Mesh itself when called on a bare Mesh", () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial(),
      );

      expect(findChildMesh(mesh)).toBe(mesh);
    });
  });
});
