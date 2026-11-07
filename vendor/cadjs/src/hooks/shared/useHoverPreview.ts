import { useCallback, useRef } from "react";
import * as THREE from "three";
import { useCadCore } from "../../contexts/CoreContext";
import { PickItem } from "../../scene-operations/mesh-operations";
import { BODY, SELECTION } from "../../theme";

/**
 * Select Other hover preview: depth-test off + hover tint + render-on-top so the
 * previewed body shows through occluders. Restoring returns to defaults.
 *
 * Used by fillet/sweep/loft/revolve mode-state hooks.
 */
export function useHoverPreview() {
  const { getObject } = useCadCore();
  const hoverPreviewRef = useRef<string | null>(null);

  const restoreHoverPreview = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            (mat as THREE.MeshStandardMaterial).color.set(BODY.default);
            (mat as THREE.MeshStandardMaterial).depthTest = true;
          }
          (child as THREE.Mesh).renderOrder = 0;
        }
      });
    },
    [getObject],
  );

  const applyHoverPreview = useCallback(
    (item: PickItem | null) => {
      const prev = hoverPreviewRef.current;
      if (prev && (!item || item.elementId !== prev)) {
        restoreHoverPreview(prev);
        hoverPreviewRef.current = null;
      }
      if (!item) return;
      const obj = getObject(item.elementId);
      if (!obj) return;
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            (mat as THREE.MeshStandardMaterial).color.set(SELECTION.hover);
            (mat as THREE.MeshStandardMaterial).depthTest = false;
          }
          (child as THREE.Mesh).renderOrder = 999;
        }
      });
      hoverPreviewRef.current = item.elementId;
    },
    [getObject, restoreHoverPreview],
  );

  return { hoverPreviewRef, applyHoverPreview, restoreHoverPreview };
}
