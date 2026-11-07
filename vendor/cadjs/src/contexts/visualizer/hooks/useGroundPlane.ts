import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SCENE } from "../../../theme";
import { disposeObject3D } from "../../../scene-operations/mesh-operations";
import { GROUND_PLANE_Z_OFFSET } from "../../../visual-constants";

export interface GroundPlaneApi {
  showGroundPlane: boolean;
  toggleGroundPlane: () => void;
}

/**
 * Owns the visible/hidden state of the ground plane and grid. Adds the group
 * to the scene when shown, removes + disposes when hidden, and re-runs both
 * paths when sceneReady transitions from false to true (so the plane appears
 * on first mount).
 */
export function useGroundPlane(
  sceneRef: React.MutableRefObject<THREE.Scene | null>,
  sceneReady: boolean,
): GroundPlaneApi {
  const [showGroundPlane, setShowGroundPlane] = useState<boolean>(true);
  const groundPlaneRef = useRef<THREE.Group | null>(null);

  const toggleGroundPlane = useCallback(() => {
    setShowGroundPlane((prev) => !prev);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (groundPlaneRef.current) {
      scene.remove(groundPlaneRef.current);
      disposeObject3D(groundPlaneRef.current);
      groundPlaneRef.current = null;
    }

    if (showGroundPlane) {
      const groundGroup = new THREE.Group();
      groundGroup.userData.isGroundPlane = true;

      const gridSize = 20;
      const gridDivisions = 20;
      const gridHelper = new THREE.GridHelper(
        gridSize,
        gridDivisions,
        SCENE.gridMajor,
        SCENE.gridMinor,
      );
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.z = -0.02;
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => {
          m.depthWrite = false;
        });
      } else {
        (gridHelper.material as THREE.Material).depthWrite = false;
      }

      const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: SCENE.groundPlane,
        transparent: true,
        opacity: SCENE.groundPlaneOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.position.z = GROUND_PLANE_Z_OFFSET;

      groundGroup.add(gridHelper);
      groundGroup.add(plane);
      scene.add(groundGroup);

      groundPlaneRef.current = groundGroup;
    }
  }, [showGroundPlane, sceneReady, sceneRef]);

  return { showGroundPlane, toggleGroundPlane };
}
