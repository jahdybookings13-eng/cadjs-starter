import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectionType } from "../VisualizerContext";
import type { ControlsListeners } from "./hooks/useSceneAndRenderer";

export interface CameraSwitchRefs {
  perspCameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  orthoCameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  controlsListenersRef: React.MutableRefObject<ControlsListeners | null>;
}

/**
 * Switch between perspective and orthographic projection. Mutates refs in place.
 * Reconstructs OrbitControls (Three.js requires this for proper zoom behavior on
 * the new camera) and re-attaches the on-demand render listeners onto the new
 * controls instance via `controlsListenersRef`. Without re-attaching, camera
 * input on the new controls produces no `change`/`start`/`end` events feeding
 * `requestRender()`, freezing the canvas after every projection toggle.
 */
export function switchProjection(
  refs: CameraSwitchRefs,
  newType: ProjectionType,
  setProjectionType: (type: ProjectionType) => void,
  requestRender?: () => void,
): void {
  const persp = refs.perspCameraRef.current;
  const ortho = refs.orthoCameraRef.current;
  const renderer = refs.rendererRef.current;
  const controls = refs.controlsRef.current;
  if (!persp || !ortho || !renderer || !controls) return;

  const currentCamera = refs.cameraRef.current;
  if (!currentCamera) return;

  const targetCamera = newType === "perspective" ? persp : ortho;
  if (targetCamera === currentCamera) return;

  targetCamera.position.copy(currentCamera.position);
  targetCamera.up.copy(currentCamera.up);
  targetCamera.quaternion.copy(currentCamera.quaternion);

  if (newType === "orthographic") {
    const distance = currentCamera.position.distanceTo(controls.target);
    const fovRad = (persp.fov * Math.PI) / 180;
    const halfHeight = distance * Math.tan(fovRad / 2);
    const aspect = persp.aspect;
    ortho.left = -halfHeight * aspect;
    ortho.right = halfHeight * aspect;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    ortho.updateProjectionMatrix();
  }

  const target = controls.target.clone();
  const enableRotate = controls.enableRotate;
  const enableZoom = controls.enableZoom;
  const enablePan = controls.enablePan;

  refs.controlsListenersRef.current?.detach(controls);
  controls.dispose();
  const newControls = new OrbitControls(targetCamera, renderer.domElement);
  newControls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.RIGHT,
  };
  newControls.target.copy(target);
  newControls.enableRotate = enableRotate;
  newControls.enableZoom = enableZoom;
  newControls.enablePan = enablePan;
  newControls.listenToKeyEvents(window);
  newControls.update();

  refs.controlsRef.current = newControls;
  refs.cameraRef.current = targetCamera;
  refs.controlsListenersRef.current?.attach(newControls);
  setProjectionType(newType);

  // The new controls' listeners only fire on user input, paint once now so the
  // post-switch frame reflects the swapped camera.
  requestRender?.();

  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as { __cadCamera?: THREE.Camera }).__cadCamera =
      targetCamera;
  }
}
