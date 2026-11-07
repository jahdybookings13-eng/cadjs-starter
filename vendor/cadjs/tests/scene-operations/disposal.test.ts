/**
 * Regression tests for Three.js GPU resource disposal on element removal.
 *
 * Verifies that the `disposeAndRemove` helper is wired into removeElement and
 * that geometries/materials are properly disposed (preventing the GPU memory
 * leak that previously plagued boolean ops, undo/redo, and updateElementBrep).
 */

import * as THREE from "three";
import { removeElement } from "../../src/scene-operations/element-operations";
import {
  disposeAndRemove,
  disposeObject3D,
} from "../../src/scene-operations/mesh-operations";
import { Brep, Vertex, Face } from "../../src/geometry";
import { SceneElement } from "../../src/scene-operations/types";

function createMockGroup(): {
  group: THREE.Group;
  geom: THREE.BufferGeometry;
  mat: THREE.Material;
} {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geom, mat);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, geom, mat };
}

describe("disposal helpers", () => {
  // Note on what we can assert: BufferGeometry.dispose() and Material.dispose()
  // dispatch events that the WebGLRenderer listens for to free GPU resources.
  // From JS we cannot observe the GPU-side free, so the dispose-was-called spy
  // IS the strongest available post-condition. We pair it with structural
  // post-conditions (parent attachment, child counts, objectsMap state).
  it("disposeObject3D disposes geometries and materials but does not detach", () => {
    const { group, geom, mat } = createMockGroup();
    const parent = new THREE.Scene();
    parent.add(group);

    const geomSpy = vi.spyOn(geom, "dispose");
    const matSpy = vi.spyOn(mat, "dispose");

    disposeObject3D(group);

    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(group.parent).toBe(parent);
    expect(parent.children).toContain(group);
  });

  it("disposeAndRemove detaches from parent AND disposes resources", () => {
    const { group, geom, mat } = createMockGroup();
    const parent = new THREE.Scene();
    parent.add(group);

    const geomSpy = vi.spyOn(geom, "dispose");
    const matSpy = vi.spyOn(mat, "dispose");

    disposeAndRemove(group);

    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(group.parent).toBeNull();
    expect(parent.children).not.toContain(group);
  });

  it("disposeAndRemove handles undefined and unparented objects gracefully", () => {
    expect(() => disposeAndRemove(undefined)).not.toThrow();

    const { group } = createMockGroup();
    expect(group.parent).toBeNull();
    expect(() => disposeAndRemove(group)).not.toThrow();
  });
});

describe("removeElement disposes the tracked Object3D", () => {
  it("disposes the mapped object's geometry and material", () => {
    const { group, geom, mat } = createMockGroup();
    const parent = new THREE.Scene();
    parent.add(group);

    const objectsMap = new Map<string, THREE.Object3D>([["node_1", group]]);
    const v = new Vertex(0, 0, 0);
    const elements: SceneElement[] = [
      {
        brep: new Brep([v], [], [new Face([v, v, v])]),
        nodeId: "node_1",
        position: new THREE.Vector3(0, 0, 0),
      },
    ];

    const geomSpy = vi.spyOn(geom, "dispose");
    const matSpy = vi.spyOn(mat, "dispose");

    const result = removeElement(elements, [], "node_1", objectsMap);

    expect(geomSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(group.parent).toBeNull();
    expect(objectsMap.has("node_1")).toBe(false);
    expect(result.updatedElements).toEqual([]);
  });

  it("is a no-op for unknown nodeIds (no throw)", () => {
    const objectsMap = new Map<string, THREE.Object3D>();
    expect(() => removeElement([], [], "ghost", objectsMap)).not.toThrow();
  });
});
