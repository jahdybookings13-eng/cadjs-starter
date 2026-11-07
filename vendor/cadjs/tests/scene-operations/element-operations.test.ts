import * as THREE from "three";
import {
  addElement,
  removeElement,
  updateElementPosition,
  updateElementRotation,
} from "../../src/scene-operations/element-operations";
import { Brep, CompoundBrep, Face, Vertex } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

describe("element-operations", () => {
  let objectsMap: Map<string, THREE.Object3D>;
  let elements: SceneElement[];
  let selectedElements: string[];
  let simpleBrep: Brep;
  let compoundBrep: CompoundBrep;

  beforeEach(() => {
    // Setup test fixtures
    objectsMap = new Map<string, THREE.Object3D>();
    elements = [];
    selectedElements = [];

    // Create a simple brep
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(1, 0, 0);
    const v3 = new Vertex(1, 1, 0);
    const face = new Face([v1, v2, v3]);
    simpleBrep = new Brep([v1, v2, v3], [], [face]);

    // Create a compound brep
    const brep1 = new Brep([v1, v2, v3], [], [face]);
    const v4 = new Vertex(0, 0, 1);
    const v5 = new Vertex(1, 0, 1);
    const v6 = new Vertex(1, 1, 1);
    const face2 = new Face([v4, v5, v6]);
    const brep2 = new Brep([v4, v5, v6], [], [face2]);
    compoundBrep = new CompoundBrep([brep1, brep2]);
  });

  describe("addElement", () => {
    test("adds an element with auto-created mesh", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const idCounter = 0;

      const result = addElement(
        elements,
        simpleBrep,
        position,
        idCounter,
        objectsMap,
      );

      // Check if elements array is updated correctly
      expect(result.updatedElements).toHaveLength(1);
      expect(result.updatedElements[0].nodeId).toBe("node_1");
      expect(result.updatedElements[0].brep).toBe(simpleBrep);
      expect(result.updatedElements[0].position).toBe(position);
      expect(result.updatedElements[0].selected).toBe(false);

      // Check if object was created and added to map
      expect(objectsMap.size).toBe(1);
      expect(objectsMap.has("node_1")).toBe(true);

      // Real createMeshFromBrep returns a THREE.Group
      const obj = objectsMap.get("node_1")!;
      expect(obj).toBeInstanceOf(THREE.Group);

      // Check if id counter is incremented
      expect(result.nextId).toBe(1);
    });

    test("adds an element with provided mesh", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const idCounter = 5;
      const customMesh = new THREE.Mesh(
        new THREE.SphereGeometry(),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      );

      const result = addElement(
        elements,
        simpleBrep,
        position,
        idCounter,
        objectsMap,
        customMesh,
      );

      expect(result.nodeId).toBe("node_6");
      expect(objectsMap.get("node_6")).toBe(customMesh);
    });
  });

  describe("removeElement", () => {
    beforeEach(() => {
      // Setup pre-existing elements using real createMeshFromBrep
      const result1 = addElement(
        [],
        simpleBrep,
        new THREE.Vector3(0, 0, 0),
        0,
        objectsMap,
      );
      const result2 = addElement(
        result1.updatedElements,
        simpleBrep,
        new THREE.Vector3(1, 0, 0),
        result1.nextId,
        objectsMap,
      );
      elements = result2.updatedElements.map((el, i) =>
        i === 1 ? { ...el, selected: true } : el,
      );
      selectedElements = ["node_2"];
    });

    test("removes element from elements array and objects map", () => {
      const result = removeElement(
        elements,
        selectedElements,
        "node_1",
        objectsMap,
      );

      expect(result.updatedElements).toHaveLength(1);
      expect(result.updatedElements[0].nodeId).toBe("node_2");
      expect(objectsMap.has("node_1")).toBe(false);
      expect(objectsMap.has("node_2")).toBe(true);
    });

    test("removes element from selected elements if it was selected", () => {
      const result = removeElement(
        elements,
        selectedElements,
        "node_2",
        objectsMap,
      );

      expect(result.updatedSelectedElements).toHaveLength(0);
      expect(result.updatedElements).toHaveLength(1);
      expect(result.updatedElements[0].nodeId).toBe("node_1");
    });
  });

  describe("updateElementPosition", () => {
    beforeEach(() => {
      // Setup pre-existing elements using real createMeshFromBrep
      const result1 = addElement(
        [],
        simpleBrep,
        new THREE.Vector3(0, 0, 0),
        0,
        objectsMap,
      );
      elements = result1.updatedElements;

      // Add a compound brep element with a provided Group (CompoundBrep can't go through createMeshFromBrep easily)
      const compoundGroup = new THREE.Group();
      compoundGroup.position.set(1, 0, 0);
      objectsMap.set("node_2", compoundGroup);
      elements = [
        ...elements,
        {
          nodeId: "node_2",
          brep: compoundBrep,
          position: new THREE.Vector3(1, 0, 0),
          selected: true,
        },
      ];
    });

    test("updates position for a simple brep element", () => {
      const newPosition = new THREE.Vector3(5, 5, 5);
      const updatedElements = updateElementPosition(
        elements,
        "node_1",
        newPosition,
        objectsMap,
      );

      // Check if position is updated
      const updatedElement = updatedElements.find(
        (el) => el.nodeId === "node_1",
      );
      expect(updatedElement?.position).toEqual(newPosition);

      // Check if object position is updated
      const object = objectsMap.get("node_1");
      expect(object?.position.equals(newPosition)).toBe(true);
    });

    test("updates position for a compound brep element", () => {
      const newPosition = new THREE.Vector3(10, 10, 10);
      const updatedElements = updateElementPosition(
        elements,
        "node_2",
        newPosition,
        objectsMap,
      );

      // Check if position is updated
      const updatedElement = updatedElements.find(
        (el) => el.nodeId === "node_2",
      );
      expect(updatedElement?.position).toEqual(newPosition);

      // Check if object position is updated
      const object = objectsMap.get("node_2");
      expect(object?.position.equals(newPosition)).toBe(true);
    });

    test("returns original elements array when element not found", () => {
      const newPosition = new THREE.Vector3(5, 5, 5);
      const updatedElements = updateElementPosition(
        elements,
        "non_existent",
        newPosition,
        objectsMap,
      );

      // Should return the original elements unchanged
      expect(updatedElements).toBe(elements);
    });
  });

  describe("optional SceneElement fields", () => {
    test("addElement does NOT include rotation (only brep, nodeId, position, selected)", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const result = addElement(elements, simpleBrep, position, 0, objectsMap);

      // addElement creates { brep, nodeId, position, selected: false } — no rotation
      expect(result.updatedElements[0].rotation).toBeUndefined();
    });

    test("addElement does NOT include elementType", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const result = addElement(elements, simpleBrep, position, 0, objectsMap);

      expect(result.updatedElements[0].elementType).toBeUndefined();
    });

    test("addElement does NOT include occBrep", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const result = addElement(elements, simpleBrep, position, 0, objectsMap);

      expect(result.updatedElements[0].occBrep).toBeUndefined();
    });

    test("addElement does NOT include edgeGeometry", () => {
      const position = new THREE.Vector3(1, 2, 3);
      const result = addElement(elements, simpleBrep, position, 0, objectsMap);

      expect(result.updatedElements[0].edgeGeometry).toBeUndefined();
    });

    test("updateElementPosition preserves rotation field via spread", () => {
      const el: SceneElement = {
        nodeId: "node_rot",
        brep: simpleBrep,
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(Math.PI / 4, 0, 0),
        selected: false,
      };
      const elGroup = new THREE.Group();
      objectsMap.set("node_rot", elGroup);

      const updatedElements = updateElementPosition(
        [el],
        "node_rot",
        new THREE.Vector3(5, 5, 5),
        objectsMap,
      );

      expect(updatedElements[0].rotation).toBeDefined();
      expect(updatedElements[0].rotation!.x).toBeCloseTo(Math.PI / 4);
    });

    test("updateElementPosition preserves occBrep field via spread", () => {
      const el: SceneElement = {
        nodeId: "node_occ",
        brep: simpleBrep,
        position: new THREE.Vector3(0, 0, 0),
        occBrep: "some_serialized_data",
        selected: false,
      };
      objectsMap.set("node_occ", new THREE.Group());

      const updatedElements = updateElementPosition(
        [el],
        "node_occ",
        new THREE.Vector3(5, 5, 5),
        objectsMap,
      );

      expect(updatedElements[0].occBrep).toBe("some_serialized_data");
    });

    test("updateElementPosition with very large coordinates (1e10)", () => {
      const result1 = addElement(
        [],
        simpleBrep,
        new THREE.Vector3(0, 0, 0),
        0,
        objectsMap,
      );
      const largePos = new THREE.Vector3(1e10, 1e10, 1e10);

      const updatedElements = updateElementPosition(
        result1.updatedElements,
        "node_1",
        largePos,
        objectsMap,
      );

      expect(updatedElements[0].position.x).toBe(1e10);
      expect(updatedElements[0].position.y).toBe(1e10);
      expect(updatedElements[0].position.z).toBe(1e10);
    });
  });

  describe("child element propagation (translation)", () => {
    let parentEl: SceneElement;
    let childEl: SceneElement;
    let unrelatedEl: SceneElement;

    beforeEach(() => {
      objectsMap = new Map();

      parentEl = {
        nodeId: "parent_1",
        brep: simpleBrep,
        position: new THREE.Vector3(5, 5, 5),
        selected: false,
      };
      objectsMap.set("parent_1", new THREE.Group());
      objectsMap.get("parent_1")!.position.set(5, 5, 5);

      childEl = {
        nodeId: "child_1",
        brep: simpleBrep,
        position: new THREE.Vector3(7, 5, 5),
        selected: false,
        sketchPlane: {
          type: "face" as const,
          origin: new THREE.Vector3(5, 5, 6),
          normal: new THREE.Vector3(0, 0, 1),
          xAxis: new THREE.Vector3(1, 0, 0),
          yAxis: new THREE.Vector3(0, 1, 0),
          sourceElementId: "parent_1",
        },
      };
      objectsMap.set("child_1", new THREE.Group());
      objectsMap.get("child_1")!.position.set(7, 5, 5);

      unrelatedEl = {
        nodeId: "unrelated_1",
        brep: simpleBrep,
        position: new THREE.Vector3(20, 20, 20),
        selected: false,
      };
      objectsMap.set("unrelated_1", new THREE.Group());
      objectsMap.get("unrelated_1")!.position.set(20, 20, 20);

      elements = [parentEl, childEl, unrelatedEl];
    });

    test("moving parent propagates delta to child", () => {
      const newParentPos = new THREE.Vector3(10, 5, 5); // delta = (5, 0, 0)
      const result = updateElementPosition(
        elements,
        "parent_1",
        newParentPos,
        objectsMap,
      );

      const parent = result.find((el) => el.nodeId === "parent_1")!;
      const child = result.find((el) => el.nodeId === "child_1")!;

      expect(parent.position).toEqual(new THREE.Vector3(10, 5, 5));
      expect(child.position.x).toBeCloseTo(12); // 7 + 5
      expect(child.position.y).toBeCloseTo(5);
      expect(child.position.z).toBeCloseTo(5);
    });

    test("moving parent updates child sketchPlane origin", () => {
      const newParentPos = new THREE.Vector3(10, 5, 5); // delta = (5, 0, 0)
      const result = updateElementPosition(
        elements,
        "parent_1",
        newParentPos,
        objectsMap,
      );

      const child = result.find((el) => el.nodeId === "child_1")!;
      expect(child.sketchPlane!.origin.x).toBeCloseTo(10); // 5 + 5
      expect(child.sketchPlane!.origin.y).toBeCloseTo(5);
      expect(child.sketchPlane!.origin.z).toBeCloseTo(6);
    });

    test("moving parent updates child Three.js object", () => {
      const newParentPos = new THREE.Vector3(10, 5, 5);
      updateElementPosition(elements, "parent_1", newParentPos, objectsMap);

      const childObj = objectsMap.get("child_1")!;
      expect(childObj.position.x).toBeCloseTo(12);
    });

    test("unrelated elements are not affected", () => {
      const newParentPos = new THREE.Vector3(10, 5, 5);
      const result = updateElementPosition(
        elements,
        "parent_1",
        newParentPos,
        objectsMap,
      );

      const unrelated = result.find((el) => el.nodeId === "unrelated_1")!;
      expect(unrelated.position).toEqual(new THREE.Vector3(20, 20, 20));
    });

    test("moving child does NOT move parent (unidirectional)", () => {
      const newChildPos = new THREE.Vector3(100, 100, 100);
      const result = updateElementPosition(
        elements,
        "child_1",
        newChildPos,
        objectsMap,
      );

      const parent = result.find((el) => el.nodeId === "parent_1")!;
      expect(parent.position).toEqual(new THREE.Vector3(5, 5, 5));
    });

    test("multiple children from same parent all move", () => {
      const child2: SceneElement = {
        nodeId: "child_2",
        brep: simpleBrep,
        position: new THREE.Vector3(5, 8, 5),
        selected: false,
        sketchPlane: {
          type: "face" as const,
          origin: new THREE.Vector3(5, 5, 6),
          normal: new THREE.Vector3(0, 0, 1),
          xAxis: new THREE.Vector3(1, 0, 0),
          yAxis: new THREE.Vector3(0, 1, 0),
          sourceElementId: "parent_1",
        },
      };
      objectsMap.set("child_2", new THREE.Group());
      const elems = [...elements, child2];

      const newParentPos = new THREE.Vector3(5, 10, 5); // delta = (0, 5, 0)
      const result = updateElementPosition(
        elems,
        "parent_1",
        newParentPos,
        objectsMap,
      );

      expect(
        result.find((el) => el.nodeId === "child_1")!.position.y,
      ).toBeCloseTo(10);
      expect(
        result.find((el) => el.nodeId === "child_2")!.position.y,
      ).toBeCloseTo(13);
    });
  });

  describe("child element propagation (rotation)", () => {
    let parentEl: SceneElement;
    let childEl: SceneElement;

    beforeEach(() => {
      objectsMap = new Map();

      parentEl = {
        nodeId: "parent_1",
        brep: simpleBrep,
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        selected: false,
      };
      objectsMap.set("parent_1", new THREE.Group());

      childEl = {
        nodeId: "child_1",
        brep: simpleBrep,
        position: new THREE.Vector3(5, 0, 0),
        selected: false,
        sketchPlane: {
          type: "face" as const,
          origin: new THREE.Vector3(0, 0, 1),
          normal: new THREE.Vector3(0, 0, 1),
          xAxis: new THREE.Vector3(1, 0, 0),
          yAxis: new THREE.Vector3(0, 1, 0),
          sourceElementId: "parent_1",
        },
      };
      objectsMap.set("child_1", new THREE.Group());
      objectsMap.get("child_1")!.position.set(5, 0, 0);

      elements = [parentEl, childEl];
    });

    test("rotating parent orbits child around parent position", () => {
      // Rotate 90 degrees around Z axis: child at (5,0,0) should move to (0,5,0)
      const newRotation = new THREE.Euler(0, 0, Math.PI / 2);
      const result = updateElementRotation(
        elements,
        "parent_1",
        newRotation,
        objectsMap,
      );

      const child = result.find((el) => el.nodeId === "child_1")!;
      expect(child.position.x).toBeCloseTo(0);
      expect(child.position.y).toBeCloseTo(5);
      expect(child.position.z).toBeCloseTo(0);
    });

    test("rotating parent rotates child sketchPlane normal", () => {
      // Rotate 90 degrees around Z: normal (0,0,1) stays (0,0,1)
      // Rotate 90 degrees around Y: normal (0,0,1) should become (1,0,0)
      const newRotation = new THREE.Euler(0, Math.PI / 2, 0);
      const result = updateElementRotation(
        elements,
        "parent_1",
        newRotation,
        objectsMap,
      );

      const child = result.find((el) => el.nodeId === "child_1")!;
      expect(child.sketchPlane!.normal.x).toBeCloseTo(1);
      expect(child.sketchPlane!.normal.y).toBeCloseTo(0);
      expect(child.sketchPlane!.normal.z).toBeCloseTo(0);
    });

    test("rotating parent updates child Three.js object", () => {
      const newRotation = new THREE.Euler(0, 0, Math.PI / 2);
      updateElementRotation(elements, "parent_1", newRotation, objectsMap);

      const childObj = objectsMap.get("child_1")!;
      expect(childObj.position.x).toBeCloseTo(0);
      expect(childObj.position.y).toBeCloseTo(5);
    });

    test("rotating child does NOT affect parent", () => {
      const newRotation = new THREE.Euler(Math.PI, 0, 0);
      const result = updateElementRotation(
        elements,
        "child_1",
        newRotation,
        objectsMap,
      );

      const parent = result.find((el) => el.nodeId === "parent_1")!;
      expect(parent.rotation!.x).toBeCloseTo(0);
      expect(parent.rotation!.y).toBeCloseTo(0);
      expect(parent.rotation!.z).toBeCloseTo(0);
    });

    test("element without rotation defaults to identity", () => {
      // Remove rotation from parent to test the fallback
      elements[0] = { ...parentEl, rotation: undefined };
      const newRotation = new THREE.Euler(0, 0, Math.PI / 2);
      const result = updateElementRotation(
        elements,
        "parent_1",
        newRotation,
        objectsMap,
      );

      const child = result.find((el) => el.nodeId === "child_1")!;
      expect(child.position.x).toBeCloseTo(0);
      expect(child.position.y).toBeCloseTo(5);
    });
  });
});
