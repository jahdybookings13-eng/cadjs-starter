import { useCallback, useRef } from "react";
import * as THREE from "three";
import { useCadVisualizer } from "../../contexts/VisualizerContext";

/**
 * Stable Raycaster scoped to a single consumer hook, so mode input-handlers
 * don't allocate a fresh `THREE.Raycaster` on every event.
 *
 * Returns:
 *   - `raycastToObjects(event, objects, recursive?)`, convenience that runs
 *     `intersectObjects` against a known list. Most input-handlers want this.
 *   - `raycasterFromEvent(event)`, sets the raycaster from the cursor and
 *     returns the underlying `THREE.Raycaster`. Use this when passing to
 *     helpers like `collectPicksUnderCursor` that need the Raycaster object.
 */
export function useRaycastToObjects(line2Threshold = 8) {
  const { renderer, camera } = useCadVisualizer();
  const raycasterRef = useRef(new THREE.Raycaster());

  const raycasterFromEvent = useCallback(
    (event: MouseEvent): THREE.Raycaster | null => {
      if (!renderer || !camera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(mouse, camera);
      raycasterRef.current.camera = camera;
      raycasterRef.current.params.Line2 = { threshold: line2Threshold };
      return raycasterRef.current;
    },
    [renderer, camera, line2Threshold],
  );

  const raycastToObjects = useCallback(
    (
      event: MouseEvent,
      objects: THREE.Object3D[],
      recursive = false,
    ): THREE.Intersection[] => {
      const r = raycasterFromEvent(event);
      return r ? r.intersectObjects(objects, recursive) : [];
    },
    [raycasterFromEvent],
  );

  return { raycastToObjects, raycasterFromEvent };
}
