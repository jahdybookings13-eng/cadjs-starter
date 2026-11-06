import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSubPrimSelector } from "../subPrimSelector";

describe("subPrimSelector triangle passthrough", () => {
  it("carries the hit triangle in mesh-local coords", () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.nodeId = "E1";
    scene.add(mesh);
    scene.updateMatrixWorld(true);

    const sel = createSubPrimSelector();
    const hit = sel.cast(
      new THREE.Vector3(0.25, 1, 0.25),
      new THREE.Vector3(0, -1, 0),
      scene,
      10,
    );
    expect(hit).not.toBeNull();
    expect(hit?.tri).toBeDefined();
    expect(hit?.tri?.length).toBe(3);
    for (const v of hit?.tri ?? []) {
      expect(Math.abs(v.z)).toBeLessThan(1e-6);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });
});
