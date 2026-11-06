// Placement: drives a scene object to a solved column-major 4x4. Pure +
// THREE-applied. Instances are addressed by stable id (the feature/output id).

import * as THREE from "three";

/**
 * Move/rotate `object` so its WORLD transform equals `transform`
 * (column-major 4x4). Parent transforms are pre-multiplied out so the
 * result lands correctly in world space.
 */
export function placeObject(
  object: THREE.Object3D | null | undefined,
  transform: number[],
): boolean {
  if (!object) return false;
  const m = new THREE.Matrix4();
  // column-major: column i = elements 4i..4i+3
  m.set(
    transform[0] ?? 1,
    transform[1] ?? 0,
    transform[2] ?? 0,
    transform[3] ?? 0,
    transform[4] ?? 0,
    transform[5] ?? 1,
    transform[6] ?? 0,
    transform[7] ?? 0,
    transform[8] ?? 0,
    transform[9] ?? 0,
    transform[10] ?? 1,
    transform[11] ?? 0,
    transform[12] ?? 0,
    transform[13] ?? 0,
    transform[14] ?? 0,
    transform[15] ?? 1,
  );
  if (object.parent) {
    object.parent.updateMatrixWorld(true);
    const parentInv = object.parent.matrixWorld.clone().invert();
    m.premultiply(parentInv);
  }
  object.position.setFromMatrixPosition(m);
  object.quaternion.setFromRotationMatrix(m);
  object.updateMatrix();
  return true;
}
