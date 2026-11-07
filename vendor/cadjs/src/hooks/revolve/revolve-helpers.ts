import type * as THREE from "three";

export { isFlat as isFlatShape } from "../../scene-operations/brep-utils";

/**
 * Normalize an axis defined by two endpoints into origin + unit direction.
 * Returns null if the axis has zero length (caller should surface an error).
 */
export function normalizeAxis(
  start: THREE.Vector3,
  end: THREE.Vector3,
): {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
} | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return null;
  return {
    origin: { x: start.x, y: start.y, z: start.z },
    direction: { x: dx / len, y: dy / len, z: dz / len },
  };
}
