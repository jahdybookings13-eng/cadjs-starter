import { useCallback, useRef, useState } from "react";
import * as THREE from "three";

export interface MouseInteractionApi {
  cursorPosition: THREE.Vector3 | null;
  getMouseIntersection: (event: MouseEvent) => THREE.Vector3 | null;
  updateCursorPosition: (event: MouseEvent) => void;
  setDrawingPlane: (normal: THREE.Vector3, constant?: number) => void;
}

/**
 * Owns the cursor position state + the drawing plane used by the raycaster.
 * Takes camera + renderer refs from `useSceneAndRenderer`.
 */
export function useMouseInteraction(
  cameraRef: React.MutableRefObject<THREE.Camera | null>,
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
): MouseInteractionApi {
  const drawingPlaneRef = useRef(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  );
  const [cursorPosition, setCursorPosition] = useState<THREE.Vector3 | null>(
    null,
  );

  const getMouseIntersection = useCallback(
    (event: MouseEvent): THREE.Vector3 | null => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!renderer || !camera) return null;

      const drawingPlane = drawingPlaneRef.current;
      const raycaster = new THREE.Raycaster();

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const intersection = new THREE.Vector3();
      const result = raycaster.ray.intersectPlane(drawingPlane, intersection);
      return result ? intersection : null;
    },
    [cameraRef, rendererRef],
  );

  const updateCursorPosition = useCallback(
    (event: MouseEvent) => {
      const intersection = getMouseIntersection(event);
      setCursorPosition(intersection);
    },
    [getMouseIntersection],
  );

  const setDrawingPlane = useCallback(
    (normal: THREE.Vector3, constant: number = 0) => {
      drawingPlaneRef.current.set(normal, constant);
    },
    [],
  );

  return {
    cursorPosition,
    getMouseIntersection,
    updateCursorPosition,
    setDrawingPlane,
  };
}
