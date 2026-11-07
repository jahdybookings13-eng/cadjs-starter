import * as THREE from "three";
import { BODY, SELECTION } from "../../theme";

/**
 * Set hover highlight color on the given object and reveal any edge/vertex helpers it contains.
 * No-op if obj is null.
 */
export function highlightElement(obj: THREE.Object3D | null): void {
  if (!obj) return;

  if (obj instanceof THREE.Mesh) {
    (obj.material as THREE.MeshStandardMaterial).color.set(SELECTION.hover);
    (obj.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  obj.traverse((child) => {
    if (
      child.userData.helperType === "edge" ||
      child.userData.helperType === "vertex"
    ) {
      child.visible = true;
    }
    if (child instanceof THREE.Mesh && !child.userData.isHelper) {
      (child.material as THREE.MeshStandardMaterial).color.set(SELECTION.hover);
      (child.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
  });
}

/**
 * Reset color (selected vs default) and hide helpers if not selected.
 */
export function unhighlightElement(
  obj: THREE.Object3D | null,
  isSelected: boolean,
): void {
  if (!obj) return;

  const color = isSelected ? SELECTION.selected : BODY.default;

  obj.traverse((child) => {
    if (
      child.userData.helperType === "edge" ||
      child.userData.helperType === "vertex"
    ) {
      child.visible = isSelected;
    }
    if (child instanceof THREE.Mesh && !child.userData.isHelper) {
      (child.material as THREE.MeshStandardMaterial).color.set(color);
      (child.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
  });
}
