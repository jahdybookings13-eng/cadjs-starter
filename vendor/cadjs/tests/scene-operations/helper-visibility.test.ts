import * as THREE from "three";
import { handleSetMode } from "../../src/scene-operations/selection-operations";
import { Brep, Face, Vertex } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

/**
 * Switching modes via `handleSetMode` MUST hide all `helperType`-tagged
 * children (edge/vertex helpers) on the affected objects. Forgotten
 * helpers persist across modes and confuse selection.
 *
 * The invariant pinned here is the second traversal in `handleSetMode`
 * that resets `child.visible = false` for `helperType === "edge" |
 * "vertex"` regardless of what the first traversal did.
 */
describe("handleSetMode hides edge/vertex helpers", () => {
  function makeElement(nodeId: string): SceneElement {
    const v1 = new Vertex(0, 0, 0);
    const v2 = new Vertex(1, 0, 0);
    const v3 = new Vertex(0, 1, 0);
    return {
      brep: new Brep([v1, v2, v3], [], [new Face([v1, v2, v3])]),
      nodeId,
      position: new THREE.Vector3(0, 0, 0),
      selected: true,
    };
  }

  function makeGroupWithHelpers(): {
    group: THREE.Group;
    edgeHelper: THREE.LineSegments;
    vertexHelper: THREE.Mesh;
    bodyMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    group.add(bodyMesh);

    const edgeHelper = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff0000 }),
    );
    edgeHelper.userData.helperType = "edge";
    edgeHelper.visible = true;
    group.add(edgeHelper);

    const vertexHelper = new THREE.Mesh(
      new THREE.SphereGeometry(0.05),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
    );
    vertexHelper.userData.helperType = "vertex";
    vertexHelper.visible = true;
    group.add(vertexHelper);

    return { group, edgeHelper, vertexHelper, bodyMesh };
  }

  it("hides edge + vertex helpers when switching mode", () => {
    const element = makeElement("e1");
    const { group, edgeHelper, vertexHelper, bodyMesh } =
      makeGroupWithHelpers();
    const objectsMap = new Map<string, THREE.Object3D>([["e1", group]]);

    // Pre-condition: helpers visible.
    expect(edgeHelper.visible).toBe(true);
    expect(vertexHelper.visible).toBe(true);

    const result = handleSetMode([element], "extrude", objectsMap);

    expect(result.mode).toBe("extrude");
    expect(edgeHelper.visible).toBe(false);
    expect(vertexHelper.visible).toBe(false);
    // The body mesh itself stays visible — only helper-tagged children get hidden.
    expect(bodyMesh.visible).toBe(true);
    // Side effect of mode switch: element.selected resets to false.
    expect(result.updatedElements[0].selected).toBe(false);
  });

  it("does not hide non-helper children", () => {
    const element = makeElement("e1");
    const group = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    bodyMesh.visible = true;
    // Edge overlay is NOT a helper — it's a permanent rendering aid.
    bodyMesh.userData.isEdgeOverlay = true;
    group.add(bodyMesh);

    const objectsMap = new Map<string, THREE.Object3D>([["e1", group]]);
    handleSetMode([element], "move", objectsMap);

    expect(bodyMesh.visible).toBe(true);
  });
});
