import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import {
  handleSetMode,
  selectElement as selectElementOp,
  deselectElement as deselectElementOp,
  applySelectionMaterial,
} from "../../src/scene-operations/selection-operations";
import { Brep, CompoundBrep, Vertex, Edge, Face } from "../../src/geometry";
import { BODY, SELECTION } from "../../src/theme";

// Build a real LineSegments2 + LineMaterial like the production edge overlay,
// so tests exercise the actual `instanceof LineSegments2` narrowing.
function makeEdgeOverlay(opts?: {
  opacity?: number;
  transparent?: boolean;
}): LineSegments2 {
  const mat = new LineMaterial({
    color: 0x000000,
    opacity: opts?.opacity ?? 1,
    transparent: opts?.transparent ?? false,
  });
  const geo = new LineSegmentsGeometry();
  const overlay = new LineSegments2(geo, mat);
  overlay.userData.isEdgeOverlay = true;
  return overlay;
}

function selectElement(
  elements: any[],
  selectedElements: string[],
  nodeId: string,
  objectsMap: Map<string, THREE.Object3D>,
) {
  const result = selectElementOp(elements, selectedElements, nodeId);
  applySelectionMaterial(
    objectsMap,
    result.affectedNodeIds,
    SELECTION.selected,
  );
  return result;
}

function deselectElement(
  elements: any[],
  selectedElements: string[],
  nodeId: string,
  objectsMap: Map<string, THREE.Object3D>,
) {
  const result = deselectElementOp(elements, selectedElements, nodeId);
  applySelectionMaterial(objectsMap, result.affectedNodeIds, BODY.default);
  return result;
}

// Helper to create a simple Brep for testing
function createSimpleBrep(): Brep {
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
  return new Brep([v1, v2, v3, v4], edges, [face]);
}

describe("selection-operations", () => {
  let objectsMap: Map<string, THREE.Object3D>;
  let elements: any[];
  let selectedElements: string[];

  beforeEach(() => {
    objectsMap = new Map<string, THREE.Object3D>();
    elements = [
      {
        nodeId: "node_1",
        brep: { faces: [] },
        position: new THREE.Vector3(),
        selected: false,
      },
      {
        nodeId: "node_2",
        brep: { faces: [] },
        position: new THREE.Vector3(),
        selected: false,
      },
    ];
    selectedElements = [];
    // Create minimal THREE.Mesh objects for testing
    elements.forEach((el) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      objectsMap.set(el.nodeId, mesh);
    });
  });

  describe("handleSetMode", () => {
    test("deselects all and sets new mode", () => {
      // Pre-select an element
      elements[0].selected = true;
      selectedElements.push("node_1");

      const newMode = "move";
      const result = handleSetMode(elements, newMode, objectsMap);
      // All elements should be deselected
      result.updatedElements.forEach((el) => expect(el.selected).toBe(false));
      expect(result.mode).toBe(newMode);
    });

    test("resets mesh color to blue for all elements", () => {
      // Set colors to red initially
      elements.forEach((el) => {
        const mesh = objectsMap.get(el.nodeId) as THREE.Mesh;
        (mesh.material as THREE.MeshStandardMaterial).color.set(
          SELECTION.selected,
        );
      });

      handleSetMode(elements, "move", objectsMap);

      elements.forEach((el) => {
        const mesh = objectsMap.get(el.nodeId) as THREE.Mesh;
        const color = (mesh.material as THREE.MeshStandardMaterial).color;
        expect(color.getHex()).toBe(BODY.default);
      });
    });

    test("Group with edge overlay: resets overlay opacity, does NOT color reset overlay", () => {
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      const overlay = makeEdgeOverlay({ opacity: 0.5, transparent: true });
      group.add(realMesh);
      group.add(overlay);
      objectsMap.set("node_1", group);

      handleSetMode(elements, "move", objectsMap);

      // Real mesh should be reset to BODY.default
      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
      // Overlay opacity should be reset to 1.0
      expect(overlay.material.opacity).toBe(1.0);
      expect(overlay.material.transparent).toBe(false);
    });

    test("Group with helper: helper set to visible=false on mode switch", () => {
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      const edgeHelper = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial(),
      );
      edgeHelper.userData.helperType = "edge";
      edgeHelper.userData.isHelper = true;
      edgeHelper.visible = true;

      const vertexHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.05),
        new THREE.MeshBasicMaterial(),
      );
      vertexHelper.userData.helperType = "vertex";
      vertexHelper.userData.isHelper = true;
      vertexHelper.visible = true;

      group.add(realMesh);
      group.add(edgeHelper);
      group.add(vertexHelper);
      objectsMap.set("node_1", group);

      handleSetMode(elements, "move", objectsMap);

      // Both helpers should be hidden
      expect(edgeHelper.visible).toBe(false);
      expect(vertexHelper.visible).toBe(false);
      // Real mesh should be color reset
      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
    });

    test("Group with Mesh + overlay + helper: all three handled correctly", () => {
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      const overlay = makeEdgeOverlay({ opacity: 0.5, transparent: true });
      const helper = new THREE.Mesh(
        new THREE.SphereGeometry(),
        new THREE.MeshBasicMaterial(),
      );
      helper.userData.isHelper = true;
      helper.userData.helperType = "edge";
      helper.visible = true;

      group.add(realMesh);
      group.add(overlay);
      group.add(helper);
      objectsMap.set("node_1", group);

      handleSetMode(elements, "move", objectsMap);

      // Mesh: color reset
      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
      // Overlay: opacity reset
      expect(overlay.material.opacity).toBe(1.0);
      // Helper: hidden
      expect(helper.visible).toBe(false);
    });

    test("bare Mesh resets material on mode switch", () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      objectsMap.set("node_1", mesh);

      handleSetMode(elements, "move", objectsMap);

      expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
        BODY.default,
      );
      expect((mesh.material as THREE.MeshStandardMaterial).opacity).toBe(1.0);
    });

    test("handles non-Mesh objects gracefully", () => {
      objectsMap.set("node_1", new THREE.Group());

      const result = handleSetMode(elements, "move", objectsMap);
      expect(result.mode).toBe("move");
      expect(result.updatedElements[0].selected).toBe(false);
    });
  });

  describe("selectElement - basic", () => {
    test("updates element selection", () => {
      const result = selectElement(
        elements,
        selectedElements,
        "node_1",
        objectsMap,
      );
      const updatedElement = result.updatedElements.find(
        (el) => el.nodeId === "node_1",
      );
      expect(updatedElement?.selected).toBe(true);
      expect(result.updatedSelectedElements).toContain("node_1");
    });

    test("changes mesh color to red", () => {
      selectElement(elements, selectedElements, "node_1", objectsMap);

      const mesh = objectsMap.get("node_1") as THREE.Mesh;
      const color = (mesh.material as THREE.MeshStandardMaterial).color;
      expect(color.getHex()).toBe(SELECTION.selected);
    });

    test("returns unchanged state for non-existent element", () => {
      const result = selectElement(
        elements,
        selectedElements,
        "non_existent",
        objectsMap,
      );
      expect(result.updatedElements).toBe(elements);
      expect(result.updatedSelectedElements).toBe(selectedElements);
    });

    test("does not duplicate in selectedElements array", () => {
      const result1 = selectElement(
        elements,
        selectedElements,
        "node_1",
        objectsMap,
      );
      const result2 = selectElement(
        result1.updatedElements,
        result1.updatedSelectedElements,
        "node_1",
        objectsMap,
      );

      const count = result2.updatedSelectedElements.filter(
        (id) => id === "node_1",
      ).length;
      expect(count).toBe(1);
    });
  });

  describe("selectElement - compound handling", () => {
    let childBrep1: Brep;
    let childBrep2: Brep;
    let compoundBrep: CompoundBrep;
    let compoundElements: any[];

    beforeEach(() => {
      childBrep1 = createSimpleBrep();
      childBrep2 = createSimpleBrep();
      compoundBrep = new CompoundBrep([childBrep1, childBrep2]);

      compoundElements = [
        {
          nodeId: "compound_1",
          brep: compoundBrep,
          position: new THREE.Vector3(),
          selected: false,
        },
        {
          nodeId: "child_1",
          brep: childBrep1,
          position: new THREE.Vector3(),
          selected: false,
        },
        {
          nodeId: "child_2",
          brep: childBrep2,
          position: new THREE.Vector3(),
          selected: false,
        },
        {
          nodeId: "standalone",
          brep: createSimpleBrep(),
          position: new THREE.Vector3(),
          selected: false,
        },
      ];

      // Create mesh objects for each element
      compoundElements.forEach((el) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial({ color: BODY.default }),
        );
        objectsMap.set(el.nodeId, mesh);
      });
    });

    test("selecting CompoundBrep selects all elements sharing same brep", () => {
      const result = selectElement(
        compoundElements,
        [],
        "compound_1",
        objectsMap,
      );

      const compoundEl = result.updatedElements.find(
        (el) => el.nodeId === "compound_1",
      );
      expect(compoundEl?.selected).toBe(true);
      expect(result.updatedSelectedElements).toContain("compound_1");
    });

    test("selecting child element cascades to parent compound", () => {
      const result = selectElement(compoundElements, [], "child_1", objectsMap);

      // The child should be selected
      const childEl = result.updatedElements.find(
        (el) => el.nodeId === "child_1",
      );
      expect(childEl?.selected).toBe(true);

      // The parent compound should also be selected
      const compoundEl = result.updatedElements.find(
        (el) => el.nodeId === "compound_1",
      );
      expect(compoundEl?.selected).toBe(true);

      // Both should be in selectedElements
      expect(result.updatedSelectedElements).toContain("child_1");
      expect(result.updatedSelectedElements).toContain("compound_1");
    });

    test("selecting child element also selects sibling children", () => {
      const result = selectElement(compoundElements, [], "child_1", objectsMap);

      // Both children should be selected
      expect(result.updatedSelectedElements).toContain("child_1");
      expect(result.updatedSelectedElements).toContain("child_2");

      const child2El = result.updatedElements.find(
        (el) => el.nodeId === "child_2",
      );
      expect(child2El?.selected).toBe(true);
    });

    test("selecting standalone element does not affect compound", () => {
      const result = selectElement(
        compoundElements,
        [],
        "standalone",
        objectsMap,
      );

      expect(result.updatedSelectedElements).toContain("standalone");
      expect(result.updatedSelectedElements).not.toContain("compound_1");
      expect(result.updatedSelectedElements).not.toContain("child_1");
      expect(result.updatedSelectedElements).not.toContain("child_2");
    });

    test("selection cascading produces unique nodeIds", () => {
      const result = selectElement(compoundElements, [], "child_1", objectsMap);

      const uniqueIds = new Set(result.updatedSelectedElements);
      expect(uniqueIds.size).toBe(result.updatedSelectedElements.length);
    });
  });

  describe("selectElement - THREE.Group handling", () => {
    test("traverses THREE.Group to set mesh colors", () => {
      const group = new THREE.Group();
      const innerMesh1 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      const innerMesh2 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      group.add(innerMesh1);
      group.add(innerMesh2);

      objectsMap.set("node_1", group);

      selectElement(elements, selectedElements, "node_1", objectsMap);

      // Both inner meshes should be red
      const color1 = (innerMesh1.material as THREE.MeshStandardMaterial).color;
      const color2 = (innerMesh2.material as THREE.MeshStandardMaterial).color;
      expect(color1.getHex()).toBe(SELECTION.selected);
      expect(color2.getHex()).toBe(SELECTION.selected);
    });

    test("handles nested groups during selection", () => {
      const outerGroup = new THREE.Group();
      const innerGroup = new THREE.Group();
      const deepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );

      innerGroup.add(deepMesh);
      outerGroup.add(innerGroup);
      objectsMap.set("node_1", outerGroup);

      selectElement(elements, selectedElements, "node_1", objectsMap);

      const color = (deepMesh.material as THREE.MeshStandardMaterial).color;
      expect(color.getHex()).toBe(SELECTION.selected);
    });

    test("selectElement colors ALL Mesh children including overlay", () => {
      // selectElement does not skip isEdgeOverlay — it colors everything
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      const overlay = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      overlay.userData.isEdgeOverlay = true;
      group.add(realMesh);
      group.add(overlay);
      objectsMap.set("node_1", group);

      selectElement(elements, selectedElements, "node_1", objectsMap);

      // Both get selection color (no isEdgeOverlay check in selectElement)
      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(SELECTION.selected);
      expect(
        (overlay.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(SELECTION.selected);
    });

    test("selectElement colors helper Mesh children too", () => {
      // selectElement does not skip isHelper — it colors everything
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      const helper = new THREE.Mesh(
        new THREE.SphereGeometry(),
        new THREE.MeshStandardMaterial({ color: BODY.default }),
      );
      helper.userData.isHelper = true;
      group.add(realMesh);
      group.add(helper);
      objectsMap.set("node_1", group);

      selectElement(elements, selectedElements, "node_1", objectsMap);

      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(SELECTION.selected);
      expect(
        (helper.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(SELECTION.selected);
    });
  });

  describe("deselectElement - basic", () => {
    test("updates element selection", () => {
      // First select and then deselect node_1
      let result = selectElement(
        elements,
        selectedElements,
        "node_1",
        objectsMap,
      );
      expect(result.updatedSelectedElements).toContain("node_1");

      result = deselectElement(
        result.updatedElements,
        result.updatedSelectedElements,
        "node_1",
        objectsMap,
      );
      const updatedElement = result.updatedElements.find(
        (el) => el.nodeId === "node_1",
      );
      expect(updatedElement?.selected).toBe(false);
      expect(result.updatedSelectedElements).not.toContain("node_1");
    });

    test("changes mesh color back to blue", () => {
      let result = selectElement(
        elements,
        selectedElements,
        "node_1",
        objectsMap,
      );
      deselectElement(
        result.updatedElements,
        result.updatedSelectedElements,
        "node_1",
        objectsMap,
      );

      const mesh = objectsMap.get("node_1") as THREE.Mesh;
      const color = (mesh.material as THREE.MeshStandardMaterial).color;
      expect(color.getHex()).toBe(BODY.default);
    });

    test("returns unchanged state for non-existent element", () => {
      const result = deselectElement(
        elements,
        ["node_1"],
        "non_existent",
        objectsMap,
      );
      expect(result.updatedElements).toBe(elements);
      expect(result.updatedSelectedElements).toEqual(["node_1"]);
    });
  });

  describe("deselectElement - compound handling", () => {
    let childBrep1: Brep;
    let childBrep2: Brep;
    let compoundBrep: CompoundBrep;
    let compoundElements: any[];

    beforeEach(() => {
      childBrep1 = createSimpleBrep();
      childBrep2 = createSimpleBrep();
      compoundBrep = new CompoundBrep([childBrep1, childBrep2]);

      compoundElements = [
        {
          nodeId: "compound_1",
          brep: compoundBrep,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "child_1",
          brep: childBrep1,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "child_2",
          brep: childBrep2,
          position: new THREE.Vector3(),
          selected: true,
        },
        {
          nodeId: "standalone",
          brep: createSimpleBrep(),
          position: new THREE.Vector3(),
          selected: false,
        },
      ];

      // Create mesh objects for each element
      compoundElements.forEach((el) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial({
            color: el.selected ? SELECTION.selected : BODY.default,
          }),
        );
        objectsMap.set(el.nodeId, mesh);
      });
    });

    test("deselecting CompoundBrep deselects all elements sharing same brep", () => {
      const selected = ["compound_1", "child_1", "child_2"];
      const result = deselectElement(
        compoundElements,
        selected,
        "compound_1",
        objectsMap,
      );

      const compoundEl = result.updatedElements.find(
        (el) => el.nodeId === "compound_1",
      );
      expect(compoundEl?.selected).toBe(false);
      expect(result.updatedSelectedElements).not.toContain("compound_1");
    });

    test("deselecting child element cascades to parent compound", () => {
      const selected = ["compound_1", "child_1", "child_2"];
      const result = deselectElement(
        compoundElements,
        selected,
        "child_1",
        objectsMap,
      );

      // The child should be deselected
      const childEl = result.updatedElements.find(
        (el) => el.nodeId === "child_1",
      );
      expect(childEl?.selected).toBe(false);

      // The parent compound should also be deselected
      const compoundEl = result.updatedElements.find(
        (el) => el.nodeId === "compound_1",
      );
      expect(compoundEl?.selected).toBe(false);

      // Both should be removed from selectedElements
      expect(result.updatedSelectedElements).not.toContain("child_1");
      expect(result.updatedSelectedElements).not.toContain("compound_1");
    });

    test("deselecting child element also deselects sibling children", () => {
      const selected = ["compound_1", "child_1", "child_2"];
      const result = deselectElement(
        compoundElements,
        selected,
        "child_1",
        objectsMap,
      );

      // Both children should be deselected
      expect(result.updatedSelectedElements).not.toContain("child_1");
      expect(result.updatedSelectedElements).not.toContain("child_2");

      const child2El = result.updatedElements.find(
        (el) => el.nodeId === "child_2",
      );
      expect(child2El?.selected).toBe(false);
    });

    test("deselecting standalone element does not affect compound", () => {
      compoundElements[3].selected = true;
      const selected = ["compound_1", "child_1", "child_2", "standalone"];
      const mesh = objectsMap.get("standalone") as THREE.Mesh;
      (mesh.material as THREE.MeshStandardMaterial).color.set(
        SELECTION.selected,
      );

      const result = deselectElement(
        compoundElements,
        selected,
        "standalone",
        objectsMap,
      );

      expect(result.updatedSelectedElements).not.toContain("standalone");
      // Compound and children should remain selected
      expect(result.updatedSelectedElements).toContain("compound_1");
      expect(result.updatedSelectedElements).toContain("child_1");
      expect(result.updatedSelectedElements).toContain("child_2");
    });
  });

  describe("deselectElement - THREE.Group handling", () => {
    test("traverses THREE.Group to reset mesh colors", () => {
      const group = new THREE.Group();
      const innerMesh1 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      const innerMesh2 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      group.add(innerMesh1);
      group.add(innerMesh2);

      objectsMap.set("node_1", group);

      deselectElement(elements, ["node_1"], "node_1", objectsMap);

      // Both inner meshes should be blue
      const color1 = (innerMesh1.material as THREE.MeshStandardMaterial).color;
      const color2 = (innerMesh2.material as THREE.MeshStandardMaterial).color;
      expect(color1.getHex()).toBe(BODY.default);
      expect(color2.getHex()).toBe(BODY.default);
    });

    test("handles nested groups during deselection", () => {
      const outerGroup = new THREE.Group();
      const innerGroup = new THREE.Group();
      const deepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );

      innerGroup.add(deepMesh);
      outerGroup.add(innerGroup);
      objectsMap.set("node_1", outerGroup);

      deselectElement(elements, ["node_1"], "node_1", objectsMap);

      const color = (deepMesh.material as THREE.MeshStandardMaterial).color;
      expect(color.getHex()).toBe(BODY.default);
    });

    test("deselecting element resets color on all children including overlays", () => {
      const group = new THREE.Group();
      const realMesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      const overlay = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: SELECTION.selected }),
      );
      overlay.userData.isEdgeOverlay = true;
      group.add(realMesh);
      group.add(overlay);
      objectsMap.set("node_1", group);

      deselectElement(elements, ["node_1"], "node_1", objectsMap);

      // Both get default color (deselectElement doesn't check isEdgeOverlay)
      expect(
        (realMesh.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
      expect(
        (overlay.material as THREE.MeshStandardMaterial).color.getHex(),
      ).toBe(BODY.default);
    });
  });
});
