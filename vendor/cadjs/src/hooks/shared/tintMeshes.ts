import * as THREE from "three";

/** Set the body color on every mesh inside the object identified by `nodeId`.
 *  Skips edge-overlay LineSegments and helper nodes. No-op if the object is
 *  not in the scene yet (getObject returns null/undefined). */
export function tintMeshes(
  getObject: (id: string) => THREE.Object3D | null | undefined,
  nodeId: string,
  color: number,
): void {
  const obj = getObject(nodeId);
  if (!obj) return;
  obj.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      !child.userData.isEdgeOverlay &&
      !child.userData.isHelper
    ) {
      (child.material as THREE.MeshStandardMaterial).color.set(color);
    }
  });
}

/** Variant that also tints child `THREE.Line` objects flagged with
 *  `userData.isPathLine`. Used by sweep where the path is a polyline. */
export function tintMeshesAndPathLines(
  getObject: (id: string) => THREE.Object3D | null | undefined,
  nodeId: string,
  color: number,
): void {
  const obj = getObject(nodeId);
  if (!obj) return;
  obj.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      !child.userData.isEdgeOverlay &&
      !child.userData.isHelper
    ) {
      (child.material as THREE.MeshStandardMaterial).color.set(color);
    }
    if (child instanceof THREE.Line && child.userData.isPathLine) {
      (child.material as THREE.LineBasicMaterial).color.set(color);
    }
  });
}
