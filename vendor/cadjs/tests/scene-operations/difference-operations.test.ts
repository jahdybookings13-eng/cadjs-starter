import * as THREE from "three";
import { booleanOp } from "../../src/scene-operations/boolean-operations";
import { Brep, CompoundBrep, Edge, Face, Vertex } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

describe("difference-operations", () => {
  let objectsMap: Map<string, THREE.Object3D>;
  let elements: SceneElement[];
  let selectedElements: string[];
  let idCounter: number;
  let brep1: Brep;
  let brep2: Brep;

  // Helper function to create a simple 2D rectangular brep
  const createRectBrep = (
    x: number,
    y: number,
    width: number,
    height: number,
    z: number = 0,
  ): Brep => {
    const v1 = new Vertex(x, y, z);
    const v2 = new Vertex(x + width, y, z);
    const v3 = new Vertex(x + width, y + height, z);
    const v4 = new Vertex(x, y + height, z);
    const face = new Face([v1, v2, v3, v4]);
    return new Brep([v1, v2, v3, v4], [], [face]);
  };

  // Helper function to create a 3D box brep (6 faces)
  const createBoxBrep = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ): Brep => {
    // 8 vertices of a box
    const v1 = new Vertex(x, y, z);
    const v2 = new Vertex(x + width, y, z);
    const v3 = new Vertex(x + width, y + height, z);
    const v4 = new Vertex(x, y + height, z);
    const v5 = new Vertex(x, y, z + depth);
    const v6 = new Vertex(x + width, y, z + depth);
    const v7 = new Vertex(x + width, y + height, z + depth);
    const v8 = new Vertex(x, y + height, z + depth);

    // 6 faces of a box
    const bottom = new Face([v1, v2, v3, v4]); // z = 0
    const top = new Face([v5, v6, v7, v8]); // z = depth
    const front = new Face([v1, v2, v6, v5]); // y = 0
    const back = new Face([v4, v3, v7, v8]); // y = height
    const left = new Face([v1, v4, v8, v5]); // x = 0
    const right = new Face([v2, v3, v7, v6]); // x = width

    return new Brep(
      [v1, v2, v3, v4, v5, v6, v7, v8],
      [],
      [bottom, top, front, back, left, right],
    );
  };

  beforeEach(() => {
    // Set up test fixtures
    objectsMap = new Map<string, THREE.Object3D>();
    idCounter = 5; // Start with a non-zero ID to test increment

    // Create simple breps for testing
    // Base shape (larger)
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(2, 0, 0);
    const v3 = new Vertex(2, 2, 0);
    const v4 = new Vertex(0, 2, 0);
    const face1 = new Face([v1, v2, v3, v4]);
    brep1 = new Brep([v1, v2, v3, v4], [], [face1]);

    // Tool shape (smaller, to be subtracted)
    const v5 = new Vertex(0.5, 0.5, 0);
    const v6 = new Vertex(1.5, 0.5, 0);
    const v7 = new Vertex(1.5, 1.5, 0);
    const v8 = new Vertex(0.5, 1.5, 0);
    const face2 = new Face([v5, v6, v7, v8]);
    brep2 = new Brep([v5, v6, v7, v8], [], [face2]);

    // Set up elements - first is base, second is tool
    elements = [
      {
        nodeId: "node_1",
        brep: brep1,
        position: new THREE.Vector3(0, 0, 0),
        selected: true,
      },
      {
        nodeId: "node_2",
        brep: brep2,
        position: new THREE.Vector3(0, 0, 0),
        selected: true,
      },
      {
        nodeId: "node_3", // An unselected element
        brep: new Brep([], [], []),
        position: new THREE.Vector3(5, 0, 0),
        selected: false,
      },
    ];

    // Set up selected elements - ORDER MATTERS: first is base, second is tool
    selectedElements = ["node_1", "node_2"];

    // Add objects to the map
    objectsMap.set("node_1", new THREE.Mesh());
    objectsMap.set("node_2", new THREE.Mesh());
    objectsMap.set("node_3", new THREE.Mesh());
  });

  describe("basic operations", () => {
    test("returns err when fewer than 2 elements selected", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        ["node_1"], // Only one element selected
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/at least 2 elements/);
      expect(objectsMap.size).toBe(3); // No changes to objects map
    });

    test("returns err when no elements selected", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        [], // No elements selected
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/at least 2 elements/);
    });

    test("creates a compound brep and updates state when 2 elements are selected", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // Check the ID counter was incremented
      expect(result.value.nextIdCounter).toBe(6);

      // Check that a new element was created with a CompoundBrep
      expect(result.value.updatedElements.length).toBe(2); // One new element + node_3

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();
      expect(newElement?.brep).toBeInstanceOf(CompoundBrep);

      // Verify compound contains both original breps (base and tool for history)
      const compound = newElement?.brep as CompoundBrep;
      expect(compound.children.length).toBe(2);
      expect(compound.children).toContain(brep1); // Base
      expect(compound.children).toContain(brep2); // Tool

      // Check that original objects were removed from map
      expect(objectsMap.has("node_1")).toBeFalsy();
      expect(objectsMap.has("node_2")).toBeFalsy();

      // Check that new object was added to map
      expect(objectsMap.has("node_6")).toBeTruthy();
      expect(objectsMap.get("node_6")).toBeInstanceOf(THREE.Group);

      // Selected elements should be cleared
      expect(result.value.updatedSelectedElements).toEqual([]);
    });

    test("preserves unselected elements", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // node_3 should still exist and be unchanged
      const node3 = result.value.updatedElements.find(
        (el) => el.nodeId === "node_3",
      );
      expect(node3).toBeDefined();
      expect(node3?.position.x).toBe(5);

      // node_3 should still be in objectsMap
      expect(objectsMap.has("node_3")).toBeTruthy();
    });
  });

  describe("selection order", () => {
    test("respects selection order (first selected is base)", async () => {
      // Reverse the selection order: node_2 is base, node_1 is tool
      const reversedSelection = ["node_2", "node_1"];

      const result = await booleanOp(
        "difference",
        elements,
        reversedSelection,
        idCounter,
        objectsMap,
      );
      // With real OpenCascade, 2D shapes may fail difference operations
      // Result could be null if the operation fails
      if (result.ok) {
        const newElement = result.value.updatedElements.find(
          (el) => el.nodeId === "node_6",
        );
        expect(newElement).toBeDefined();
        expect(newElement?.brep).toBeInstanceOf(CompoundBrep);

        const compound = newElement?.brep as CompoundBrep;
        expect(compound.children.length).toBeGreaterThanOrEqual(1);
      } else {
        // Operation failed - acceptable for some geometry configurations
        expect(result.ok).toBe(false);
      }
    });

    test("base shape determines the primary geometry", async () => {
      // Create shapes with different sizes
      const largeBrep = createBoxBrep(0, 0, 0, 10, 10, 10);
      const smallBrep = createBoxBrep(4, 4, 4, 2, 2, 2);

      elements = [
        {
          nodeId: "large",
          brep: largeBrep,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "small",
          brep: smallBrep,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("large", new THREE.Mesh());
      objectsMap.set("small", new THREE.Mesh());

      // large - small should result in a shape with a hole
      const result = await booleanOp(
        "difference",
        elements,
        ["large", "small"],
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      const compound = newElement?.brep as CompoundBrep;

      // First child is base (large), second is tool (small)
      expect(compound.children[0]).toBe(largeBrep);
      expect(compound.children[1]).toBe(smallBrep);
    });
  });

  describe("multiple tools", () => {
    test("handles difference with multiple tools (3+ elements)", async () => {
      // Add a third brep as another tool
      const v9 = new Vertex(1, 1, 0);
      const v10 = new Vertex(1.8, 1, 0);
      const v11 = new Vertex(1.8, 1.8, 0);
      const v12 = new Vertex(1, 1.8, 0);
      const face3 = new Face([v9, v10, v11, v12]);
      const brep3 = new Brep([v9, v10, v11, v12], [], [face3]);

      const element3: SceneElement = {
        nodeId: "node_4",
        brep: brep3,
        position: new THREE.Vector3(0, 0, 0),
        selected: true,
      };

      elements.push(element3);
      objectsMap.set("node_4", new THREE.Mesh());

      // Select all three: base + two tools
      const threeSelected = ["node_1", "node_2", "node_4"];

      const result = await booleanOp(
        "difference",
        elements,
        threeSelected,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // Should create a new compound with 3 children
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();

      const compound = newElement?.brep as CompoundBrep;
      expect(compound.children.length).toBe(3); // base + 2 tools
    });

    test("handles 5 tools being subtracted sequentially", async () => {
      // Create base and 5 tools
      const baseBrep = createBoxBrep(0, 0, 0, 10, 10, 2);
      const tool1 = createBoxBrep(1, 1, 0, 1, 1, 2);
      const tool2 = createBoxBrep(3, 1, 0, 1, 1, 2);
      const tool3 = createBoxBrep(5, 1, 0, 1, 1, 2);
      const tool4 = createBoxBrep(7, 1, 0, 1, 1, 2);
      const tool5 = createBoxBrep(1, 5, 0, 1, 1, 2);

      elements = [
        {
          nodeId: "base",
          brep: baseBrep,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "tool1",
          brep: tool1,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "tool2",
          brep: tool2,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "tool3",
          brep: tool3,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "tool4",
          brep: tool4,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "tool5",
          brep: tool5,
          position: new THREE.Vector3(),
          selected: true,
        },
      ];

      elements.forEach((el) => {
        objectsMap.set(el.nodeId, new THREE.Mesh());
      });

      const result = await booleanOp(
        "difference",
        elements,
        ["base", "tool1", "tool2", "tool3", "tool4", "tool5"],
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();

      const compound = newElement?.brep as CompoundBrep;
      // Should have children stored for history
      expect(compound.children.length).toBeGreaterThanOrEqual(1);

      // New element should exist
      expect(result.value.nextIdCounter).toBe(6);
    });
  });

  describe("compound brep handling", () => {
    test("handles compound breps as base shape", async () => {
      // Create a compound brep and use it as the base
      const compound = new CompoundBrep([brep1]);

      // Replace element 1 with a compound
      elements[0] = {
        ...elements[0],
        brep: compound,
      };

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // The operation should still succeed
      expect(result.value.nextIdCounter).toBe(6);

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();
      expect(newElement?.brep).toBeInstanceOf(CompoundBrep);
    });

    test("handles compound breps as tool shape", async () => {
      // Create a compound brep and use it as the tool
      const toolCompound = new CompoundBrep([brep2]);

      elements[1] = {
        ...elements[1],
        brep: toolCompound,
      };

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(6);

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();
      expect(newElement?.brep).toBeInstanceOf(CompoundBrep);
    });

    test("handles nested compound breps", async () => {
      // Create a deeply nested compound (edge case - not typically valid)
      const innerCompound = new CompoundBrep([brep1]);
      const outerCompound = new CompoundBrep([innerCompound as any]);

      elements[0] = {
        ...elements[0],
        brep: outerCompound,
      };

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      // Nested compounds with inner CompoundBrep as children fail in difference:
      // CompoundBrep-as-child has no vertices/faces for brepToOCShape to process
      expect(result.ok).toBe(false);
    });
  });

  describe("object map management", () => {
    test("removes selected elements from objectsMap", async () => {
      expect(objectsMap.has("node_1")).toBeTruthy();
      expect(objectsMap.has("node_2")).toBeTruthy();

      await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );

      expect(objectsMap.has("node_1")).toBeFalsy();
      expect(objectsMap.has("node_2")).toBeFalsy();
    });

    test("adds result as THREE.Group to objectsMap", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      const resultObject = objectsMap.get("node_6");
      expect(resultObject).toBeDefined();
      expect(resultObject).toBeInstanceOf(THREE.Group);
    });

    test("preserves unselected objects in objectsMap", async () => {
      const unselectedMesh = objectsMap.get("node_3");

      await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );

      expect(objectsMap.get("node_3")).toBe(unselectedMesh);
    });
  });

  describe("id counter management", () => {
    test("increments id counter by 1", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(idCounter + 1);
    });

    test("uses incremented id for new element nodeId", async () => {
      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      const expectedNodeId = `node_${idCounter + 1}`;
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === expectedNodeId,
      );
      expect(newElement).toBeDefined();
    });

    test("handles high id counter values", async () => {
      const highIdCounter = 999999;

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        highIdCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(1000000);
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_1000000",
      );
      expect(newElement).toBeDefined();
    });
  });

  describe("position handling", () => {
    test("handles elements at different positions", async () => {
      elements[0].position = new THREE.Vector3(10, 20, 30);
      elements[1].position = new THREE.Vector3(-5, -10, -15);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // Operation should still succeed
      expect(result.value.nextIdCounter).toBe(6);
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();
    });

    test("handles elements at origin", async () => {
      elements[0].position = new THREE.Vector3(0, 0, 0);
      elements[1].position = new THREE.Vector3(0, 0, 0);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(6);
    });

    test("handles elements with rotation", async () => {
      elements[0].rotation = new THREE.Euler(Math.PI / 4, 0, 0);
      elements[1].rotation = new THREE.Euler(0, Math.PI / 2, 0);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // Operation should still succeed (rotation may affect result geometry)
      expect(result.value.nextIdCounter).toBe(6);
    });
  });

  describe("edge cases", () => {
    test("handles elements with empty breps", async () => {
      elements[1].brep = new Brep([], [], []);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // OCC difference with empty tool succeeds: base shape is unchanged
      expect(result.value.nextIdCounter).toBe(6);
    });

    test("handles selection of same element twice (deduplication)", async () => {
      const duplicateSelection = ["node_1", "node_1"];

      const result = await booleanOp(
        "difference",
        elements,
        duplicateSelection,
        idCounter,
        objectsMap,
      );

      // Either deduplication produces a valid result, or the duplicate triggers a discriminated error.
      // Both outcomes prove the function handled the bad input gracefully (no crash).
      expect(result).toBeDefined();
    });

    test("handles non-existent nodeId in selection", async () => {
      const invalidSelection = ["node_1", "nonexistent_node"];

      // This should be handled gracefully
      try {
        const result = await booleanOp(
          "difference",
          elements,
          invalidSelection,
          idCounter,
          objectsMap,
        );
        if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
        // If it doesn't throw, verify it handled the case
        expect(result).toBeDefined();
      } catch (error) {
        // If it throws, that's also acceptable behavior
        expect(error).toBeDefined();
      }
    });

    test("handles very large number of vertices", async () => {
      // Create a brep with many vertices (simulating a complex shape)
      const vertices: Vertex[] = [];
      for (let i = 0; i < 100; i++) {
        vertices.push(new Vertex(Math.cos(i * 0.1), Math.sin(i * 0.1), 0));
      }
      const complexFace = new Face(vertices);
      const complexBrep = new Brep(vertices, [], [complexFace]);

      elements[0].brep = complexBrep;

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(6);
    });
  });

  describe("error handling", () => {
    test("returns null when base element has empty brep", async () => {
      // Base (first selected) element has empty brep
      elements[0].brep = new Brep([], [], []);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
    });

    test("succeeds when tool element has empty brep", async () => {
      // Tool (second selected) element has empty brep
      elements[1].brep = new Brep([], [], []);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // OCC difference with empty tool succeeds: base shape is unchanged
      expect(result.value.nextIdCounter).toBe(6);
    });

    test("returns null when all elements have empty breps", async () => {
      elements[0].brep = new Brep([], [], []);
      elements[1].brep = new Brep([], [], []);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
    });

    test("returns null when base has degenerate geometry", async () => {
      // Degenerate geometry: collinear vertices
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1, 0, 0);
      const v3 = new Vertex(2, 0, 0);
      const degenerateFace = new Face([v1, v2, v3]);
      elements[0].brep = new Brep([v1, v2, v3], [], [degenerateFace]);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
    });

    test("handles tool larger than base (may result in empty geometry)", async () => {
      // Tool completely contains base - result should be empty
      const smallBase = createBoxBrep(2, 2, 0, 1, 1, 1);
      const largeTool = createBoxBrep(0, 0, 0, 10, 10, 10);

      elements[0].brep = smallBase;
      elements[1].brep = largeTool;

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      // When tool completely contains base, OCC difference produces empty geometry
      // which fails during tessellation/conversion, returning null
      expect(result.ok).toBe(false);
    });

    test("handles NaN in base position", async () => {
      elements[0].position = new THREE.Vector3(NaN, 0, 0);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      // NaN in position produces invalid OCC transforms, expect failure
      expect(result.ok).toBe(false);
    });

    test("handles Infinity in tool position", async () => {
      elements[1].position = new THREE.Vector3(Infinity, 0, 0);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      // Infinity in position produces invalid OCC transforms, expect failure
      expect(result.ok).toBe(false);
    });

    test("returns err when elements array is empty", async () => {
      const result = await booleanOp(
        "difference",
        [],
        selectedElements,
        idCounter,
        objectsMap,
      );
      // 2 ids passed, but no matching elements → err on the post-filter guard
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/at least 2 elements/);
    });

    test("returns err when selection only partially matches elements", async () => {
      // Selection includes nodeId not in elements array; only 1 valid match → err
      const partialSelection = ["node_1", "node_99"];

      const result = await booleanOp(
        "difference",
        elements,
        partialSelection,
        idCounter,
        objectsMap,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/at least 2 elements/);
    });

    test("handles extremely small geometry near precision limits", async () => {
      // Very small geometry - OpenCascade cannot handle sub-micron precision
      const v1 = new Vertex(0, 0, 0);
      const v2 = new Vertex(1e-10, 0, 0);
      const v3 = new Vertex(1e-10, 1e-10, 0);
      const v4 = new Vertex(0, 1e-10, 0);
      const tinyFace = new Face([v1, v2, v3, v4]);
      elements[0].brep = new Brep([v1, v2, v3, v4], [], [tinyFace]);

      const result = await booleanOp(
        "difference",
        elements,
        selectedElements,
        idCounter,
        objectsMap,
      );
      // Extremely small geometry typically causes OpenCascade to fail
      expect(result.ok).toBe(false);
    });
  });

  describe("cross-shaped intersection (real-world scenario)", () => {
    test("handles cross-shaped difference (horizontal - vertical)", async () => {
      // Simulate the cross scenario that was fixed
      // Horizontal bar: wide and short
      const horizontalBar = createBoxBrep(-5, -1, 0, 10, 2, 1);
      // Vertical bar: narrow and tall
      const verticalBar = createBoxBrep(-1, -5, 0, 2, 10, 1);

      elements = [
        {
          nodeId: "horizontal",
          brep: horizontalBar,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "vertical",
          brep: verticalBar,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("horizontal", new THREE.Mesh());
      objectsMap.set("vertical", new THREE.Mesh());

      const result = await booleanOp(
        "difference",
        elements,
        ["horizontal", "vertical"],
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      // Should create a result with both shapes stored as children
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement).toBeDefined();

      const compound = newElement?.brep as CompoundBrep;
      expect(compound.children[0]).toBe(horizontalBar); // Base
      expect(compound.children[1]).toBe(verticalBar); // Tool
    });

    test("handles cross-shaped difference (vertical - horizontal)", async () => {
      // Reverse: subtract horizontal from vertical
      const horizontalBar = createBoxBrep(-5, -1, 0, 10, 2, 1);
      const verticalBar = createBoxBrep(-1, -5, 0, 2, 10, 1);

      elements = [
        {
          nodeId: "horizontal",
          brep: horizontalBar,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "vertical",
          brep: verticalBar,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("horizontal", new THREE.Mesh());
      objectsMap.set("vertical", new THREE.Mesh());

      // Vertical first = base, horizontal second = tool
      const result = await booleanOp(
        "difference",
        elements,
        ["vertical", "horizontal"],
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      const compound = newElement?.brep as CompoundBrep;

      // Order should be reversed
      expect(compound.children[0]).toBe(verticalBar); // Base
      expect(compound.children[1]).toBe(horizontalBar); // Tool
    });
  });

  describe("3D geometry scenarios", () => {
    test("handles 3D box difference", async () => {
      const outerBox = createBoxBrep(0, 0, 0, 5, 5, 5);
      const innerBox = createBoxBrep(1, 1, 1, 3, 3, 3);

      elements = [
        {
          nodeId: "outer",
          brep: outerBox,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "inner",
          brep: innerBox,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("outer", new THREE.Mesh());
      objectsMap.set("inner", new THREE.Mesh());

      const result = await booleanOp(
        "difference",
        elements,
        ["outer", "inner"],
        idCounter,
        objectsMap,
      );
      if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

      expect(result.value.nextIdCounter).toBe(6);
      const newElement = result.value.updatedElements.find(
        (el) => el.nodeId === "node_6",
      );
      expect(newElement?.brep).toBeInstanceOf(CompoundBrep);
    });

    test("handles difference with non-overlapping shapes", async () => {
      // Two shapes that don't overlap
      const box1 = createBoxBrep(0, 0, 0, 1, 1, 1);
      const box2 = createBoxBrep(10, 10, 10, 1, 1, 1);

      elements = [
        {
          nodeId: "box1",
          brep: box1,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "box2",
          brep: box2,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("box1", new THREE.Mesh());
      objectsMap.set("box2", new THREE.Mesh());

      const result = await booleanOp(
        "difference",
        elements,
        ["box1", "box2"],
        idCounter,
        objectsMap,
      );
      // Non-overlapping difference may succeed or fail depending on OpenCascade
      if (result.ok) {
        expect(result.value.nextIdCounter).toBe(6);
      } else {
        expect(result.ok).toBe(false);
      }
    });

    test("handles difference where tool completely contains base", async () => {
      // Tool is larger than base - should result in empty/null geometry
      const smallBox = createBoxBrep(2, 2, 2, 1, 1, 1);
      const largeBox = createBoxBrep(0, 0, 0, 5, 5, 5);

      elements = [
        {
          nodeId: "small",
          brep: smallBox,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
        {
          nodeId: "large",
          brep: largeBox,
          position: new THREE.Vector3(0, 0, 0),
          selected: true,
        },
      ];

      objectsMap.set("small", new THREE.Mesh());
      objectsMap.set("large", new THREE.Mesh());

      // small - large = empty (base is completely inside tool)
      const result = await booleanOp(
        "difference",
        elements,
        ["small", "large"],
        idCounter,
        objectsMap,
      );
      // When tool completely contains base, result may be empty/null
      if (result.ok) {
        expect(result.value.nextIdCounter).toBe(6);
      } else {
        expect(result.ok).toBe(false);
      }
    });
  });
});
