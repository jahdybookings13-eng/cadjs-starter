import * as THREE from "three";
import { importElements } from "../../src/scene-operations/import-operations";
import { Brep, Vertex, Face } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

function makeBrep(): Brep {
  const v1 = new Vertex(0, 0, 0);
  const v2 = new Vertex(1, 0, 0);
  const v3 = new Vertex(1, 1, 0);
  return new Brep([v1, v2, v3], [], [new Face([v1, v2, v3])]);
}

describe("importElements", () => {
  let objectsMap: Map<string, THREE.Object3D>;

  beforeEach(() => {
    objectsMap = new Map();
  });

  test("adds imported elements to existing elements array", () => {
    const existing: SceneElement[] = [
      {
        brep: makeBrep(),
        nodeId: "node_1",
        position: new THREE.Vector3(0, 0, 0),
      },
    ];

    const imports = [
      { brep: makeBrep(), position: new THREE.Vector3(1, 2, 3) },
      { brep: makeBrep(), position: new THREE.Vector3(4, 5, 6) },
    ];

    const result = importElements(existing, imports, 1, objectsMap);

    expect(result.updatedElements).toHaveLength(3);
    expect(result.updatedElements[0].nodeId).toBe("node_1");
    expect(result.updatedElements[1].nodeId).toBe("node_2");
    expect(result.updatedElements[2].nodeId).toBe("node_3");
  });

  test("generates incremental nodeIds from idCounter", () => {
    const result = importElements(
      [],
      [{ brep: makeBrep(), position: new THREE.Vector3() }],
      10,
      objectsMap,
    );

    expect(result.updatedElements[0].nodeId).toBe("node_11");
    expect(result.nextId).toBe(11);
    expect(result.nodeIds).toEqual(["node_11"]);
  });

  test("adds meshes to objectsMap for each import", () => {
    const imports = [
      { brep: makeBrep(), position: new THREE.Vector3(1, 0, 0) },
      { brep: makeBrep(), position: new THREE.Vector3(2, 0, 0) },
    ];

    const result = importElements([], imports, 0, objectsMap);

    expect(objectsMap.size).toBe(2);
    expect(objectsMap.has("node_1")).toBe(true);
    expect(objectsMap.has("node_2")).toBe(true);
    expect(result.nodeIds).toEqual(["node_1", "node_2"]);
  });

  test("copies position to element and mesh", () => {
    const pos = new THREE.Vector3(3, 4, 5);
    const imports = [{ brep: makeBrep(), position: pos }];

    const result = importElements([], imports, 0, objectsMap);

    expect(result.updatedElements[0].position).toBe(pos);
    const mesh = objectsMap.get("node_1")!;
    expect(mesh.position.x).toBe(3);
    expect(mesh.position.y).toBe(4);
    expect(mesh.position.z).toBe(5);
  });

  test("empty imports returns unchanged elements", () => {
    const existing: SceneElement[] = [
      {
        brep: makeBrep(),
        nodeId: "node_1",
        position: new THREE.Vector3(),
      },
    ];

    const result = importElements(existing, [], 5, objectsMap);

    expect(result.updatedElements).toHaveLength(1);
    expect(result.nextId).toBe(5);
    expect(result.nodeIds).toEqual([]);
    expect(objectsMap.size).toBe(0);
  });

  test("does not mutate original elements array", () => {
    const existing: SceneElement[] = [
      {
        brep: makeBrep(),
        nodeId: "node_1",
        position: new THREE.Vector3(),
      },
    ];
    const originalLength = existing.length;

    importElements(
      existing,
      [{ brep: makeBrep(), position: new THREE.Vector3() }],
      1,
      objectsMap,
    );

    expect(existing).toHaveLength(originalLength);
  });
});
