import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAMERA_MIN_DISTANCE } from "../visual-constants";

export type FaceName = "front" | "back" | "top" | "bottom" | "left" | "right";

export type NamedView =
  // Faces (6)
  | FaceName
  // Edges (12): pairs of adjacent faces
  | "front-top"
  | "front-bottom"
  | "front-left"
  | "front-right"
  | "back-top"
  | "back-bottom"
  | "back-left"
  | "back-right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  // Corners (8): triples of mutually-adjacent faces
  | "front-top-right"
  | "front-top-left"
  | "front-bottom-right"
  | "front-bottom-left"
  | "back-top-right"
  | "back-top-left"
  | "back-bottom-right"
  | "back-bottom-left"
  // Legacy alias for the main isometric view (equivalent to front-top-right)
  | "isometric";

/** Unit outward normals for the six cube faces. Shared with the ViewCube widget
 *  so its pickable mesh positions always match the resulting camera direction. */
export const FACE_NORMALS: Record<FaceName, THREE.Vector3> = {
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
};

/** Returns the unit direction from origin toward the camera for a given view.
 *  For faces this is the face normal; for edges and corners it is the
 *  normalized sum of the participating face normals. */
export function getViewDirection(view: NamedView): THREE.Vector3 {
  if (view === "isometric") {
    return new THREE.Vector3(1, 1, 1).normalize();
  }
  const parts = view.split("-") as FaceName[];
  const dir = new THREE.Vector3();
  for (const p of parts) dir.add(FACE_NORMALS[p]);
  return dir.normalize();
}

function upForView(view: NamedView): THREE.Vector3 {
  if (view === "top") return new THREE.Vector3(0, 0, -1);
  if (view === "bottom") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

/** Ease-out quadratic: decelerating to zero velocity */
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export interface UseCameraAnimationResult {
  animateToView: (viewName: NamedView) => void;
  fitAll: (
    elements: Array<{ nodeId: string }>,
    getObject: (nodeId: string) => THREE.Object3D | undefined,
  ) => void;
  isAnimating: boolean;
}

export function useCameraAnimation(
  camera: THREE.Camera | null,
  controls: OrbitControls | null,
): UseCameraAnimationResult {
  const animFrameRef = useRef<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const cancelAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const animateToView = useCallback(
    (viewName: NamedView) => {
      if (!camera || !controls) return;

      cancelAnimation();

      // Preserve the user's current orbit pivot and framing distance, ViewCube
      // clicks should only change the viewing direction, not recenter on origin.
      const pivot = controls.target.clone();
      const currentDistance = Math.max(
        camera.position.distanceTo(pivot),
        CAMERA_MIN_DISTANCE,
      );
      const startPos = camera.position.clone();
      const endPos = pivot
        .clone()
        .add(getViewDirection(viewName).multiplyScalar(currentDistance));

      // Use quaternion slerp for smooth up-vector transition
      const startUp = camera.up.clone();
      const endUp = upForView(viewName);

      const startTime = performance.now();
      const duration = 400; // ms

      // Cancel animation on user orbit interaction
      const onControlChange = () => {
        cancelAnimation();
        controls.removeEventListener("start", onControlChange);
      };
      controls.addEventListener("start", onControlChange);

      setIsAnimating(true);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeOutQuad(t);

        camera.position.lerpVectors(startPos, endPos, eased);
        camera.up.copy(startUp).lerp(endUp, eased).normalize();

        controls.update();

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          controls.removeEventListener("start", onControlChange);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [camera, controls, cancelAnimation],
  );

  const fitAll = useCallback(
    (
      elements: Array<{ nodeId: string }>,
      getObject: (nodeId: string) => THREE.Object3D | undefined,
    ) => {
      if (!camera || !controls || elements.length === 0) return;

      cancelAnimation();

      const box = new THREE.Box3();
      let hasGeometry = false;

      for (const el of elements) {
        const obj = getObject(el.nodeId);
        if (obj) {
          box.expandByObject(obj);
          hasGeometry = true;
        }
      }

      if (!hasGeometry) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      const maxDim = Math.max(size.x, size.y, size.z, 1);

      let distance: number;
      if (camera instanceof THREE.PerspectiveCamera) {
        const fov = camera.fov * (Math.PI / 180);
        distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;
      } else {
        // OrthographicCamera: keep current distance, update frustum to fit
        distance = camera.position.distanceTo(controls.target);
        const ortho = camera as THREE.OrthographicCamera;
        const aspect = window.innerWidth / window.innerHeight;
        const halfHeight = (maxDim / 2) * 1.5;
        ortho.left = -halfHeight * aspect;
        ortho.right = halfHeight * aspect;
        ortho.top = halfHeight;
        ortho.bottom = -halfHeight;
        ortho.updateProjectionMatrix();
      }

      // Animate to fit position
      const startPos = camera.position.clone();
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const endPos = center.clone().add(direction.multiplyScalar(distance));

      const startTarget = controls.target.clone();
      const endTarget = center.clone();

      const startTime = performance.now();
      const duration = 400;

      setIsAnimating(true);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeOutQuad(t);

        camera.position.lerpVectors(startPos, endPos, eased);
        controls.target.lerpVectors(startTarget, endTarget, eased);
        controls.update();

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [camera, controls, cancelAnimation],
  );

  return { animateToView, fitAll, isAnimating };
}
